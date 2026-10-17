"""Escape attempts against the run container (ported from eval-sketch's sandbox tests)."""

import http.server
import threading

import pytest

from wfeval.engine import free_port
from wfeval.sandbox import Sandbox, image_id

pytestmark = pytest.mark.skipif(not image_id(), reason="sandbox image not loaded")


@pytest.fixture(scope="module")
def box(tmp_path_factory):
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"eval-engine"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    port = free_port()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    rw = tmp_path_factory.mktemp("pipes")
    ro = tmp_path_factory.mktemp("ro") / "shim.sh"
    ro.write_text("# shim\n")
    with Sandbox(port, rw=[rw], ro=[ro]) as b:
        b.rw_dir, b.ro_file = rw, ro
        yield b
    srv.shutdown()


def sh(box, cmd):
    r = box.run(cmd, 20)
    return r.returncode, (r.stdout + r.stderr).strip()


def test_3030_is_the_eval_engine(box):
    assert sh(box, "curl -s localhost:3030/health") == (0, "eval-engine")


def test_engine_port_is_the_eval_engine_too(box):
    # The pipe prompt names the engine's real port.
    assert sh(box, f"curl -s localhost:{box.engine_port}/health") == (0, "eval-engine")


@pytest.mark.parametrize("url", ["https://example.com", "http://host.docker.internal:3030/health",
                                 "http://0.250.250.254:3030/health", "http://192.168.1.1/"])
def test_no_network(box, url):
    code, _ = sh(box, f"curl -s -m 4 {url}")
    assert code != 0


def test_host_files_invisible(box):
    import pathlib
    home = pathlib.Path.home()
    assert sh(box, f"ls {home}/.screenpipe")[0] != 0
    assert sh(box, f"ls {home}/.ssh")[0] != 0


def test_writes(box):
    assert sh(box, f"echo x > {box.rw_dir}/f && cat {box.rw_dir}/f") == (0, "x")
    assert sh(box, f"echo x >> {box.ro_file}")[0] != 0
    assert sh(box, "echo x > /etc/x")[0] != 0
    assert sh(box, "echo x > /tmp/x && cat /tmp/x") == (0, "x")


def test_unprivileged(box):
    assert sh(box, "cat /proc/self/status | grep CapEff")[1].endswith("0000000000000000")
