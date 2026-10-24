import { describe, it, expect } from "vitest";
import {
  initialState,
  applyPoll,
  mapStatus,
  glyphColor,
  isChinTransition,
} from "../src/shared/battery-state.js";

describe("battery-state", () => {
  it("maps statuses like BatteryStatusViewModel.swift", () => {
    expect(mapStatus({ ac: true, charging: true, percent: 80 })).toBe("Charging battery");
    expect(mapStatus({ ac: true, charging: false, percent: 80 })).toBe("Not charging");
    expect(mapStatus({ ac: true, charging: false, percent: 100 })).toBe("Full charge");
    expect(mapStatus({ ac: true, charging: true, percent: 100 })).toBe("Full charge");
    expect(mapStatus({ ac: false, charging: false, percent: 50 })).toBe("On Battery");
  });

  it("glyph colors: green charging/full, red ≤20% on battery", () => {
    expect(glyphColor({ ac: true, charging: true, percent: 50 })).toBe("#30D158");
    expect(glyphColor({ ac: true, charging: false, percent: 100 })).toBe("#30D158");
    expect(glyphColor({ ac: false, charging: false, percent: 15 })).toBe("#FF453A");
    expect(glyphColor({ ac: false, charging: false, percent: 50 })).toBe("#FFFFFF");
  });

  it("chin fires on plug/unplug and charging transitions only", () => {
    expect(isChinTransition(
      { has: true, ac: false, charging: false, percent: 50 },
      { has: true, ac: true, charging: true, percent: 50 }
    )).toBe(true);
    expect(isChinTransition(
      { has: true, ac: true, charging: true, percent: 50 },
      { has: true, ac: true, charging: true, percent: 51 }
    )).toBe(false);
    expect(isChinTransition(
      { has: true, ac: true, charging: false, percent: 99 },
      { has: true, ac: true, charging: false, percent: 100 }
    )).toBe(true);
  });

  it("applyPoll chains state and schedules a 3s chin", () => {
    let s = initialState();
    const r1 = applyPoll(s, { ac: false, charging: false, percent: 50 }, 1000);
    expect(r1.state.has).toBe(true);
    expect(r1.chin).toBe(false);
    const r2 = applyPoll(r1.state, { ac: true, charging: true, percent: 50 }, 5000);
    expect(r2.chin).toBe(true);
    expect(r2.chinUntil).toBe(8000);
    expect(r2.statusText).toBe("Charging battery");
  });

  it("ignores unknown battery (percent 255)", () => {
    const r = applyPoll(initialState(), { ac: true, charging: false, percent: 255 }, 0);
    expect(r.state.has).toBe(false);
  });
});
