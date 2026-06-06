#!/usr/bin/env python3
import tkinter as tk
import subprocess
import threading
import os

PROJ = os.path.dirname(os.path.abspath(__file__))

BG     = "#000000"
FG     = "#ffffff"
SEP    = "#333333"
BTN_BG = "#141313"
BTN_FG = "#000000"
GRAY   = "#aaaaaa"
GREEN  = "#44ff44"


def is_running(pattern):
    result = subprocess.run(["pgrep", "-f", pattern], capture_output=True)
    return result.returncode == 0


def tunneld_state():
    """Return 'running' or 'stopped'.

    tunneld is started on demand by start.sh and torn down when it exits,
    so the launcher just reports whether the process is currently alive.
    pgrep works across users (tunneld runs as root).
    """
    return "running" if is_running("remote tunneld") else "stopped"


def _run_async(cmd):
    threading.Thread(target=lambda: subprocess.run(cmd), daemon=True).start()


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
        self.title("Ghost Pin")
        self.resizable(False, False)
        self.configure(bg=BG)
        self._build_ui()
        self._poll()

    def _build_ui(self):
        tk.Label(
            self, text="控制台",
            bg=BG, fg=FG, font=("System", 14, "bold"),
        ).pack(padx=16, pady=12)
        tk.Frame(self, bg=SEP, height=1).pack(fill="x")

        # Tunneld: status only
        row = tk.Frame(self, bg=BG)
        row.pack(fill="x", padx=16, pady=10)
        tk.Label(row, text="iOS 通道", bg=BG, fg=FG, font=("System", 12)).pack(side="left")
        self.tunneld_status = tk.Label(row, text="● 未啟動", bg=BG, fg=GRAY, font=("System", 11))
        self.tunneld_status.pack(side="right")

        tk.Frame(self, bg=SEP, height=1).pack(fill="x")

        # Dev service: status + button
        frame = tk.Frame(self, bg=BG)
        frame.pack(fill="x", padx=16, pady=10)
        top = tk.Frame(frame, bg=BG)
        top.pack(fill="x")
        tk.Label(top, text="連線 Expo Go", bg=BG, fg=FG, font=("System", 12)).pack(side="left")
        self.dev_status = tk.Label(top, text="● 未啟動", bg=BG, fg=GRAY, font=("System", 11))
        self.dev_status.pack(side="right")
        self.dev_btn = tk.Button(
            frame, text="啟動", bg=BTN_BG, fg=BTN_FG,
            font=("System", 11), width=8, bd=0, cursor="hand2",
        )
        self.dev_btn.pack(anchor="w", pady=(6, 0))

    def _poll(self):
        if not self.winfo_exists():
            return

        if tunneld_state() == "running":
            self.tunneld_status.config(text="● 運行中", fg=GREEN)
        else:
            self.tunneld_status.config(text="● 未啟動", fg=GRAY)

        if is_running("expo start"):
            self.dev_status.config(text="● 運行中", fg=GREEN)
            self.dev_btn.config(text="中斷", command=stop_dev)
        else:
            self.dev_status.config(text="● 未啟動", fg=GRAY)
            self.dev_btn.config(text="啟動", command=start_dev)

        self.after(1000, self._poll)


if __name__ == "__main__":
    LauncherApp().mainloop()
