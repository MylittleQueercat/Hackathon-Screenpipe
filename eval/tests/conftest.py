import json
from datetime import datetime, timedelta, timezone

import pytest

from wfeval import generate

NOW = datetime(2026, 10, 17, 15, 0, tzinfo=timezone(timedelta(hours=2)))


@pytest.fixture(scope="session")
def built():
    return generate.build("receipts", 1)


@pytest.fixture(scope="session")
def seeded(built):
    """Seeded frames as run.py records them, anchored at a fixed time."""
    phases, _ = built
    out, i = [], 0
    for p in (1, 2):
        doc = phases[p]
        for f, src in zip(generate.anchor(doc, NOW), doc["frames"]):
            i += 1
            out.append({"id": i, "phase": p, "timestamp": f["timestamp"], "app_name": f["app_name"],
                        "owner": src["owner"], "run": src["run"], "step": src["step"]})
    return out
