# Chrome Web Store permission justifications

## Permissions

- **storage** — Stores the captures and QuickCut preferences in `chrome.storage.local` so they remain on this device between sessions.
- **activeTab** — Grants temporary access to the current tab only after the user invokes a QuickCut capture action.
- **scripting** — Injects QuickCut's capture handler into the current tab only after the user explicitly starts text or link capture.
- **clipboardWrite** — Allows QuickCut to copy the text or link the user explicitly captures to the clipboard.

## Host access

QuickCut requests no broad host permissions. `activeTab` is the only page access, and it is temporary and user-initiated for the current tab.
