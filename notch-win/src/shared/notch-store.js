// Notch state machine — port of BoringViewModel + ContentView hover logic.
// Fidelity: open on hover after minimumHoverDuration (0.3s), close on mouse-leave
// after 100ms, click opens immediately, guards prevent close (battery popover /
// sharing) — docs/SPEC-fidelite-boring-notch.md §2.
export const DEFAULTS = {
  minimumHoverDuration: 0.3, // Constants.swift:79
  closeDelay: 0.1, // ContentView.swift:544 (100ms)
  gestureSensitivity: 200, // Constants.swift:123
  openNotchOnHover: true, // Constants.swift:81
};

export class NotchStore extends EventTarget {
  // Browser timers must be invoked with the global receiver — wrap in arrows
  // (calling `this.timers.setTimeout(...)` directly throws "Illegal invocation").
  constructor(config = DEFAULTS, timers) {
    super();
    this.timers =
      timers ??
      {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id),
      };
    // Merge without letting explicit `undefined` keys erase the defaults.
    this.config = { ...DEFAULTS };
    for (const [k, v] of Object.entries(config ?? {})) {
      if (v !== undefined) this.config[k] = v;
    }
    this.notchState = "closed"; // 'closed' | 'open' (enums/generic.swift:22)
    this.isHovering = false;
    this.currentView = "home"; // 'home' | 'shelf'
    this.preventNotchClose = false; // SharingStateManager equivalent
    this.isBatteryPopoverActive = false;
    this.sneakPeek = { show: false, type: null, value: 0 };
    this.hideOnClosed = false;
    this._hoverTimer = null;
    this._closeTimer = null;
  }

  _clearTimers() {
    if (this._hoverTimer) this.timers.clearTimeout(this._hoverTimer);
    if (this._closeTimer) this.timers.clearTimeout(this._closeTimer);
    this._hoverTimer = null;
    this._closeTimer = null;
  }

  open() {
    this._clearTimers();
    if (this.notchState !== "open") {
      this.notchState = "open";
      this._emit("open");
    }
  }

  close(force = false) {
    if (this.preventNotchClose && !force) return; // BoringViewModel.swift:200-204
    this._clearTimers();
    if (this.notchState !== "closed") {
      this.notchState = "closed";
      this.isBatteryPopoverActive = false;
      this.sneakPeek = { show: false, type: null, value: 0 };
      this._emit("close");
    }
  }

  // Hotkey toggle: opens for at least 3s (boringNotchApp.swift:390-409).
  toggleWithMinimumOpen(scheduleAutoClose) {
    if (this.notchState === "closed") {
      this.open();
      scheduleAutoClose(3000, () => this.close());
    } else {
      this.close();
    }
  }

  handleHover(hovering) {
    if (hovering) {
      this.isHovering = true;
      this._emit("hoverstart");
      if (this._closeTimer) {
        this.timers.clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
      if (this.notchState === "closed" && this.config.openNotchOnHover) {
        this._hoverTimer = this.timers.setTimeout(() => {
          this._hoverTimer = null;
          if (this.notchState === "closed" && this.isHovering && !this.sneakPeek.show) {
            // Listeners may cancel (e.g. inline music expansion) via detail.cancelled
            const detail = { cancelled: false };
            this._emit("will-open-hover", detail);
            if (!detail.cancelled) this.open();
          }
        }, this.config.minimumHoverDuration * 1000);
      }
    } else {
      this._closeTimer = this.timers.setTimeout(() => {
        this._closeTimer = null;
        this.isHovering = false;
        this._emit("hoverend");
        if (this.notchState === "open" && !this.isBatteryPopoverActive && !this.preventNotchClose) {
          this.close();
        }
      }, this.config.closeDelay * 1000);
      if (this._hoverTimer) {
        this.timers.clearTimeout(this._hoverTimer);
        this._hoverTimer = null;
      }
    }
  }

  showSneakPeek(type, durationMs = 1500) {
    this.sneakPeek = { show: true, type, value: 0 };
    this._emit("sneakpeek", { type, durationMs });
    this.timers.setTimeout(() => {
      if (this.sneakPeek.show) {
        this.sneakPeek = { show: false, type: null, value: 0 };
        this._emit("sneakpeek-end");
      }
    }, durationMs);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
