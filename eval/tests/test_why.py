import json

from wfeval.why import explain


def test_each_rejected_item_gets_its_reason(tmp_path):
    data, run = tmp_path / "data", tmp_path / "run"
    (data / "s-s1").mkdir(parents=True)
    run.mkdir()
    frames = [{"app_name": "TextEdit", "window_name": "tracker.csv", "accessibility_text": "row one\nsaved ⟦d:-1⟧",
               "events": []},
              {"app_name": "TextEdit", "window_name": "tracker.csv", "accessibility_text": "row two", "events": []}]
    (data / "s-s1" / "phase1.json").write_text(json.dumps({"frames": frames}))
    (run / "run.json").write_text(json.dumps({"data": {"suite": "s", "seed": 1}}))
    (run / "seeded.jsonl").write_text("\n".join(json.dumps({"id": 10 + i, "phase": 1, "timestamp": t}) for i, t in
                                                enumerate(["2026-10-16T11:00:00.250Z", "2026-10-16T11:00:05.500Z"])))
    cite = lambda t, q: {"kind": "action", "text": "x", "timestamp": t, "app": "TextEdit", "quote": q}
    payload = {"stages": [{"evidence": [{"timestamp": "2026-10-16T11:00:00.250Z", "app": "TextEdit"}],
                           "procedure": [cite("2026-10-16T11:00:00.250Z", "saved 15 Oct 2026"),
                                         cite("2026-10-16T11:00:05.500Z", "row two"),
                                         cite("2026-10-16T11:00:00.250Z", "tracker.csv"),
                                         cite("2026-10-16T11:00:00Z", "row one")]}]}
    rows = [{"type": "workspace", "action": "handoff", "draft_id": "d1", "ok": True, "args": {"payload": payload}},
            {"type": "workspace", "action": "publish", "draft_id": "d1", "ok": False, "at": "2026-10-17T20:00:00Z",
             "task": "workflow-review", "reply": "Workflow operation failed: 422: Stage 1 retained 1 of 4"}]
    (run / "requests.jsonl").write_text("\n".join(json.dumps(r) for r in rows))
    [rejection] = explain(run, data)
    problems = [x["problems"] for x in rejection["stages"][0]["procedure"]]
    assert problems[0] == []  # dates rendered as at seed time
    assert problems[1] == ["cites a capture missing from this stage's evidence"]
    assert problems[2] == ["quote not in that capture (it is the window title)"]
    assert problems[3] == ["cites a capture missing from this stage's evidence",
                           "no capture at that exact time (one in that second)"]
