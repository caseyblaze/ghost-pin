# Button Feedback & Status Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opacity press feedback to all buttons and colored icon+text status messages to App.tsx.

**Architecture:** All changes are confined to `app/App.tsx`. Two new module-level constants (STATUS_COLORS, STATUS_ICONS) and one new state (`statusType`) are added. No new files needed.

**Tech Stack:** React Native, Expo, TypeScript

---

## Files

| File | Change |
|---|---|
| `app/App.tsx` | All changes — constants, state, render, call sites |

---

### Task 1: Add constants and statusType state

**Files:**
- Modify: `app/App.tsx`

- [ ] **Step 1: Add STATUS_COLORS and STATUS_ICONS after the import block (after line 10)**

```tsx
const STATUS_COLORS = {
  info:    '#7fd1ff',
  success: '#4ade80',
  error:   '#f87171',
} as const;

const STATUS_ICONS = {
  info:    '',
  success: '✓ ',
  error:   '✗ ',
} as const;
```

- [ ] **Step 2: Add statusType state inside the App component (after the existing `status` state on line 76)**

```tsx
const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
```

- [ ] **Step 3: Update the status Text render (currently `<Text style={styles.status}>{status}</Text>`)**

```tsx
<Text style={[styles.status, { color: STATUS_COLORS[statusType] }]}>
  {STATUS_ICONS[statusType]}{status}
</Text>
```

- [ ] **Step 4: Verify TypeScript compiles without errors**

```bash
cd app && npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add app/App.tsx
git commit -m "feat: add statusType state and status color/icon render"
```

---

### Task 2: Update setStatus call sites

**Files:**
- Modify: `app/App.tsx`

- [ ] **Step 1: Update `refreshStatus()`**

Replace the current body:
```tsx
async function refreshStatus() {
  const r = await getStatus();
  if (!r.ok) setStatus(`離線：${r.message}`);
  else setStatus(r.data?.online ? '裝置已連線' : '無裝置連線');
}
```

With:
```tsx
async function refreshStatus() {
  const r = await getStatus();
  if (!r.ok) {
    setStatus(`離線：${r.message}`);
    setStatusType('error');
  } else if (r.data?.online) {
    setStatus('裝置已連線');
    setStatusType('success');
  } else {
    setStatus('無裝置連線');
    setStatusType('info');
  }
}
```

- [ ] **Step 2: Update `onSet()`**

Replace:
```tsx
async function onSet() {
  setBusy(true);
  const r = await setLocation(Number(lat), Number(lng));
  setStatus(r.ok ? `已設定 ${lat}, ${lng}` : `失敗：${r.message}`);
  setBusy(false);
}
```

With:
```tsx
async function onSet() {
  setBusy(true);
  const r = await setLocation(Number(lat), Number(lng));
  setStatus(r.ok ? `已設定 ${lat}, ${lng}` : `失敗：${r.message}`);
  setStatusType(r.ok ? 'success' : 'error');
  setBusy(false);
}
```

- [ ] **Step 3: Update `onReset()`**

Replace:
```tsx
async function onReset() {
  setBusy(true);
  const r = await resetLocation();
  setStatus(r.ok ? '已恢復真實定位' : `失敗：${r.message}`);
  setBusy(false);
}
```

With:
```tsx
async function onReset() {
  setBusy(true);
  const r = await resetLocation();
  setStatus(r.ok ? '已恢復真實定位' : `失敗：${r.message}`);
  setStatusType(r.ok ? 'success' : 'error');
  setBusy(false);
}
```

- [ ] **Step 4: Verify TypeScript compiles without errors**

```bash
cd app && npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add app/App.tsx
git commit -m "feat: wire statusType to all setStatus call sites"
```

---

### Task 3: Add press feedback to all Pressable buttons

**Files:**
- Modify: `app/App.tsx`

> Note: `Pressable`'s `style` prop accepts either a static style or a function `({ pressed }) => style`. We use the function form to add `opacity: 0.6` when pressed.

- [ ] **Step 1: Update preset buttons**

Replace:
```tsx
<Pressable key={p.name} style={styles.preset}
  onPress={() => { setLat(String(p.lat)); setLng(String(p.lng)); }}>
```

With:
```tsx
<Pressable key={p.name}
  style={({ pressed }) => [styles.preset, pressed && { opacity: 0.6 }]}
  onPress={() => { setLat(String(p.lat)); setLng(String(p.lng)); }}>
```

- [ ] **Step 2: Update primary action button (設定定位)**

Replace:
```tsx
<Pressable style={[styles.btn, styles.primary]} disabled={busy} onPress={onSet}>
```

With:
```tsx
<Pressable style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.6 }]} disabled={busy} onPress={onSet}>
```

- [ ] **Step 3: Update secondary action button (恢復真實定位)**

Replace:
```tsx
<Pressable style={[styles.btn, styles.secondary]} disabled={busy} onPress={onReset}>
```

With:
```tsx
<Pressable style={({ pressed }) => [styles.btn, styles.secondary, pressed && { opacity: 0.6 }]} disabled={busy} onPress={onReset}>
```

- [ ] **Step 4: Update refresh link (重新檢查狀態)**

Replace:
```tsx
<Pressable style={styles.refresh} onPress={refreshStatus}>
```

With:
```tsx
<Pressable style={({ pressed }) => [styles.refresh, pressed && { opacity: 0.6 }]} onPress={refreshStatus}>
```

- [ ] **Step 5: Update ClipboardBanner 套用 button**

Replace:
```tsx
<Pressable onPress={() => hide(onApplyRef.current)}>
  <Text style={styles.bannerApply}>套用</Text>
</Pressable>
```

With:
```tsx
<Pressable style={({ pressed }) => pressed && { opacity: 0.6 }} onPress={() => hide(onApplyRef.current)}>
  <Text style={styles.bannerApply}>套用</Text>
</Pressable>
```

- [ ] **Step 6: Update ClipboardBanner ✕ button**

Replace:
```tsx
<Pressable onPress={() => hide(onDismissRef.current)}>
  <Text style={styles.bannerDismissBtn}>✕</Text>
</Pressable>
```

With:
```tsx
<Pressable style={({ pressed }) => pressed && { opacity: 0.6 }} onPress={() => hide(onDismissRef.current)}>
  <Text style={styles.bannerDismissBtn}>✕</Text>
</Pressable>
```

- [ ] **Step 7: Verify TypeScript compiles without errors**

```bash
cd app && npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 8: Commit**

```bash
git add app/App.tsx
git commit -m "feat: add opacity press feedback to all Pressable buttons"
```

---

## Manual Verification

After all tasks complete, start the app and verify:

```bash
cd app && npx expo start
```

Check list:
- [ ] Tap 設定定位 → button dims on press
- [ ] Tap 恢復真實定位 → button dims on press
- [ ] Tap 重新檢查狀態 → link dims on press
- [ ] Tap a preset → preset chip dims on press
- [ ] On success (設定定位) → status shows `✓ 已設定 ...` in green
- [ ] On reset (恢復真實定位) → status shows `✓ 已恢復真實定位` in green
- [ ] On connection error → status shows `✗ 失敗：...` in red
- [ ] On offline → status shows `✗ 離線：...` in red
- [ ] Initial load → status `檢查中…` stays in blue
- [ ] 無裝置連線 → stays in blue
- [ ] Clipboard banner appears → 套用 and ✕ both dim on press
