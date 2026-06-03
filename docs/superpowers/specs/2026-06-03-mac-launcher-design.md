# Ghost Pin 開發啟動器 — Design Doc

**日期：** 2026-06-03  
**狀態：** 已確認

---

## 概覽

為 ghost-pin 專案製作一個 macOS 啟動器，將兩個開發指令包成可點擊的 GUI App，讓開發者不需要開 Terminal 就能一鍵啟動所有服務。

---

## 目標

- 個人使用（單機，不需要打包發佈）
- 點兩下 `.app` 就能打開操作介面
- 兩個服務各有獨立的啟動／中斷按鈕與狀態指示

---

## 架構

### 檔案結構

```
ghost-pin/
├── launcher.py          ← 主程式（新增）
├── start.sh
├── app/
└── server/
```

另外用 Automator 建立 `GhostPin Launcher.app`，內部呼叫 `python3 <專案路徑>/launcher.py`。App 放在 `/Applications` 或桌面。

### 技術選型

- **語言：** Python 3（macOS 內建，無需額外安裝）
- **GUI：** tkinter（Python 內建，無需額外套件）
- **sudo 授權：** AppleScript `do shell script ... with administrator privileges`（觸發原生系統密碼對話框）

---

## 介面設計

視窗固定大小約 320×200，不可縮放。

```
┌────────────────────────────────────┐
│        Ghost Pin 開發啟動器          │
├────────────────────────────────────┤
│  iOS 通道（tunneld）   ● 未啟動      │
│  [  啟動  ]                         │
├────────────────────────────────────┤
│  開發服務（Expo）       ● 未啟動      │
│  [  啟動  ]                         │
└────────────────────────────────────┘
```

啟動後：

```
│  iOS 通道（tunneld）   🟢 運行中     │
│  [  中斷  ]                         │
```

### 狀態指示

| 狀態   | 顏色 | 文字   |
|--------|------|--------|
| 未啟動 | 灰色 | 未啟動 |
| 運行中 | 綠色 | 運行中 |

---

## 服務控制邏輯

### iOS 通道（pymobiledevice3 remote tunneld）

**啟動：**
```
osascript -e 'do shell script "pymobiledevice3 remote tunneld > /dev/null 2>&1 &" with administrator privileges'
```
彈出系統原生密碼對話框，以 root 權限在背景啟動 tunneld。

**中斷：**
```
osascript -e 'do shell script "pkill -f \"pymobiledevice3 remote tunneld\"" with administrator privileges'
```

**狀態偵測：**
```
pgrep -f "pymobiledevice3 remote tunneld"
```
回傳碼 0 = 運行中，非 0 = 未啟動。

---

### 開發服務（start.sh）

**啟動：**
開啟新的 Terminal 視窗執行 `./start.sh`，讓 Expo QR code 和 log 顯示在 Terminal 裡。
```
osascript -e 'tell app "Terminal" to do script "cd /Users/kc/Documents/ghost-pin && ./start.sh"'
```

**中斷：**
```python
subprocess.run(['pkill', '-f', 'expo start'])
subprocess.run(['pkill', '-f', 'node.*server'])
```

**狀態偵測：**
```
pgrep -f "expo start"
```
回傳碼 0 = 運行中，非 0 = 未啟動。

---

## 狀態輪詢

`tkinter` 的 `after()` 機制每 1000ms 執行一次 `pgrep` 檢查，更新兩個服務的狀態顏色和按鈕文字。不使用執行緒，避免複雜度。

---

## Automator 封裝步驟（手動操作，不寫入程式碼）

1. 打開 Automator → 新增「應用程式」
2. 加入「執行 Shell Script」動作
3. 輸入：`cd /Users/kc/Documents/ghost-pin && python3 launcher.py`
4. 儲存為 `GhostPin Launcher.app`
5. 拖到 `/Applications` 或 Dock

---

## 不在範圍內

- 開機自動啟動
- 多用戶支援
- 日誌顯示（Expo log 已在 Terminal 視窗顯示）
- 程式碼簽名 / 公證（個人使用不需要）
