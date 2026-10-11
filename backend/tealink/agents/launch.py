"""Start the whole teagent roster as child processes.

Online shops heartbeat immediately. Shops seeded offline (Lantern Leaf) start
in standby and heartbeat only after ``POST /events/shop-join``. This process
blocks until Ctrl+C, then stops the children. NATS has to be up first
(``make bus``).
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse

from tealink.config import get_settings
from tealink.data.loader import load_catalog

CORE = ("taste", "social", "explorer", "budget", "preference")


def main() -> int:
    settings = get_settings()
    parsed = urlparse(settings.nats_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 4222
    if not _port_open(host, port):
        print(
            f"NATS is not accepting connections at {host}:{port}. Start it with `make bus` first.",
            file=sys.stderr,
        )
        return 1
    try:
        catalog = load_catalog()
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    backend = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    commands: list[list[str]] = []
    for kind in CORE:
        commands.append([sys.executable, "-m", "tealink.agents.serve", "--agent", kind])
    for shop in catalog.shops:
        command = [
            sys.executable,
            "-m",
            "tealink.agents.serve",
            "--agent",
            "shop",
            "--shop-id",
            shop.id,
        ]
        if not shop.online:
            command.append("--standby")
        commands.append(command)

    processes = [
        subprocess.Popen(command, cwd=backend, start_new_session=True) for command in commands
    ]
    print(f"Serving {len(processes)} agents over {settings.nats_url}. Ctrl+C stops them.", flush=True)

    def stop(*_args) -> None:
        _stop(processes)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        while any(process.poll() is None for process in processes):
            time.sleep(0.5)
    finally:
        _stop(processes)
    failed = [process.returncode for process in processes if process.returncode not in (0, None, -15)]
    return 1 if failed else 0


def _stop(processes: list[subprocess.Popen]) -> None:
    for process in processes:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                process.terminate()
    deadline = time.monotonic() + 5
    for process in processes:
        remaining = deadline - time.monotonic()
        if process.poll() is None:
            try:
                process.wait(timeout=max(0.1, remaining))
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    process.kill()


def _port_open(host: str, port: int) -> bool:
    sock = socket.socket()
    sock.settimeout(0.4)
    try:
        sock.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


if __name__ == "__main__":
    raise SystemExit(main())
