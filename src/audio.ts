import { useEffect, useState } from "react";
let context: AudioContext | undefined,
  last = 0;
// Original synthesized sine tones; no third-party recordings or audio licences.
export function useAudio(volume: number) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem("diwali-sound") === "true";
    } catch {
      return false;
    }
  });
  const [activated, setActivated] = useState(false);
  const [status, setStatus] = useState("");
  function tone(kind: "add" | "remove" | "welcome" | "handoff", force = false) {
    if (
      (!enabled && !force) ||
      (!activated && !force) ||
      document.hidden ||
      Date.now() - last < 180
    )
      return;
    last = Date.now();
    try {
      context ??= new AudioContext();
      void context
        .resume()
        .catch(() => setStatus("Sound is unavailable. Shopping still works."));
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        kind === "remove" ? 440 : kind === "handoff" ? 880 : 660,
        context.currentTime,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        kind === "remove" ? 220 : 1100,
        context.currentTime + 0.12,
      );
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.18,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {
      setStatus("Sound is unavailable. Shopping still works.");
    }
  }
  function toggle() {
    const next = activated ? !enabled : true;
    setEnabled(next);
    setActivated(true);
    try {
      localStorage.setItem("diwali-sound", String(next));
    } catch {
      /* Preference lasts this visit. */
    }
    if (next) tone("welcome", true);
    else void context?.suspend().catch(() => {});
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) void context?.suspend().catch(() => {});
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      void context?.close().catch(() => {});
      context = undefined;
    };
  }, []);
  return {
    toggle,
    tone,
    status,
    isOn: enabled && activated,
    label: enabled && activated ? "Sound on · mute" : "Enable festive sound",
  };
}
