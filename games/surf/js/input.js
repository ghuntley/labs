// Keyboard, mouse and touch -> lane changes and pause.
//   ←/→ or A/D: move one lane     mouse: hover over a third of the screen
//   touch: swipe left/right, or tap the left/right half    P / Esc: pause

export function attachInput(target, { move, setLane, pause }) {
  let mouseActive = false;

  const onKey = (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': move(-1); break;
      case 'ArrowRight': case 'KeyD': move(1); break;
      case 'KeyP': case 'Escape': pause(); break;
      default: return;
    }
    mouseActive = false;
    e.preventDefault();
  };

  const onMouse = (e) => {
    if (e.pointerType !== 'mouse') return;
    // Only steer by mouse once it actually moves, so keys keep working.
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0) mouseActive = true;
    if (!mouseActive) return;
    const w = target.clientWidth || window.innerWidth;
    setLane(Math.max(0, Math.min(2, Math.floor((e.clientX / w) * 3))));
  };

  let touch = null;
  const onDown = (e) => {
    if (e.pointerType === 'mouse') return;
    touch = { x: e.clientX, y: e.clientY, at: performance.now() };
  };
  const onUp = (e) => {
    if (e.pointerType === 'mouse' || !touch) return;
    const dx = e.clientX - touch.x;
    const w = target.clientWidth || window.innerWidth;
    if (Math.abs(dx) > 30) move(Math.sign(dx));
    else move(e.clientX < w / 2 ? -1 : 1);
    touch = null;
    e.preventDefault();
  };

  window.addEventListener('keydown', onKey);
  target.addEventListener('pointermove', onMouse);
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointerup', onUp);
  return () => {
    window.removeEventListener('keydown', onKey);
    target.removeEventListener('pointermove', onMouse);
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointerup', onUp);
  };
}
