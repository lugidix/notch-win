// notch renderer orchestrator — wires state machine + springs + interactions,
// the exact counterpart of ContentView.swift's body/hover/gesture handlers.
import { SpringGroup } from "./spring-engine.js";
import { applyIcons } from "./icons.js";
import { createMusicController } from "./music.js";
import { createShelfController } from "./shelf.js";
import { notchPath, RADIUS } from "../../../shared/notch-shape.js";
import { NotchStore } from "../../../shared/notch-store.js";
import {
  OPEN_SPRING,
  CLOSE_SPRING,
  INTERACTIVE_SPRING,
  VIEW_TRANSITION,
} from "../../../shared/spring-math.js";

const $ = (id) => document.getElementById(id);
const els = {
  notch: $("notch"),
  svg: $("notch-svg"),
  path: $("notch-path"),
  topRect: $("top-rect"),
  openContent: $("open-content"),
  closedContent: $("closed-content"),
};

const config = window.notchApi
  ? await window.notchApi.getConfig()
  : { closedNotchWidth: 185, closedNotchHeight: 32, openNotchWidth: 640, openNotchHeight: 190 };

const closed = { w: config.closedNotchWidth ?? 185, h: config.closedNotchHeight ?? 32 };
const opened = { w: config.openNotchWidth ?? 640, h: config.openNotchHeight ?? 190 };

const store = new NotchStore({
  minimumHoverDuration: config.minimumHoverDuration,
  openNotchOnHover: config.openNotchOnHover,
  gestureSensitivity: config.gestureSensitivity,
});

// One spring per animated property. Open transitions run on the interactive
// spring (doOpen wraps vm.open() in interactiveSpring, ContentView.swift:41,505-509),
// close on the dedicated close spring (ContentView.swift:124).
const springs = new SpringGroup()
  .add("w", closed.w, INTERACTIVE_SPRING)
  .add("h", closed.h, INTERACTIVE_SPRING)
  .add("rTop", RADIUS.closed.top, INTERACTIVE_SPRING)
  .add("rBot", RADIUS.closed.bottom, INTERACTIVE_SPRING)
  .add("content", 0, VIEW_TRANSITION) // scale(0.8)+opacity .smooth(0.35)
  .add("shadow", 0, INTERACTIVE_SPRING); // black 0.7, radius 6

function applyFrame(v) {
  const w = Math.max(1, v.w);
  const h = Math.max(1, v.h);
  els.notch.style.width = `${w}px`;
  els.notch.style.height = `${h}px`;
  els.svg.setAttribute("width", w);
  els.svg.setAttribute("height", h);
  els.path.setAttribute("d", notchPath(w, h, v.rTop, v.rBot));

  // Clip content to the exact notch shape — SwiftUI .clipShape(NotchShape)
  // equivalent; kills any glow/element bleeding past the rounded corners.
  const d = `path('${notchPath(w, h, v.rTop, v.rBot)}')`;
  els.openContent.style.clipPath = d;
  els.closedContent.style.clipPath = d;

  els.topRect.setAttribute("x", v.rTop);
  els.topRect.setAttribute("width", Math.max(0, w - 2 * v.rTop));

  // Content: opacity + scale(0.8→1, anchor top) + blur 30→0 (NotchHomeView.swift:464-465).
  // The fit factor shrinks content while the shape is still growing, so the
  // clip-path never slices elements mid-transition (nothing "cuts the notch").
  const p = v.content;
  const fit = Math.min(1, h / 150);
  els.openContent.style.opacity = p.toFixed(3);
  els.openContent.style.transform = `scale(${((0.8 + 0.2 * p) * fit).toFixed(4)})`;
  els.openContent.style.filter = `blur(${((1 - p) * 30).toFixed(2)}px)`;
  els.openContent.style.pointerEvents = p > 0.5 ? "auto" : "none";

  // Shadow only while open or hovering (ContentView.swift:111-114)
  const shadowOn = store.notchState === "open" || store.isHovering;
  els.svg.style.filter =
    shadowOn && v.shadow > 0.01
      ? `drop-shadow(0 0 6px rgba(0,0,0,${(v.shadow * 0.7).toFixed(3)}))`
      : "none";
}
springs.onFrame(applyFrame);
applyFrame(springs.snapshot());

function setPassThrough(ignore) {
  if (ignoring === ignore) return;
  ignoring = ignore;
  window.notchApi?.setIgnoreMouseEvents(ignore);
}

// Music island — ONE expanded state (hover or click, identical): the medium
// island 370×150 with margins. Without music, opening goes to the full
// boring.notch player 640×190 (header, slider, controls).
const MEDIUM_MEDIA = { w: 370, h: 150 };
const MEDIUM_RADIUS = { top: 36, bottom: 36 };

function openNotch() {
  setPassThrough(false); // the open panel must be clickable immediately
  const compact = musicActive || music.state.status !== "idle";
  els.openContent.classList.toggle("compact", compact);
  const target = compact ? MEDIUM_MEDIA : opened;
  const g = compact
    ? MEDIUM_RADIUS
    : config.cornerRadiusScaling === false
      ? RADIUS.closed
      : RADIUS.opened;
  springs.set("w", target.w, INTERACTIVE_SPRING);
  springs.set("h", target.h, INTERACTIVE_SPRING);
  springs.set("rTop", g.top, INTERACTIVE_SPRING);
  springs.set("rBot", g.bottom, INTERACTIVE_SPRING);
  springs.set("content", 1, VIEW_TRANSITION);
  springs.set("shadow", 1, INTERACTIVE_SPRING);
}

function closeNotch() {
  springs.set("w", closedWidthTarget(), CLOSE_SPRING);
  springs.set("h", closed.h, CLOSE_SPRING);
  springs.set("rTop", RADIUS.closed.top, CLOSE_SPRING);
  springs.set("rBot", RADIUS.closed.bottom, CLOSE_SPRING);
  springs.set("content", 0, VIEW_TRANSITION);
  springs.set("shadow", 0, CLOSE_SPRING);
}

// Closed pill widens while the music activity is visible. Fixed "described"
// pill width (boring demo: art + title + eq at rest) instead of the raw formula.
let musicActive = false;
const CLOSED_MUSIC_W = 260;
function closedWidthTarget() {
  return musicActive ? CLOSED_MUSIC_W : closed.w;
}

store.addEventListener("open", openNotch);
store.addEventListener("close", () => {
  closeNotch();
  // Release the host window: only the pill itself stays hover-interactive
  // (re-enabled by forwarded mousemove), the rest clicks through to the desktop.
  setPassThrough(true);
});
store.addEventListener("hoverstart", () => springs.set("shadow", 1, INTERACTIVE_SPRING));
store.addEventListener("hoverend", () => {
  if (store.notchState === "closed") springs.set("shadow", 0, INTERACTIVE_SPRING);
});

// ---- Pointer interactions (ContentView.swift:131-148, 513-611) ----
// Capture is taken only once a real drag starts — capturing on plain
// pointerdown would retarget clicks to the pill and starve the buttons.
let gesture = null; // { startY, lastDy, dragging }

els.notch.addEventListener("pointerenter", () => store.handleHover(true));
els.notch.addEventListener("pointerleave", () => {
  if (gesture?.dragging) return; // gesture end handles it
  store.handleHover(false);
});

els.notch.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  gesture = { startY: e.clientY, lastDy: 0, dragging: false };
});

els.notch.addEventListener("pointermove", (e) => {
  if (!gesture) return;
  const dy = e.clientY - gesture.startY; // + down, − up
  gesture.lastDy = dy;
  if (!gesture.dragging) {
    if (Math.abs(dy) <= 4) return; // plain click, no capture
    gesture.dragging = true;
    els.notch.setPointerCapture(e.pointerId);
  }
  const sens = store.config.gestureSensitivity;
  if (store.notchState === "closed" && dy > 0) {
    // Pull-down open gesture: scale = 1 + progress*0.01 (ContentView.swift:85-89,562-583)
    const progress = (dy / sens) * 20;
    const scale = Math.max(0.6, 1 + progress * 0.01);
    els.notch.style.transform = `translateX(-50%) scale(${scale})`;
    if (dy > sens) {
      els.notch.style.transform = "translateX(-50%)";
      gesture = null;
      store.open();
    }
  } else if (store.notchState === "open" && dy < 0) {
    // Swipe-up close gesture (ContentView.swift:585-611)
    const progress = (-dy / sens) * 20;
    const scale = Math.max(0.6, 1 - progress * 0.01);
    els.notch.style.transform = `translateX(-50%) scale(${scale})`;
    if (-dy > sens) {
      els.notch.style.transform = "translateX(-50%)";
      gesture = null;
      store.close();
    }
  }
});

els.notch.addEventListener("pointerup", (e) => {
  if (!gesture) return;
  const wasDrag = gesture.dragging;
  gesture = null;
  els.notch.style.transform = "translateX(-50%)"; // .smooth reset
  if (wasDrag || e.button !== 0) return;
  if (store.notchState === "closed") {
    store.open(); // onTapGesture → doOpen (ContentView.swift:134-136)
  }
  // While open, a plain click does nothing more — the medium island is the
  // single expanded music state (extra info lives in the full 640 view,
  // reachable when no track is playing).
});

els.notch.addEventListener("pointercancel", () => {
  gesture = null;
  els.notch.style.transform = "translateX(-50%)";
});

els.notch.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.notchApi?.contextMenu();
});

$("btn-settings").addEventListener("click", (e) => e.stopPropagation());

// ---- Click-through: interactive only on the notch shape itself ----
// The 640×210 host is mostly transparent; clicks outside the pill must fall
// through to the desktop. mousemove keeps arriving thanks to forward:true.
let ignoring = false;
window.addEventListener("mousemove", (e) => {
  const r = els.notch.getBoundingClientRect();
  const inside =
    e.clientX >= r.left && e.clientX <= r.right && e.clientY <= r.bottom && e.clientY >= r.top;
  if (!inside) {
    setPassThrough(true);
    // Mirror the close path in case pointerleave was missed
    // (ContentView.swift:542-557 — close 100ms after leaving).
    if (store.isHovering) store.handleHover(false);
  } else {
    setPassThrough(false);
  }
});
window.addEventListener("mouseout", (e) => {
  if (!e.relatedTarget) {
    // Pointer left the host window entirely (fast exit / other monitor).
    if (store.isHovering) store.handleHover(false);
    if (store.notchState === "closed") setPassThrough(true);
  }
});

// Cursor watchdog (main polls the real cursor): backstop for missed leave
// events, e.g. when the pointer jumps to another screen while hovering.
let cursorWasInside = true;
window.notchApi?.onCursorInside((inside) => {
  if (!inside && cursorWasInside) {
    cursorWasInside = false;
    if (store.isHovering) store.handleHover(false);
    if (store.notchState === "closed") setPassThrough(true);
  } else if (inside) {
    cursorWasInside = true;
  }
});

// Start pass-through so the idle notch doesn't eat desktop clicks until hovered.
// (mousemove with forward:true will re-enable interaction when over the pill.)
setPassThrough(true);

// SF Symbols-style transport controls / gear.
applyIcons();

// ---- Shelf (slice 4): tabs + drop grid ------------------------------------
const shelf = createShelfController({ store, api: window.notchApi });
shelf.onSwitchView((view) => {
  els.openContent.classList.toggle("shelf", view === "shelf");
});

// ---- Music (slice 2): SMTC playback → notch UI ----------------------------
const music = createMusicController({ store, config, api: window.notchApi });
music.setClosedArtSize(closed.h);
music.onActivityChange((active) => {
  musicActive = active;
  if (store.notchState === "closed") {
    springs.set("w", closedWidthTarget(), VIEW_TRANSITION); // .smooth chin resize
  }
});
window.notchApi?.onMedia((poll) => music.handleMediaEvent(poll));
window.notchApi?.onHotkey((key) => music.handleHotkey(key));
console.log("[app] music wiring complete, notchApi:", !!window.notchApi);

// ---- Fullscreen hiding: the closed pill fades out while a fullscreen app
// is in the foreground (BoringViewModel:72-103, hideNotchOption). ----
let fullscreenApp = false;
let fullscreenProc = "";
function updateHideOnClosed() {
  const option = config.hideNotchOption ?? "nowPlayingOnly";
  if (option === "never") {
    store.hideOnClosed = false;
  } else if (option === "always") {
    store.hideOnClosed = fullscreenApp;
  } else {
    // nowPlayingOnly: hide when the fullscreen app IS the media source
    // (SMTC sourceId prefix vs process name), tolerant matching both ways.
    const mediaSrc = (music.state?.sourceId ?? "").toLowerCase();
    const fs = fullscreenProc.toLowerCase();
    const isMediaApp =
      fs !== "" &&
      (mediaSrc.includes(fs) || (mediaSrc.includes("apple") && fs.includes("apple")) ||
       (mediaSrc.includes("spotify") && fs.includes("spotify")) ||
       (mediaSrc.includes("chrome") && fs.includes("chrome")) ||
       (mediaSrc.includes("firefox") && fs.includes("firefox")) ||
       (mediaSrc.includes("msedge") && fs.includes("msedge")));
    store.hideOnClosed = fullscreenApp && isMediaApp;
  }
  document.body.classList.toggle("hidden-notch", store.hideOnClosed && store.notchState === "closed");
}
window.notchApi?.onFullscreen((msg) => {
  fullscreenApp = !!msg.fullscreen;
  fullscreenProc = msg.process ?? "";
  updateHideOnClosed();
});
store.addEventListener("open", () => document.body.classList.remove("hidden-notch"));
store.addEventListener("close", () => updateHideOnClosed());

window.addEventListener("error", (e) => console.log("[renderer-error]", e.message));

// Live config updates (settings window, slice 5)
window.notchApi?.onConfig((c) => {
  closed.w = c.closedNotchWidth ?? closed.w;
  closed.h = c.closedNotchHeight ?? closed.h;
  if (store.notchState === "closed") closeNotch();
});

// Debug/eval hook (also used by scripts/smoke-capture.js).
window.__notch = { store, springs, openNotch, closeNotch, music };
