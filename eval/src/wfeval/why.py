"""`wfeval why-rejected <run>`: why each rejected publish in a run was rejected, item by
item, with no model and nothing spent.

The engine's 422 says how many procedure items it kept, not which or why, and logs
nothing. The extension logs every Workflows call with the draft submitted
(`requests.jsonl`, `workspace` lines); this replays the publication rules against the
seeded captures (the history, dates rendered as at seed time) for each rejected publish:

- a stage evidence entry must name a capture of that app at exactly that time;
- a procedure item must cite one of its stage's evidence entries (time and app);
- its quote must be in that capture's text.

Matching is upstream's, exact to the millisecond: "(one in that second)" marks a
whole-second citation that the second-precision variant accepts. The engine's own
checks remain the authority; this names the likely cause.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .generate import DATE_TOKEN, capture_date
from .run import ROOT


@dataclass(frozen=True)
class Capture:
    at: datetime
    app: str
    text: str
    title: str


def when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def flat(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def captures(run: Path, data_root: Path = ROOT / "data") -> list[Capture]:
    """Every seeded screen capture and input event, with the text the engine holds: the
    k-th seeded row of a phase is the k-th frame of that phase's history file."""
    meta = json.loads((run / "run.json").read_text())["data"]
    data = data_root / f"{meta['suite']}-s{meta['seed']}"
    rows: dict[int, list[dict]] = {}
    for line in (run / "seeded.jsonl").read_text().splitlines():
        r = json.loads(line)
        rows.setdefault(r["phase"], []).append(r)
    out = []
    for phase, seeded in rows.items():
        frames = json.loads((data / f"phase{phase}.json").read_text())["frames"]
        for r, f in zip(seeded, frames):
            at = when(r["timestamp"])
            text = DATE_TOKEN.sub(lambda m: capture_date(at.date() + timedelta(days=int(m[1]))),
                                  f.get("accessibility_text") or "")
            out.append(Capture(at, f["app_name"].lower(), flat(text), flat(f.get("window_name"))))
            for e in f.get("events") or []:
                if e.get("element_name"):
                    out.append(Capture(at + timedelta(seconds=e["dt"]), f["app_name"].lower(),
                                       flat(e["element_name"]), ""))
    return out


def restored_drafts(run: Path) -> dict[str, dict]:
    """The drafts a stage run started from, before the agent edited any."""
    r = json.loads((run / "run.json").read_text())
    if not r.get("snapshot"):
        return {}
    path = ROOT / "snapshots" / r["snapshot"] / "steps" / r["step"] / "catalog.json"
    if not path.exists():
        return {}
    drafts = json.loads(path.read_text()).get("agentWorkspace", {}).get("drafts", {})
    return {k: v.get("payload") for k, v in drafts.items()}


def first_workflow(payload: dict) -> dict:
    return (payload.get("workflows") or [payload])[0] if isinstance(payload, dict) else {}


def item_reasons(item: dict, evidence: set, caps: list[Capture]) -> list[str]:
    t, app, quote = item.get("timestamp"), (item.get("app") or "").lower(), flat(item.get("quote"))
    try:
        at = when(t)
    except (TypeError, ValueError):
        return ["no valid timestamp"]
    reasons = []
    if (at, app) not in evidence:
        reasons.append("cites a capture missing from this stage's evidence")
    exact = [c for c in caps if c.app == app and c.at == at]
    if not exact:
        same_second = any(c.app == app and c.at.replace(microsecond=0) == at for c in caps)
        reasons.append("no capture at that exact time" + (" (one in that second)" if same_second else ""))
    elif not any(quote in c.text for c in exact):
        title = any(quote and quote in c.title for c in exact)
        reasons.append("quote not in that capture" + (" (it is the window title)" if title else ""))
    return reasons


def evidence_reasons(entry: dict, caps: list[Capture]) -> list[str]:
    try:
        at = when(entry.get("timestamp"))
    except (TypeError, ValueError):
        return ["no valid timestamp"]
    app = (entry.get("app") or "").lower()
    if any(c.app == app and c.at == at for c in caps):
        return []
    same_second = any(c.app == app and c.at.replace(microsecond=0) == at for c in caps)
    return ["no capture at that exact time" + (" (one in that second)" if same_second else "")]


def explain(run: Path, data_root: Path = ROOT / "data") -> list[dict]:
    caps = captures(run, data_root)
    drafts = restored_drafts(run)
    out = []
    for line in (run / "requests.jsonl").read_text().splitlines():
        e = json.loads(line)
        if e.get("type") != "workspace":
            continue
        args, did = e.get("args") or {}, e.get("draft_id")
        if e.get("ok") and did and isinstance(args.get("payload"), dict):
            drafts[did] = args["payload"]
        if e.get("action") != "publish" or e.get("ok") or did not in drafts:
            continue
        workflow = first_workflow(drafts[did])
        stages = []
        for i, stage in enumerate(workflow.get("stages") or [], 1):
            ev = stage.get("evidence") or []
            evidence = set()
            for x in ev:
                try:
                    evidence.add((when(x["timestamp"]), (x.get("app") or "").lower()))
                except (KeyError, TypeError, ValueError):
                    pass
            stages.append({
                "stage": i,
                "evidence": [{"at": x.get("timestamp"), "app": x.get("app"), "problems": evidence_reasons(x, caps)}
                             for x in ev],
                "procedure": [{"kind": it.get("kind"), "at": it.get("timestamp"), "app": it.get("app"),
                               "quote": (it.get("quote") or "")[:60],
                               "problems": item_reasons(it, evidence, caps)}
                              for it in stage.get("procedure") or []],
            })
        out.append({"at": e.get("at"), "task": e.get("task"), "draft": did,
                    "reply": e.get("reply", "")[:200], "stages": stages})
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wfeval why-rejected")
    ap.add_argument("run", type=Path, help="runs/<id>")
    a = ap.parse_args(argv)
    for r in explain(a.run):
        print(f"\n{r['at'][11:19]} {r['task']} draft {r['draft'][:8]}: {r['reply']}")
        for s in r["stages"]:
            for x in s["evidence"]:
                if x["problems"]:
                    print(f"  stage {s['stage']} evidence {x['at']} {x['app']}: {'; '.join(x['problems'])}")
            for x in s["procedure"]:
                verdict = "; ".join(x["problems"]) or "ok"
                print(f"  stage {s['stage']} {x['kind']:8} {x['at']} {x['app']}: {verdict}  {x['quote']!r}")
    return 0
