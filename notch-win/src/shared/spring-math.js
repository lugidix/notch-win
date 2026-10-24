// Swift-math → spring physics, ported 1:1 from SwiftUI semantics.
// SwiftUI: .spring(response: R, dampingFraction: Z, blendDuration: 0)
// maps to a unit-mass damped oscillator with:
//   omega  = 2*PI / R
//   stiffness k = omega^2
//   damping   c = 2 * Z * omega
// Fidelity sources: docs/SPEC-fidelite-boring-notch.md §3 (ContentView.swift:41,123-124).

export const OPEN_SPRING = { response: 0.42, dampingFraction: 0.8 }; // notch open
export const CLOSE_SPRING = { response: 0.45, dampingFraction: 1.0 }; // notch close
export const INTERACTIVE_SPRING = { response: 0.38, dampingFraction: 0.8 }; // hover/click/gesture
export const VIEW_TRANSITION = { response: 0.35, dampingFraction: 1.0 }; // .smooth(duration: 0.35)
export const SLIDER_SPRING = { response: 0.35, dampingFraction: 0.7 }; // slider drag height
export const HOVER_SPRING = { response: 0.3, dampingFraction: 1.0 }; // .smooth(duration: 0.3)

export function springFromSwift({ response, dampingFraction }) {
  const omega = (2 * Math.PI) / response;
  return {
    stiffness: omega * omega,
    damping: 2 * dampingFraction * omega,
  };
}

// One semi-implicit Euler step (substep for stability at high stiffness).
export function stepSpring(state, target, { stiffness, damping }, dt) {
  const MAX_STEP = 1 / 240;
  let { position, velocity } = state;
  let remaining = Math.min(dt, 1 / 20);
  while (remaining > 1e-9) {
    const h = Math.min(MAX_STEP, remaining);
    const force = -stiffness * (position - target) - damping * velocity;
    velocity += force * h;
    position += velocity * h;
    remaining -= h;
  }
  return { position, velocity };
}

// Simulate to time t (seconds) with fixed 240 Hz integration; returns samples.
export function simulate(state0, target, params, t) {
  const h = 1 / 240;
  const steps = Math.max(1, Math.round(t / h));
  let state = { ...state0 };
  for (let i = 0; i < steps; i++) state = stepSpring(state, target, params, h);
  return state;
}
