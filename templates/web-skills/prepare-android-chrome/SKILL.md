---
name: prepare-android-chrome
description: 'Prepare a USB-connected Android phone so the user (or follow-up tools) can drive Chrome on it via the chrome-devtools-android MCP server. Verifies adb, ensures Chrome DevTools is reachable, registers/forwards the MCP endpoint, and — if a localhost URL is given — sets up adb reverse for the dev server. Performs no navigation, no screenshot, no audits, and no cleanup.'
---

# Prepare Android Chrome (DevTools MCP)

This skill only **prepares the connection**. After it finishes, the user can drive Chrome on the phone via the `chrome-devtools-android` MCP server (navigate, screenshot, audit — whatever they want). The skill itself does not open pages, take screenshots, run audits, or tear anything down.

Reference: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/debugging-android.md

## Inputs

- **`url`** (optional) — only needed if the user wants `localhost` reachable from the phone. When provided and the host resolves to `localhost` / `127.0.0.1` / `0.0.0.0`, this skill sets up `adb reverse` for that port. Otherwise the URL is ignored.

## Prerequisites

Machine:

- `adb` on `PATH` (Android Platform Tools).
- Chrome DevTools MCP server installed (invoked via `npx`).

Phone:

- Developer Options + USB debugging enabled. See https://developer.android.com/studio/debug/dev-options
- Chrome (stable, beta, or Canary) installed and **opened at least once** interactively (to clear EULA/first-run prompts).
- USB-connected to the machine, with the on-device "Allow USB debugging?" prompt accepted.

## Steps

### 1. Check / set up the adb connection

```bash
adb devices
```

Expected: one line like `R3CMA0955JT  device`.

- If `unauthorized`: ask the user to tap "Allow" on the phone.
- If empty: ask the user to plug the phone in and confirm USB debugging is on.
- If multiple devices listed: ask the user which serial to target and use `adb -s <serial>` for every subsequent `adb` command in this skill.

Then confirm Chrome's DevTools socket is live on the phone:

```bash
adb shell cat /proc/net/unix | grep --text chrome_devtools_remote
```

Expected: at least one matching line. If empty, launch Chrome via adb:

```bash
# Detect installed Chrome variant
adb shell pm list packages | grep -E 'com\.(android\.chrome|chrome\.(beta|canary|dev))'

# Launch (substitute the matching package name)
adb shell monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1
```

Wait ~2 seconds, re-check `chrome_devtools_remote`. If still empty, Chrome has not been opened interactively — ask the user to unlock the phone and tap through Chrome's first-run prompts once.

Forward the DevTools port:

```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote
curl -sS http://127.0.0.1:9222/json/version
```

`curl` should return JSON with `Browser` and `webSocketDebuggerUrl`. If it fails, re-run `adb forward` and confirm nothing else is bound to port 9222.

### 2. Check / guide the chrome-devtools-android MCP server

The default `chrome-devtools` MCP server launches a **desktop** Chrome. A **separate** MCP server named `chrome-devtools-android` must be registered, pointed at the phone via `--wsEndpoint`, so it can coexist with the desktop one.

Check whether it is already registered:

```bash
claude mcp list | grep chrome-devtools-android
```

If missing, **do not run the add command yourself** — it writes to the user's MCP config. Surface this command and ask the user to run it:

```bash
claude mcp add --transport stdio --scope user chrome-devtools-android \
    -- npx chrome-devtools-mcp@latest --wsEndpoint=ws://127.0.0.1:9222/devtools/browser
```

After they confirm it is added, they must **restart the agent** so the new MCP server is loaded. Then re-invoke this skill.

### 3. Check the chrome-devtools-android MCP connection

Once the server is registered and loaded, call `list_pages` via the `chrome-devtools-android` MCP tools. The returned pages should match the tabs currently open in Chrome on the phone.

If `list_pages` returns nothing or errors:

- Re-run the `adb forward` from step 1.
- Confirm no other DevTools client (e.g. `chrome://inspect` in desktop Chrome targeting the same phone) is attached — Chrome only allows one CDP client at a time.
- Verify the `--wsEndpoint` registered in step 2 matches `ws://127.0.0.1:9222/devtools/browser`.

### 4. If `url` is a localhost address, set up reverse port forwarding

Skip this step entirely when no URL was provided or the URL's host is not localhost.

When the URL host is `localhost` / `127.0.0.1` / `0.0.0.0`, parse the port and set up reverse forwarding so the phone can reach the host's dev server:

```bash
adb reverse tcp:<port> tcp:<port>
```

Example for Vite on 5173:

```bash
adb reverse tcp:5173 tcp:5173
```

Without this, `localhost` on the phone resolves to the phone itself and the page fails to load.

If the URL has no explicit port, infer the scheme default (80 for `http`, 443 for `https`) — but flag to the user that reverse-forwarding privileged ports is unusual and double-check what they actually want.

### 5. Report and hand off

Report the prepared state to the user, e.g.:

```
adb device:       <serial> (<Android version>, Chrome <version>)
DevTools forward: tcp:9222 -> chrome_devtools_remote  (OK)
MCP server:       chrome-devtools-android  (registered, list_pages OK)
Reverse forward:  tcp:<port> -> tcp:<port>            (only if step 4 ran)
```

Then stop. The user (or a follow-up tool call) can now use the `chrome-devtools-android` MCP tools — `new_page`, `navigate_page`, `take_screenshot`, `list_console_messages`, `performance_start_trace`, etc. — to drive Chrome on the phone.

## What this skill does NOT do

- Does not navigate to the URL or open any page.
- Does not take screenshots or run any audit (performance, console, a11y, etc.).
- Does **not** clean up: it leaves `adb forward tcp:9222`, the registered MCP server, and any `adb reverse` in place so follow-up work can use them. If the user wants to tear things down later, they can run `adb forward --remove tcp:9222` and `adb reverse --remove tcp:<port>` themselves.

## Notes & caveats

- **Experimental upstream**: Chrome on Android via Puppeteer/DevTools-MCP is officially experimental. Some tools (`resize_page`, certain `emulate` modes, `take_screenshot` with `fullPage: true`) behave differently than on desktop. In particular, `take_screenshot` with `fullPage: true` on Android can duplicate content — prefer scroll-and-stitch if a full-page capture is needed downstream.
- **No direct CDP WebSocket**: Chrome 128+ enforces strict origin checking on the CDP WebSocket endpoint on Android. A direct `ws://` connection from Python (or similar) is rejected with 403. Always go through the MCP server.
- **One DevTools client at a time**: if `chrome://inspect` is open in desktop Chrome against the same phone, the MCP server may fail to attach. Ask the user to close it.
- **Don't edit the user's MCP config from inside this skill.** Surface the `claude mcp add` command and let the user run it.
