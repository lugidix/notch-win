import { describe, it, expect } from "vitest";
import {
  roundedPolyPath,
  prevPath,
  nextPath,
  playPath,
  pausePath,
  gearPath,
} from "../src/renderer/notch/js/icons.js";

describe("roundedPolyPath", () => {
  it("produces quadratic-rounded corners inside the 24 viewBox", () => {
    const d = roundedPolyPath([[3.8, 12], [13.4, 6.1], [13.4, 17.9]], 1.4);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("Q ");
    expect(d.endsWith("Z")).toBe(true);
    for (const m of d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(0);
      expect(Number(m[1])).toBeLessThanOrEqual(24);
    }
  });
});

describe("SF Symbols geometry", () => {
  it("prev/next are bar + two-kite compositions (Apple Music style)", () => {
    const p = prevPath();
    const n = nextPath();
    expect((p.match(/M /g) || []).length).toBe(3); // bar + two kites
    expect((n.match(/M /g) || []).length).toBe(3);
    expect(p).toContain("A "); // rounded bar caps
  });

  it("play is a single kite, pause is two capsule subpaths", () => {
    expect((playPath().match(/M /g) || []).length).toBe(1);
    const pause = pausePath();
    expect((pause.match(/M /g) || []).length).toBe(2);
    expect(pause).toContain("A "); // rounded caps
  });

  it("gear has an even-odd center hole", () => {
    const g = gearPath();
    expect((g.match(/M /g) || []).length).toBe(2); // body + hole
    expect(g).toContain("A "); // circular hole
  });
});
