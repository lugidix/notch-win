// Playback model — port of MusicManager.swift state semantics:
// - position extrapolation: elapsed + (now − ts) × rate, clamped (MusicManager.swift:567-573)
// - idle: immediate false while playing, debounced true after waitInterval (3s)
//   of pause (MusicManager.swift:538-552, Constants.swift:129)
// - track change: identity by title|artist|album, drives sneak peek
//   (MusicManager.swift:585-593)
export const DEFAULT_WAIT_INTERVAL = 3;

export function initialState() {
  return {
    status: "idle", // idle | playing | paused | stopped
    title: "",
    artist: "",
    album: "",
    artB64: null,
    artVersion: 0,
    positionSec: 0,
    durationSec: 0,
    rate: 1,
    ts: 0, // epoch ms of last position sample
    isPlaying: false,
    isPlayerIdle: true,
    trackKey: "",
    sourceId: "",
    avgColor: { r: 255, g: 255, b: 255 },
    _idleSince: 0,
  };
}

// Apply one SMTC poll (1 Hz). Returns { state, trackChanged }.
export function applyPoll(prev, poll, nowMs, waitIntervalSec = DEFAULT_WAIT_INTERVAL) {
  const next = { ...prev };

  if (!poll || poll.status === "idle" || !poll.track) {
    next.status = "idle";
    next.isPlaying = false;
    next.isPlayerIdle = true;
    next._idleSince = 0;
    return { state: next, trackChanged: false };
  }

  const t = poll.track;
  next.status = poll.status;
  next.isPlaying = poll.status === "playing";
  next.sourceId = poll.sourceId ?? prev.sourceId ?? "";
  next.title = t.title ?? "";
  next.artist = t.artist ?? "";
  next.album = t.album ?? "";
  next.durationSec = t.durationSec ?? 0;
  next.rate = t.rate ?? 1;
  next.positionSec = t.positionSec ?? 0;
  next.ts = poll.ts ?? nowMs;
  if (poll.artB64 && poll.artB64 !== prev.artB64) {
    next.artB64 = poll.artB64;
    next.artVersion = prev.artVersion + 1;
  }

  const trackKey = `${next.title}|${next.artist}|${next.album}`;
  const trackChanged = trackKey !== prev.trackKey && prev.trackKey !== "";
  next.trackKey = trackKey;

  // Idle state machine (updateIdleState, MusicManager.swift:538-552)
  if (next.isPlaying) {
    next.isPlayerIdle = false;
    next._idleSince = 0;
  } else {
    if (!prev.isPlaying) {
      next._idleSince = prev._idleSince || nowMs;
    } else {
      next._idleSince = nowMs;
    }
    const waited = nowMs - next._idleSince >= waitIntervalSec * 1000;
    next.isPlayerIdle = waited ? true : prev.status !== "idle" ? prev.isPlayerIdle : true;
  }

  return { state: next, trackChanged };
}

// estimatedPlaybackPosition (MusicManager.swift:567-573)
export function estimatedPosition(state, nowMs) {
  if (!state.isPlaying) return Math.min(state.positionSec, state.durationSec);
  const elapsed = state.positionSec + ((nowMs - state.ts) / 1000) * state.rate;
  return Math.min(Math.max(0, elapsed), state.durationSec);
}

export function timeString(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// HSB brightness floor — port of ensureMinimumBrightness(factor:)
export function ensureMinimumBrightness({ r, g, b }, factor) {
  const max = Math.max(r, g, b) / 255;
  if (max >= factor || max === 0) return { r, g, b };
  const scale = factor / max;
  const clamp = (x) => Math.min(255, Math.round(x * scale));
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

export function cssColor({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
