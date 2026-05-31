# Ghost-Pin 設計文件

**日期**：2026-05-31
**狀態**：設計確認中

## 目標

打造一個改變實體 iPhone 定位的介面：使用者在手機 App 上輸入經緯度或從預設清單選地點，按下按鈕後，iPhone 的 GPS 定位被改到該座標；並提供一鍵恢復真實定位。

## 範圍（已確認）

- **核心功能**：設定**靜態座標** + **一鍵恢復**。
- **不在範圍內**（YAGNI）：模擬移動路線、GPX 播放、多裝置同時控制、雲端/遠端存取。
- **目標 iOS 版本**：**iOS 17 以上**（走 RSD tunnel-based transport）。

## 系統架構

```
① Expo App（手機 / 模擬器）
   輸入 lat,lng ｜ 預設地點清單 ｜「設定」「恢復」鈕 ｜ 狀態列
        ⬇ HTTP（POST /location、POST /reset、GET /status）
② Node.js Server（Mac，:3000）
   Express 路由 ｜ 座標驗證 ｜ exec() 組指令 ｜ 包裝 stdout/stderr → JSON
   啟動 & 每次請求前：health check tunneld（絕不碰 sudo）
        ⬇ exec("pymobiledevice3 developer dvt simulate-location ...")
③ pymobiledevice3 CLI
   set --tunnel '' -- <lat> <lng> ｜ clear --tunnel ''
        ⬇ 透過常駐 tunneld 的 RSD tunnel
④ iPhone（USB 連線）
   Developer Mode ｜ DDI 已掛載 ｜ 定位被改變
```

**旁路常駐（使用者手動跑一次）**：終端機 `sudo pymobiledevice3 remote tunneld`，保持開著。Server 只檢查它在不在，**不透過 exec 跑 sudo**——避免免密 sudoers 的安全後門與密碼卡死問題。

## 元件職責

### ① Expo App（純 UI）
- **輸入**：lat / lng 兩個數字輸入框。
- **預設地點清單**：從共用的 `presets.json` 讀取（例：台北101、台北車站、桃園機場）。點選即填入座標。
- **動作鈕**：「設定定位」「恢復真實定位」。
- **狀態列**：顯示 tunnel/裝置是否在線、目前模擬座標（或「未模擬」）。
- **設定**：Server 的位址（IP:port）可在 App 內設定，預設 `http://localhost:3000`；實機測試時改成 Mac 區網 IP。
- App 完全不碰底層，只發 HTTP。

### ② Node.js Server（橋樑）
- 技術：Node.js + Express。
- 路由：
  - `POST /location`：body `{ lat, lng }`。先驗證範圍（lat ∈ [-90,90]、lng ∈ [-180,180]、為有效數字），再 `exec` 執行
    `pymobiledevice3 developer dvt simulate-location set --tunnel '' -- <lat> <lng>`。
  - `POST /reset`：`exec` 執行 `pymobiledevice3 developer dvt simulate-location clear --tunnel ''`。
  - `GET /status`：檢查 tunneld 與裝置是否在線（例如 `pymobiledevice3 usbmux list` 或 tunneld 健康查詢），回傳結構化狀態。
- **回應格式**：統一 JSON `{ ok: boolean, message: string, data?: object }`；錯誤時帶上 pymobiledevice3 的 stderr 摘要與錯誤碼。
- **座標傳遞安全**：座標經數值驗證後以參數陣列傳給子行程（不做字串拼接 shell），避免命令注入。

### ③ pymobiledevice3 CLI
- iOS ≥ 17 指令前綴為 `developer dvt`。
- `--tunnel ''` 讓指令自動透過常駐 tunneld 找到裝置，免去手抄 RSD address/port。

## 資料流

```
使用者輸入/選擇座標
  → Expo App POST /location {lat,lng}
  → Server 驗證 → exec pymobiledevice3 set
  → tunneld → iPhone 定位改變
  → Server 回 {ok:true,...} → App 更新狀態列
```

恢復流程同理走 `/reset` → `simulate-location clear`。

## 錯誤處理

| 情境 | 行為 |
|------|------|
| 座標格式/範圍錯誤 | Server 在 exec 前回 `400 {ok:false, message:"座標無效"}` |
| tunneld 未啟動 / 裝置離線 | `GET /status` 回離線；`/location` 回 `503 {ok:false, message:"裝置未連線，請確認 tunneld 與 USB"}` |
| pymobiledevice3 執行失敗 | 回 `500`，message 帶 stderr 摘要 |
| App 連不到 Server | App 顯示連線錯誤，提示檢查 Server IP 與同網路 |

## 前提條件（一次性設定）

1. iPhone 開啟 Developer Mode。
2. Mac 安裝 pymobiledevice3（`pipx install pymobiledevice3`）。
3. iPhone USB 連 Mac、信任電腦、掛載 DDI（`pymobiledevice3 mounter auto-mount`）。
4. 常駐 tunnel：`sudo pymobiledevice3 remote tunneld`。
5. App 與 Server 同一 Wi-Fi（或 App 跑模擬器用 localhost）。

## 實作階段

### Phase 0 — Spike（手動驗證，先做，不寫 App）
目標：在實機跑通一次完整鏈路，確認可行再投入開發。
1. `pipx install pymobiledevice3`
2. iPhone 開 Developer Mode、信任電腦
3. `pymobiledevice3 mounter auto-mount`
4. `sudo pymobiledevice3 remote tunneld`（保持開著）
5. `pymobiledevice3 developer dvt simulate-location set --tunnel '' -- 25.0330 121.5654`（台北101）
6. iPhone 地圖 App 確認藍點移動
7. `pymobiledevice3 developer dvt simulate-location clear --tunnel ''`

**驗收標準**：步驟 5 地圖藍點到台北101、步驟 7 恢復真實位置。**通過才進 Phase 1。**

> 已知風險：iOS 18 有 `simulate-location` 偶發失敗 / 連線不穩的回報（pymobiledevice3 issue #572、#1217）。spike 卡住就地除錯，避免白做 App。

### Phase 1 — Node.js Server
- 建立 Express 專案、三個端點、座標驗證、exec 包裝、JSON 回應、health check。
- 手動用 curl/Postman 測過三個端點。

### Phase 2 — Expo App
- 輸入框、預設清單、動作鈕、狀態列、Server IP 設定。
- 模擬器用 localhost 串接；實機改 Mac 區網 IP 測試。

## 測試策略

- **Server**：座標驗證的單元測試（有效/邊界/無效值）；exec 層以 mock 子行程測試指令組裝與錯誤包裝；`/status` 在線/離線兩種回應。
- **整合**：Phase 0 spike 即為端到端真機驗證；Phase 1 後用 curl 對真機驗證三端點。
- **App**：手動驗證 UI 流程（輸入→設定→狀態更新→恢復）。

## 限制

- App 與 Server 必須同一 Wi-Fi，或 App 跑模擬器用 localhost。實機測試時 Server 位址要設成 Mac 區網 IP。
- 僅支援單一 USB 連線的 iPhone。
- 依賴 tunneld 常駐；Mac 重開或 tunnel 中斷需重跑。

## 參考來源

- [pymobiledevice3 repo](https://github.com/doronz88/pymobiledevice3)
- [Remote Access & Tunneling (iOS 17+)](https://deepwiki.com/doronz88/pymobiledevice3/3-remote-access-and-tunneling-(ios-17+))
- [issue #572 — Unreliable simulate-location with iOS 17](https://github.com/doronz88/pymobiledevice3/issues/572)
