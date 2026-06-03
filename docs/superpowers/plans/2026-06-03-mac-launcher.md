# Ghost Pin Mac Launcher 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `launcher.py`，用 tkinter 視窗包裝 tunneld 和 start.sh，提供啟動／中斷按鈕和即時狀態指示。

**Architecture:** 單一 Python 腳本，UI 用 tkinter 建構，服務控制用 subprocess + osascript 呼叫，每秒輪詢 pgrep 更新狀態。

**Tech Stack:** Python 3.14（Homebrew）、python-tk@3.14、tkinter、subprocess、osascript

---

### Task 0: 安裝 python-tk

**Files:**
- 無（系統套件安裝）

- [ ] **Step 1: 安裝 python-tk**

```bash
brew install python-tk@3.14
```

Expected output 包含 `🍺 /opt/homebrew/Cellar/python-tk@3.14/...`

- [ ] **Step 2: 驗證 tkinter 可用**

```bash
python3 -c "import tkinter; print('tkinter OK')"
```

Expected: `tkinter OK`

---

### Task 1: 建立 UI 骨架

**Files:**
- Create: `launcher.py`

- [ ] **Step 1: 建立 launcher.py（僅 UI，無邏輯）**

建立 `/Users/kc/Documents/ghost-pin/launcher.py`，內容如下：

```python
#!/usr/bin/env python3
import tkinter as tk
import subprocess
import os

PROJ = os.path.dirname(os.path.abspath(__file__))

BG = "#1e1e1e"
FG = "#ffffff"
BTN_START = "#2d7d46"
BTN_STOP = "#8b2020"
BTN_FG = "#ffffff"
GRAY = "#888888"
GREEN = "#2ecc71"


def is_running(pattern):
    result = subprocess.run(["pgrep", "-f", pattern], capture_output=True)
    return result.returncode == 0


def start_tunneld():
    subprocess.Popen([
        "osascript", "-e",
        'do shell script "pymobiledevice3 remote tunneld > /dev/null 2>&1 &"'
        ' with administrator privileges',
    ])


def stop_tunneld():
    subprocess.Popen([
        "osascript", "-e",
        'do shell script "pkill -f \\"pymobiledevice3 remote tunneld\\""'
        ' with administrator privileges',
    ])


def start_dev():
    subprocess.Popen([
        "osascript", "-e",
        f'tell app "Terminal" to do script "cd {PROJ} && ./start.sh"',
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
        tk.Frame(self, bg="#333333", height=1).pack(fill="x")

        self.tunneld_status, self.tunneld_btn = self._build_row("iOS 通道（tunneld）")
        tk.Frame(self, bg="#333333", height=1).pack(fill="x")
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
```

- [ ] **Step 2: 驗證視窗可以打開**

```bash
cd /Users/kc/Documents/ghost-pin && python3 launcher.py
```

Expected：出現深色視窗，標題「Ghost Pin 開發啟動器」，兩排灰色「● 未啟動」，各有一個綠色「啟動」按鈕。按右上角 ✕ 關閉。

---

### Task 2: 驗證服務控制（手動測試）

**Files:**
- 無（驗證現有 launcher.py 行為）

- [ ] **Step 1: 測試狀態偵測（tunneld）**

打開視窗，不啟動任何服務，觀察 iOS 通道顯示「● 未啟動」。  
手動在另一個 Terminal 執行：
```bash
sudo pymobiledevice3 remote tunneld &
```
回到視窗，約 1 秒內 iOS 通道應變為「● 運行中」、按鈕變紅色「中斷」。  
驗證完後手動 kill：
```bash
sudo pkill -f "pymobiledevice3 remote tunneld"
```
狀態應在 1 秒內回到「● 未啟動」。

- [ ] **Step 2: 測試 tunneld 啟動（透過 UI）**

點擊「iOS 通道」列的「啟動」按鈕。  
Expected：出現系統原生密碼對話框，輸入密碼後，約 1 秒內狀態變為「● 運行中」。

- [ ] **Step 3: 測試 tunneld 中斷（透過 UI）**

點擊「中斷」按鈕。  
Expected：再次出現密碼對話框，約 1 秒內狀態回到「● 未啟動」。

- [ ] **Step 4: 測試開發服務啟動**

點擊「開發服務」列的「啟動」按鈕。  
Expected：Terminal 開啟新視窗並執行 `./start.sh`，約幾秒後 Expo 顯示 QR code。  
回到啟動器視窗，約 1 秒內開發服務狀態變為「● 運行中」。

- [ ] **Step 5: 測試開發服務中斷**

點擊「中斷」按鈕。  
Expected：expo 和 node server 行程被終止，狀態回到「● 未啟動」。  
（Terminal 視窗會留著，這是預期行為）

---

### Task 3: Commit 並設定 Automator App

**Files:**
- Modify: `launcher.py`（確認最終版本）

- [ ] **Step 1: Commit launcher.py**

```bash
git add launcher.py
git commit -m "feat: add Mac GUI launcher for tunneld and Expo services"
```

- [ ] **Step 2: 建立 Automator App（手動操作）**

1. 打開 **Automator**（應用程式資料夾）
2. 選「**新增文件**」→ 類型選「**應用程式**」
3. 左側搜尋「**執行 Shell Script**」，雙擊加入
4. Shell 選 `/bin/zsh`，傳遞輸入選「**不傳遞任何輸入**」
5. 輸入以下指令：
   ```bash
   cd /Users/kc/Documents/ghost-pin && python3 launcher.py
   ```
6. **儲存**（⌘S）→ 命名為 `GhostPin Launcher` → 存到桌面或 `/Applications`

- [ ] **Step 3: 測試 Automator App**

雙擊 `GhostPin Launcher.app`。  
Expected：啟動器視窗出現，行為與直接執行 `python3 launcher.py` 相同。

若出現「無法打開，因為它來自未識別的開發者」：  
→ 系統設定 → 隱私權與安全性 → 點「仍要打開」
