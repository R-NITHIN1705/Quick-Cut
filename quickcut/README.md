# QuickCut

QuickCut is a small Manifest V3 Chrome extension that selects text between two points or captures a link destination, saves it locally, and shows a short “Saved” message.

## Permissions

- `storage` saves captured text and links and the configurable history limit in `chrome.storage.local`.
- `activeTab` grants temporary access to the current tab after the user invokes QuickCut from its toolbar popup or keyboard command.
- `scripting` injects the selection controller only into that user-invoked tab.
- `clipboardWrite` permits copying the selected text to the clipboard.
- The `commands` API is declared through the manifest and does not require a separate permission. Chrome's Extensions shortcuts page lets the user change the suggested `Alt+Shift+X` shortcut.

## Use

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `quickcut/` folder.
4. Open a page with selectable text, click the QuickCut toolbar button, then click the start and end points. QuickCut selects, copies, and saves the text. Press **Escape** to cancel.
5. For links, choose **Capture a link**, then click the link. QuickCut saves its destination URL without following it. If you want linked text, use text selection mode instead.

The popup shows recent captures. QuickCut keeps records newest-first, with a default history limit of 200. Re-capturing identical content of the same type moves its existing record to the top and refreshes its timestamp while preserving its ID and label. Older entries remain until trimmed by the configured limit. Change the limit in Settings (1–10000), or change the keyboard command at `chrome://extensions/shortcuts`.

## Sounds and shortcuts

QuickCut generates its short activation click, capture snip, copy pop, and cancel tone locally with the Web Audio API in `sounds/sounds.js`. It does not download or stream audio, so the sounds work offline. Sound is enabled by default at a modest volume; turn it off or adjust the level in Settings. Feedback plays only after activation, saving, copying, or cancellation succeeds.

Chrome manages the shortcuts and lets you reassign them from `chrome://extensions/shortcuts` or the button in Settings. Suggested defaults are `Alt+Shift+X` for scissors mode, `Alt+Shift+Q` to open the popup, and `Alt+Shift+F` to open the popup with its search field focused. These avoid taking over the common `Ctrl/Cmd+F` browser find shortcut. **Escape** cancels an active mode and remains available regardless of the shortcut settings.

Each record has an `id`, `content`, `type` (`text`, `link`, or heuristically classified `code`), and millisecond `createdAt` timestamp. When available, records also include `sourceUrl` and `sourceTitle`; a `label` field is available for user labels. No remote service is used.

Link capture resolves relative destinations against the page URL and accepts only HTTP or HTTPS. It stores the resolved URL and does not downgrade HTTPS, strip query strings, or otherwise intentionally rewrite the destination. Other schemes such as `javascript:` and `mailto:` are rejected.

## Limits

QuickCut uses the browser's caret hit-testing APIs and normal DOM ranges. It may be inaccurate in complex editors (including canvas-based or heavily virtualized editors), and editor-specific behaviors may interfere. Selection is limited to the current document: it does not cross iframe boundaries, and cross-origin frames cannot be read. Chrome does not allow extensions to inject into protected pages such as `chrome://` pages, the Chrome Web Store, or some browser-owned surfaces. In those cases, QuickCut reports that it cannot run. Browser security and page behavior can also block clipboard writes; the extension will still show the selection when copying fails.

This foundation is not guaranteed to work on every website. It does not request broad host access and only attempts to run after explicit toolbar or keyboard activation.
