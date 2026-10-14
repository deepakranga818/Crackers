import { useEffect, useState } from "react";
import { createSoundPlayer, type SoundKind } from "./sound-player";

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
  const [player] = useState(() => createSoundPlayer(volume));
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
