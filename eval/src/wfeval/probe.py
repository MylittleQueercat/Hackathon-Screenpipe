"""`wfeval probe-publish <step> --variant <v>`: what the engine's publication check says
about the drafts at a saved step, as given, with no model and nothing spent.

Restores the step in a free slot, then asks the engine to publish each open draft
exactly as the agents left it, as Review's first attempt would. A variant that changes
validation (evidence matching, the output contract) shows its effect here before a
stage run pays for Review's retries. `--parallel` sends all those publishes at once
against the same revisions, as Review does when it publishes several drafts in one turn.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .engine import Engine, EngineError, clone_template
from .run import ROOT, live_slot
from .stage import disable_all, restore_state


def probe(step_dir: Path, variant_path: Path, slot_no: int | None,
          parallel: bool = False) -> list[dict]:
    variant = json.loads(variant_path.read_text())
    binary = ROOT / variant.get("binary", ".engines/target/debug/screenpipe")
    meta = json.loads((step_dir.parent.parent / "snapshot.json").read_text())
    out = []
    with live_slot(slot_no) as (run_dir, port, _):
        try:
            clone_template(run_dir)
            restore_state(step_dir / "state", run_dir / "home/.screenpipe", meta["root"], run_dir)
            engine = Engine(run_dir, port=port, binary=binary, extra_env=variant.get("env", {}))
            engine.start()
            try:
                disable_all(engine)
                ws = engine.workspace()["workspace"]
                drafts = [did for did, d in sorted(ws.get("drafts", {}).items())
                          if d.get("status") == "open"]

                def publish(did: str, ws_rev: int, cat_rev: int) -> dict:
                    body = {"task": "workflow-review", "action": "publish", "draft_id": did,
                            "expected_revision": ws_rev, "catalog_revision": cat_rev,
                            "note": "probe: the draft as given"}
                    try:
                        receipt = engine.post("/workflows/workspace", body)
                        return {"draft": did, "published": True, "changes": receipt.get("changes")}
                    except EngineError as e:
                        return {"draft": did, "published": False, "error": str(e)[:3000]}

                if parallel:
                    ws_rev, cat_rev = ws["revision"], engine.catalog().get("revision", 0)
                    with ThreadPoolExecutor(len(drafts) or 1) as pool:
                        out = list(pool.map(lambda did: publish(did, ws_rev, cat_rev), drafts))
                else:
                    for did in drafts:
                        out.append(publish(did, engine.workspace()["workspace"]["revision"],
                                           engine.catalog().get("revision", 0)))
            finally:
                engine.stop()
        finally:
            shutil.rmtree(run_dir, ignore_errors=True)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wfeval probe-publish")
    ap.add_argument("step", type=Path, help="snapshots/<id>/steps/<NN>-...")
    ap.add_argument("--variant", type=Path, default=ROOT / "variants" / "baseline.json")
    ap.add_argument("--slot", type=int)
    ap.add_argument("--parallel", action="store_true",
                    help="publish all open drafts at once against the same revisions")
    a = ap.parse_args(argv)
    results = probe(a.step, a.variant, a.slot, a.parallel)
    for r in results:
        print(json.dumps(r))
    print(f"{sum(r['published'] for r in results)} of {len(results)} drafts publish as given", file=sys.stderr)
    return 0
