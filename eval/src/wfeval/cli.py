"""`wfeval <command>`: generate, template, check-engine, run, snapshot, stage, grade,
compare, cleanup."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, argv = sys.argv[1], sys.argv[2:]
    if cmd == "generate":
        from .generate import main as m
        return m(argv)
    if cmd == "template":
        from .engine import make_template
        data = make_template()
        print(f"template ready: {data}\nlog in once (opens a browser):\n"
              f"  SCREENPIPE_DATA_DIR={data} {Path(__file__).resolve().parents[2]}/.engines/target/debug/screenpipe login")
        return 0
    if cmd == "check-engine":
        from .check import main as m
        return m(argv)
    if cmd == "run":
        from .run import main as m
        return m(argv)
    if cmd == "snapshot":
        from .stage import main_snapshot as m
        return m(argv)
    if cmd == "stage":
        from .stage import main_stage as m
        return m(argv)
    if cmd == "grade":
        from .grade import grade_run
        truth = None
        if argv[:1] == ["--truth"]:  # regrade against the current truth: --truth data/<suite>-s<seed>/truth.json
            truth, argv = Path(argv[1]), argv[2:]
        for run in argv:
            for g in grade_run(Path(run), truth):
                g.pop("attributed")
                print(json.dumps(g))
        return 0
    if cmd == "compare":
        from .compare import main as m
        return m(argv)
    if cmd == "cleanup":
        from .sandbox import cleanup
        print(f"removed {cleanup()} sandbox containers")
        return 0
    print(f"unknown command {cmd}\n{__doc__}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
