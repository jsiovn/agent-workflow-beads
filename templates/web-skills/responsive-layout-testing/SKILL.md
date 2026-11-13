---
name: responsive-layout-testing
description: Use when asked to check, screenshot, or fix how a web page renders across screen sizes - loads the page at 320/375/425/768/1024/1280px via the Chrome DevTools MCP, screenshots each, and fixes any horizontal overflow or layout break before reporting
---

# Responsive Layout Testing

## Overview

A page that "looks fine" on your screen is one width out of many. Narrow viewports are where text overflows, grids blow out, and fixed-width elements push a horizontal scrollbar onto the whole document. This skill drives the **Chrome DevTools MCP** to load one page at six representative widths, screenshot each, detect layout breaks programmatically, fix the root cause, and prove the fix with a fresh screenshot.

**Core principle:** every breakpoint gets an objective overflow check, not an eyeball glance at one screenshot.

**Violating the letter of this process is violating the spirit of it.**

This is an **executor-mode** technique. It writes code (CSS/markup fixes), so it must not run in a planner session. It pairs with `systematic-debugging` (find the offending element before editing) and hands the completion claim to `verification-before-completion`.

## The Iron Law

```
NO "RESPONSIVE" / "FIXED" CLAIM WITHOUT A CLEAN OVERFLOW CHECK
+ FRESH SCREENSHOT AT EVERY WIDTH
```

If you have not run the overflow probe and captured a screenshot at all six widths _after_ your last edit, you cannot say the layout is fixed.

## The Breakpoints

Test all six. Don't drop the narrow ones — 320px is where things break.

| Label | Width (px) | Height (px) | Represents          |
| ----- | ---------- | ----------- | ------------------- |
| 320   | 320        | 800         | Smallest phones     |
| 375   | 375        | 800         | iPhone-class phones |
| 425   | 425        | 800         | Large phones        |
| 768   | 768        | 1024        | Tablet / `md`       |
| 1024  | 1024       | 768         | Small laptop / `lg` |
| 1280  | 1280       | 800         | Desktop / `xl`      |

## Steps

### 1. Get the target page live

Determine the URL to test from the user's request, the bead, or the plan. The page must be reachable in a browser. If the project has a `run` / `build-and-test` skill or a documented dev-server command, use it to start the app; otherwise ask how to serve the page rather than guessing. Note the full URL (including any path/query) and wait for the dev server to finish startup before navigating.

### 2. Capture + probe each width

Use a fresh isolated Chrome DevTools context (unique `isolatedContext` name) so prior state never leaks in. For **each** width in the table:

1. `new_page` — open a page in the isolated context; record its `pageId`.
2. `resize_page` — set the viewport to the breakpoint's width × height.
3. `navigate_page` — load the URL. If the route needs auth, inject the project's auth mock via `initScript` (see `attach-web-screenshots` for the pattern).
4. `wait_for` — wait on the key content so you screenshot a settled layout, not a spinner.
5. `evaluate_script` — run the overflow probe below and record the result.
6. `take_screenshot` — save `fullPage: true` to `/tmp/<slug>-<width>.png` (e.g. `/tmp/pricing-320.png`).

**Overflow probe** (run via `evaluate_script`):

```js
() => {
  const docEl = document.documentElement;
  const vw = docEl.clientWidth;
  const overflowing = [...document.querySelectorAll('*')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      // right edge past the viewport, or wider than the viewport itself
      return r.right > vw + 1 || r.width > vw + 1;
    })
    .slice(0, 20)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: el.className && String(el.className).slice(0, 80),
      right: Math.round(el.getBoundingClientRect().right),
      width: Math.round(el.getBoundingClientRect().width),
    }));
  return {
    viewport: vw,
    docScrollWidth: docEl.scrollWidth,
    hasHorizontalScroll: docEl.scrollWidth > vw + 1,
    offenders: overflowing,
  };
};
```

A width **passes** only when `hasHorizontalScroll` is `false` and `offenders` is empty. Also eyeball the screenshot for breaks the probe can't catch: clipped/overlapping text, content escaping its container, controls pushed off-screen, an unreadable squashed layout.

### 3. Find the root cause before editing

For each failing width, the probe already names the offending elements (innermost first). Treat it like `systematic-debugging`: trace _why_ that element is wider than its viewport before you touch CSS. Common culprits:

- A fixed `width:` / `min-width:` (in `px`) that exceeds the narrow viewport.
- Long unbroken strings or URLs with no `overflow-wrap` / `word-break`.
- A flex/grid row that doesn't wrap (`flex-nowrap`, fixed column counts).
- A negative margin, absolute position, or `100vw` element ignoring the scrollbar.
- An image/table/`pre`/iframe with no `max-width: 100%`.

### 4. Fix the cause, not the symptom

Edit the actual offending rule — make widths fluid (`max-width: 100%`, `min-width: 0` on flex children), let rows wrap, add `overflow-wrap: anywhere` to long text, cap media at `100%`.

**Red flag — masking, not fixing:** slapping `overflow-x: hidden` on `html`/`body` (or the container) to kill the scrollbar. That hides the symptom while the content is still clipped or escaping its box. If your fix is `overflow-x: hidden` and you haven't removed the thing that overflows, you have not fixed it. The probe will still report offenders even when the scrollbar is suppressed — that's the tell.

### 5. Re-probe + re-screenshot to prove it

After editing, re-run step 2 for **every width you changed anything for** (and re-screenshot — a CSS change at one width often shifts others). The Iron Law is satisfied only when all six widths report no horizontal scroll and no offenders, with fresh screenshots on disk.

### 6. Close pages

Close every page you opened with `close_page(<pageId>)`. The last remaining page can't be closed — leave it.

### 7. Hand off the completion claim

Do not declare the layout fixed on your own. Route the final claim through **`verification-before-completion`**: the evidence is the post-fix probe output (no scroll, no offenders) plus the screenshots at all six widths. Report the before/after per width to the user, attaching the screenshots.

## Red Flags — STOP

- About to say "responsive" / "looks good on mobile" after screenshotting only one or two widths.
- Reaching for `overflow-x: hidden` on the page root to silence a scrollbar.
- Editing CSS before reading which element the probe flagged.
- Claiming the fix worked without re-running the probe _after_ the edit.
- Skipping 320px because "no one uses a phone that small."

## Rationalization Prevention

| Excuse                                    | Reality                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| "It looked fine at 1280, ship it."        | Breaks live in the narrow widths. Test all six.                    |
| "`overflow-x: hidden` makes it go away."  | It hides clipped content. The probe still flags the offender.      |
| "I can see the overflow, just fix it."    | Seeing the symptom ≠ knowing which rule causes it. Read the probe. |
| "I already screenshotted before the fix." | Pre-fix shots prove the bug, not the fix. Re-shoot after editing.  |
| "320px is too rare to matter."            | It's the cheapest width to test and the most likely to break.      |

## Related

- `systematic-debugging` — root-cause discipline applied to the offending element in step 3.
- `verification-before-completion` — owns the final "fixed" claim (step 7).
- `attach-web-screenshots` — opt-in skill for the auth-mock `initScript` pattern and for posting the screenshots to a PR.
