"""Container side of the sandbox's only channel out: listens on 127.0.0.1:<port>... inside
the container (network none, so this loopback is the container's own) and relays each
connection over stdin/stdout to the host, which connects it to the eval engine and
nothing else. Every port reaches that same engine: 3030 for the curl auth shim, and the
engine's own port, which the pipe prompt states. Frames: >IBI (connection id, kind, length) then the payload; kinds are
0 open, 1 data, 2 close.
"""

import socket
import struct
import sys
import threading

HEADER = struct.Struct(">IBI")
OPEN, DATA, CLOSE = 0, 1, 2

out = sys.stdout.buffer
out_lock = threading.Lock()
conns: dict[int, socket.socket] = {}
conns_lock = threading.Lock()


def send(cid: int, kind: int, payload: bytes = b"") -> None:
    with out_lock:
        out.write(HEADER.pack(cid, kind, len(payload)) + payload)
        out.flush()


def pump(cid: int, conn: socket.socket) -> None:
    try:
        while chunk := conn.recv(65536):
            send(cid, DATA, chunk)
    except OSError:
        pass
    send(cid, CLOSE)


def from_host() -> None:
    inp = sys.stdin.buffer
    while header := inp.read(HEADER.size):
        cid, kind, length = HEADER.unpack(header)
        payload = inp.read(length) if length else b""
        with conns_lock:
            conn = conns.get(cid)
        if conn is None:
            continue
        if kind == DATA:
            try:
                conn.sendall(payload)
            except OSError:
                pass
        elif kind == CLOSE:
            with conns_lock:
                conns.pop(cid, None)
            try:
                conn.shutdown(socket.SHUT_WR)
            except OSError:
                pass


next_cid = 0


def accept(server: socket.socket) -> None:
    global next_cid
    while True:
        conn, _ = server.accept()
        with conns_lock:
            next_cid += 1
            cid = next_cid
            conns[cid] = conn
        send(cid, OPEN)
        threading.Thread(target=pump, args=(cid, conn), daemon=True).start()


def main() -> None:
    servers = []
    for port in sorted({int(a) for a in sys.argv[1:]}):
        server = socket.socket()
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(("127.0.0.1", port))
        server.listen(64)
        servers.append(server)
    threading.Thread(target=from_host, daemon=True).start()
    for server in servers[1:]:
        threading.Thread(target=accept, args=(server,), daemon=True).start()
    sys.stderr.write("portal ready\n")
    sys.stderr.flush()
    accept(servers[0])


if __name__ == "__main__":
    main()
