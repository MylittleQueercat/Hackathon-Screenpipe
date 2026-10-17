"""Slots, snapshot state, and how stage runs are graded and paired."""

import json
from pathlib import Path

import pytest

from wfeval import compare, engine, run, stage
from wfeval.grade import grade_phase

RUN = Path(__file__).parent / "fixtures/sonnet-s1-phase1"
TRUTH = json.loads((RUN / "truth.json").read_text())
SEEDED = [json.loads(l) for l in (RUN / "seeded.jsonl").read_text().splitlines()]
CATALOG = json.loads((RUN / "catalog.json").read_text())


def test_slot_zero_is_the_fixed_location():
    assert engine.slot(0) == (engine.LIVE, engine.PORT)
    assert engine.slot(2) == (Path("/Users/Shared/wfeval/live2"), engine.PORT + 2)
    with pytest.raises(ValueError):
        engine.slot(engine.SLOTS)


def test_slot_path_and_port_mask_to_slot_zero():
    root, port = engine.slot(1)
    text = f"cwd {root}/home/.screenpipe/pipes/workflow-review\nScreenpipe API: http://localhost:{port}"
    assert run.masked(text, 1) == run.masked(text.replace(str(root), str(engine.LIVE))
                                             .replace(f":{port}", f":{engine.PORT}"), 0)
    assert str(root) not in run.masked(text, 1)


def test_live_slot_takes_the_first_free_one(tmp_path, monkeypatch):
    base = tmp_path / "wfeval" / "live"
    monkeypatch.setattr(run, "LIVE", base)
    monkeypatch.setattr(run, "slot", lambda k: (base if k == 0 else base.with_name(f"live{k}"), 45000 + k))
    with run.live_slot() as (root0, _, k0):
        with run.live_slot() as (root1, port1, k1):
            assert (k0, k1) == (0, 1) and root1.name == "live1" and port1 == 45001
        with pytest.raises(run.EngineError):
            with run.live_slot(0):
                pass


def test_state_round_trip_drops_per_start_files(tmp_path):
    data = tmp_path / "a" / "home/.screenpipe"
    (data / "storage/g").mkdir(parents=True)
    (data / "storage/g/index.sqlite").write_bytes(b"db")
    (data / "storage/g/index.sqlite.quarantine.reserve.json").write_text("{}")
    (data / "pipes/workflow-review/logs").mkdir(parents=True)
    (data / "pipes/workflow-review/logs/1.json").write_text("{}")
    (data / "pipes/workflow-review/pipe.md").write_text(f"notes in {tmp_path / 'a'}/x")
    (data / "workflows").mkdir()
    (data / "workflows/catalog.json").write_text("{}")
    (data / "secrets.sqlite").write_bytes(b"login")
    stage.save_state(data, tmp_path / "state")
    saved = {str(p.relative_to(tmp_path / "state")) for p in (tmp_path / "state").rglob("*") if p.is_file()}
    assert saved == {"storage/g/index.sqlite", "pipes/workflow-review/pipe.md", "workflows/catalog.json"}

    other = tmp_path / "b" / "home/.screenpipe"
    (other / "workflows").mkdir(parents=True)
    (other / "workflows/catalog.json").write_text('{"old": true}')
    (other / "secrets.sqlite").write_bytes(b"template login")
    stage.restore_state(tmp_path / "state", other, str(tmp_path / "a"), tmp_path / "b")
    assert (other / "workflows/catalog.json").read_text() == "{}"
    assert (other / "secrets.sqlite").read_bytes() == b"template login"  # the template's, kept
    assert (other / "pipes/workflow-review/pipe.md").read_text() == f"notes in {tmp_path / 'b'}/x"


def test_drafts_view_grades_what_drafts_propose():
    workflows = CATALOG["analysis"]["workflows"]
    ws = {"drafts": {f"d{i}": {"id": f"d{i}", "status": "open", "version": i, "payload": w}
                     for i, w in enumerate(workflows)}}
    ws["drafts"]["x"] = {"id": "x", "status": "rejected", "version": 9, "payload": workflows[0]}
    drafts = grade_phase(1, stage.read_view(ws, CATALOG, "drafts"), SEEDED, TRUTH)
    published = grade_phase(1, CATALOG, SEEDED, TRUTH)
    assert drafts["checks"] == published["checks"]  # the rejected copy is not a duplicate
    assert drafts["workflows"] == len(workflows)


def result(variant, repeat, passed, snapshot=None, stage_task=None):
    return {"variant": variant, "suite": "receipts", "seed": 1, "repeat": repeat, "phase": 1,
            "snapshot": snapshot, "stage": stage_task, "status": "done",
            "checks": {"found": {"pass": passed}}, "mistakes": {}, "usage": {"requests": 10}, "seconds": 60}


def test_compare_pairs_stage_results_by_step_and_agent(tmp_path, capsys):
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir(), b.mkdir()
    step = "snap/steps/04-p1-workflow-review"
    (a / "results.jsonl").write_text("\n".join(json.dumps(r) for r in [
        result("base", 1, True), result("base", 1, False, step, "workflow-review")]))
    (b / "results.jsonl").write_text("\n".join(json.dumps(r) for r in [
        result("new", 3, True), result("new", 7, True, step, "workflow-review")]))
    assert compare.main(["--a", str(a), "--b", str(b)]) == 0
    out = capsys.readouterr().out
    assert "2 paired phases" in out and "fixed 1, broken 0" in out
    assert "workflow-review on snap/steps/04-p1-workflow-review" in out


def test_discover_drafts_cite_through_sources():
    frame = next(f for f in SEEDED if f["owner"] == "receipts")
    payload = {"candidateTitle": "File receipts", "openQuestions": ["rename, then the tracker row?"],
               "sources": [{"app": frame["app_name"], "timestamps": [frame["timestamp"], "2026-10-16T11:29-12:24Z"]}]}
    ws = {"drafts": {"d": {"id": "d", "status": "open", "version": 1, "payload": payload}}}
    g = grade_phase(1, stage.read_view(ws, CATALOG, "drafts"), SEEDED, TRUTH)
    assert g["checks"]["found"]["pass"] and g["checks"]["evidence_resolves"]["pass"]
    assert g["attributed"][0]["title"] == "File receipts"
