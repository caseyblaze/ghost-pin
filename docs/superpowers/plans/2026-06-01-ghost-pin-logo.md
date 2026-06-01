# Ghost-Pin Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `Ghost-Pin` text title in App.tsx with a styled `GhostPinLogo` component — two-tone monospace text with a gradient underline.

**Architecture:** A single stateless component `GhostPinLogo` is created in `app/src/GhostPinLogo.tsx`. It renders two `<Text>` spans side-by-side (GHOST in white, PIN in blue) over a `LinearGradient` underline bar. `App.tsx` imports and uses it in place of the current `<Text style={styles.title}>` element.

**Tech Stack:** React Native, Expo ~54, `expo-linear-gradient` (to be installed)

---

### Task 1: Install expo-linear-gradient

**Files:**
- Modify: `app/package.json` (updated automatically by npx expo install)

- [ ] **Step 1: Install the package**

  Run from the repo root (not inside `app/`):

  ```bash
  cd /Users/kc/Documents/ghost-pin/app && npx expo install expo-linear-gradient
  ```

  Expected output includes a line like:
  ```
  ✔ Installing 1 package using npm
  ```
  And `package.json` will now list `"expo-linear-gradient"` under `dependencies`.

- [ ] **Step 2: Verify the install**

  ```bash
  grep expo-linear-gradient /Users/kc/Documents/ghost-pin/app/package.json
  ```

  Expected: one line with `"expo-linear-gradient": "~X.Y.Z"` (exact version may vary).

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/kc/Documents/ghost-pin && git add app/package.json app/package-lock.json && git commit -m "chore: install expo-linear-gradient"
  ```

---

### Task 2: Create GhostPinLogo component

**Files:**
- Create: `app/src/GhostPinLogo.tsx`

- [ ] **Step 1: Create the file**

  Create `app/src/GhostPinLogo.tsx` with this exact content:

  ```tsx
  import { View, Text, StyleSheet } from 'react-native';
  import { LinearGradient } from 'expo-linear-gradient';

  export function GhostPinLogo() {
    return (
      <View style={styles.container}>
        <View style={styles.textRow}>
          <Text style={[styles.text, styles.ghost]}>GHOST</Text>
          <Text style={[styles.text, styles.pin]}>PIN</Text>
        </View>
        <LinearGradient
          colors={['#7fd1ff', '#2563eb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.underline}
        />
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { marginBottom: 4 },
    textRow: { flexDirection: 'row' },
    text: {
      fontSize: 28,
      fontWeight: '800',
      fontFamily: 'monospace',
      letterSpacing: 2,
    },
    ghost: { color: '#ffffff' },
    pin: { color: '#2563eb' },
    underline: { height: 2, borderRadius: 1 },
  });
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd /Users/kc/Documents/ghost-pin/app && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/kc/Documents/ghost-pin && git add app/src/GhostPinLogo.tsx && git commit -m "feat: add GhostPinLogo component"
  ```

---

### Task 3: Wire GhostPinLogo into App.tsx

**Files:**
- Modify: `app/App.tsx` (lines 1–9, 161, 210)

- [ ] **Step 1: Add import**

  In `app/App.tsx`, add the import after the existing local imports (after line 9, `import { setLocation, resetLocation, getStatus } from './src/api';`):

  ```tsx
  import { GhostPinLogo } from './src/GhostPinLogo';
  ```

- [ ] **Step 2: Replace the title element**

  Find line 161:
  ```tsx
  <Text style={styles.title}>Ghost-Pin</Text>
  ```

  Replace with:
  ```tsx
  <GhostPinLogo />
  ```

- [ ] **Step 3: Remove styles.title**

  In the `StyleSheet.create({...})` block (around line 210), find and delete this line:
  ```tsx
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 4 },
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /Users/kc/Documents/ghost-pin/app && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/kc/Documents/ghost-pin && git add app/App.tsx && git commit -m "feat: replace title text with GhostPinLogo"
  ```

---

### Task 4: Visual verification

**Files:** none (read-only verification step)

- [ ] **Step 1: Start the app**

  ```bash
  cd /Users/kc/Documents/ghost-pin && bash start.sh
  ```

  Or directly:
  ```bash
  cd /Users/kc/Documents/ghost-pin/app && npx expo start --ios
  ```

- [ ] **Step 2: Check the logo**

  In the simulator/device, verify:
  - "GHOST" appears in white, "PIN" in blue (`#2563eb`), side by side with no gap
  - Both words use a monospace font, bold, uppercase
  - A thin gradient line (light blue → blue) sits immediately below the text
  - The spacing below the logo before the status line looks the same as before

- [ ] **Step 3: Done** — no further commits needed unless visual tweaks are required.
