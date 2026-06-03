#!/usr/bin/env python3
import tkinter as tk
import subprocess
import threading
import os

PROJ = os.path.dirname(os.path.abspath(__file__))

SUDOERS_FILE = "/etc/sudoers.d/ghost-pin-launcher"

BG        = "#1c1c1e"
FG        = "#f2f2f7"
SEP       = "#38383a"
BTN_START = "#0a84ff"
BTN_FG    = "#ffffff"
BTN_STOP  = "#ff453a"
GRAY      = "#98989d"
GREEN     = "#30d158"


def is_running(pattern):
    result = subprocess.run(["pgrep", "-f", pattern], capture_output=True)
    return result.returncode == 0


def _is_sudoers_ready():
    return os.path.exists(SUDOERS_FILE)


def _ensure_sudoers():
    user = os.environ.get("USER", "")
    if not user:
        return False
    tmp = "/tmp/ghost-pin-sudoers-tmp"
    with open(tmp, "w") as f:
        f.write(f"{user} ALL=(ALL) NOPASSWD: /usr/bin/pkill\n")
    result = subprocess.run([
        "osascript", "-e",
        f'do shell script "mv {tmp} {SUDOERS_FILE} && chmod 440 {SUDOERS_FILE}"'
        f' with administrator privileges',
    ], capture_output=True)
    return result.returncode == 0


def _run_async(cmd):
    threading.Thread(target=lambda: subprocess.run(cmd), daemon=True).start()


def start_tunneld():
    _run_async([
        "osascript", "-e",
        'do shell script "pymobiledevice3 remote tunneld > /dev/null 2>&1 &"'
        ' with administrator privileges',
    ])


def stop_tunneld():
    def _do():
        if not _is_sudoers_ready():
            _ensure_sudoers()
        subprocess.run(["sudo", "-n", "pkill", "-f", "pymobiledevice3"])
    threading.Thread(target=_do, daemon=True).start()


def start_dev():
    escaped = PROJ.replace("\\", "\\\\").replace('"', '\\"')
    _run_async([
        "osascript", "-e",
        f'tell app "Terminal" to do script "cd \\"{escaped}\\" && ./start.sh"',
    ])


def stop_dev():
    subprocess.run(["pkill", "-f", "expo start"])
    subprocess.run(["pkill", "-f", "node.*server"])


class LauncherApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Ghost Pin 開發啟動器")
        self.resizable(False, False)
        self.configure(bg=BG)
        self._build_ui()
        self._poll()

    def _build_ui(self):
        tk.Label(
            self, text="Ghost Pin 開發啟動器",
            bg=BG, fg=FG, font=("System", 14, "bold"),
        ).pack(padx=16, pady=12)
        tk.Frame(self, bg=SEP, height=1).pack(fill="x")

        self.tunneld_status, self.tunneld_btn = self._build_row("iOS 通道（tunneld）")
        tk.Frame(self, bg=SEP, height=1).pack(fill="x")
        self.dev_status, self.dev_btn = self._build_row("開發服務（Expo）")

    def _build_row(self, label):
        frame = tk.Frame(self, bg=BG)
        frame.pack(fill="x", padx=16, pady=10)

        top = tk.Frame(frame, bg=BG)
        top.pack(fill="x")
        tk.Label(top, text=label, bg=BG, fg=FG, font=("System", 12)).pack(side="left")
        status_lbl = tk.Label(
            top, text="● 未啟動", bg=BG, fg=GRAY, font=("System", 11),
        )
        status_lbl.pack(side="right")

        btn = tk.Button(
            frame, text="啟動", bg=BTN_START, fg=BTN_FG,
            font=("System", 11), width=8, bd=0, cursor="hand2",
        )
        btn.pack(anchor="w", pady=(6, 0))

        return status_lbl, btn

    def _poll(self):
        if not self.winfo_exists():
            return
        tunneld_running = is_running("pymobiledevice3 remote tunneld")
        dev_running = is_running("expo start")

        self._update_row(
            self.tunneld_status, self.tunneld_btn,
            tunneld_running, start_tunneld, stop_tunneld,
        )
        self._update_row(
            self.dev_status, self.dev_btn,
            dev_running, start_dev, stop_dev,
        )
        self.after(1000, self._poll)

    def _update_row(self, status_lbl, btn, running, start_fn, stop_fn):
        if running:
            status_lbl.config(text="● 運行中", fg=GREEN)
            btn.config(text="中斷", bg=BTN_STOP, command=stop_fn)
        else:
            status_lbl.config(text="● 未啟動", fg=GRAY)
            btn.config(text="啟動", bg=BTN_START, command=start_fn)


if __name__ == "__main__":
    LauncherApp().mainloop()
