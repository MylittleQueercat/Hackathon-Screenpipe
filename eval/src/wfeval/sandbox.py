"""The container a run's agent tools execute in (ported from eval-sketch's sandbox).

Pi and the engine stay on the host; `agent/sandbox-tools.ts` sends bash, read, write
and edit here. The container has no network. Its one way out is `portal.py`, reached
through a `docker exec` pipe: it listens on the container's own 127.0.0.1:3030 and
the host side connects every relayed connection to the eval engine's port, and only
there. Mounted: the run's pipe directories (read-write, at their host paths, since
agents save working files in their pipe dir) and the curl auth shim (read-only).
"""

from __future__ import annotations

import os
import shutil
import socket
import struct
import subprocess
import threading
import uuid
from pathlib import Path

IMAGE = "wfeval-sandbox:latest"
LABEL = "wfeval.sandbox"
PORT_IN_BOX = 3030
HEADER = struct.Struct(">IBI")
OPEN, DATA, CLOSE = 0, 1, 2


def docker_bin() -> str:
    found = os.environ.get("DOCKER") or shutil.which("docker") or str(Path.home() / ".orbstack/bin/docker")
    if not Path(found).exists():
        raise RuntimeError("docker not found: set DOCKER")
    return found


def docker_host(docker: str) -> str:
    """The daemon endpoint of the current context, for processes started without this
    environment (the engine's is built from scratch, with its own HOME)."""
    if os.environ.get("DOCKER_HOST"):
        return os.environ["DOCKER_HOST"]
    r = subprocess.run([docker, "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError(f"cannot resolve the docker endpoint: {r.stderr.strip()}")
    return r.stdout.strip()


def image_id(image: str = IMAGE) -> str | None:
    r = subprocess.run([docker_bin(), "image", "inspect", "--format", "{{.Id}}", image],
                       capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def published() -> tuple[str, str]:
    """(config digest, manifest digest) of the published image, pinned in load.sh."""
    pins = dict(line.split("=", 1) for line in (Path(__file__).resolve().parents[2] / "sandbox/load.sh")
                .read_text().splitlines() if line.startswith(("PUBLISHED=", "ID=")))
    return pins["ID"].strip(), pins["PUBLISHED"].strip().split("@", 1)[1]


def is_published(image: str = IMAGE) -> bool:
    """The image is the published one. Docker names an image by its config digest (the
    classic store, OrbStack) or by its manifest digest (the containerd store, Docker
    Desktop's default): either one, or the manifest digest among its RepoDigests."""
    r = subprocess.run([docker_bin(), "image", "inspect", "--format", "{{.Id}} {{join .RepoDigests \" \"}}", image],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return False
    config, manifest = published()
    names = r.stdout.split()
    return names[0] in (config, manifest) or any(n.endswith("@" + manifest) for n in names[1:])


class Portal:
    """Host side of portal.py: one engine port, nothing else. Inside, the box listens on
    3030 and on the engine's own port; both reach that engine."""

    def __init__(self, docker: str, container: str, target_port: int):
        self.target = ("127.0.0.1", target_port)
        self.proc = subprocess.Popen(
            [docker, "exec", "--interactive", container, "/bin/python3", "-u", "/opt/portal/portal.py",
             str(PORT_IN_BOX), str(target_port)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.lock = threading.Lock()
        self.conns: dict[int, socket.socket] = {}
        self.connections = 0
        ready = self.proc.stderr.readline()
        if b"portal ready" not in ready:
            raise RuntimeError(f"portal failed to start: {ready!r}")
        threading.Thread(target=self._from_box, daemon=True).start()

    def _send(self, cid: int, kind: int, payload: bytes = b"") -> None:
        with self.lock:
            try:
                self.proc.stdin.write(HEADER.pack(cid, kind, len(payload)) + payload)
                self.proc.stdin.flush()
            except (BrokenPipeError, ValueError):
                pass

    def _pump(self, cid: int, conn: socket.socket) -> None:
        try:
            while chunk := conn.recv(65536):
                self._send(cid, DATA, chunk)
        except OSError:
            pass
        self._send(cid, CLOSE)

    def _from_box(self) -> None:
        out = self.proc.stdout
        while header := out.read(HEADER.size):
            cid, kind, length = HEADER.unpack(header)
            payload = out.read(length) if length else b""
            if kind == OPEN:
                self.connections += 1
                try:
                    conn = socket.create_connection(self.target, timeout=10)
                    conn.settimeout(None)
                except OSError:
                    self._send(cid, CLOSE)
                    continue
                self.conns[cid] = conn
                threading.Thread(target=self._pump, args=(cid, conn), daemon=True).start()
            elif kind == DATA and cid in self.conns:
                try:
                    self.conns[cid].sendall(payload)
                except OSError:
                    pass
            elif kind == CLOSE and cid in self.conns:
                conn = self.conns.pop(cid)
                try:
                    conn.shutdown(socket.SHUT_WR)
                except OSError:
                    pass

    def close(self) -> None:
        for conn in list(self.conns.values()):
            conn.close()
        self.proc.kill()
        self.proc.wait()


class Sandbox:
    def __init__(self, engine_port: int, rw: list[Path], ro: list[Path], image: str = IMAGE,
                 memory: str = "1g", cpus: str = "2"):
        self.engine_port, self.image, self.memory, self.cpus = engine_port, image, memory, cpus
        self.rw = [Path(p).resolve() for p in rw]
        self.ro = [Path(p).resolve() for p in ro]
        self.docker = docker_bin()
        self.docker_host = docker_host(self.docker)
        self.container: str | None = None
        self.image_id: str | None = None
        self.portal: Portal | None = None

    def __enter__(self) -> "Sandbox":
        self.image_id = image_id(self.image)
        if not self.image_id:
            raise RuntimeError(f"image {self.image} not loaded: run sandbox/load.sh")
        name = f"wfeval-{uuid.uuid4().hex[:12]}"
        mounts = [a for p in self.rw for a in ("--mount", f"type=bind,source={p},target={p}")]
        mounts += [a for p in self.ro for a in ("--mount", f"type=bind,source={p},target={p},readonly")]
        cmd = [self.docker, "run", "--detach", "--name", name, "--label", LABEL,
               "--hostname", "eval",  # not the random container id
               "--network", "none", "--read-only",
               "--tmpfs", "/tmp:rw,size=256m,mode=1777",
               *mounts,
               "--user", f"{os.getuid()}:{os.getgid()}",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "--pids-limit", "256", "--memory", self.memory, "--memory-swap", self.memory,
               "--cpus", self.cpus, self.image]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"sandbox failed to start: {r.stderr.strip()}")
        self.container = name
        self.portal = Portal(self.docker, name, self.engine_port)
        return self

    def run(self, command: str, timeout: int = 30) -> subprocess.CompletedProcess:
        assert self.container, "use as a context manager"
        return subprocess.run([self.docker, "exec", self.container, "/bin/timeout", "-s", "KILL",
                               str(timeout), "/bin/bash", "-c", command],
                              capture_output=True, text=True, timeout=timeout + 15)

    def __exit__(self, *exc) -> None:
        if self.portal:
            self.portal.close()
            self.portal = None
        if self.container:
            subprocess.run([self.docker, "rm", "--force", self.container], capture_output=True)
            self.container = None


def cleanup() -> int:
    d = docker_bin()
    ids = subprocess.run([d, "ps", "-aq", "--filter", f"label={LABEL}"], capture_output=True,
                         text=True).stdout.split()
    if ids:
        subprocess.run([d, "rm", "--force", *ids], capture_output=True)
    return len(ids)
