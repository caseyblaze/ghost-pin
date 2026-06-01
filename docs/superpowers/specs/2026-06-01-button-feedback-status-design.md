# Button Feedback & Status Message Design

## Overview

Two UI improvements to Ghost-Pin app (`app/App.tsx`):
1. Button press feedback so users know a button was tapped
2. Clearer status messages with color and icon based on outcome

---

## 1. Button Press Feedback

### Approach
Use `Pressable`'s `style` function prop to apply `opacity: 0.6` when `pressed` is true. This works universally across all button colors without needing per-variant pressed colors.

### Affected components (6 total)
| Button | Location |
|---|---|
| 設定定位 | `App` — primary action |
| 恢復真實定位 | `App` — secondary action |
| 重新檢查狀態 | `App` — refresh link |
| Preset buttons (each) | `App` — preset list |
| 套用 | `ClipboardBanner` |
| ✕ | `ClipboardBanner` |

### Implementation pattern
```jsx
// Before
<Pressable style={[styles.btn, styles.primary]} ...>

// After
<Pressable style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.6 }]} ...>
```

---

## 2. Status Message Color + Icon

### Approach
Add a `statusType` state alongside the existing `status` string. The icon and color are applied at the render layer; the `status` strings in state are unchanged.

### New state
```ts
const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
```

### Status → type mapping
| Status string | type |
|---|---|
| `'檢查中…'` | `info` |
| `'裝置已連線'` | `success` |
| `'無裝置連線'` | `info` |
| `'離線：...'` | `error` |
| `'已設定 ...'` | `success` |
| `'已恢復真實定位'` | `success` |
| `'失敗：...'` | `error` |

### Color & icon constants
```ts
const STATUS_COLORS = {
  info:    '#7fd1ff',  // existing blue — no change
  success: '#4ade80',  // green
  error:   '#f87171',  // red
} as const;

const STATUS_ICONS = {
  info:    '',
  success: '✓ ',
  error:   '✗ ',
} as const;
```

### Render
```jsx
<Text style={[styles.status, { color: STATUS_COLORS[statusType] }]}>
  {STATUS_ICONS[statusType]}{status}
</Text>
```

### Call sites — update `setStatus` to also call `setStatusType`

`refreshStatus()`:
- `'離線：...'` → `error`
- `'裝置已連線'` → `success`
- `'無裝置連線'` → `info`

`onSet()`:
- `'已設定 ...'` → `success`
- `'失敗：...'` → `error`

`onReset()`:
- `'已恢復真實定位'` → `success`
- `'失敗：...'` → `error`

Initial state: `'檢查中…'` is `info`.

---

## Out of scope
- Toast animations
- Persisting status across app restarts
- Any other UI changes
