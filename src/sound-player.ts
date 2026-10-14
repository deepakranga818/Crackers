export type SoundKind = "add" | "remove" | "welcome" | "handoff";
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

// Schedule only after activation succeeds, so a blocked or suspended context
// cannot be reported as enabled playback.
export function createSoundPlayer(volume: number) {
  let context: AudioContext | undefined;
  let last = -Infinity;
  let generation = 0;
  let disposed = false;
  const active = new Set<OscillatorNode>();
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
  async function play(kind: SoundKind) {
    if (disposed || document.hidden || Date.now() - last < 240) return false;
    last = Date.now();
    const current = ++generation;
    const Constructor =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Constructor) throw new Error("Web Audio unavailable");
    if (!context || context.state === "closed") context = new Constructor();
    await context.resume();
    if (current !== generation || disposed || document.hidden) return false;
    if (context.state !== "running") throw new Error("Audio playback blocked");
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
