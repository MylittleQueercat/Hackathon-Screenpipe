"""Negative controls on a real catalog (baseline, Sonnet 5, receipts seed 1, phase 1,
which scored 11/11): each damage a variant could do must cost exactly its check."""

import copy
import json
import re
from pathlib import Path

import pytest

from wfeval.grade import grade_phase

RUN = Path(__file__).parent / "fixtures/sonnet-s1-phase1"
TRUTH = json.loads((RUN / "truth.json").read_text())
SEEDED = [json.loads(l) for l in (RUN / "seeded.jsonl").read_text().splitlines()]
CATALOG = json.loads((RUN / "catalog.json").read_text())


def grade(catalog):
    g = grade_phase(1, catalog, SEEDED, TRUTH)
    return sorted(k for k, v in g["checks"].items() if v["pass"] is False), g["mistakes"]


def workflow(catalog, word):
    return next(w for w in catalog["analysis"]["workflows"] if word in w["title"])


def scrub(value, pattern):
    """Remove a phrase from everything the agents wrote, not from cited evidence."""
    if isinstance(value, str):
        return pattern.sub("", value)
    if isinstance(value, list):
        return [scrub(v, pattern) for v in value]
    if isinstance(value, dict):
        return {k: v if k in ("evidence", "quote", "timestamp", "app") else scrub(v, pattern) for k, v in value.items()}
    return value


def test_as_run_passes():
    assert grade(CATALOG) == ([], {})


def drop_email(c):
    c["analysis"]["workflows"].remove(workflow(c, "Email"))


def cut_duplicate(c):
    words = next(x for x in TRUTH["checks"] if x["id"] == "duplicate")["any"]
    pattern = re.compile("|".join(map(re.escape, words)), re.I)
    ws = c["analysis"]["workflows"]
    i = ws.index(workflow(c, "Receipt"))
    ws[i] = scrub(ws[i], pattern)


def invent_evidence(c):
    workflow(c, "Receipt")["evidence"].append({"timestamp": "2026-10-16T03:00:00Z", "app": "Finder"})


def merge_jobs(c):
    receipts, email = workflow(c, "Receipt"), workflow(c, "Email")
    receipts["evidence"] += email["evidence"] * 2
    c["analysis"]["workflows"] = [receipts]


@pytest.mark.parametrize("damage, failed, tag", [
    (drop_email, ["email_separate"], "job_missed"),
    (cut_duplicate, ["duplicate"], "exception_missed:duplicate"),
    (invent_evidence, ["evidence_resolves"], "invented_evidence"),
    (merge_jobs, ["email_separate"], "jobs_merged"),
])
def test_damage_costs_its_check(damage, failed, tag):
    c = copy.deepcopy(CATALOG)
    damage(c)
    checks, mistakes = grade(c)
    assert checks == failed and set(mistakes) == {tag}
