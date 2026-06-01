# Ghost-Pin

改變實體 iPhone 定位的介面。Expo App → Node.js Server → pymobiledevice3 → iPhone（iOS 17+）。

## 一次性設定

1. `pipx install pymobiledevice3`
2. iPhone 開 Developer Mode、USB 連 Mac、信任電腦
3. `pymobiledevice3 mounter auto-mount`
4. App Store 安裝 **Expo Go**
5. 常駐 tunnel（保持開著，Mac 重開後需重跑）：

```bash
sudo pymobiledevice3 remote tunneld
```

## 啟動

```bash
./start.sh
```

自動完成：偵測 Mac 區網 IP → 啟動 Server（:3000）→ 啟動 Expo（顯示 QR code）。

用 iPhone 相機掃 QR code，Expo Go 開啟後即可使用。

- 輸入緯度 / 經度（或點選預設地點），按「設定定位」
- 按「恢復真實定位」取消模擬

> **`Unable to run simctl` 可忽略。** Expo 偵測模擬器的警告，實機不受影響。

---

`app/src/config.ts` 已列入 `.gitignore`；範本見 `app/src/config.example.ts`。
