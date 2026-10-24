// Exact port of boring.notch NotchShape.path (components/Notch/NotchShape.swift:36-119)
// and corner radius constants (sizing/matters.swift:18).
export const RADIUS = {
  closed: { top: 6, bottom: 14 },
  opened: { top: 19, bottom: 24 },
};

// Returns an SVG path string for a w×h notch with asymmetric top/bottom radii.
// Top corners: quadratic from (0,0) to (rTop,rTop), control (rTop,0).
// Bottom corners are horizontally offset by rTop, control points on the bottom edge.
export function notchPath(w, h, rTop, rBot) {
  return [
    `M 0 0`,
    `Q ${rTop} 0 ${rTop} ${rTop}`,
    `L ${rTop} ${h - rBot}`,
    `Q ${rTop} ${h} ${rTop + rBot} ${h}`,
    `L ${w - rTop - rBot} ${h}`,
    `Q ${w - rTop} ${h} ${w - rTop} ${h - rBot}`,
    `L ${w - rTop} ${rTop}`,
    `Q ${w - rTop} 0 ${w} 0`,
    `Z`,
  ].join(" ");
}
