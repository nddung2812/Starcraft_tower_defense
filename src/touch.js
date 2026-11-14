/*
 * Two-finger camera for touch screens: pinch to zoom, twist to rotate.
 *
 * One finger is left to the ordinary pointer handlers (drag to pan, tap to select, and with
 * units selected a tap is their order: see touchOrder in main.js). As soon as a second finger
 * lands this takes over: it ends the pan the first finger started and swallows both fingers'
 * events until one lifts, so a pinch can never be read as a tap or a build.
 */
export function installTouch(canvas, stage, { cancelDrag }) {
  const fingers = new Map();
  const state = { used: false, pinching: false };
  let last = null;

  const measure = () => {
    const [a, b] = [...fingers.values()];
    return { gap: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  const down = (ev) => {
    if (ev.pointerType !== 'touch') return;
    state.used = true;
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (fingers.size < 2) return;
    ev.stopImmediatePropagation();
    if (fingers.size === 2) {
      cancelDrag();
      state.pinching = true;
      last = measure();
    }
  };

  const move = (ev) => {
    if (ev.pointerType !== 'touch' || !fingers.has(ev.pointerId)) return;
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!state.pinching) return;
    ev.stopImmediatePropagation();
    if (fingers.size < 2) return;
    const now = measure();
    // Fingers apart brings the camera in. Ignore a near-zero gap: its ratio is noise.
    if (last.gap > 12 && now.gap > 12) stage.zoomBy(last.gap / now.gap);
    let turn = now.angle - last.angle;
    if (turn > Math.PI) turn -= Math.PI * 2;
    else if (turn < -Math.PI) turn += Math.PI * 2;
    stage.spin(-turn);                 // the ground turns with the fingers
    stage.updateCamera();
    last = now;
  };

  const up = (ev) => {
    if (ev.pointerType !== 'touch' || !fingers.delete(ev.pointerId)) return;
    if (!state.pinching) return;
    ev.stopImmediatePropagation();     // the lifted finger was part of the pinch, not a tap
    if (!fingers.size) state.pinching = false;
    else if (fingers.size >= 2) last = measure();
  };

  for (const [type, handler] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]]) {
    canvas.addEventListener(type, handler, { capture: true });
  }
  return state;
}

/** A phone or tablet, or anything that has actually been touched this session. */
export function touchScreen(state) {
  return !!state?.used || !!window.matchMedia?.('(pointer: coarse)').matches;
}
