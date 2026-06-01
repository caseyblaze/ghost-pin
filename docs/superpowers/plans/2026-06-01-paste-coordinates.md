# Paste Coordinates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user copies a `(lat, lng)` coordinate string and switches back to the app, a slide-in banner appears offering to paste the values into the lat/lng fields.

**Architecture:** `AppState` detects foreground transitions and reads the clipboard via `expo-clipboard`. A pure `parseCoords` function validates the string. On success, a `ClipboardBanner` component (inlined in `App.tsx`) slides in, shows the coordinates, and offers Apply / Dismiss.

**Tech Stack:** Expo SDK ~54, React 19, expo-clipboard ~7, jest-expo ~54 (unit tests for parseCoords)

---

### Task 1: Install expo-clipboard

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Install the package**

Run in the `app/` directory:
```bash
cd app && npx expo install expo-clipboard
```
Expected output includes `+ expo-clipboard@7.x.x` (exact patch version may vary).

- [ ] **Step 2: Verify install**

```bash
node -e "require('./node_modules/expo-clipboard/package.json').version |> console.log"
```
Expected: prints a `7.x.x` version string.

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "feat: install expo-clipboard"
```

---

### Task 2: Extract parseCoords + write tests

**Files:**
- Create: `app/src/parseCoords.ts`
- Create: `app/src/__tests__/parseCoords.test.ts`
- Modify: `app/package.json` (add jest config + devDependencies)

- [ ] **Step 1: Install jest-expo and types**

```bash
cd app && npx expo install jest-expo && npm install --save-dev @types/jest
```

- [ ] **Step 2: Add jest config to app/package.json**

Add the following key at the top level of `app/package.json` (alongside `"scripts"`):
```json
"jest": {
  "preset": "jest-expo"
}
```
Also add to `"devDependencies"`:
```json
"jest": "^29.0.0"
```

- [ ] **Step 3: Create the test file (failing)**

Create `app/src/__tests__/parseCoords.test.ts`:
```typescript
import { parseCoords } from '../parseCoords';

describe('parseCoords', () => {
  it('parses (lat, lng) with parentheses', () => {
    expect(parseCoords('(25.0330, 121.5654)')).toEqual({ lat: 25.033, lng: 121.5654 });
  });

  it('parses lat, lng without parentheses', () => {
    expect(parseCoords('25.0330, 121.5654')).toEqual({ lat: 25.033, lng: 121.5654 });
  });

  it('parses negative coordinates', () => {
    expect(parseCoords('(-33.8688, 151.2093)')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it('returns null for lat out of range', () => {
    expect(parseCoords('(91, 0)')).toBeNull();
  });

  it('returns null for lng out of range', () => {
    expect(parseCoords('(0, 181)')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseCoords('hello world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCoords('')).toBeNull();
  });

  it('returns null for single number', () => {
    expect(parseCoords('25.0330')).toBeNull();
  });

  it('handles extra whitespace', () => {
    expect(parseCoords('(  25.0330 ,  121.5654  )')).toEqual({ lat: 25.033, lng: 121.5654 });
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd app && npx jest src/__tests__/parseCoords.test.ts
```
Expected: FAIL — `Cannot find module '../parseCoords'`

- [ ] **Step 5: Create app/src/parseCoords.ts**

```typescript
export type Coords = { lat: number; lng: number };

export function parseCoords(text: string): Coords | null {
  const match = text.trim().match(
    /^\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?$/
  );
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd app && npx jest src/__tests__/parseCoords.test.ts
```
Expected: PASS — 9 tests passing

- [ ] **Step 7: Commit**

```bash
git add app/src/parseCoords.ts app/src/__tests__/parseCoords.test.ts app/package.json app/package-lock.json
git commit -m "feat: add parseCoords with tests"
```

---

### Task 3: Add ClipboardBanner component to App.tsx

**Files:**
- Modify: `app/App.tsx`

In this task we add the `ClipboardBanner` component and its styles, but do NOT wire it up to AppState yet. We just render it unconditionally so we can see it looks right. Wiring happens in Task 4.

- [ ] **Step 1: Add imports to App.tsx**

At the top of `app/App.tsx`, add to the React Native import list: `Animated`, `AppState`.
Add a new import line below the React Native import:
```typescript
import * as Clipboard from 'expo-clipboard';
import { parseCoords, type Coords } from './src/parseCoords';
```

The import block should look like:
```typescript
import { useEffect, useRef, useState } from 'react';
import {
  Animated, AppState, SafeAreaView, ScrollView, View,
  Text, TextInput, Pressable, StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { parseCoords, type Coords } from './src/parseCoords';
import { PRESETS } from './presets';
import { setLocation, resetLocation, getStatus } from './src/api';
```

- [ ] **Step 2: Add ClipboardBanner component above the App function**

Insert this component definition in `app/App.tsx` between the imports and the `export default function App()` line:

```typescript
type BannerProps = {
  coords: Coords;
  onApply: () => void;
  onDismiss: () => void;
};

function ClipboardBanner({ coords, onApply, onDismiss }: BannerProps) {
  const translateY = useRef(new Animated.Value(-60)).current;

  function hide(callback: () => void) {
    Animated.timing(translateY, {
      toValue: -60,
      duration: 150,
      useNativeDriver: true,
    }).start(() => callback());
  }

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => hide(onDismiss), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
      <View style={styles.bannerAccent} />
      <Text style={styles.bannerText} numberOfLines={1}>
        📋 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
      </Text>
      <Pressable onPress={() => hide(onApply)}>
        <Text style={styles.bannerApply}>套用</Text>
      </Pressable>
      <Pressable onPress={() => hide(onDismiss)}>
        <Text style={styles.bannerDismissBtn}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}
```

- [ ] **Step 3: Add banner styles to StyleSheet.create**

Add these style entries to the existing `StyleSheet.create({...})` at the bottom of `App.tsx`:
```typescript
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a3a5c',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    paddingVertical: 10,
    paddingRight: 12,
    gap: 8,
  },
  bannerAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#2563eb',
    marginRight: 4,
  },
  bannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  bannerApply: {
    color: '#7fd1ff',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  bannerDismissBtn: {
    color: '#9aa',
    fontSize: 16,
    paddingHorizontal: 4,
  },
```

- [ ] **Step 4: Temporarily render the banner to verify appearance**

Inside `App()`, add a temporary `pendingCoords` constant and render the banner between the title and status text:

```typescript
// Temporary: remove in Task 4
const pendingCoords: Coords | null = { lat: 25.033, lng: 121.5654 };
```

In the JSX, between `<Text style={styles.title}>Ghost-Pin</Text>` and `<Text style={styles.status}>`, insert:
```tsx
{pendingCoords && (
  <ClipboardBanner
    coords={pendingCoords}
    onApply={() => {}}
    onDismiss={() => {}}
  />
)}
```

- [ ] **Step 5: Start the app and visually verify the banner**

```bash
cd app && npx expo start
```

Open Expo Go on your phone or simulator. You should see the banner:
```
📋 25.0330, 121.5654    套用    ✕
```
Slide-in animation should play when the app loads. ✕ and 套用 buttons should be visible and tappable (though they don't do anything yet).

- [ ] **Step 6: Remove the temporary pendingCoords constant**

Delete the `const pendingCoords: Coords | null = { lat: 25.033, lng: 121.5654 };` line you added in Step 4. Leave the JSX conditional in place — it will use the real state added in Task 4.

- [ ] **Step 7: Commit**

```bash
git add app/App.tsx
git commit -m "feat: add ClipboardBanner component"
```

---

### Task 4: Wire AppState + clipboard detection

**Files:**
- Modify: `app/App.tsx`

- [ ] **Step 1: Add banner state and refs inside App()**

Inside `export default function App()`, add these declarations near the top alongside the existing `useState` calls:

```typescript
const [pendingCoords, setPendingCoords] = useState<Coords | null>(null);
const lastClipboardRef = useRef<string | null>(null);
```

- [ ] **Step 2: Add AppState listener useEffect inside App()**

Add this `useEffect` below the existing `useEffect(() => { refreshStatus(); }, []);`:

```typescript
useEffect(() => {
  const sub = AppState.addEventListener('change', async (nextState) => {
    if (nextState !== 'active') return;
    const text = await Clipboard.getStringAsync();
    if (!text || text === lastClipboardRef.current) return;
    const coords = parseCoords(text);
    if (!coords) return;
    lastClipboardRef.current = text;
    setPendingCoords(coords);
  });
  return () => sub.remove();
}, []);
```

- [ ] **Step 3: Add handleApply and handleDismiss inside App()**

Add these two functions inside `App()`, below the `onReset` function:

```typescript
function handleApply() {
  if (!pendingCoords) return;
  setLat(String(pendingCoords.lat));
  setLng(String(pendingCoords.lng));
  lastClipboardRef.current = null;
  setPendingCoords(null);
}

function handleDismiss() {
  setPendingCoords(null);
}
```

- [ ] **Step 4: Update the JSX to use real state and handlers**

The JSX already has the conditional from Task 3. Update it to use the real handlers:

```tsx
{pendingCoords && (
  <ClipboardBanner
    coords={pendingCoords}
    onApply={handleApply}
    onDismiss={handleDismiss}
  />
)}
```

- [ ] **Step 5: Manual end-to-end test**

1. Start the app: `cd app && npx expo start`
2. Copy `(25.0330, 121.5654)` to your clipboard (e.g. from Notes or another app)
3. Switch to the Ghost-Pin app
4. Expected: blue-accented banner slides in showing `📋 25.0330, 121.5654`
5. Tap **套用** → lat/lng fields fill with `25.033` / `121.5654`, banner slides out
6. Switch away and back without copying anything new → no banner (dedup working)
7. Copy `(35.6762, 139.6503)` → switch back → new banner appears
8. Tap **✕** → banner dismisses; switch away and back → no banner (dedup still set)
9. Let a banner appear and wait 4 seconds → banner auto-dismisses

- [ ] **Step 6: Commit**

```bash
git add app/App.tsx
git commit -m "feat: paste coordinates from clipboard on foreground"
```
