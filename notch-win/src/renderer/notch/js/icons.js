// SF Symbols-style icon generator — boring.notch uses SF Symbols
// (backward.fill, play.fill, pause.fill, forward.fill, gear) which cannot be
// shipped on Windows (Apple font licensing). These builders recreate their
// geometry: rounded-corner kites for transport controls, capsules for pause,
// and a smooth 8-tooth gear for the settings button.

const f = (x) => Math.round(x * 100) / 100;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

// Polygon path with quadratic-rounded corners (SF-symbol look).
export function roundedPolyPath(pts, r) {
  const n = pts.length;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const v1 = norm(sub(p, pts[(i - 1 + n) % n]));
    const v2 = norm(sub(pts[(i + 1) % n], p));
    const a = [p[0] - v1[0] * r, p[1] - v1[1] * r];
    const b = [p[0] + v2[0] * r, p[1] + v2[1] * r];
    segs.push(`${i === 0 ? "M" : "L"} ${f(a[0])} ${f(a[1])}`);
    segs.push(`Q ${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`);
  }
  segs.push("Z");
  return segs.join(" ");
}

// Vertical capsule subpath (pause bars, SF pause.fill proportions).
export function capsulePath(x, y, w, h) {
  const r = w / 2;
  return [
    `M ${f(x)} ${f(y + r)}`,
    `A ${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}`,
    `L ${f(x + w)} ${f(y + h - r)}`,
    `A ${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}`,
    "Z",
  ].join(" ");
}

// Apple Music style (Figma reference): vertical bar on the OUTER edge + two
// left/right-pointing rounded kites — regular weight, solid fill, no circle.
const BAR_X = 2;
const BAR_W = 3.6;
const KITE_L = [[6, 12], [13.8, 5.3], [13.8, 18.7]];
const KITE_GAP = 0.8;

export function prevPath() {
  const k2 = KITE_L.map(([x, y]) => [x + (14 - 6) + KITE_GAP, y]);
  return [
    capsulePath(BAR_X, 5, BAR_W, 14),
    roundedPolyPath(KITE_L, 1.1),
    roundedPolyPath(k2, 1.1),
  ].join(" ");
}

export function nextPath() {
  const mirror = ([x, y]) => [24 - x, y];
  const k1 = KITE_L.map(mirror);
  const k2 = k1.map(([x, y]) => [x - (14 - 6) - KITE_GAP, y]);
  const bar = capsulePath(24 - BAR_X - BAR_W, 5, BAR_W, 14);
  return [roundedPolyPath(k1, 1.1), roundedPolyPath(k2, 1.1), bar].join(" ");
}

// play.fill: single larger rounded kite, vertical left edge, obtuse soft apex.
export function playPath() {
  return roundedPolyPath([[7.2, 4.2], [19, 12], [7.2, 19.8]], 3);
}

// pause.fill: two capsules (SF proportions: bar 3.8, gap 3.4).
export function pausePath() {
  return [capsulePath(6.4, 4.5, 4.2, 15), capsulePath(13.4, 4.5, 4.2, 15)].join(" ");
}

// SF gearshape.fill-style gear: 8 wide teeth, thick body, medium hole.
export function gearPath(teeth = 8, rRoot = 6.8, rTip = 9, rHole = 3) {
  const STEP = (2 * Math.PI) / 512;
  const toothHalf = (Math.PI / teeth) * 0.72;
  const smooth = (t) => t * t * (3 - 2 * t);
  const pts = [];
  for (let a = -Math.PI; a <= Math.PI; a += STEP) {
    let r = rRoot;
    const period = (2 * Math.PI) / teeth;
    const c = Math.round(a / period) * period;
    const d = Math.abs(a - c);
    if (d < toothHalf) r = rRoot + (rTip - rRoot) * smooth(1 - d / toothHalf);
    pts.push([12 + r * Math.cos(a), 12 + r * Math.sin(a)]);
  }
  const outer = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${f(x)} ${f(y)}`).join(" ");
  const hole = [
    `M ${f(12 + rHole)} 12`,
    `A ${rHole} ${rHole} 0 1 0 ${f(12 - rHole)} 12`,
    `A ${rHole} ${rHole} 0 1 0 ${f(12 + rHole)} 12`,
    "Z",
  ].join(" ");
  return `${outer} Z ${hole}`;
}

export function applyIcons() {
  const icons = {
    prev: prevPath(),
    next: nextPath(),
    play: playPath(),
    pause: pausePath(),
    gear: gearPath(),
  };
  for (const [name, d] of Object.entries(icons)) {
    document.querySelectorAll(`[data-icon="${name}"]`).forEach((el) => el.setAttribute("d", d));
  }
}
