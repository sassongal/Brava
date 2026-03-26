// Brava Sound Effects — Web Audio API synthesis
let audioCtx: AudioContext | null = null;
let soundsEnabled = true;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function setSoundsEnabled(enabled: boolean) {
  soundsEnabled = enabled;
  localStorage.setItem("brava_sounds", enabled ? "1" : "0");
}

export function getSoundsEnabled(): boolean {
  const stored = localStorage.getItem("brava_sounds");
  if (stored !== null) soundsEnabled = stored === "1";
  return soundsEnabled;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume: number = 0.15) {
  if (!soundsEnabled) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore audio errors */ }
}

// High piano note — layout conversion success
export function playConvertSound() {
  playTone(880, 0.15, "sine", 0.12); // A5
  setTimeout(() => playTone(1108, 0.2, "sine", 0.10), 80); // C#6
}

// Soft success chime — clipboard save, AI complete, etc.
export function playSuccessSound() {
  playTone(660, 0.12, "sine", 0.10); // E5
  setTimeout(() => playTone(880, 0.18, "sine", 0.08), 100); // A5
}

// Quick click — snippet expanded, copy action
export function playClickSound() {
  playTone(1200, 0.06, "triangle", 0.08);
}

// Screenshot shutter
export function playShutterSound() {
  playTone(800, 0.05, "square", 0.06);
  setTimeout(() => playTone(600, 0.08, "square", 0.04), 50);
}

// Error tone
export function playErrorSound() {
  playTone(300, 0.15, "sawtooth", 0.08);
  setTimeout(() => playTone(250, 0.2, "sawtooth", 0.06), 100);
}
