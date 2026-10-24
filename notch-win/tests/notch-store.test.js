import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotchStore, DEFAULTS } from "../src/shared/notch-store.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("defaults (SPEC §2)", () => {
  it("matches boring.notch constants", () => {
    expect(DEFAULTS.minimumHoverDuration).toBe(0.3);
    expect(DEFAULTS.closeDelay).toBe(0.1);
    expect(DEFAULTS.gestureSensitivity).toBe(200);
    expect(DEFAULTS.openNotchOnHover).toBe(true);
  });
});

describe("hover open", () => {
  it("opens after 300ms of hover", () => {
    const s = new NotchStore();
    s.handleHover(true);
    expect(s.notchState).toBe("closed");
    vi.advanceTimersByTime(300);
    expect(s.notchState).toBe("open");
  });

  it("does not open if hover ends before 300ms", () => {
    const s = new NotchStore();
    s.handleHover(true);
    vi.advanceTimersByTime(150);
    s.handleHover(false);
    vi.advanceTimersByTime(500);
    expect(s.notchState).toBe("closed");
  });
});

describe("hover close", () => {
  it("closes 100ms after mouse leaves", () => {
    const s = new NotchStore();
    s.open();
    s.handleHover(false);
    expect(s.notchState).toBe("open"); // grace period
    vi.advanceTimersByTime(100);
    expect(s.notchState).toBe("closed");
  });

  it("re-hover within 100ms cancels the close", () => {
    const s = new NotchStore();
    s.open();
    s.handleHover(false);
    vi.advanceTimersByTime(50);
    s.handleHover(true);
    vi.advanceTimersByTime(200);
    expect(s.notchState).toBe("open");
  });

  it("does not close while battery popover is active (ContentView.swift:170-183)", () => {
    const s = new NotchStore();
    s.open();
    s.isBatteryPopoverActive = true;
    s.handleHover(false);
    vi.advanceTimersByTime(300);
    expect(s.notchState).toBe("open");
  });

  it("does not close while preventNotchClose (share sheet)", () => {
    const s = new NotchStore();
    s.open();
    s.preventNotchClose = true;
    s.handleHover(false);
    vi.advanceTimersByTime(300);
    expect(s.notchState).toBe("open");
  });
});

describe("sneak peek", () => {
  it("auto-hides after duration and blocks hover-open while shown", () => {
    const s = new NotchStore();
    s.showSneakPeek("music", 1500);
    expect(s.sneakPeek.show).toBe(true);
    s.handleHover(true);
    vi.advanceTimersByTime(1000);
    expect(s.notchState).toBe("closed"); // blocked by sneak peek
    vi.advanceTimersByTime(600);
    expect(s.sneakPeek.show).toBe(false);
  });
});

describe("hotkey toggle", () => {
  it("auto-closes after 3s minimum open (boringNotchApp.swift:396-404)", () => {
    const s = new NotchStore();
    s.toggleWithMinimumOpen((ms, fn) => setTimeout(fn, ms));
    expect(s.notchState).toBe("open");
    vi.advanceTimersByTime(2999);
    expect(s.notchState).toBe("open");
    vi.advanceTimersByTime(2);
    expect(s.notchState).toBe("closed");
  });
});
