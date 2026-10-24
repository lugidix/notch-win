import { describe, it, expect } from "vitest";
import { notchPath, RADIUS } from "../src/shared/notch-shape.js";

describe("notchPath", () => {
  it("starts at top-left corner and closes the path", () => {
    const d = notchPath(200, 32, 6, 14);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("closed pill uses radii 6/14 (sizing/matters.swift:18)", () => {
    expect(RADIUS.closed).toEqual({ top: 6, bottom: 14 });
  });

  it("opened notch uses radii 19/24", () => {
    expect(RADIUS.opened).toEqual({ top: 19, bottom: 24 });
  });

  it("bottom corners are horizontally offset by rTop (NotchShape.swift:64-73)", () => {
    const d = notchPath(200, 32, 6, 14);
    // bottom-left quadratic control at (rTop, h) then point (rTop+rBot, h)
    expect(d).toContain("Q 6 32 20 32");
    // bottom-right: control (w-rTop, h) then point (w-rTop, h-rBot)
    expect(d).toContain("Q 194 32 194 18");
  });

  it("top corners use control on the top edge (NotchShape.swift:46-55)", () => {
    const d = notchPath(200, 32, 6, 14);
    expect(d).toContain("Q 6 0 6 6");
    expect(d).toContain("Q 194 0 200 0");
  });
});
