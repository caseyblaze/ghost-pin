#!/usr/bin/env python3
"""Ghost-Pin location daemon.

Holds a single long-lived DVT LocationSimulation session and applies
set/clear commands received as JSON lines on stdin. Replies as JSON lines
on stdout. Stays deliberately "dumb": on any session error it reports and
exits so the Node supervisor can restart it.
"""
import asyncio
import json
import sys
import threading

from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation
from pymobiledevice3.tunneld.api import TUNNELD_DEFAULT_ADDRESS, get_tunneld_devices


def parse_command(line):
    """Parse one stdin line into a command dict, or None if blank/invalid."""
    line = line.strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except ValueError:
        return None


def reply_ok(req_id):
    return {"id": req_id, "ok": True}


def reply_err(req_id, error):
    return {"id": req_id, "ok": False, "error": error}


def write_line(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


async def _stdin_lines(loop):
    """Yield stdin lines without blocking the event loop (reader thread)."""
    queue = asyncio.Queue()

    def reader():
        for line in sys.stdin:
            loop.call_soon_threadsafe(queue.put_nowait, line)
        loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=reader, daemon=True).start()
    while True:
        line = await queue.get()
        if line is None:
            return
        yield line


async def _pick_rsd(udid):
    rsds = await get_tunneld_devices(TUNNELD_DEFAULT_ADDRESS)
    if not rsds:
        raise RuntimeError("no device available via tunneld")
    if udid:
        for rsd in rsds:
            if getattr(rsd, "udid", None) == udid:
                return rsd
        raise RuntimeError("device %s not found via tunneld" % udid)
    return rsds[0]


async def main():
    loop = asyncio.get_running_loop()
    udid = sys.argv[1] if len(sys.argv) > 1 else ""
    rsd = await _pick_rsd(udid or None)
    async with DvtProvider(rsd) as dvt, LocationSimulation(dvt) as loc:
        write_line({"event": "ready"})
        async for raw in _stdin_lines(loop):
            msg = parse_command(raw)
            if msg is None:
                continue
            req_id = msg.get("id")
            cmd = msg.get("cmd")
            try:
                if cmd == "set":
                    await loc.set(float(msg["lat"]), float(msg["lng"]))
                elif cmd == "clear":
                    await loc.clear()
                elif cmd == "ping":
                    pass
                else:
                    write_line(reply_err(req_id, "unknown cmd: %s" % cmd))
                    continue
                write_line(reply_ok(req_id))
            except Exception as exc:  # session likely dead -> report then exit
                write_line(reply_err(req_id, str(exc)))
                raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        write_line({"event": "fatal", "error": str(exc)})
        sys.exit(1)
