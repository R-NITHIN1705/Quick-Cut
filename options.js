const soundEnabled = document.getElementById("sound-enabled");
const soundVolume = document.getElementById("sound-volume");
const volumeValue = document.getElementById("volume-value");
const historyLimit = document.getElementById("history-limit");
const soundStatus = document.getElementById("sound-status");
const cutSound = document.getElementById("cut-sound");
const historyStatus = document.getElementById("history-status");
let volumeSaveTimer;

function showError(node, message) {
  node.textContent = message;
  node.style.color = "#98432e";
}

async function sendMessage(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "QuickCut could not complete that action.");
    return response;
  } catch (error) {
    throw new Error(error?.message || "Could not reach QuickCut. Reload the extension and try again.");
  }
}

async function saveSoundSettings() {
  try {
    await chrome.storage.local.set({
      soundEnabled: soundEnabled.checked,
      soundVolume: Number(soundVolume.value) / 100,
      cutSound: cutSound.value
    });
    soundStatus.textContent = "Sound settings saved.";
    soundStatus.style.color = "#526e51";
  } catch {
    showError(soundStatus, "Could not save sound settings.");
  }
}

soundEnabled.addEventListener("change", saveSoundSettings);
cutSound.addEventListener("change", saveSoundSettings);
soundVolume.addEventListener("input", () => {
  volumeValue.value = `${soundVolume.value}%`;
  volumeValue.textContent = `${soundVolume.value}%`;
  clearTimeout(volumeSaveTimer);
  volumeSaveTimer = setTimeout(saveSoundSettings, 180);
});

chrome.storage.local.get({ soundEnabled: true, soundVolume: 0.35, cutSound: "snip" }).then((values) => {
  soundEnabled.checked = values.soundEnabled !== false;
  cutSound.value = values.cutSound === "sweep" ? "sweep" : "snip";
  const storedVolume = Number(values.soundVolume ?? 0.35);
  const volume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(100, Math.round(storedVolume * 100))) : 35;
  soundVolume.value = volume;
  volumeValue.value = `${volume}%`;
  volumeValue.textContent = `${volume}%`;
}).catch(() => showError(soundStatus, "Could not load sound settings."));

document.getElementById("preview-cut-sound").addEventListener("click", async () => {
  try {
    await chrome.storage.local.set({ soundVolume: Number(soundVolume.value) / 100, cutSound: cutSound.value });
    await globalThis.quickCutPlaySound?.("capture");
  } catch {
    showError(soundStatus, "Could not preview the sound.");
  }
});

sendMessage({ type: "QUICKCUT_GET_STATE" }).then((state) => {
  historyLimit.value = state.historyLimit;
}).catch((error) => showError(historyStatus, error.message));

document.getElementById("save-limit").addEventListener("click", async () => {
  const limit = Number(historyLimit.value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
    showError(historyStatus, "Choose a whole number from 1 to 10000.");
    return;
  }
  try {
    const result = await sendMessage({ type: "QUICKCUT_SET_LIMIT", limit });
    historyStatus.textContent = `Saved. ${result.count} capture${result.count === 1 ? "" : "s"} remain in history.`;
    historyStatus.style.color = "#526e51";
  } catch (error) {
    showError(historyStatus, error.message);
  }
});

const clearConfirm = document.getElementById("clear-confirm");
const clearHistoryButton = document.getElementById("clear-history");
clearHistoryButton.addEventListener("click", () => {
  clearConfirm.hidden = false;
  document.getElementById("confirm-clear").focus();
});
document.getElementById("cancel-clear").addEventListener("click", () => {
  clearConfirm.hidden = true;
  clearHistoryButton.focus();
});
document.getElementById("confirm-clear").addEventListener("click", async () => {
  try {
    await sendMessage({ type: "QUICKCUT_CLEAR_ALL" });
    clearConfirm.hidden = true;
    historyStatus.textContent = "All captures cleared.";
    historyStatus.style.color = "#526e51";
  } catch (error) {
    clearConfirm.hidden = true;
    showError(historyStatus, error.message);
  }
});

const shortcutNames = {
  "toggle-scissors": "Activate scissors mode",
  "_execute_action": "Open the QuickCut popup",
  "focus-search": "Open popup and focus search"
};

function addShortcutRow(container, name, shortcut) {
  const row = document.createElement("div");
  row.className = "shortcut-row";
  const label = document.createElement("span");
  label.className = "shortcut-name";
  label.textContent = name;
  const value = document.createElement("kbd");
  value.textContent = shortcut || "Not assigned";
  row.append(label, value);
  container.append(row);
}

const shortcutsContainer = document.getElementById("shortcut-list");
chrome.commands.getAll((commands) => {
  shortcutsContainer.replaceChildren();
  const current = new Map((commands || []).map((command) => [command.name, command.shortcut]));
  Object.entries(shortcutNames).forEach(([name, label]) => addShortcutRow(shortcutsContainer, label, current.get(name)));
  addShortcutRow(shortcutsContainer, "Cancel active mode", "Escape (always available)");
});

document.getElementById("shortcut-page").addEventListener("click", async () => {
  try {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  } catch {
    showError(document.getElementById("global-error"), "Could not open Chrome's shortcut settings page.");
  }
});
