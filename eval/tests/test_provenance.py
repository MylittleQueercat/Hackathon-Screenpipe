"""The engine's recorded changes don't depend on how the patch was applied."""

import subprocess

from wfeval import run


def test_changes_same_whether_new_files_are_staged_or_not(tmp_path, monkeypatch):
    src = tmp_path / "upstream"
    src.mkdir()
    g = lambda *a: subprocess.run(["git", "-C", str(src), *a], check=True, capture_output=True)
    g("init", "-q")
    (src / "kept.rs").write_text("a\n")
    (src / "gone.rs").write_text("b\n")
    g("add", ".")
    g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base")
    (src / "kept.rs").write_text("a2\n")
    (src / "gone.rs").unlink()
    (src / "new.rs").write_text("c\n")
    monkeypatch.setattr(run, "ENGINES", tmp_path)

    unstaged = run.changes()  # what plain `git apply` leaves
    g("add", "-A")
    assert run.changes() == unstaged  # what `git apply --index` leaves
    assert set(unstaged) == {"kept.rs", "gone.rs", "new.rs"} and unstaged["gone.rs"] is None
