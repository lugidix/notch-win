import { describe, it, expect } from "vitest";
import {
  initialState,
  applyPoll,
  estimatedPosition,
  timeString,
  ensureMinimumBrightness,
} from "../src/shared/playback-state.js";

const track = (over = {}) => ({
  title: "Nightcall",
  artist: "Kavinsky",
  album: "OutRun",
  positionSec: 42,
  durationSec: 250,
  rate: 1,
  ...over,
});

describe("applyPoll", () => {
  it("marks playing and resets idle immediately", () => {
    const { state } = applyPoll(initialState(), { status: "playing", track: track() }, 1000);
    expect(state.isPlaying).toBe(true);
    expect(state.isPlayerIdle).toBe(false);
  });

  it("goes idle only after waitInterval (3s) of pause", () => {
    let s = initialState();
    s = applyPoll(s, { status: "playing", track: track() }, 0).state;
    s = applyPoll(s, { status: "paused", track: track() }, 1000).state; // pause starts debounce
    expect(s.isPlayerIdle).toBe(false);
    s = applyPoll(s, { status: "paused", track: track() }, 3900).state;
    expect(s.isPlayerIdle).toBe(false); // 2.9s < waitInterval
    s = applyPoll(s, { status: "paused", track: track() }, 4100).state;
    expect(s.isPlayerIdle).toBe(true); // 3.1s ≥ waitInterval
  });

  it("detects track changes (drives sneak peek)", () => {
    let s = applyPoll(initialState(), { status: "playing", track: track() }, 0).state;
    const r = applyPoll(
      s,
      { status: "playing", track: track({ title: "Rampage", artist: "Majeur" }) },
      1000
    );
    expect(r.trackChanged).toBe(true);
  });

  it("no track change on first track", () => {
    const r = applyPoll(initialState(), { status: "playing", track: track() }, 0);
    expect(r.trackChanged).toBe(false);
  });

  it("idle event resets everything", () => {
    let s = applyPoll(initialState(), { status: "playing", track: track() }, 0).state;
    s = applyPoll(s, { status: "idle" }, 1000).state;
    expect(s.status).toBe("idle");
    expect(s.isPlayerIdle).toBe(true);
  });

  it("bumps artVersion only on new artwork", () => {
    let s = initialState();
    s = applyPoll(s, { status: "playing", track: track(), artB64: "AAA" }, 0).state;
    expect(s.artVersion).toBe(1);
    s = applyPoll(s, { status: "playing", track: track(), artB64: "AAA" }, 1000).state;
    expect(s.artVersion).toBe(1);
    s = applyPoll(s, { status: "playing", track: track(), artB64: "BBB" }, 2000).state;
    expect(s.artVersion).toBe(2);
  });
});

describe("estimatedPosition (MusicManager.swift:567-573)", () => {
  it("extrapolates with rate while playing", () => {
    const s = { ...initialState(), isPlaying: true, positionSec: 10, durationSec: 100, rate: 2, ts: 1000 };
    expect(estimatedPosition(s, 2000)).toBeCloseTo(12, 5); // 10 + 1s×2
  });

  it("clamps to duration", () => {
    const s = { ...initialState(), isPlaying: true, positionSec: 99, durationSec: 100, rate: 1, ts: 1000 };
    expect(estimatedPosition(s, 10_000)).toBe(100);
  });

  it("frozen when paused", () => {
    const s = { ...initialState(), isPlaying: false, positionSec: 33, durationSec: 100, ts: 1000 };
    expect(estimatedPosition(s, 60_000)).toBe(33);
  });
});

describe("timeString", () => {
  it("formats m:ss and h:mm:ss like boring (NotchHomeView.swift:515-526)", () => {
    expect(timeString(0)).toBe("0:00");
    expect(timeString(65)).toBe("1:05");
    expect(timeString(3671)).toBe("1:01:11");
  });
});

describe("ensureMinimumBrightness", () => {
  it("lifts dark colors to the factor without changing hue order", () => {
    const c = ensureMinimumBrightness({ r: 10, g: 2, b: 26 }, 0.6);
    expect(Math.max(c.r, c.g, c.b)).toBeGreaterThanOrEqual(153); // 0.6×255
    expect(c.b >= c.r && c.r >= c.g).toBe(true);
  });

  it("keeps bright colors untouched", () => {
    expect(ensureMinimumBrightness({ r: 255, g: 200, b: 10 }, 0.6)).toEqual({ r: 255, g: 200, b: 10 });
  });
});
