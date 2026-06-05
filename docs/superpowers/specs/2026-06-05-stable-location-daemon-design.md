# 穩定定位：常駐 DVT session + 三層自動復原

日期：2026-06-05
狀態：設計已核可，待寫實作計畫

## 問題

改變實體 iPhone 定位「常常有異常」，回報的兩個症狀：

1. **偶爾失敗要重試** — 按一次沒反應或報錯，再按一兩次才成功。
2. **整個 tunnel 掛掉** — 要重跑 `tunneld` 或重插 USB 才能再用。

兩者都在**連線層**，不是定位邏輯本身。

### 根因

iOS 17+ 不論用哪個工具，改定位都得走 DVT（DeveloperServices/Instruments）服務，而 DVT 必須掛在 RemoteXPC tunnel 上。

現行 `server/src/pmd.js` 的 `setLocation` 每改一次定位就：
- `kill` 掉上一個 `simulate-location set` process，
- 再 `spawn` 一個全新的 `pymobiledevice3` CLI，重新走一遍 **tunnel → RSD → DVT 握手**。

這個握手在 iOS 17+ 上又重又脆，重複做正是「偶爾失敗」的來源。而 `sudo pymobiledevice3 remote tunneld` 是獨立常駐程序，沒人監管，掛了不會自動重起，就是「整個 tunnel 掛掉」。

附帶問題：`POST /location` 目前 fire-and-forget（不 await，永遠回 `ok:true`），錯誤只進 `errors.log`，前端無感。

## 目標

- 消滅每次改定位的重複握手 → 解掉「偶爾失敗要重試」。
- 三層失效各自有自動復原 → 解掉「整個 tunnel 掛掉」需手動介入。
- 前端能得知定位是否真的設定成功。
- 遷移風險最低：沿用既有 pymobiledevice3 9.16.0 / Python 3.12 安裝。

非目標：不換成 go-ios；不改 Expo App 的 UI 設計（僅消費新的真實結果與狀態）。

## 可行性（已驗證）

- pymobiledevice3 **9.16.0**、venv Python **3.12.10**。
- `from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation` 可用。
- 機制：**只要 DVT session 開著，就能重複呼叫 `loc.set(lat, lng)` 推新座標，不必重連**；session 關閉時模擬定位自動清除。

## 架構

```
Expo App ──HTTP──> Node server ──stdin/stdout JSON──> Python location daemon ──DVT session──> iPhone
                   (supervisor)                        (持有一條長連線)

tunneld ── 由 launchd LaunchDaemon 監管（KeepAlive + RunAtLoad）
```

三個元件、各一個職責：

### ① Python location daemon（新檔 `server/daemon/location_daemon.py`）

- 啟動時：透過 tunneld 找到 RSD → 開 `DvtSecureSocketProxyService` → 建 `LocationSimulation`，**整個 session 一直持有不關**。
- 從 stdin 一行一個 JSON 指令讀進來，呼叫對應方法，把結果一行一個 JSON 寫回 stdout。
- **保持「笨」**：偵測到 tunnel/session 出錯 → 寫一筆錯誤回 stdout → 退出（非 0）。不自己硬撐重連，交給 Node supervisor 決定。

### ② Node supervisor（改寫 `server/src/pmd.js`）

- 對外 API `setLocation / clearLocation / getStatus` 簽名不變。
- spawn 並監管常駐 daemon（同時只跑一個）。
- 把指令寫進 daemon stdin、等對應回覆。
- **Watchdog**：daemon 退出 → 指數 backoff 重啟（1s→2s→4s→…上限 30s）→ 重啟後自動把「最後一次的座標」重設回去，使用者無感。
- 定期 `ping` 做健康檢查。

### ③ tunneld 監管（launchd LaunchDaemon）

- 把 tunneld 從「手動 sudo 跑」改成 `/Library/LaunchDaemons/` 下的 LaunchDaemon（root）。
- `KeepAlive=true` → 掛掉由 launchd 自動重啟（OS 級監管）。
- `RunAtLoad=true` → 開機自動起，解掉「Mac 重開後需重跑」。
- 一次性安裝：`scripts/install-tunneld.sh` 跑一次 `sudo` 放 plist + `launchctl bootstrap`。之後免 sudo、免手動重跑。

## Line protocol（daemon ⇄ supervisor）

每行一個 JSON 物件，`\n` 分隔。請求帶 `id`，回覆帶相同 `id` 以對應。

請求（supervisor → daemon）：
```json
{"id": 1, "cmd": "set", "lat": 25.03, "lng": 121.56}
{"id": 2, "cmd": "clear"}
{"id": 3, "cmd": "ping"}
```

回覆（daemon → supervisor）：
```json
{"id": 1, "ok": true}
{"id": 2, "ok": true}
{"id": 3, "ok": true}
{"id": 1, "ok": false, "error": "session closed: ..."}
```

非請求對應的致命錯誤可直接寫 `{"event":"fatal","error":"..."}` 後退出。

## 三層失效與復原

| 失效 | 偵測者 | 復原方式 |
|------|--------|----------|
| DVT session 掛 | daemon | 回報錯誤 → 退出；supervisor backoff 重啟並重設最後座標 |
| daemon 連不上 tunneld | supervisor | backoff 重試，tunneld 一回來就接上 |
| tunneld 掛 / 重開機 | launchd | `KeepAlive` / `RunAtLoad` 自動重啟 |

重啟期間若有新的 `set` 進來：**只暫存最新一筆**，daemon 一就緒就送出，舊的丟棄。

## Node API 與 routes 行為

- `POST /location` 改成 **await daemon 回覆再回應**：成功 `{ok:true}`，失敗 `{ok:false, message}`（同時照舊寫 `errors.log`）。
- timeout（例如 daemon 重啟中 5 秒內未就緒）→ 回 `{ok:false, message:"定位服務重啟中，請稍後再試"}`，避免請求無限掛住。
- `getStatus` 擴充：`device online` + `daemon ready` + `tunnel(launchd) 狀態`，讓前端與 launcher 能分辨「沒插手機」vs「通道掛了」。
- `routes.js` 僅 `/location` 改 `await` 並回傳真實結果；`validate.js` 不動。

## launcher.py 調整

- tunneld 狀態列改讀 `launchctl print` 結果：運行中 / 已停 / 未安裝。
- 未安裝時提示執行 `scripts/install-tunneld.sh`。

## 測試策略

- **`pmd.js` 單元測試**：把「daemon transport」抽成可注入介面（送指令 / 收回覆 / 模擬退出），測 supervisor 的重啟、backoff、座標重設、timeout、queue 只保留最後一筆。不碰真機。
- **daemon line-protocol**：純函式測試（JSON 行 → 指令物件 / 錯誤回覆），不依賴真機 DVT。
- 現有 `pmd.test.js` / `routes.test.js` 隨改寫調整，層級與風格不變。
- **手動整合驗證（需真機，寫進實作計畫）**：
  1. 設定 → 連續改座標 N 次，確認不重連、每次 < 1s 生效。
  2. 拔網路模擬 session 掛掉 → 看 supervisor 自動恢復並重設座標。
  3. `kill` tunneld → 看 launchd 自動重起、daemon 自動接上。
  4. reboot Mac → 不手動操作即可再次設定定位。

## 檔案異動概覽

| 檔案 | 動作 |
|------|------|
| `server/daemon/location_daemon.py` | 新增：常駐 DVT session daemon |
| `server/src/pmd.js` | 改寫：supervisor + watchdog + line protocol |
| `server/src/routes.js` | 微調：`/location` await 真實結果 |
| `scripts/install-tunneld.sh` | 新增：安裝 launchd LaunchDaemon |
| `scripts/com.ghostpin.tunneld.plist`（範本） | 新增：LaunchDaemon plist |
| `launcher.py` | 微調：tunneld 狀態改讀 launchctl |
| `server/tests/*` | 隨改寫調整 |
| `README.md` | 更新設定步驟（tunneld 改 launchd 安裝） |
