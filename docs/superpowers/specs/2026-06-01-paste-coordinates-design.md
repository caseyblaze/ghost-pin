# Paste Coordinates Feature Design

Date: 2026-06-01

## Overview

Add a clipboard-detection feature to the Ghost-Pin mobile app. When the user copies a coordinate string (e.g. from Google Maps) and switches back to the app, a banner appears offering to paste the parsed coordinates into the lat/lng fields.

## Trigger

- Uses React Native `AppState` to detect when the app transitions from `background` → `active`
- On each such transition, read the clipboard via `expo-clipboard`'s `Clipboard.getStringAsync()`
- Parse the string; show the banner only if parsing succeeds

## Coordinate Parsing (`parseCoords`)

Accepts two formats:

| Format | Example |
|--------|---------|
| `(lat, lng)` | `(25.0330, 121.5654)` |
| `lat, lng` | `25.0330, 121.5654` |

Validation:
- lat: numeric, range -90 to 90
- lng: numeric, range -180 to 180
- Any other input → return `null`, show nothing

## Deduplication

- A `useRef` stores the last clipboard string that triggered a banner
- If the same string is detected again on the next foreground switch, the banner is NOT shown again
- After the user taps "套用" (apply), the ref is cleared so the same coordinates can trigger again on the next foreground switch

## ClipboardBanner Component

Inlined in `App.tsx` (small enough to not warrant a separate file).

**Position:** Between the title and the status line.

**Visual:**
```
┌──────────────────────────────────────┐
│▌📋 25.0330, 121.5654    套用    ✕   │
└──────────────────────────────────────┘
```

**Styling:**
- Background: `#1a3a5c`
- Left border: `#2563eb` (4px, matches primary button colour)
- Border radius: 8
- Text: white; "套用" in `#7fd1ff`; "✕" in `#9aa`

**Animation:**
- Slide in from top: `Animated.timing`, 200ms, ease-out
- Slide out (dismiss or apply): reverse direction, 150ms

## Behaviour

| Action | Result |
|--------|--------|
| Tap 套用 | Fill `lat` and `lng` state; dismiss banner with slide-out; clear dedup ref |
| Tap ✕ | Dismiss banner with slide-out; do NOT clear dedup ref (won't show again for same string) |
| 4 seconds elapse | Auto-dismiss (same as tapping ✕) |

## File Changes

- `app/package.json` — add `expo-clipboard`
- `app/App.tsx` — add AppState listener, `parseCoords`, `ClipboardBanner`, banner state

## Dependencies

- `expo-clipboard` (Expo managed workflow, works in Expo Go)
- No new native modules required beyond what Expo provides
