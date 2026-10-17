import json

from wfeval.usage import phase_usage


def test_usage_from_pipe_log(tmp_path):
    stdout = "\n".join(json.dumps(e) for e in [
        {"type": "message_end", "message": {"role": "user"}},
        {"type": "tool_execution_start"},
        {"type": "message_end", "message": {"role": "assistant", "usage": {"input": 100, "cacheRead": 900, "output": 20}}},
        {"type": "message_end", "message": {"role": "assistant", "usage": {"input": 50, "cacheRead": 1000, "output": 30}}},
    ]) + "\nnot json\n"
    log = tmp_path / "workflow-discover-1.json"
    log.write_text(json.dumps({"pipe_name": "workflow-discover", "success": True, "stdout": stdout}))
    u = phase_usage([log])
    assert (u["input"], u["cacheRead"], u["output"], u["requests"], u["tool_calls"]) == (150, 1900, 50, 2, 1)
    assert u["peak_context"] == 1050 and u["agent_runs"] == 1 and u["cost_usd"] is None


def test_model_fallback_is_caught(tmp_path):
    from wfeval.run import model_fallback
    assert model_fallback(tmp_path) is None
    (tmp_path / "engine.log").write_text(
        "WARN screenpipe_core::agents::pi: model 'claude-haiku-4-5' is not available on this tier "
        "(allowed: [auto, gpt-5.4]); falling back to 'auto' so the pipe doesn't fail\n")
    assert model_fallback(tmp_path) == "claude-haiku-4-5 -> auto"


def test_request_log_is_the_full_record(tmp_path):
    import json
    from wfeval.usage import phase_usage
    log = tmp_path / "requests.jsonl"
    rows = [{"type": "request", "at": "2026-10-17T11:00:01Z", "task": "workflow-review"},
            {"type": "usage", "at": "2026-10-17T11:00:02Z", "task": "workflow-review",
             "usage": {"input": 10, "cacheRead": 90, "output": 5}},
            {"type": "tool", "at": "2026-10-17T11:00:03Z", "task": "workflow-review", "tool": "bash"},
            {"type": "usage", "at": "2026-10-17T12:00:00Z", "task": "workflow-review",
             "usage": {"input": 999, "output": 999}}]  # after the phase
    log.write_text("\n".join(json.dumps(r) for r in rows))
    u = phase_usage([], None, log, "2026-10-17T10:59:00+00:00", "2026-10-17T11:30:00+00:00")
    assert (u["source"], u["input"], u["cacheRead"], u["output"], u["requests"], u["tool_calls"]) == \
        ("request_log", 10, 90, 5, 1, 1)
    assert u["peak_context"] == 100 and u["by_task"]["workflow-review"]["requests"] == 1
    assert phase_usage([], None, log, "2026-10-18T00:00:00+00:00", "2026-10-18T01:00:00+00:00")["source"] == "pipe_logs"
