
# ✂️ QuickCut

**Copy text and links in two clicks. Keep everything in a searchable history.**

No dragging. No Cmd/Ctrl+C. Everything stays on your device.
---

## Why QuickCut?

Selecting text by dragging is clumsy, especially for long passages that need scrolling. Then you still have to press Cmd/Ctrl+C, and the browser only remembers the **last** thing you copied.

QuickCut fixes all three:

| Browser default | QuickCut |
| --- | --- |
| Drag across text, miss, try again | **Click the start, click the end** |
| Press Cmd/Ctrl+C | **Copied automatically** |
| Only the last copy is remembered | **Searchable history of everything you cut** |

## ✨ Features

- **Two-click text capture** - mark a start point and an end point; QuickCut selects, copies, and saves the text between them. Works in either direction and across inline elements.
- **Link capture** - click a link to copy its real URL (even when the visible text says something else) without navigating. Double-click to open it in a new tab.
- **Searchable history** - newest first, with type badges (text, link, code), source page, and timestamps.
- **Always-on or off** - one toggle turns QuickCut on or off across all tabs. When off, it does nothing at all.
- **Stays out of your way** - only `Escape` is handled. Typing, Cmd/Ctrl+C/V/A, and the site's own Copy buttons keep working normally.
- **Sounds and feedback** - short, locally generated sounds and an on-page "Saved" confirmation. Mute or adjust volume anytime.
- **Right-click "Paste from QuickCut"** - re-insert a recent capture into any field.
- **Sensible limits** - configurable history size, duplicate handling, and best-effort skipping of passwords, card-like numbers, and one-time codes.

## 📦 Install

### From the Chrome Web Store

> Coming soon: `<link here once published>`

### From source (Developer mode)

1. Download or clone this repository:
   ```bash
   git clone https://github.com/<your-username>/quickcut.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `quickcut/` folder (the one that contains `manifest.json`).
5. Pin QuickCut from the puzzle-piece menu so it's one click away.

After editing files, click the reload arrow on the QuickCut card and refresh any open tabs.

## 🚀 How it works

1. Click the QuickCut icon and switch it **ON** (or press `Alt+Shift+X`).
2. **Text:** double-click a word to set the start, then click where the selection should end. The text is selected, copied, and saved.
3. **Links:** choose **Capture link**, then click a link to copy and save its URL. Double-click to open it in a new tab.
4. Open the popup to search, copy again, open, or delete anything you saved.
5. Press `Escape` to clear a pending start. Press it again to turn QuickCut off.

### Keyboard shortcuts

| Action | Default |
| --- | --- |
| Turn QuickCut on/off | `Alt+Shift+X` |
| Open the popup | `Alt+Shift+Q` |
| Open the popup with search focused | `Alt+Shift+F` |
| Cancel a pending start / exit | `Esc` |

Change any of them at `chrome://extensions/shortcuts`.

## 🔒 Privacy

- Captures are stored with `chrome.storage.local` **on your device only**.
- No servers, no analytics, no telemetry, no remote code.
- QuickCut never monitors your clipboard. It saves only when **you** capture something.
- Sensitive-content filtering (passwords, card-like numbers, one-time codes) is best-effort. It can miss secrets or reject ordinary text, so don't rely on it for anything that must never be stored.

## 🔑 Permissions

| Permission | Why it's needed |
| --- | --- |
| `storage` | Save your history and settings locally. |
| `activeTab` / `scripting` | Inject the capture script into tabs opened before install. |
| `clipboardWrite` | Copy captures and re-copy items from history. |
| `contextMenus` | The "Paste from QuickCut" right-click menu. |
| Site access (`http://*/*`, `https://*/*`) | Run the capture script on the pages you use, without reopening the popup every time. It reads page content only when you click to capture. |

## ⚠️ Known limitations

- Doesn't run on `chrome://` pages, the Chrome Web Store, or other pages Chrome blocks for extensions.
- Complex editors, canvas-based apps, and sites with custom selection handling may behave differently.
- Content inside cross-origin iframes is not captured.
- Text mode relies on the browser's selection APIs, so very unusual page structures may select slightly differently.

## 🛠 Development

```
quickcut/
├── manifest.json
├── background.js        # service worker: storage, messaging, context menu
├── content.js           # two-click selection, link capture, on-page feedback
├── popup.html/css/js    # history UI
├── options.html/css/js  # settings
├── sounds/              # Web Audio sound generator (no audio files)
├── icons/
└── README.md
```

- Plain JavaScript, HTML, and CSS. No build step, no dependencies for the extension itself.
- Syntax check: `node --check <file>.js`
- Tests (Playwright, loads the unpacked extension): `npm test`

### Debugging tips

- Extension errors: `chrome://extensions` → QuickCut → **Errors**.
- Service worker logs: **Inspect views → service worker**.
- Content script logs: DevTools console on the page.

## 🗺 Roadmap

- [ ] Export / import history (JSON, CSV, Markdown)
- [ ] Per-site "never run here" list
- [ ] Light / dark / system theme
- [ ] Labels and pinning for saved items
- [ ] Firefox and Edge builds

## 🤝 Contributing

Issues and pull requests are welcome. Please:

1. Open an issue describing the bug or idea first.
2. Keep changes focused and run `node --check` on every JS file.
3. Include the page or site where you hit a problem, plus the console error if there is one.
