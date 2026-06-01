# Ghost-Pin Logo Design

**Date:** 2026-06-01

## Goal

Replace the plain `<Text>Ghost-Pin</Text>` title in the app header with a styled logo component using two-tone typography and a gradient underline.

## Visual Specification

```text
GHOSTPIN
─────────  (gradient underline: #7fd1ff → #2563eb)
```

| Property       | GHOST      | PIN        |
| -------------- | ---------- | ---------- |
| Color          | `#ffffff`  | `#2563eb`  |
| Font family    | monospace  | monospace  |
| Font weight    | 800        | 800        |
| Text transform | uppercase  | uppercase  |
| Letter spacing | 2px        | 2px        |
| Font size      | 28px       | 28px       |
| Margin bottom  | 4px        | —          |

**Underline:** 2px height, `borderRadius: 1`, gradient from `#7fd1ff` to `#2563eb` (left → right), full width of the combined text.

## Component

A `GhostPinLogo` component defined in `app/src/GhostPinLogo.tsx`.

```tsx
<View style={{ marginBottom: 4 }}>
  <View style={{ flexDirection: 'row' }}>
    <Text>GHOST</Text>
    <Text>PIN</Text>
  </View>
  <LinearGradient
    colors={['#7fd1ff', '#2563eb']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={{ height: 2, borderRadius: 1 }}
  />
</View>
```

## Implementation Steps

1. Install `expo-linear-gradient` in `app/`:

   ```bash
   cd app && npx expo install expo-linear-gradient
   ```

2. Create `app/src/GhostPinLogo.tsx` with the component.

3. In `app/App.tsx`:
   - Import `GhostPinLogo`
   - Replace `<Text style={styles.title}>Ghost-Pin</Text>` with `<GhostPinLogo />`
   - Remove `styles.title` from `StyleSheet.create`

## Constraints

- No changes to server or other app logic.
- `expo-linear-gradient` version resolved automatically by `npx expo install`.
- Component has no props; it is a fixed brand element.
