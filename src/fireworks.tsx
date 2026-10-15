import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

// The player (the SVG-only "light" build, which needs no eval) and the animation load as one
// separate chunk: browsing does not need them.
const load = () =>
  Promise.all([
    import("lottie-web/build/player/lottie_light"),
    import("./fireworks.json"),
  ]);

// A full-screen fireworks burst. Render `node` once; call `play()` when something good happens
// (an item added, an order handed to WhatsApp). The layer is a manual popover so it paints in the
// top layer, above the cart dialog; it ignores taps and is hidden from assistive technology.
export function useFireworks() {
  const layer = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const current = useRef<AnimationItem | undefined>(undefined);
  useEffect(() => {
    // Fetch the chunk once the page has settled so the first burst is not late.
    const id = window.setTimeout(() => void load().catch(() => {}), 2000);
    return () => {
      window.clearTimeout(id);
      current.current?.destroy();
    };
  }, []);
  async function play() {
    const host = layer.current;
    const mount = art.current;
    if (!host || !mount || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    try {
      const [{ default: lottie }, { default: animationData }] = await load();
      current.current?.destroy();
      const portrait = matchMedia("(orientation: portrait)").matches;
      const animation = lottie.loadAnimation({
        container: mount,
        renderer: "svg",
        loop: false,
        autoplay: true,
        // lottie edits the data it is given (repeaters multiply on a second use), so each play
        // gets its own copy.
        animationData: structuredClone(animationData),
        // Landscape: fill the screen. Portrait: keep every burst in view.
        rendererSettings: {
          preserveAspectRatio: portrait ? "xMidYMid meet" : "xMidYMid slice",
        },
      });
      current.current = animation;
      animation.addEventListener("complete", () => {
        if (current.current !== animation) return;
        current.current = undefined;
        animation.destroy();
        host.hidePopover?.();
      });
      // Hide first: a burst already showing keeps its old place in the top layer, which can be
      // under a dialog opened since. Showing it again puts it back on top.
      try {
        host.hidePopover?.();
        host.showPopover?.();
      } catch {
        /* No popover support: the layer is simply always there, under dialogs. */
      }
    } catch {
      /* Decoration only: shopping never depends on it. */
    }
  }
  const node = (
    <div className="burst-layer" popover="manual" aria-hidden="true" ref={layer}>
      <div className="burst-art" ref={art} />
    </div>
  );
  return { play, node };
}
