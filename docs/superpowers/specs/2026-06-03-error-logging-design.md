# Error Logging Design

## Goal

Automatically save pymobiledevice3 error messages to a log file on the Mac when `setLocation` or `clearLocation` fails.

## Scope

One file changed: `server/src/pmd.js`

## Log File

- Path: `<project-root>/errors.log`
- Added to `.gitignore`
- Size cap: if file exceeds 1 MB before a write, trim the oldest half of lines first

## Format

```
[2026-06-03 13:25:01] set-location 25.033 121.565
pymobiledevice3 失敗: RuntimeError: Event loop stopped before Future completed.
---
[2026-06-03 13:26:10] clear-location
pymobiledevice3 失敗: error: (102, 'Operation not supported on socket')
---
```

## Implementation

Add `logError(command, detail)` to `pmd.js`:

```js
function logError(command, detail) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const entry = `[${ts}] ${command}\n${detail}\n---\n`;
  const MAX = 1024 * 1024;
  if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX) {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n');
    fs.writeFileSync(LOG_PATH, lines.slice(Math.floor(lines.length / 2)).join('\n'));
  }
  fs.appendFileSync(LOG_PATH, entry);
}
```

Call sites:
- `spawnPmd` on `code !== 0` (covers `clearLocation`)
- `setLocation` spawn `close` handler on failure

## Out of Scope

- Connection errors, validate errors, server crashes
- Log rotation libraries
- UI display of errors in the app
