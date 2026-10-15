import { useEffect, useRef, useState } from "react";
import { createSoundPlayer, type SoundKind } from "./sound-player";

export function useAudio(volume: number) {
  // On unless the visitor has turned it off before: the crackers play when the page opens.
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem("diwali-sound") !== "false";
    } catch {
      return true;
    }
  });
  const [activated, setActivated] = useState(false);
  const [status, setStatus] = useState("");
  const [player] = useState(() => createSoundPlayer(volume));
  // Removes the "first tap" listener below once the toggle button has settled things itself.
  const stopWaiting = useRef(() => {});
  const unavailable = () => {
    setActivated(false);
    setStatus(
      "Sound is unavailable. Shopping still works. Check browser or device mute settings, then try Enable festive sound again.",
    );
  };
  function tone(kind: SoundKind) {
    if (!enabled || !activated) return;
    void player.play(kind).catch(unavailable);
  }
  function remember(value: boolean) {
    try {
      localStorage.setItem("diwali-sound", String(value));
    } catch {
      /* Preference lasts this visit. */
    }
  }
  function toggle() {
    stopWaiting.current();
    if (enabled && activated) {
      setEnabled(false);
      setActivated(false);
      setStatus("");
      remember(false);
      player.mute();
      return;
    }
    // Start directly in the click handler to retain browser user activation.
    void player
      .play("welcome")
      .then((played) => {
        if (!played) return;
        setEnabled(true);
        setActivated(true);
        setStatus("");
        remember(true);
      })
      .catch(unavailable);
  }
  // Crackers on load. Browsers refuse sound before the visitor has touched the page, so try
  // once now (it works where the browser allows it) and otherwise on the first tap or key.
  useEffect(() => {
    if (!enabled) return;
    const events = ["pointerup", "keydown"] as const;
    const stop = () =>
      events.forEach((e) => document.removeEventListener(e, onGesture, true));
    stopWaiting.current = stop;
    const start = (probe: boolean) =>
      player.play("crackers", probe).then(
        (played) => {
          if (!played) return;
          stop();
          setActivated(true);
        },
        () => {
          if (probe) return;
          stop();
          unavailable();
        },
      );
    function onGesture(e: Event) {
      // The sound button has its own click handler; starting here would make it mute.
      if ((e.target as Element | null)?.closest?.(".sound")) return;
      void start(false);
    }
    events.forEach((e) => document.addEventListener(e, onGesture, true));
    void start(true);
    return stop;
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) player.mute();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      player.destroy();
    };
  }, [player]);
  return {
    toggle,
    tone,
    status,
    isOn: enabled && activated,
    label: enabled && activated ? "Sound on · mute" : "Enable festive sound",
  };
}
