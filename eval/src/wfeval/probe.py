"""`wfeval probe-publish <step> --variant <v>`: what the engine's publication check says
about the drafts at a saved step, as given, with no model and nothing spent.

Restores the step in a free slot, then asks the engine to publish each open draft
exactly as the agents left it, as Review's first attempt would. A variant that changes
validation (evidence matching, the output contract) shows its effect here before a
stage run pays for Review's retries.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from .engine import Engine, EngineError, clone_template
from .run import ROOT, live_slot
from .stage import disable_all, restore_state


def probe(step_dir: Path, variant_path: Path, slot_no: int | None) -> list[dict]:
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
                for did, draft in sorted(ws.get("drafts", {}).items()):
                    if draft.get("status") != "open":
                        continue
                    ws = engine.workspace()["workspace"]
                    body = {"task": "workflow-review", "action": "publish", "draft_id": did,
                            "expected_revision": ws["revision"],
                            "catalog_revision": engine.catalog().get("revision", 0),
                            "note": "probe: the draft as given"}
                    try:
                        receipt = engine.post("/workflows/workspace", body)
                        out.append({"draft": did, "published": True, "changes": receipt.get("changes")})
                    except EngineError as e:
                        out.append({"draft": did, "published": False, "error": str(e)[:3000]})
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
    a = ap.parse_args(argv)
    results = probe(a.step, a.variant, a.slot)
    for r in results:
        print(json.dumps(r))
    print(f"{sum(r['published'] for r in results)} of {len(results)} drafts publish as given", file=sys.stderr)
    return 0
