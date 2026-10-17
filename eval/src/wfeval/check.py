"""`wfeval check-engine`: does this engine (and this Mac) work with the harness? A minute,
no model calls, nothing spent.

Starts the variant's engine in a free slot on a copy of the template, then checks what
the harness relies on (README, "What the harness relies on"): the patch's seed route and
login lookup, the four workflow agents as installable Pi pipes, a cycle that starts with
the expected agents ready, the workspace and catalog shapes the grader and stage runs
read, executions, search over seeded frames, a state save and restore, and the sandbox
reaching the engine. What it can't check without a model: that the account's tier
offers the variant's model, and the shape of a published workflow (the first graded
phase shows it: a catalog without `analysis.workflows` scores every job missed).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from . import generate
from .engine import EVAL_TZ, TASKS, TEMPLATE, Engine, clone_template
from .run import ROOT, context_files, install_overrides, live_slot, port_free
from .sandbox import Sandbox, image_id, is_published
from .stage import disable_all, restore_state, save_state

class Checks:
    def __init__(self):
        self.failed = 0

    def __call__(self, name: str, ok: bool, detail: str = "", warn: bool = False) -> bool:
        mark = "ok  " if ok else ("warn" if warn else "FAIL")
        print(f"{mark}  {name}" + (f": {detail}" if detail else ""))
        if not ok and not warn:
            self.failed += 1
        return ok


def check(variant_path: Path, slot_no: int | None) -> int:
    variant = json.loads(variant_path.read_text())
    binary = ROOT / variant.get("binary", ".engines/target/debug/screenpipe")
    c = Checks()

    # ----------------------------------------------------------- before an engine
    if not c("engine binary", binary.exists(), str(binary) if binary.exists() else
             f"{binary} missing: run ./setup-engine.sh, or fix the variant's `binary`"):
        return 1
    if not c("template", (TEMPLATE / "home/.screenpipe/pi-agent").exists(),
             "" if (TEMPLATE / "home/.screenpipe/pi-agent").exists() else "run `uv run wfeval template`"):
        return 1
    home = TEMPLATE / "home"
    who = subprocess.run([str(binary), "whoami"], capture_output=True, text=True, timeout=60,
                         env={"HOME": str(home), "PATH": "/usr/bin:/bin", "SCREENPIPE_DATA_DIR": str(home / ".screenpipe")})
    c("cloud login in the template", "logged in as" in who.stdout,
      "" if "logged in as" in who.stdout else
      f"run: SCREENPIPE_DATA_DIR={home / '.screenpipe'} {binary} login")
    c("official app quit (port 3030 free)", port_free(3030),
      "" if port_free(3030) else "something listens on 3030: quit the screenpipe app (it records your screen)",
      warn=True)
    have = image_id()
    c("sandbox image", have is not None, "" if have else "run sandbox/load.sh")
    if have:
        c("sandbox image is the published one", is_published(), "" if is_published() else
          f"{have} matches neither published digest (sandbox/ changed?)", warn=True)

    # ------------------------------------------------------------- with an engine
    data = ROOT / "data/receipts-s1"
    if not (data / "manifest.json").exists():
        generate.write("receipts", 1)
    doc = json.loads((data / "phase1.json").read_text())
    with live_slot(slot_no) as (run_dir, port, k):
        try:
            clone_template(run_dir)
            data_dir = run_dir / "home/.screenpipe"
            found = context_files(data_dir)
            c("no AGENTS.md/CLAUDE.md for Pi to add", not found, ", ".join(found))
            engine = Engine(run_dir, port=port, binary=binary, extra_env=variant.get("env", {}))
            try:
                engine.start()
            except Exception as e:
                c(f"engine starts in slot {k} (port {port})", False, f"{e}")
                return 1
            c(f"engine starts in slot {k} (port {port})", True)
            try:
                frames = generate.anchor(doc, datetime.now(ZoneInfo(EVAL_TZ)))[:40]
                try:
                    ids = engine.seed(frames)
                    c("seed route (harness.patch)", len(ids) == len(frames), f"{len(ids)} of {len(frames)} frames")
                except Exception as e:
                    c("seed route (harness.patch)", False, f"{e}: is patches/harness.patch applied to this branch?")
                    return 1
                try:
                    engine.enable_workflows()
                    c("four workflow agents install and enable", True, ", ".join(TASKS))
                except Exception as e:
                    c("four workflow agents install and enable", False, str(e))
                    return 1
                pi = all((data_dir / "pipes" / t / "pipe.md").exists() for t in TASKS)
                c("agents are pipes the sandbox extension can join", pi)
                install_overrides(engine, variant)
                disable_all(engine)
                off = {t: engine.get(f"/pipes/{t}")["data"]["config"]["enabled"] for t in TASKS}
                c("agents disable (stage runs)", not any(off.values()), json.dumps(off))
                engine.post("/workflows/workspace", {"action": "start", "task": TASKS[0]})
                ws = engine.workspace()["workspace"]
                cycle = ws.get("cycle") or {}
                c("a cycle starts", cycle.get("status") == "running" and bool(cycle.get("start"))
                  and bool(cycle.get("end")), json.dumps({k: cycle.get(k) for k in ("status", "start", "end")}))
                ready = [t for t in TASKS if engine.workspace(t).get("ready")]
                c("Discover and Maintain are ready first", set(ready) == {"workflow-discover", "workflow-maintain"},
                  f"ready: {ready}", warn=True)
                c("workspace has drafts and a revision", isinstance(ws.get("drafts"), dict)
                  and isinstance(ws.get("revision"), int), f"keys: {sorted(ws)}")
                catalog = engine.catalog()
                shape = isinstance(catalog, dict) and isinstance((catalog.get("analysis") or {}).get("workflows", []), list)
                c("catalog is readable", shape, f"keys: {sorted(catalog)[:8]}")
                execs = engine.get(f"/pipes/{TASKS[0]}/executions?limit=5&include_output=false")
                c("executions endpoint", isinstance(execs.get("data"), list))
                hits = engine.get("/search?content_type=accessibility&limit=5&q=Paperwork")
                c("search finds seeded frames", bool(hits.get("data")), f"{len(hits.get('data') or [])} hits")

                before = ws.get("cycle", {}).get("id")
                engine.stop()
                save_state(data_dir, run_dir / "saved")
                restore_state(run_dir / "saved", data_dir, str(run_dir), run_dir)
                engine.start()
                engine.post("/workflows/rollout", {"enabled": True})
                after = engine.workspace()["workspace"]
                c("state saves and restores (snapshots)", (after.get("cycle") or {}).get("id") == before
                  and bool(engine.get("/search?content_type=accessibility&limit=1&q=Paperwork").get("data")))

                shim = data_dir / "pi-agent/bash-env.sh"
                shim.parent.mkdir(parents=True, exist_ok=True)
                shim.touch()
                if have:
                    with Sandbox(port, rw=[data_dir / "pipes"], ro=[shim]) as box:
                        for p in (3030, port):
                            r = box.run(f"curl -s -m 5 localhost:{p}/health", 20)
                            c(f"sandbox reaches the eval engine on {p}", r.returncode == 0 and '"status"' in r.stdout,
                              (r.stdout or r.stderr).strip()[:120])
                        r = box.run("curl -s -m 4 https://example.com", 20)
                        c("sandbox has no network", r.returncode != 0)
            finally:
                engine.stop()
        finally:
            shutil.rmtree(run_dir, ignore_errors=True)

    print("\nall checks passed: this engine works with the harness" if not c.failed
          else f"\n{c.failed} check(s) failed")
    return 1 if c.failed else 0


def main(argv: list[str] | None = None) -> int:
    from .engine import SLOTS
    ap = argparse.ArgumentParser(prog="wfeval check-engine")
    ap.add_argument("--variant", type=Path, default=ROOT / "variants" / "baseline.json")
    ap.add_argument("--slot", type=int, help=f"0..{SLOTS - 1}; default: the first free one")
    a = ap.parse_args(argv)
    try:
        return check(a.variant, a.slot)
    except Exception as e:  # a crash is a failed check, said plainly
        print(f"FAIL  {type(e).__name__}: {e}", file=sys.stderr)
        return 1
