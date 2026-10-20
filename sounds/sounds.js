(() => {
  if (globalThis.quickCutPlaySound) return;
  const SETTINGS = { enabled: true, volume: 0.35 };
  let contextPromise;

  async function readSettings() {
    try {
      const stored = await chrome.storage.local.get({ soundEnabled: SETTINGS.enabled, soundVolume: SETTINGS.volume, cutSound: "snip" });
      const requestedVolume = Number(stored.soundVolume ?? SETTINGS.volume);
      return {
        enabled: stored.soundEnabled !== false,
        volume: Number.isFinite(requestedVolume) ? Math.max(0, Math.min(1, requestedVolume)) : SETTINGS.volume,
        cutSound: stored.cutSound === "sweep" ? "sweep" : "snip"
      };
    } catch {
      return SETTINGS;
    }
  }

  async function getContext() {
    if (!contextPromise) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return null;
      try { contextPromise = Promise.resolve(new AudioContextClass()); }
      catch { return null; }
    }
    try {
      const context = await contextPromise;
      if (context.state === "suspended") await context.resume();
      return context;
    } catch {
      return null;
    }
  }

  async function playQuickCutSound(name) {
    const settings = await readSettings();
    if (!settings.enabled || settings.volume <= 0) return false;
    const context = await getContext();
    if (!context) return false;
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.value = settings.volume;
    master.connect(context.destination);

    const tone = (frequency, endFrequency, duration, level, type = "sine", delay = 0) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = now + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(level, start + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    };

    if (name === "activate") {
      tone(760, 500, 0.045, 0.095, "sine");
    } else if (name === "capture" && settings.cutSound === "sweep") {
      tone(1150, 420, 0.11, 0.075, "triangle");
      tone(760, 310, 0.09, 0.045, "sine", 0.035);
    } else if (name === "capture") {
      // Two brief, filtered noise cuts make a small original snip without an audio asset.
      for (const delay of [0, 0.055]) {
        const length = Math.ceil(context.sampleRate * 0.035);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const envelope = context.createGain();
        const start = now + delay;
        filter.type = "highpass";
        filter.frequency.value = 1250;
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(0.12, start + 0.003);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.035);
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(master);
        source.start(start);
      }
    } else if (name === "copy") {
      tone(470, 780, 0.075, 0.11, "sine");
    } else if (name === "cancel") {
      tone(360, 230, 0.12, 0.075, "triangle");
    } else {
      master.disconnect();
      return false;
    }
    setTimeout(() => master.disconnect(), 250);
    return true;
  }

  globalThis.quickCutPlaySound = playQuickCutSound;
})();
