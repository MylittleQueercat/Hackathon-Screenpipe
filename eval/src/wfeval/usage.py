"""Tokens, agent runs, tool calls and time per phase.

Tokens and tool calls come from the request log the sandbox extension writes (one
`usage` line per assistant message, one `tool` line per call). The pipe logs hold Pi's
JSON event stream too (`usage_totals`, eval-sketch's), but the engine keeps only the head
of a long run's stdout, so they undercount; they remain the source of agent runs, and of
tokens for runs made before the extension logged usage. Pi reports cost 0 for
model `auto` (the gateway picks the model), so dollars come only from `prices.json`
when it names a price; tokens are the measurement, dollars an estimate on top.

The extension also logs each Workflows call and the engine's reply (`workspace` lines):
`workspace` in the totals counts calls by action and failures by message, numbers and
ids masked, so a run shows what its agents retried on.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

PRICES = Path(__file__).resolve().parents[2] / "prices.json"


def events(stdout: str):
    for line in stdout.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def usage_totals(stdout: str) -> dict:
    totals = {"input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0,
              "peak_context": 0, "requests": 0, "tool_calls": 0}
    for e in events(stdout):
        if e.get("type") == "message_end" and (e.get("message") or {}).get("role") == "assistant":
            u = e["message"].get("usage") or {}
            for k in ("input", "cacheRead", "cacheWrite", "output", "reasoning"):
                totals[k] += u.get(k) or 0
            totals["requests"] += 1
            totals["peak_context"] = max(totals["peak_context"], (u.get("input") or 0) + (u.get("cacheRead") or 0))
        elif e.get("type") == "tool_execution_start":
            totals["tool_calls"] += 1
    return totals


def log_usage(log: Path) -> dict:
    value = json.loads(log.read_text())
    return {"task": value.get("pipe_name"), "started_at": value.get("started_at"),
            "finished_at": value.get("finished_at"), "success": value.get("success"),
            **usage_totals(value.get("stdout") or "")}


def price(totals: dict, model: str | None) -> float | None:
    """USD per the price table, per million tokens; None when the model has no price."""
    if not PRICES.exists() or not model:
        return None
    p = json.loads(PRICES.read_text()).get(model) or {}
    keys = {"input": "input", "cacheRead": "cache_read", "cacheWrite": "cache_write", "output": "output"}
    if any(p.get(v) is None for v in keys.values()):
        return None
    return round(sum(totals[k] * p[v] for k, v in keys.items()) / 1e6, 6)


TOKENS = ("input", "cacheRead", "cacheWrite", "output", "reasoning")


def request_log_usage(path: Path | None, since: str, until: str) -> dict | None:
    """Totals from the extension's request log for entries in [since, until] (UTC ISO),
    overall and per task; None when the log has no usage lines in the window."""
    if not path or not path.exists():
        return None
    when = lambda v: datetime.fromisoformat(v.replace("Z", "+00:00"))
    lo, hi = when(since), when(until)
    total = {k: 0 for k in TOKENS} | {"requests": 0, "tool_calls": 0, "peak_context": 0}
    by_task: dict[str, dict] = {}
    calls: dict[str, Counter] = {}
    failures: Counter = Counter()
    found = False
    for line in path.read_text().splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get("type") not in ("usage", "tool", "workspace") or not e.get("at") or not lo <= when(e["at"]) <= hi:
            continue
        if e["type"] == "workspace":
            action, failure = e.get("action") or "?", workspace_failure(e)
            calls.setdefault(action, Counter())["failed" if failure else "ok"] += 1
            if failure:
                failures[failure] += 1
            continue
        task = by_task.setdefault(e.get("task") or "?", {k: 0 for k in TOKENS} | {"requests": 0, "tool_calls": 0})
        if e["type"] == "tool":
            total["tool_calls"] += 1
            task["tool_calls"] += 1
            continue
        found = True
        u = e.get("usage") or {}
        for k in TOKENS:
            total[k] += u.get(k) or 0
            task[k] += u.get(k) or 0
        total["requests"] += 1
        task["requests"] += 1
        total["peak_context"] = max(total["peak_context"], (u.get("input") or 0) + (u.get("cacheRead") or 0))
    if calls:
        total["workspace"] = {"calls": {a: dict(c) for a, c in sorted(calls.items())},
                              "failed": sum(failures.values()), "failures": dict(failures.most_common())}
    return {**total, "by_task": by_task} if found else None


FAILED = "Workflow operation failed: "


def workspace_failure(entry: dict) -> str | None:
    """A failed Workflows call's reply as a kind: its first sentence, with numbers and ids
    masked so that the same rule counts once. None when the call succeeded."""
    reply = (entry.get("reply") or "").strip()
    if entry.get("ok", True) and not reply.startswith(FAILED):
        return None
    reply = reply.removeprefix(FAILED)
    first = re.split(r"(?<=[.!?])\s", reply, maxsplit=1)[0]
    first = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<id>", first)
    return re.sub(r"\d+", "N", first)[:200]


def phase_usage(logs: list[Path], model: str | None = None, request_log: Path | None = None,
                since: str | None = None, until: str | None = None) -> dict:
    per = [log_usage(p) for p in sorted(logs)]
    total = {k: sum(r[k] for r in per) for k in ("input", "cacheRead", "cacheWrite", "output", "reasoning",
                                                 "requests", "tool_calls")}
    total["peak_context"] = max((r["peak_context"] for r in per), default=0)
    total["source"] = "pipe_logs"
    full = request_log_usage(request_log, since, until) if since and until else None
    if full:
        total.update(full)
        total["source"] = "request_log"
    elif not per and request_log and request_log.exists():
        total["source"] = "request_log"  # no agent ran (an idle phase): zero is exact
    total["agent_runs"] = len(per)
    total["runs_by_task"] = {}
    for r in per:
        total["runs_by_task"][r["task"]] = total["runs_by_task"].get(r["task"], 0) + 1
    total["cost_usd"] = price(total, model)
    return total
