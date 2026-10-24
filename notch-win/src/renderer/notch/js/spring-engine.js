// rAF-driven spring animator. One loop drives every animated property of the
// notch (size, corner radii, content opacity/scale, shadow) so motion matches
// the SwiftUI springs exactly (docs/SPEC-fidelite-boring-notch.md §3).
import { springFromSwift, stepSpring } from "../../../shared/spring-math.js";

export class SpringGroup {
  constructor() {
    this.springs = new Map(); // name -> { position, velocity, target, params, done }
    this._raf = null;
    this._last = null;
    this._onFrame = null;
  }

  add(name, initial, swiftParams) {
    this.springs.set(name, {
      position: initial,
      velocity: 0,
      target: initial,
      params: springFromSwift(swiftParams),
      swiftParams,
      done: true,
    });
    return this;
  }

  // Retarget keeps velocity (SwiftUI spring continuation semantics).
  set(name, target, swiftParams) {
    const s = this.springs.get(name);
    if (!s) throw new Error(`unknown spring: ${name}`);
    s.target = target;
    if (swiftParams) {
      s.swiftParams = swiftParams;
      s.params = springFromSwift(swiftParams);
    }
    s.done = false;
    this._wake();
  }

  value(name) {
    return this.springs.get(name)?.position;
  }

  _step(dt) {
    let anyMoving = false;
    for (const s of this.springs.values()) {
      if (s.done) continue;
      const next = stepSpring(
        { position: s.position, velocity: s.velocity },
        s.target,
        s.params,
        dt
      );
      s.position = next.position;
      s.velocity = next.velocity;
      if (Math.abs(s.position - s.target) < 0.01 && Math.abs(s.velocity) < 0.01) {
        s.position = s.target;
        s.velocity = 0;
        s.done = true;
      } else {
        anyMoving = true;
      }
    }
    return anyMoving;
  }

  _wake() {
    if (this._raf != null) return;
    this._last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - this._last) / 1000, 1 / 20);
      this._last = now;
      const moving = this._step(dt);
      if (this._onFrame) this._onFrame(this.snapshot());
      this._raf = moving ? requestAnimationFrame(tick) : null;
    };
    this._raf = requestAnimationFrame(tick);
  }

  snapshot() {
    const out = {};
    for (const [name, s] of this.springs) out[name] = s.position;
    return out;
  }

  onFrame(cb) {
    this._onFrame = cb;
    return this;
  }
}
