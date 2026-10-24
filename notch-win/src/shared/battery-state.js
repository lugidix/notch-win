// Battery model — port of BatteryStatusViewModel.swift semantics:
// statusText transitions ("Plugged In" / "Unplugged" / "Charging battery" /
// "Not charging" / "Full charge"), chin triggers on state changes,
// glyph colors (green charging/full, red ≤20% on battery, yellow low power).
export function initialState() {
  return { ac: false, charging: false, percent: 0, has: false };
}

export function mapStatus(state, percent = state.percent) {
  if (state.charging) return percent >= 100 ? "Full charge" : "Charging battery";
  if (state.ac) return percent >= 100 ? "Full charge" : "Not charging";
  return "On Battery";
}

export function glyphColor(state, percent = state.percent) {
  if (state.charging || (state.ac && percent >= 100)) return "#30D158"; // green
  if (!state.ac && percent <= 20) return "#FF453A"; // red
  return "#FFFFFF";
}

// A chin-worthy transition (BatteryActivityManager diff events + boring's
// showPowerStatusNotifications): plug/unplug, charging change, or reaching
// full charge.
export function isChinTransition(prev, next) {
  if (!prev?.has || !next?.has) return false;
  if (prev.ac !== next.ac) return true;
  if (prev.charging !== next.charging) return true;
  if (prev.percent < 100 && next.percent >= 100) return true;
  return false;
}

export function applyPoll(prev, poll, nowMs, opts = {}) {
  const graceMs = opts.chinDurationMs ?? 3000; // expandingView battery: 3s
  if (!poll || poll.percent === 255 || poll.percent == null) {
    return { state: { ...initialState() }, chin: false };
  }
  const next = { ac: !!poll.ac, charging: !!poll.charging, percent: poll.percent, has: true };
  const transition = isChinTransition(prev, next);
  return {
    state: next,
    statusText: mapStatus(next),
    color: glyphColor(next),
    // Chin shows on transition while the notch is CLOSED (renderer decides),
    // auto-hides after 3s (BoringViewCoordinator expandingView: 3s).
    chin: transition,
    chinUntil: transition ? nowMs + graceMs : 0,
  };
}
