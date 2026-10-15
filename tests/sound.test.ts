import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { crackerSamples, createSoundPlayer } from "../src/sound-player";
let resume: () => void;
let state = "suspended";
const starts: number[] = [];
const stops = vi.fn();
const source = { buffer: null as unknown, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
const fakeContext = {
  sampleRate: 8000,
  createBuffer: vi.fn(() => ({ copyToChannel: vi.fn() })),
  createBufferSource: vi.fn(() => source),
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
      value: 0,
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
it("plays the firecrackers as one buffer once the browser lets audio start, and muting stops them", async () => {
  const player = createSoundPlayer(0.09);
  const playing = player.play("crackers");
  expect(fakeContext.createBufferSource).not.toHaveBeenCalled();
  resume();
  expect(await playing).toBe(true);
  expect(fakeContext.createBufferSource).toHaveBeenCalledTimes(1);
  expect(source.start).toHaveBeenCalledTimes(1);
  player.mute();
  expect(source.stop).toHaveBeenCalled();
  player.destroy();
});
it("an autoplay probe gives up quietly while the browser blocks audio, and never fires on a later tap", async () => {
  vi.useFakeTimers();
  const player = createSoundPlayer(0.09);
  const probing = player.play("crackers", true);
  await vi.advanceTimersByTimeAsync(500);
  expect(await probing).toBe(false);
  resume(); // the visitor taps something later
  await vi.advanceTimersByTimeAsync(10);
  expect(fakeContext.createBufferSource).not.toHaveBeenCalled();
  vi.useRealTimers();
  player.destroy();
});
it("the synthesised firecrackers are repeatable, normalised, a rattle then louder bangs, then silence", () => {
  const rate = 8000;
  const a = crackerSamples(rate);
  expect(a).toEqual(crackerSamples(rate));
  expect(a).toHaveLength(Math.round(rate * 2.4));
  const peak = (from: number, to: number) =>
    a.slice(Math.round(from * rate), Math.round(to * rate)).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  expect(peak(0, 2.4)).toBeCloseTo(1, 5);
  expect(peak(0, 0.9)).toBeGreaterThan(0.1); // the rattle is audible…
  expect(peak(0, 0.9)).toBeLessThan(peak(1.0, 1.9)); // …and the bangs are louder
  expect(peak(2.0, 2.4)).toBeLessThan(0.001); // nothing left ringing at the end
});
