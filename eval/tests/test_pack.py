"""`wfeval pack` sends what grading and stage runs need, and no login."""

import json
import zipfile

from wfeval import pack

JWT = "eyJ" + "a" * 30 + "." + "b" * 30 + "." + "c" * 20


def test_pack_leaves_home_out_and_strips_store_logins(tmp_path, monkeypatch):
    monkeypatch.setattr(pack, "account_email", lambda: b"me@example.com")
    run = tmp_path / "runs/r1"
    (run / "phase1").mkdir(parents=True)
    (run / "phase1/catalog.json").write_text("{}")
    (run / "home/.screenpipe/pi-config").mkdir(parents=True)
    (run / "home/.screenpipe/pi-config/auth.json").write_text(JWT)
    (run / "tmp").mkdir()
    (run / "tmp/x").write_text(JWT)
    state = tmp_path / "snapshots/s1/steps/01/state"
    state.mkdir(parents=True)
    (state / "store.bin").write_text(json.dumps({"settings": {"userId": JWT, "user": {"email": "me@example.com"}, "aiPresets": [1]}}))

    assert pack.pack(run, tmp_path / "r1.zip") == 0
    assert zipfile.ZipFile(tmp_path / "r1.zip").namelist() == ["runs/r1/phase1/catalog.json"]
    assert pack.pack(tmp_path / "snapshots/s1", tmp_path / "s1.zip") == 0
    z = zipfile.ZipFile(tmp_path / "s1.zip")
    assert json.loads(z.read("snapshots/s1/steps/01/state/store.bin")) == {"settings": {"aiPresets": [1]}}


def test_pack_refuses_a_token_anywhere_else(tmp_path, monkeypatch):
    monkeypatch.setattr(pack, "account_email", lambda: b"me@example.com")
    run = tmp_path / "runs/r1"
    run.mkdir(parents=True)
    (run / "engine.log").write_text(f"bearer {JWT}")
    assert pack.pack(run, tmp_path / "r1.zip") == 1
    assert not (tmp_path / "r1.zip").exists() and not list(tmp_path.glob("*.part"))
    (run / "engine.log").write_text("signed in as me@example.com")
    assert pack.pack(run, tmp_path / "r1.zip") == 1
