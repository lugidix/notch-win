import { describe, it, expect } from "vitest";
import {
  springFromSwift,
  stepSpring,
  simulate,
  OPEN_SPRING,
  CLOSE_SPRING,
} from "../src/shared/spring-math.js";

describe("springFromSwift", () => {
  it("derives stiffness/damping from SwiftUI response/dampingFraction", () => {
    // open spring: omega = 2π/0.42 ≈ 14.960, k ≈ 223.8, c = 2*0.8*omega ≈ 23.94
    const { stiffness, damping } = springFromSwift(OPEN_SPRING);
    expect(stiffness).toBeCloseTo(223.8, 0);
    expect(damping).toBeCloseTo(23.94, 0);
  });
});

describe("fidelity: open spring (response 0.42, damping 0.8) 185 → 640", () => {
  const params = springFromSwift(OPEN_SPRING);
  const start = { position: 185, velocity: 0 };
  const target = 640;

  it("overshoots slightly (underdamped, ζ=0.8 ⇒ ~1.5% overshoot)", () => {
    let peak = 0;
    const h = 1 / 240;
    let s = start;
    for (let i = 0; i < 240 * 2; i++) {
      s = stepSpring(s, target, params, h);
      peak = Math.max(peak, s.position);
    }
    expect(peak).toBeGreaterThan(target); // overshoot exists
    expect(peak).toBeLessThan(target + 12); // ~1.5% of 455 ≈ 7px
  });

  it("settles within ±1px after 1s", () => {
    const s = simulate(start, target, params, 1.0);
    expect(Math.abs(s.position - target)).toBeLessThanOrEqual(1);
  });
});

describe("fidelity: close spring (response 0.45, damping 1.0) 640 → 185", () => {
  const params = springFromSwift(CLOSE_SPRING);
  const start = { position: 640, velocity: 0 };
  const target = 185;

  it("never overshoots (critically damped)", () => {
    const h = 1 / 240;
    let s = start;
    let min = 640;
    for (let i = 0; i < 240 * 2; i++) {
      s = stepSpring(s, target, params, h);
      min = Math.min(min, s.position);
    }
    expect(min).toBeGreaterThanOrEqual(target - 0.001);
  });

  it("settles within ±1px after 1.2s", () => {
    const s = simulate(start, target, params, 1.2);
    expect(Math.abs(s.position - target)).toBeLessThanOrEqual(1);
  });
});

describe("stepSpring numerics", () => {
  it("handles large dt by substepping (no explosion)", () => {
    const params = springFromSwift(OPEN_SPRING);
    const s = stepSpring({ position: 0, velocity: 0 }, 640, params, 0.5);
    expect(Number.isFinite(s.position)).toBe(true);
    expect(s.position).toBeGreaterThan(0);
  });
});
