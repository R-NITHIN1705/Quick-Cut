const CONTENT_FILES = ["sounds/sounds.js", "content.js"];
const RECORDS_KEY = "captures";
const LIMIT_KEY = "historyLimit";
const DEFAULT_LIMIT = 200;
let writeQueue = Promise.resolve();

async function activateOnTab(tabId, mode = "text") {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    await chrome.tabs.sendMessage(tabId, { type: "QUICKCUT_SET_MODE", mode });
    return true;
  } catch (error) {
    console.warn("QuickCut cannot run in this tab:", error);
    return false;
  }
}

function validLimit(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10000 ? number : DEFAULT_LIMIT;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") ? url.href : null;
  } catch {
    return null;
  }
}

function prepareRecord(input) {
  if (!input || typeof input.content !== "string" || !input.content.trim()) {
    throw new Error("Capture content is empty.");
  }
  let content = input.content;
  let type = input.type;
  if (type === "link") {
    const normalized = isHttpUrl(content);
    if (!normalized) throw new Error("Only HTTP and HTTPS links can be saved.");
    content = normalized;
  } else {
    type = input.type === "code" || looksLikeCode(content) ? "code" : "text";
  }
  const sourceUrl = typeof input.sourceUrl === "string" ? isHttpUrl(input.sourceUrl) : null;
  return {
    content,
    type,
    createdAt: Date.now(),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(typeof input.sourceTitle === "string" && input.sourceTitle.trim()
      ? { sourceTitle: input.sourceTitle.trim().slice(0, 500) } : {}),
    ...(typeof input.label === "string" && input.label.trim()
      ? { label: input.label.trim().slice(0, 200) } : {})
  };
}

function looksLikeCode(text) {
  const signals = [
    /[{};]\s*(?:\n|$)/,
    /\b(?:function|const|let|var|return|class|import|export|def|async|await)\b/,
    /(?:=>|\|\||&&|===|!==|:=)/,
    /^\s{2,}\S.*\n\s{4,}\S/m
  ];
  return signals.filter((pattern) => pattern.test(text)).length >= 2 ||
    (signals.slice(0, 3).some((pattern) => pattern.test(text)) && /[{};]/.test(text));
}

async function saveCapture(input) {
  const recordData = prepareRecord(input);
  const result = await chrome.storage.local.get({ [RECORDS_KEY]: [], [LIMIT_KEY]: DEFAULT_LIMIT });
  const existing = Array.isArray(result[RECORDS_KEY]) ? result[RECORDS_KEY] : [];
  const sameIndex = existing.findIndex((item) => item?.type === recordData.type && item?.content === recordData.content);
  let record;
  const records = [...existing];
  if (sameIndex >= 0) {
    const [prior] = records.splice(sameIndex, 1);
    record = { ...prior, ...recordData, id: prior.id || crypto.randomUUID() };
  } else {
    record = { id: crypto.randomUUID(), ...recordData };
  }
  records.unshift(record);
  records.splice(validLimit(result[LIMIT_KEY] ?? DEFAULT_LIMIT));
  await chrome.storage.local.set({ [RECORDS_KEY]: records });
  return { record, count: records.length };
}

function serializedSave(input) {
  const operation = writeQueue.then(() => saveCapture(input));
  writeQueue = operation.catch(() => {});
  return operation;
}

async function getState() {
  const values = await chrome.storage.local.get({ [RECORDS_KEY]: [], [LIMIT_KEY]: DEFAULT_LIMIT });
  return {
    captures: Array.isArray(values[RECORDS_KEY]) ? values[RECORDS_KEY] : [],
    historyLimit: validLimit(values[LIMIT_KEY])
  };
}

async function setHistoryLimit(value) {
  const limit = validLimit(value);
  if (limit !== Number(value)) throw new Error("History limit must be between 1 and 10000.");
  const state = await getState();
  const captures = state.captures.slice(0, limit);
  await chrome.storage.local.set({ [LIMIT_KEY]: limit, [RECORDS_KEY]: captures });
  return { historyLimit: limit, count: captures.length };
}

async function deleteCapture(id) {
  if (typeof id !== "string" || !id) throw new Error("Capture ID is invalid.");
  const state = await getState();
  const captures = state.captures.filter((item) => item?.id !== id);
  if (captures.length === state.captures.length) throw new Error("This capture was not found.");
  await chrome.storage.local.set({ [RECORDS_KEY]: captures });
  return { count: captures.length };
}

async function clearCaptures() {
  await chrome.storage.local.set({ [RECORDS_KEY]: [] });
  return { count: 0 };
}

function serializedLimit(value) {
  const operation = writeQueue.then(() => setHistoryLimit(value));
  writeQueue = operation.catch(() => {});
  return operation;
}

function serializedMutation(operationFn) {
  const operation = writeQueue.then(operationFn);
  writeQueue = operation.catch(() => {});
  return operation;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handled = ["QUICKCUT_ACTIVATE", "QUICKCUT_LINK_MODE", "QUICKCUT_SAVE_CAPTURE", "QUICKCUT_GET_STATE", "QUICKCUT_SET_LIMIT", "QUICKCUT_DELETE_CAPTURE", "QUICKCUT_CLEAR_ALL", "QUICKCUT_OPEN_URL"];
  if (!handled.includes(message?.type)) return;
  (async () => {
    try {
      if (message?.type === "QUICKCUT_ACTIVATE" || message?.type === "QUICKCUT_LINK_MODE") {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const mode = message.type === "QUICKCUT_LINK_MODE" ? "link" : "text";
        sendResponse({ ok: Boolean(tab?.id && await activateOnTab(tab.id, mode)) });
      } else if (message?.type === "QUICKCUT_SAVE_CAPTURE") {
        sendResponse({ ok: true, ...(await serializedSave(message.capture)) });
      } else if (message?.type === "QUICKCUT_GET_STATE") {
        sendResponse({ ok: true, ...(await getState()) });
      } else if (message?.type === "QUICKCUT_SET_LIMIT") {
        sendResponse({ ok: true, ...(await serializedLimit(message.limit)) });
      } else if (message?.type === "QUICKCUT_DELETE_CAPTURE") {
        sendResponse({ ok: true, ...(await serializedMutation(() => deleteCapture(message.id))) });
      } else if (message?.type === "QUICKCUT_CLEAR_ALL") {
        sendResponse({ ok: true, ...(await serializedMutation(clearCaptures)) });
      } else if (message?.type === "QUICKCUT_OPEN_URL") {
        const url = isHttpUrl(message.url);
        if (!url) throw new Error("Only HTTP and HTTPS URLs can be opened.");
        await chrome.tabs.create({ url });
        sendResponse({ ok: true });
      }
    } catch (error) {
      console.error("QuickCut request failed:", error);
      sendResponse({ ok: false, error: error?.message || "QuickCut storage request failed." });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "focus-search") {
    try { await chrome.action.openPopup(); }
    catch (error) { console.warn("QuickCut popup could not be opened:", error); }
    return;
  }
  if (command !== "toggle-scissors") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id) await activateOnTab(tab.id, "text");
  } catch (error) {
    console.warn("QuickCut shortcut could not activate:", error);
  }
});
