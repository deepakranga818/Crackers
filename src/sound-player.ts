export type SoundKind = "add" | "remove" | "welcome" | "handoff" | "crackers";
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

// A string of firecrackers, synthesised so there is no audio file to license or download: a fast
// rattle of small cracks that speeds up, then three louder bangs with a low thump. Seeded, so it
// sounds the same every time. Peak is normalised to 1; the player sets the loudness.
export function crackerSamples(rate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(rate * 2.4));
  let seed = 20251;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const crack = (at: number, level: number, decay: number, thump = 0) => {
    const start = Math.round(at * rate);
    const length = Math.min(out.length - start, Math.round(rate * decay * 6));
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      out[start + i] +=
        level * Math.exp(-t / decay) * (random() * 2 - 1) +
        thump * Math.exp(-t / 0.08) * Math.sin(2 * Math.PI * 70 * t);
    }
  };
  for (let t = 0, gap = 0.07; t < 0.9; gap *= 0.97, t += gap * (0.6 + random() * 0.8))
    crack(t, 0.25 + random() * 0.3, 0.012 + random() * 0.01);
  for (const [at, level] of [[1.0, 0.9], [1.35, 0.7], [1.6, 1]])
    crack(at, level, 0.05, level * 0.6);
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
}

// Schedule only after activation succeeds, so a blocked or suspended context
// cannot be reported as enabled playback.
export function createSoundPlayer(volume: number) {
  let context: AudioContext | undefined;
  let last = -Infinity;
  let generation = 0;
  let disposed = false;
  const active = new Set<OscillatorNode>();
  let crackle: AudioBufferSourceNode | undefined;
  let cracklePcm: AudioBuffer | undefined;
  function stopCrackle() {
    try {
      crackle?.stop();
    } catch {
      /* Already ended. */
    }
    crackle = undefined;
  }
  function stop() {
    for (const node of active) {
      try {
        node.stop();
      } catch {
        /* Already ended. */
      }
      node.disconnect();
    }
    active.clear();
  }
  // `probe`: an autoplay attempt with no user tap behind it. A browser that blocks it leaves
  // resume() pending until some later tap, so give up quietly instead of playing late.
  async function play(kind: SoundKind, probe = false) {
    // A probe is not a tap, so it must not make the visitor's first real tap look like a repeat.
    if (disposed || document.hidden || (!probe && Date.now() - last < 240))
      return false;
    if (!probe) last = Date.now();
    const current = ++generation;
    const Constructor =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Constructor) throw new Error("Web Audio unavailable");
    if (!context || context.state === "closed") context = new Constructor();
    await (probe
      ? Promise.race([context.resume(), new Promise((done) => setTimeout(done, 400))])
      : context.resume());
    if (current !== generation || disposed || document.hidden) return false;
    if (context.state !== "running") {
      if (probe) return false;
      throw new Error("Audio playback blocked");
    }
    if (kind === "crackers") {
      const ctx = context;
      if (!cracklePcm) {
        const pcm = crackerSamples(ctx.sampleRate);
        cracklePcm = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
        cracklePcm.copyToChannel(pcm, 0);
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = cracklePcm;
      gain.gain.value = Math.min(Math.max(volume * 3, 0), 0.45);
      source.connect(gain);
      gain.connect(ctx.destination);
      stopCrackle();
      crackle = source;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (crackle === source) crackle = undefined;
      };
      source.start();
      return true;
    }
    stop();
    const notes =
      kind === "welcome" || kind === "handoff"
        ? [659.25, 830.61, 987.77]
        : kind === "remove"
          ? [440]
          : [880];
    notes.forEach((frequency, index) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const start = context!.currentTime + 0.015 + index * 0.16;
      const end = start + 0.15;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        Math.min(Math.max(volume, 0), 0.15),
        start + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      active.add(oscillator);
      oscillator.onended = () => {
        active.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    });
    return true;
  }
  function mute() {
    generation++;
    last = -Infinity;
    stop();
    stopCrackle();
    if (context && context.state !== "closed")
      void context.suspend().catch(() => {});
  }
  function destroy() {
    disposed = true;
    mute();
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
  return { play, mute, destroy };
}
