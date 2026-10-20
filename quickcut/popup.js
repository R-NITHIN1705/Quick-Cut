const statusNode = document.getElementById("status");
const searchInput = document.getElementById("search");
const listNode = document.getElementById("captures");
let allCaptures = [];
let statusTimer;

function showStatus(message, kind = "error") {
  clearTimeout(statusTimer);
  statusNode.textContent = message;
  statusNode.classList.toggle("success", kind === "success");
  statusNode.hidden = false;
  statusTimer = setTimeout(() => { statusNode.hidden = true; }, 3500);
}

async function sendRequest(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "QuickCut could not complete that action.");
    return response;
  } catch (error) {
    throw new Error(error?.message || "Could not reach QuickCut. Try reloading the extension.");
  }
}

async function activate(mode) {
  try {
    await sendRequest({ type: mode === "link" ? "QUICKCUT_LINK_MODE" : "QUICKCUT_ACTIVATE" });
    window.close();
  } catch (error) {
    showStatus(error.message);
  }
}

document.getElementById("activate").addEventListener("click", () => activate("text"));
document.getElementById("link-capture").addEventListener("click", () => activate("link"));

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const formatter = new Intl.DateTimeFormat(undefined, isToday
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return isToday ? `Today, ${formatter.format(date)}` : formatter.format(date);
}

function makeButton(label, className, handler, ariaLabel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `action-button ${className || ""}`.trim();
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel || label);
  button.addEventListener("click", handler);
  return button;
}

function renderEmpty(title, description) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const mark = document.createElement("span");
  mark.className = "empty-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "✂";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const message = document.createElement("p");
  message.textContent = description;
  empty.append(mark, heading, message);
  listNode.append(empty);
}

function renderCaptures() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const captures = [...allCaptures].sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  const filtered = captures.filter((record) => {
    const searchable = [record?.content, record?.type, record?.label, record?.sourceTitle, record?.sourceUrl]
      .filter((value) => typeof value === "string").join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });
  const total = captures.length;
  document.getElementById("count").textContent = query
    ? `${filtered.length} of ${total} saved`
    : `${total} saved`;
  document.getElementById("clear-all").hidden = total === 0;
  listNode.replaceChildren();

  if (total === 0) {
    renderEmpty("Nothing saved yet", "Select a piece of text or capture a link to build your library.");
    return;
  }
  if (filtered.length === 0) {
    renderEmpty("No matches found", "Try another word or clear your search.");
    return;
  }

  for (const record of filtered) {
    const card = document.createElement("article");
    card.className = "capture-card";

    const top = document.createElement("div");
    top.className = "capture-top";
    const type = ["text", "link", "code"].includes(record?.type) ? record.type : "text";
    const badge = document.createElement("span");
    badge.className = `badge badge-${type}`;
    badge.textContent = type;
    top.append(badge);
    const sourceText = record?.label || record?.sourceTitle || (type === "link" ? "Saved link" : "Captured text");
    const source = document.createElement("span");
    source.className = "capture-source";
    source.title = sourceText;
    source.textContent = sourceText;
    top.append(source);
    const timestamp = document.createElement("time");
    timestamp.className = "capture-time";
    const timestampDate = new Date(record?.createdAt);
    if (Number.isFinite(timestampDate.getTime())) timestamp.dateTime = timestampDate.toISOString();
    timestamp.textContent = formatTimestamp(record?.createdAt);
    timestamp.title = Number.isFinite(timestampDate.getTime()) ? timestampDate.toLocaleString() : "Timestamp unavailable";
    top.append(timestamp);

    const preview = document.createElement("p");
    preview.className = `capture-preview${type === "code" ? " code-preview" : ""}`;
    preview.textContent = typeof record?.content === "string" ? record.content : "(No content)";
    preview.title = preview.textContent;

    const actions = document.createElement("div");
    actions.className = "capture-actions";
    actions.append(makeButton("Copy", "", async () => {
      try {
        await copyAgain(record?.content || "");
        playSound("copy");
        showStatus("Copied to clipboard.", "success");
      } catch {
        showStatus("Could not copy this capture to the clipboard.");
      }
    }, "Copy this capture again"));
    if (type === "link") {
      const safeUrl = safeHttpUrl(record?.content);
      const openButton = makeButton("Open", "", async () => {
        if (!safeUrl) {
          showStatus("This saved URL is not a valid HTTP or HTTPS link.");
          return;
        }
        try {
          await sendRequest({ type: "QUICKCUT_OPEN_URL", url: safeUrl });
          showStatus("Opened link in a new tab.", "success");
        } catch (error) {
          showStatus(error.message);
        }
      }, "Open saved URL in a new tab");
      openButton.disabled = !safeUrl;
      if (!safeUrl) openButton.title = "Only valid HTTP or HTTPS URLs can be opened";
      actions.append(openButton);
    }
    actions.append(makeButton("Delete", "delete", async () => {
      try {
        await sendRequest({ type: "QUICKCUT_DELETE_CAPTURE", id: record?.id });
        allCaptures = allCaptures.filter((item) => item?.id !== record?.id);
        renderCaptures();
        showStatus("Capture deleted.", "success");
      } catch (error) {
        showStatus(error.message);
      }
    }, "Delete this capture"));

    card.append(top, preview, actions);
    listNode.append(card);
  }
}

async function copyAgain(content) {
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    const field = document.createElement("textarea");
    field.value = content;
    field.setAttribute("readonly", "");
    Object.assign(field.style, { position: "fixed", opacity: "0", pointerEvents: "none" });
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Clipboard write failed");
  }
}

function playSound(name) {
  try { void globalThis.quickCutPlaySound?.(name); } catch { /* Sound is optional. */ }
}

searchInput.addEventListener("input", renderCaptures);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && searchInput.value) {
    searchInput.value = "";
    renderCaptures();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== searchInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    searchInput.focus();
  }
});

const clearAllButton = document.getElementById("clear-all");
const clearConfirm = document.getElementById("clear-confirm");
clearAllButton.addEventListener("click", () => {
  clearConfirm.hidden = false;
  clearAllButton.hidden = true;
  document.getElementById("confirm-clear").focus();
});
document.getElementById("cancel-clear").addEventListener("click", () => {
  clearConfirm.hidden = true;
  clearAllButton.hidden = allCaptures.length === 0;
  clearAllButton.focus();
});
document.getElementById("confirm-clear").addEventListener("click", async () => {
  try {
    await sendRequest({ type: "QUICKCUT_CLEAR_ALL" });
    allCaptures = [];
    clearConfirm.hidden = true;
    renderCaptures();
    showStatus("All captures cleared.", "success");
  } catch (error) {
    clearConfirm.hidden = true;
    renderCaptures();
    showStatus(error.message);
  }
});

searchInput.focus();
sendRequest({ type: "QUICKCUT_GET_STATE" }).then((state) => {
  allCaptures = Array.isArray(state.captures) ? state.captures : [];
  renderCaptures();
}).catch((error) => {
  document.getElementById("count").textContent = "Unavailable";
  listNode.replaceChildren();
  renderEmpty("Could not load captures", "Check the extension and try opening this popup again.");
  showStatus(error.message);
});
