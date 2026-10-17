"""What the agents see of the machine: context files, host paths, run nonces."""

import json

from wfeval import run


def test_context_files_found_on_the_way_up(tmp_path):
    data = tmp_path / "a" / "home" / ".screenpipe"
    for task in run.TASKS:
        (data / "pipes" / task).mkdir(parents=True)
    assert run.context_files(data) == []
    (tmp_path / "a" / "AGENTS.md").write_text("project rules")
    (data / "pi-agent").mkdir()
    (data / "pi-agent" / "CLAUDE.md").write_text("global")
    found = run.context_files(data)
    assert str(tmp_path / "a" / "AGENTS.md") in found and str(data / "pi-agent" / "CLAUDE.md") in found


def test_live_path_has_no_context_files_above():
    assert run.context_files(run.LIVE / "home" / ".screenpipe") == []


def test_nonces_masked_and_prompts_hashed(tmp_path):
    a = "Run date: 2026-10-17\nRun context time: 2026-10-17T14:13:52.590338+02:00\ncycle 1ab8454a-3b7b-4ae5-af81-9bbb516dfd2a sp_pipe_0123456789abcdef"
    b = a.replace("17", "18").replace("1ab8454a", "9fec47c2").replace("0123456789abcdef", "fedcba9876543210")
    for name, text in (("a", a), ("b", b)):
        d = tmp_path / name
        d.mkdir()
        (d / "requests.jsonl").write_text(json.dumps(
            {"type": "request", "task": "workflow-discover", "instructions": ["sys"], "input": [{"role": "user", "content": text}]}))
    assert run.prompts(tmp_path / "a") == run.prompts(tmp_path / "b")
    assert "<time>" in (tmp_path / "a" / "prompts" / "workflow-discover.input.txt").read_text()


def test_host_paths_are_leaks(tmp_path):
    (tmp_path / "requests.jsonl").write_text(json.dumps({"instructions": f"cwd {run.ROOT}/runs/x and /Users/Shared/wfeval/live"}))
    assert run.leaks(tmp_path) == [f"{run.ROOT}/runs/x"]
