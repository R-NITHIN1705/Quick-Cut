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
    const selectedText = range ? textForRange(range) : "";
    if (!range || range.collapsed || !selectedText) {
      showHint("No selectable text at those points");
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      showHint("Could not select that text on this page");
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    const rangeRect = range.getBoundingClientRect();
    const captureType = isCodeRange(range) ? "code" : "text";
    Promise.all([copyText(selectedText), saveCapture({ content: selectedText, type: captureType })]).then(([copied, saved]) => {
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

  function textForRange(range) {
    const startCell = githubCodeCell(range.startContainer);
    const endCell = githubCodeCell(range.endContainer);
    const table = startCell?.closest("table.js-file-line-container, table.highlight");
    if (table && endCell?.closest("table") === table &&
        startCell.contains(range.startContainer) && endCell.contains(range.endContainer)) {
      const cells = [...table.querySelectorAll("td.blob-code-inner, td.blob-code[id^='LC']")];
      return textAcrossLines(range, cells, startCell, endCell);
    }

    // Several code hosts render each source line as a separate block. Range.toString()
    // omits the visual line breaks between those blocks, so rebuild the selection
    // from the line elements when both endpoints belong to the same code view.
    const lineSelector = "td.line_content, .line-content, .react-code-line";
    const startLine = closestElement(range.startContainer, lineSelector);
    const endLine = closestElement(range.endContainer, lineSelector);
    if (!startLine || !endLine || !startLine.contains(range.startContainer) ||
        !endLine.contains(range.endContainer)) return range.toString();

    const commonParent = commonAncestor(startLine, endLine);
    if (!commonParent) return range.toString();
    const lines = [
      ...(commonParent.matches(lineSelector) ? [commonParent] : []),
      ...commonParent.querySelectorAll(lineSelector)
    ];
    return textAcrossLines(range, lines, startLine, endLine);
  }

  function closestElement(node, selector) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element?.closest(selector) || null;
  }

  function textAcrossLines(range, lines, startLine, endLine) {
    const startIndex = lines.indexOf(startLine);
    const endIndex = lines.indexOf(endLine);
    if (startIndex < 0 || endIndex < startIndex) return range.toString();

    const selectedLines = [];
    for (let index = startIndex; index <= endIndex; index++) {
      const line = lines[index];
      const lineRange = document.createRange();
      lineRange.selectNodeContents(line);
      if (index === startIndex) lineRange.setStart(range.startContainer, range.startOffset);
      if (index === endIndex) lineRange.setEnd(range.endContainer, range.endOffset);
      selectedLines.push(lineRange.toString());
    }
    return selectedLines.join("\n");
  }

  function commonAncestor(first, second) {
    const ancestors = new Set();
    for (let node = first; node; node = node.parentElement) ancestors.add(node);
    for (let node = second; node; node = node.parentElement) {
      if (ancestors.has(node)) return node;
    }
    return null;
  }

  function githubCodeCell(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) return null;
    const cell = element.closest("td.blob-code-inner, td.blob-code[id^='LC']");
    if (cell) return cell;
    const row = element.closest("tr");
    return row?.querySelector("td.blob-code-inner, td.blob-code[id^='LC']") || null;
  }

  function isCodeRange(range) {
    const selector = "pre, code, .blob-code-inner, td.blob-code";
    return [range.startContainer, range.endContainer].some((node) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean(element?.closest(selector) || githubCodeCell(node));
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        let clipboardUpdated = false;
        const handler = (event) => {
          try {
            if (!event.clipboardData) return;
            event.clipboardData.setData("text/plain", text);
            event.preventDefault();
            clipboardUpdated = true;
          } catch {
            clipboardUpdated = false;
          }
        };
        document.addEventListener("copy", handler, true);
        try {
          return document.execCommand("copy") && clipboardUpdated;
        } finally {
          document.removeEventListener("copy", handler, true);
        }
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
