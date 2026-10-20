(() => {
  if (window.__quickCutInstalled) return;
  window.__quickCutInstalled = true;

  const scissorsSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke="%231b1b1b" stroke-width="2.2" stroke-linecap="round"><circle cx="7" cy="7" r="4" fill="white"/><circle cx="7" cy="20" r="4" fill="white"/><path d="M10 9l17 15M10 18l17-14M16 14l-4 4"/></g></svg>';
  const linkSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke="%231b1b1b" stroke-width="3" stroke-linecap="round"><path d="M13 8H9a6 6 0 000 12h5M19 12h4a6 6 0 010 12h-5M11 16h10"/></g></svg>';
  let mode = null;
  let startPoint = null;
  let previousCursor = "";
  let feedbackTimer;

  function setMode(nextMode) {
    const wasActive = Boolean(mode);
    mode = nextMode === "text" || nextMode === "link" ? nextMode : null;
    startPoint = null;
    if (mode) {
      if (!wasActive) previousCursor = document.documentElement.style.cursor;
      const svg = mode === "link" ? linkSvg : scissorsSvg;
      document.documentElement.style.cursor = `url("data:image/svg+xml,${svg}") 5 5, crosshair`;
      showHint(mode === "link" ? "Click a link to save its destination · Esc to cancel" : "Click the start, then the end point · Esc to cancel");
      playSound("activate");
    } else {
      document.documentElement.style.cursor = previousCursor;
      removeHint();
    }
  }

  function onPointerDown(event) {
    if (!mode || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (mode === "link") {
      const anchor = findAnchor(event);
      if (!anchor) {
        showHint("Click a link to capture it");
        return;
      }
      const rawHref = anchor.getAttribute("href");
      let destination;
      try {
        const url = new URL(rawHref || "", document.baseURI);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported scheme");
        destination = url.href;
      } catch {
        showHint("This link is not an HTTP or HTTPS destination");
        return;
      }
      void saveCapture({ content: destination, type: "link" }).then((ok) => {
        if (ok) {
          showSavedAt(event.clientX, event.clientY);
          playSound("capture");
        }
        else showHint("Could not save this link");
        setMode(null);
      });
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    if (!startPoint) {
      startPoint = point;
      showHint("Now click the end point · Esc to cancel");
      return;
    }
    const first = startPoint;
    startPoint = null;
    const range = rangeBetween(first, point);
    if (!range || range.collapsed || !range.toString()) {
      showHint("No selectable text at those points");
      return;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const selectedText = selection.toString();
    const rangeRect = range.getBoundingClientRect();
    Promise.all([copyText(selectedText), saveCapture({ content: selectedText, type: "text" })]).then(([copied, saved]) => {
      if (saved) {
        showSavedAt(rangeRect.left + rangeRect.width / 2, rangeRect.top);
        playSound("capture");
      }
      else showHint("Selected, but could not save to QuickCut");
      if (!copied) showHint(saved ? "Saved, but clipboard access was blocked" : "Clipboard and storage access failed");
      setMode(null);
    });
  }

  function findAnchor(event) {
    for (const item of event.composedPath()) {
      if (item instanceof HTMLAnchorElement && item.hasAttribute("href")) return item;
    }
    return event.target instanceof Element ? event.target.closest("a[href]") : null;
  }

  async function saveCapture(capture) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "QUICKCUT_SAVE_CAPTURE",
        capture: {
          ...capture,
          sourceUrl: location.href,
          sourceTitle: document.title
        }
      });
      return Boolean(result?.ok);
    } catch (error) {
      console.warn("QuickCut could not save the capture:", error);
      return false;
    }
  }

  function blockWhileActive(event) {
    if (!mode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeyDown(event) {
    if (mode && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMode(null);
      playSound("cancel");
    }
  }

  function caretAt(point) {
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(point.x, point.y);
      if (position) {
        const range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
      }
    }
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(point.x, point.y);
    return null;
  }

  function rangeBetween(a, b) {
    const start = caretAt(a);
    const end = caretAt(b);
    if (!start || !end) return null;
    const range = document.createRange();
    try {
      if (start.compareBoundaryPoints(Range.START_TO_START, end) <= 0) {
        range.setStart(start.startContainer, start.startOffset);
        range.setEnd(end.startContainer, end.startOffset);
      } else {
        range.setStart(end.startContainer, end.startOffset);
        range.setEnd(start.startContainer, start.startOffset);
      }
      return range;
    } catch {
      return null;
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const handler = (event) => {
          event.clipboardData.setData("text/plain", text);
          event.preventDefault();
        };
        document.addEventListener("copy", handler, { once: true, capture: true });
        return document.execCommand("copy");
      } catch {
        return false;
      }
    }
  }

  function playSound(name) {
    try { void globalThis.quickCutPlaySound?.(name); } catch { /* Sound is optional. */ }
  }

  function showSavedAt(x, y) {
    const bubble = makeHint("Saved", "quickcut-saved");
    bubble.style.left = `${Math.max(8, Math.min(innerWidth - 90, x))}px`;
    bubble.style.top = `${Math.max(8, y - 34)}px`;
    setTimeout(() => bubble.remove(), 1100);
  }

  function showHint(text) {
    removeHint();
    const hint = makeHint(text, "quickcut-hint");
    hint.style.left = "50%";
    hint.style.top = "16px";
    hint.style.transform = "translateX(-50%)";
    feedbackTimer = setTimeout(removeHint, 2600);
  }

  function makeHint(text, className) {
    const node = document.createElement("div");
    node.className = className;
    node.textContent = text;
    Object.assign(node.style, {
      position: "fixed", zIndex: "2147483647", padding: "8px 12px", borderRadius: "8px",
      background: "#171717", color: "white", font: "13px/1.3 system-ui,sans-serif",
      boxShadow: "0 3px 14px #0004", pointerEvents: "none", whiteSpace: "nowrap"
    });
    (document.documentElement || document.body).appendChild(node);
    return node;
  }

  function removeHint() {
    clearTimeout(feedbackTimer);
    document.querySelectorAll(".quickcut-hint").forEach((node) => node.remove());
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  ["mousedown", "click", "dblclick", "contextmenu", "auxclick"].forEach((name) =>
    document.addEventListener(name, blockWhileActive, true));
  document.addEventListener("keydown", onKeyDown, true);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "QUICKCUT_SET_MODE") setMode(message.mode);
  });
})();
