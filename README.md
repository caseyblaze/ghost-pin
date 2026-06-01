# Ghost-Pin

改變實體 iPhone 定位的介面。Expo App → Node.js Server → pymobiledevice3 → iPhone（iOS 17+）。

## 一次性設定

1. `pipx install pymobiledevice3`
2. iPhone 開 Developer Mode、USB 連 Mac、信任電腦
3. `pymobiledevice3 mounter auto-mount`
4. 常駐 tunnel（保持開著）：`sudo pymobiledevice3 remote tunneld`

## 啟動

- Server：`cd server && npm install && npm start`（:3000）
- App：`cd app && npx expo start`

實機測試 App：把 `app/src/config.ts` 的 `SERVER_BASE_URL` 改成 Mac 區網 IP，手機與 Mac 同一 Wi-Fi。

## 測試

`cd server && npm test`

## 限制

- 僅支援單一 USB 連線的 iPhone、iOS 17+。
- 依賴 tunneld 常駐；Mac 重開或 tunnel 中斷需重跑。
- Server 不執行 sudo；tunneld 由使用者手動啟動。
