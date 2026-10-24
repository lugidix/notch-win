// Battery renderer — chin on transitions (ContentView.swift:260-286:
// statusText left + black gap + 30px glyph right, 640-wide, 3s), header
// indicator (BoringHeader.swift:80-91), click popover.
import { initialState, applyPoll, mapStatus, glyphColor } from "../../../shared/battery-state.js";

const $ = (id) => document.getElementById(id);

export function createBatteryController({ store, config, setPillWidth }) {
  const els = {
    chin: $("battery-chin"),
    chinText: $("bat-chin-text"),
    chinGlyph: $("bat-chin-glyph"),
    hdr: $("hdr-battery"),
    hdrGlyph: $("hdr-bat-glyph"),
    hdrPct: $("hdr-bat-pct"),
    popover: $("battery-popover"),
    popStatus: $("bat-pop-status"),
    popPct: $("bat-pop-pct"),
    popSource: $("bat-pop-source"),
  };

  let state = initialState();
  let chinActive = false;
  let chinTimer = null;
  let onStateChangeCb = null;

  function glyphSvg(pct, charging, color, w = 30) {
    // macOS-style horizontal battery: body + nub, fill by level, bolt overlay.
    const fillW = Math.max(0, Math.min(1, pct / 100)) * 19.4;
    const bolt = charging
      ? `<path d="M12.4 1.2 9.2 7.6h2.4l-1.3 5.2 3.8-6.6h-2.5z" fill="${color}"/>`
      : "";
    return (
      `<svg viewBox="0 0 30 13" width="${w}" height="${Math.round((w / 30) * 13)}">` +
      `<rect x="0.5" y="0.5" width="24" height="12" rx="3.5" fill="none" stroke="${color}" stroke-width="1.4"/>` +
      `<rect x="2.3" y="2.3" width="${fillW.toFixed(1)}" height="8.4" rx="1.8" fill="${color}"/>` +
      `<rect x="26" y="4" width="2.6" height="5" rx="1" fill="${color}"/>` +
      bolt +
      `</svg>`
    );
  }

  function render() {
    if (!state.has) {
      els.hdr.style.display = "none";
      return;
    }
    const color = glyphColor(state);
    els.hdr.style.display = "";
    els.hdrGlyph.innerHTML = glyphSvg(state.percent, state.charging, color, 24);
    els.hdrPct.textContent = config.showBatteryPercentage !== false ? `${state.percent}%` : "";
    els.popStatus.textContent = mapStatus(state);
    els.popPct.textContent = `${state.percent}%`;
    els.popSource.textContent = state.ac ? "Power adapter" : "Battery";
  }

  function setChin(on) {
    if (on === chinActive) return;
    chinActive = on;
    els.chin.classList.toggle("visible", on);
    setPillWidth?.(on ? 640 : null); // computedChinWidth (SPEC §2.1)
    if (on) {
      clearTimeout(chinTimer);
      chinTimer = setTimeout(() => setChin(false), 3000); // expandingView: 3s
    }
  }

  function handleBatteryEvent(poll) {
    const res = applyPoll(state, poll, Date.now());
    state = res.state;
    render();
    if (res.chin && config.showPowerStatusNotifications !== false && store.notchState === "closed") {
      els.chinText.textContent = res.statusText;
      els.chinGlyph.innerHTML = glyphSvg(state.percent, state.charging, res.color, 30);
      setChin(true);
    }
    onStateChangeCb?.(state);
  }

  // Popover on header click (BoringBattery.swift:88-167)
  els.hdr.addEventListener("click", (e) => {
    e.stopPropagation();
    els.popover.classList.toggle("visible");
  });
  document.addEventListener("click", (e) => {
    if (!els.popover.contains(e.target) && !els.hdr.contains(e.target)) {
      els.popover.classList.remove("visible");
    }
  });

  return {
    handleBatteryEvent,
    onStateChange(cb) { onStateChangeCb = cb; },
    get state() { return state; },
    get chinActive() { return chinActive; },
    hideChin() { setChin(false); },
  };
}
