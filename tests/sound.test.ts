import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSoundPlayer } from "../src/sound-player";
let resume: () => void;
let state = "suspended";
const starts: number[] = [];
const stops = vi.fn();
const fakeContext = {
  get state() {
    return state;
  },
  currentTime: 5,
  destination: {},
  resume: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resume = () => {
          state = "running";
          resolve();
        };
      }),
  ),
  suspend: vi.fn(async () => {
    state = "suspended";
  }),
  close: vi.fn(async () => {
    state = "closed";
  }),
  createOscillator: vi.fn(() => ({
    type: "sine",
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: (time: number) => starts.push(time),
    stop: stops,
    onended: null,
  })),
  createGain: vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
};
beforeEach(() => {
  starts.length = 0;
  state = "suspended";
  vi.clearAllMocks();
  vi.stubGlobal("document", { hidden: false });
  vi.stubGlobal("window", {
    AudioContext: class {
      constructor() {
        return fakeContext;
      }
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("waits for resume before scheduling audible welcome notes", async () => {
  const player = createSoundPlayer(0.09);
  const playing = player.play("welcome");
  expect(starts).toHaveLength(0);
  resume();
  expect(await playing).toBe(true);
  expect(starts).toHaveLength(3);
  expect(starts.every((time) => time > 5)).toBe(true);
  player.destroy();
});
it("muting cancels a pending resume instead of playing late", async () => {
  const player = createSoundPlayer(0.09);
  const playing = player.play("welcome");
  player.mute();
  resume();
  expect(await playing).toBe(false);
  expect(starts).toHaveLength(0);
  player.destroy();
});
it("rejects a browser that remains suspended and ignores hidden tabs", async () => {
  const player = createSoundPlayer(0.09);
  fakeContext.resume.mockImplementationOnce(async () => {});
  await expect(player.play("welcome")).rejects.toThrow("blocked");
  vi.stubGlobal("document", { hidden: true });
  expect(await player.play("add")).toBe(false);
  player.destroy();
});
