"""Run one variant on one suite: per phase, seed the history, run a full workflow cycle,
keep everything needed to grade and audit it, then grade.

A run happens at the fixed `LIVE` path on the fixed `PORT`, one at a time per Mac, so
the paths and port in what the agents see are the same on every machine; it then moves
to `runs/<utc>-<variant>-<suite>-s<seed>-r<repeat>/`:
  run.json        provenance: variant, data hashes, engine commit/patch/binary, Pi, image
  truth.json      copied from the data dir (graded here, never mounted or seeded)
  seeded.jsonl    every seeded frame: id, timestamp, app, hidden owner
  phase<N>/       catalog.json, workspace.json, executions.json, phase.json, logs/
  requests.jsonl  provider requests (settings, prompt hashes), usage, tool calls
  prompts/        each agent's instructions and task prompt, run nonces masked
  engine.log
  results.jsonl   one graded line per phase
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from . import generate
from .engine import APP, ENGINES, EVAL_TZ, LIVE, PORT, TASKS, Engine, EngineError, clone_template
from .grade import grade_run
from .sandbox import Sandbox, image_id
from .usage import phase_usage

ROOT = Path(__file__).resolve().parents[2]
EXTENSION = ROOT / "agent" / "sandbox-tools.ts"
# Failures of the provider or the account, not of the feature: rerun, never score.
RERUN = re.compile(r"workflow_allowance_paused|workflow_business_required|workflow_usage_unavailable|"
                   r"workflow_sign_in_required|workflow_rollout_disabled|rate.?limit|\b429\b|\b401\b|"
                   r"\b5\d\d\b|overloaded|auth_failed|provider_error|ECONNRESET|fetch failed", re.I)


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(ENGINES / "upstream"), *args], capture_output=True,
                          text=True).stdout.strip()


def provenance(variant: dict, variant_path: Path, data: Path, binary: Path, run_dir: Path) -> dict:
    pi = run_dir / "home/.screenpipe/pi-agent/node_modules/@earendil-works/pi-coding-agent/package.json"
    return {
        "variant": variant, "variant_file": str(variant_path),
        "variant_sha256": sha256_file(variant_path),
        "pipe_overrides_sha256": {t: sha256_file(ROOT / p) for t, p in variant.get("pipes", {}).items()},
        "data": json.loads((data / "manifest.json").read_text()),
        "engine": {"binary": str(binary), "binary_sha256": sha256_file(binary),
                   "commit": git("rev-parse", "HEAD"),
                   "patch_sha256": hashlib.sha256(git("diff", "HEAD").encode()).hexdigest()},
        "pi_version": json.loads(pi.read_text())["version"] if pi.exists() else None,
        "pi_lock_sha256": sha256_file(pi_lock) if (pi_lock := run_dir / "home/.screenpipe/pi-agent/bun.lock").exists() else None,
        "bun_version": subprocess.run([str(APP / "bun"), "--version"], capture_output=True, text=True).stdout.strip(),
        "sandbox_image": image_id(), "extension_sha256": sha256_file(EXTENSION),
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


def install_overrides(engine: Engine, variant: dict) -> None:
    """The sandbox extension in every workflow pipe; the variant's prompts, if any."""
    for task in TASKS:
        pipe = engine.data / "pipes" / task
        ext = pipe / ".pi" / "extensions"
        ext.mkdir(parents=True, exist_ok=True)
        shutil.copy(EXTENSION, ext / "sandbox-tools.ts")
        if task in variant.get("pipes", {}):
            shutil.copy(ROOT / variant["pipes"][task], pipe / "pipe.md")


FALLBACK = re.compile(r"model '([^']+)' is not available on this tier.*?falling back to '([^']+)'")


def model_fallback(run_dir: Path) -> str | None:
    """The engine swaps a model the account's tier lacks for another one and runs on
    (`resolve_screenpipe_model`). A run pinned to a model must not run on another."""
    try:
        text = (run_dir / "engine.log").read_text(errors="replace")
    except OSError:
        return None
    m = FALLBACK.search(text)
    return f"{m.group(1)} -> {m.group(2)}" if m else None


def classify(executions: dict[str, list[dict]], since: str) -> str | None:
    """`rerun` when an agent in this cycle failed for a provider or account reason."""
    for task, items in executions.items():
        for e in items:
            if (e.get("started_at") or "") < since or e.get("status") not in {"failed", "cancelled", "timed_out"}:
                continue
            if RERUN.search(f"{e.get('error_type') or ''} {e.get('error_message') or ''}"):
                return "rerun"
    return None


def collect_logs(engine: Engine, dest: Path, seen: set[Path]) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    kept = []
    for log in sorted(engine.data.glob("pipes/workflow-*/logs/*.json")):
        if log in seen:
            continue
        seen.add(log)
        out = dest / f"{log.parent.parent.name}-{log.name}"
        shutil.copy(log, out)
        kept.append(out)
    return kept


def wait_for_room(engine: Engine, span: float, margin: float = 120) -> float:
    """Phase 2 history must be dated after the last cycle's checkedThrough."""
    through = engine.catalog().get("checkedThrough")
    if not through:
        return 0.0
    ready = datetime.fromisoformat(through.replace("Z", "+00:00")).timestamp() + span + margin
    wait = max(0.0, ready - time.time())
    time.sleep(wait)
    return wait


def run_phase(engine: Engine, phase: int, doc: dict, run_dir: Path, seeded_out, seen: set[Path],
              model: str | None, timeout: float) -> dict:
    out = run_dir / f"phase{phase}"
    out.mkdir()
    meta = {"phase": phase, "frames": len(doc["frames"])}
    if doc["frames"]:
        if phase > 1:
            meta["waited_for_room_s"] = round(wait_for_room(engine, doc["span_seconds"] or 0), 1)
        now = datetime.now(ZoneInfo(EVAL_TZ))
        frames = generate.anchor(doc, now)
        ids = engine.seed(frames)
        for i, f, src in zip(ids, frames, doc["frames"]):
            seeded_out.write(json.dumps({"id": i, "phase": phase, "timestamp": f["timestamp"],
                                         "app_name": f["app_name"], "owner": src["owner"],
                                         "run": src["run"], "step": src["step"]}) + "\n")
        seeded_out.flush()
        meta["anchored_at"] = now.isoformat()
        meta["events"] = sum(len(f["events"]) for f in frames)
    t0 = time.time()
    since = datetime.now(timezone.utc).isoformat()
    try:
        started = engine.start_cycle()
        cycle_id = (started.get("cycle") or {}).get("id") or engine.workspace()["workspace"]["cycle"]["id"]
        # A provider or account failure makes the phase a rerun, and a swapped model
        # makes it invalid; stop paying for either.
        waited = engine.wait_cycle(cycle_id, timeout=timeout,
                                   abort=lambda execs: classify(execs, since) == "rerun"
                                   or model_fallback(run_dir) is not None)
        meta["cycle_status"] = waited["status"]
        meta["cycle"] = waited["cycle"]
    except EngineError as e:
        meta["cycle_status"], meta["error"] = "error", str(e)
    meta["seconds"] = round(time.time() - t0, 1)
    executions = {t: engine.executions(t, 100) for t in TASKS}
    meta["model_fallback"] = model_fallback(run_dir)
    meta["status"] = ("invalid" if meta["model_fallback"] else classify(executions, since)
                      or ("graded" if meta["cycle_status"] == "complete" else "incomplete"))
    (out / "catalog.json").write_text(json.dumps(engine.catalog(), indent=1))
    (out / "workspace.json").write_text(json.dumps(engine.workspace(), indent=1))
    (out / "executions.json").write_text(json.dumps(executions, indent=1))
    logs = collect_logs(engine, out / "logs", seen)
    meta["usage"] = phase_usage(logs, model, run_dir / "requests.jsonl", since,
                                datetime.now(timezone.utc).isoformat())
    (out / "phase.json").write_text(json.dumps(meta, indent=1))
    return meta


def contamination(run_dir: Path, seeded: dict) -> dict:
    """Capture was off: the DB must hold exactly the seeded frames."""
    data = run_dir / "home/.screenpipe"
    try:
        index = data / json.loads((data / "storage.json").read_text())["index"]
    except (OSError, KeyError, ValueError):
        return {"checked": False}
    # A copy: the engine's DB uses an exclusive-lock VFS.
    tmp = run_dir / "tmp" / "index-check"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    for f in index.parent.glob(index.name + "*"):
        if f.is_file():
            shutil.copy(f, tmp / f.name)
    con = sqlite3.connect(tmp / index.name)
    try:
        frames = con.execute("select count(*) from frames").fetchone()[0]
        apps = [r[0] for r in con.execute("select distinct app_name from frames")]
        events = con.execute("select count(*) from ui_events").fetchone()[0]
    finally:
        con.close()
    return {"checked": True, "frames": frames, "seeded": seeded["frames"], "ui_events": events,
            "seeded_events": seeded["events"], "clean": frames == seeded["frames"] and events == seeded["events"],
            "apps": sorted(map(str, apps))}


def leaks(run_dir: Path) -> list[str]:
    """Backstop: this machine's paths in anything the agents were given, ran or read. The
    run lives outside the home and the project, so any match is a leak."""
    needles = sorted({str(Path.home()), str(ROOT)}, key=len, reverse=True)
    pattern = re.compile("(?:" + "|".join(map(re.escape, needles)) + r")[^\s\"'\\]*")
    found = set()
    texts = [json.loads(log.read_text()).get("stdout") or "" for log in run_dir.glob("phase*/logs/*.json")]
    if (run_dir / "requests.jsonl").exists():
        texts.append((run_dir / "requests.jsonl").read_text())
    for text in texts:
        found |= {m.group(0)[:200] for m in pattern.finditer(text)}
    return sorted(found)


CONTEXT_FILES = ("AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD")


def context_files(data_dir: Path) -> list[str]:
    """What Pi would add to every agent's system prompt: its agent dir's context file, and
    one per directory from the pipe's cwd up to / (`loadProjectContextFiles`)."""
    found = [str(data_dir / "pi-agent" / n) for n in CONTEXT_FILES if (data_dir / "pi-agent" / n).is_file()]
    for task in TASKS:
        cwd = data_dir / "pipes" / task
        for d in [cwd, *cwd.parents]:
            found += [str(d / n) for n in CONTEXT_FILES if (d / n).is_file()]
    return sorted(set(found))


# Run nonces in a prompt (engine ids, tokens, the clock): masked so that prompts compare.
NONCES = [
    (re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"), "<uuid>"),
    (re.compile(r"sp_pipe_[0-9a-f]+"), "<pipe-token>"),
    (re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?"), "<time>"),
    (re.compile(r"\b\d{4}-\d{2}-\d{2}\b"), "<date>"),
]


def flatten(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(flatten(v) for v in value)
    if isinstance(value, dict):
        return "\n".join(flatten(v) for k, v in value.items() if k not in ("type", "role"))
    return "" if value is None else str(value)


def masked(text: str) -> str:
    for pattern, mark in NONCES:
        text = pattern.sub(mark, text)
    return text


def prompts(run_dir: Path) -> dict[str, str]:
    """Each agent's first instructions and task prompt, masked, kept under prompts/ and
    hashed: two runs of one variant must give the same hashes on any machine."""
    out, log = {}, run_dir / "requests.jsonl"
    if not log.exists():
        return out
    (run_dir / "prompts").mkdir(exist_ok=True)
    for line in log.read_text().splitlines():
        r = json.loads(line)
        for key in ("instructions", "input"):
            name = f"{r.get('task')}.{key}"
            if r.get("type") == "request" and key in r and name not in out:
                text = masked(flatten(r[key]))
                (run_dir / "prompts" / f"{name}.txt").write_text(text)
                out[name] = hashlib.sha256(text.encode()).hexdigest()
    return dict(sorted(out.items()))


def port_free(port: int) -> bool:
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


@contextmanager
def live_slot(run_id: str):
    """The fixed run location, held for the run. A run a crash left there is moved to
    runs/ first, so nothing is lost and nothing leaks into the next one."""
    LIVE.parent.mkdir(parents=True, exist_ok=True)
    LIVE.parent.chmod(0o700)  # /Users/Shared is shared; the template holds a login
    with open(LIVE.parent / "lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise EngineError(f"another run holds {LIVE.parent}: one run at a time per Mac") from None
        if LIVE.exists():
            try:
                stale = json.loads((LIVE / "run.json").read_text())["run_id"]
            except (OSError, KeyError, ValueError):
                stale = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-unknown"
            shutil.move(str(LIVE), str(ROOT / "runs" / f"{stale}-aborted"))
        if not port_free(PORT):
            raise EngineError(f"port {PORT} is in use: the eval engine needs it (the same on every Mac)")
        yield LIVE


def run(variant_path: Path, suite: str, seed: int, repeat: int, phases: list[int], timeout: float) -> Path:
    variant = json.loads(variant_path.read_text())
    data = ROOT / "data" / f"{suite}-s{seed}"
    if not (data / "manifest.json").exists():
        generate.write(suite, seed)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = f"{stamp}-{variant['name']}-{suite}-s{seed}-r{repeat}"
    final = ROOT / "runs" / run_id
    final.parent.mkdir(exist_ok=True)
    binary = ROOT / variant.get("binary", ".engines/target/debug/screenpipe")
    seeded_total, relayed = {"frames": 0, "events": 0}, None
    with live_slot(run_id) as run_dir:
        try:
            clone_template(run_dir)
            shutil.copy(data / "truth.json", run_dir / "truth.json")
            report = {"run_id": run_id, **provenance(variant, variant_path, data, binary, run_dir)}
            (run_dir / "run.json").write_text(json.dumps(report, indent=1))
            data_dir = run_dir / "home/.screenpipe"
            if found := context_files(data_dir):
                raise EngineError(f"Pi would put these in every agent's prompt: {found}")
            shim = data_dir / "pi-agent/bash-env.sh"
            shim.parent.mkdir(parents=True, exist_ok=True)
            shim.touch()  # mounted by inode; the engine rewrites it in place on each spawn
            engine = Engine(run_dir, port=PORT, binary=binary, extra_env={
                **variant.get("env", {}), "WFEVAL_REQUEST_LOG": str(run_dir / "requests.jsonl")})
            seen: set[Path] = set()
            with Sandbox(engine.port, rw=[data_dir / "pipes"], ro=[shim]) as box:
                engine.extra_env.update({"SANDBOX_CONTAINER": box.container, "DOCKER": box.docker,
                                         "DOCKER_HOST": box.docker_host})
                install_overrides(engine, variant)
                with engine:
                    engine.enable_workflows()
                    install_overrides(engine, variant)  # install may rewrite a pipe dir
                    engine.set_model(variant.get("model", "intelligent"), variant.get("preset"))
                    with open(run_dir / "seeded.jsonl", "a") as seeded_out:
                        for phase in phases:
                            doc = json.loads((data / f"phase{phase}.json").read_text())
                            meta = run_phase(engine, phase, doc, run_dir, seeded_out, seen,
                                             variant.get("price_model"), timeout)
                            seeded_total["frames"] += meta["frames"]
                            seeded_total["events"] += meta.get("events", 0)
                            print(f"phase {phase}: {meta['status']} ({meta['cycle_status']}) in "
                                  f"{meta['seconds']} s, {meta['usage']['agent_runs']} agent runs", file=sys.stderr)
                            if meta["status"] in ("rerun", "invalid"):
                                break
                relayed = box.portal.connections if box.portal else None
        finally:
            shutil.move(str(run_dir), str(final))

    run_dir = final
    report = json.loads((run_dir / "run.json").read_text())
    report.update({"finished_at": datetime.now(timezone.utc).isoformat(), "relayed_connections": relayed,
                   "contamination": contamination(run_dir, seeded_total), "host_path_leaks": leaks(run_dir),
                   "prompts": prompts(run_dir)})
    (run_dir / "run.json").write_text(json.dumps(report, indent=1))
    with open(run_dir / "results.jsonl", "w") as f:
        for g in grade_run(run_dir):
            g = {k: v for k, v in g.items() if k != "attributed"} | {
                "workflows_by_job": {a["title"]: a["job"] for a in g["attributed"]}}
            f.write(json.dumps({"variant": variant["name"], "suite": suite, "seed": seed, "repeat": repeat, **g,
                                "prompts": report["prompts"], "host_path_leaks": len(report["host_path_leaks"])})
                    + "\n")
    return run_dir


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wfeval-run")
    ap.add_argument("--variant", type=Path, default=ROOT / "variants" / "baseline.json")
    ap.add_argument("--suite", default="receipts")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--phases", default="1,2,3")
    ap.add_argument("--timeout", type=float, default=3600, help="seconds per cycle")
    a = ap.parse_args(argv)
    out = run(a.variant, a.suite, a.seed, a.repeat, [int(p) for p in a.phases.split(",")], a.timeout)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
