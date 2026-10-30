// Sheets that come up from the bottom of a phone: the map, same count, search, Aa and the install guide. A sheet
// follows the finger from its header, a flick throws it closed, and letting go early springs it back. Every motion
// is a critically damped spring that starts from where the sheet is and how fast it is moving, so a sheet can be
// caught mid-flight (Apple's sheet values: no overshoot, about 0.35 s). On wider screens the sheets stay panels and
// none of this runs.

const PHONE = matchMedia('(max-width: 759px)');
const NO_DRAG = 'button, input, select, textarea, a, label, [data-nodrag]';

// x(t) = (A + B t) e^(-wt): the spring with no overshoot, solved exactly, so a frame never depends on the one before.
function spring(from, to, velocity, response, onUpdate, onDone) {
  const w = (2 * Math.PI) / response;
  const A = from - to;
  const B = velocity + w * A;
  const t0 = performance.now();
  let frame = 0;
  const step = (now) => {
    const t = (now - t0) / 1000;
    const e = Math.exp(-w * t);
    const x = (A + B * t) * e;
    const v = (B - w * (A + B * t)) * e;
    if (Math.abs(x) < 0.5 && Math.abs(v) < 8) { onUpdate(to, 0); onDone?.(); return; }
    onUpdate(to + x, v);
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
// Where a flick would come to rest, as a scroll view decelerates (Apple's projection).
const project = (velocity, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);
// Past the open position the sheet resists more the further it is pulled.
const rubber = (over, size) => (over * size * 0.55) / (size + 0.55 * Math.abs(over));

export function createSheets({ reduced }) {
  const scrim = document.getElementById('scrim');
  const sheets = new Map(); // id -> {node, close, y, stop, own}
  let scrimFor = null;

  const setY = (s, y) => { s.y = y; s.node.style.transform = y ? `translate3d(0, ${y}px, 0)` : ''; };
  const height = (s) => s.node.getBoundingClientRect().height || innerHeight;
  const showScrim = (s, on) => {
    if (on) { scrimFor = s; scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('on')); }
    else if (scrimFor === s) {
      // Another sheet still up under this one (Aa over the map) keeps the scrim.
      const under = [...sheets.values()].find((x) => x !== s && !x.node.hidden && !x.leaving);
      if (under && PHONE.matches) { scrimFor = under; return; }
      scrimFor = null;
      scrim.classList.remove('on');
      setTimeout(() => { if (!scrimFor) scrim.hidden = true; }, 240);
    }
  };
  const quick = () => reduced.matches || !PHONE.matches;

  // Comes up from below the screen (or simply appears with Reduce Motion, or on a wide screen). A sheet that moves
  // itself in and out (slide: false) only gets the scrim, if it wants one.
  function present(s) {
    s.stop?.();
    if (PHONE.matches && s.scrim) showScrim(s, true);
    if (quick() || !s.slide) { setY(s, 0); return; }
    setY(s, height(s));
    s.stop = spring(s.y, 0, 0, 0.36, (y) => setY(s, y));
  }
  // Goes back down at the speed it was thrown, then the sheet's own close runs.
  function dismiss(s, velocity = 0) {
    s.stop?.();
    showScrim(s, false);
    if (quick() || (!s.slide && !s.y)) { setY(s, 0); s.close(); return; }
    // Dragged down, a sheet that moves itself is closed at once and held off the screen until it is hidden.
    if (!s.slide) { setY(s, height(s) + 12); s.holding = true; s.close(); return; }
    s.leaving = true;
    s.stop = spring(s.y, height(s) + 12, Math.max(velocity, 0), 0.32, (y) => setY(s, y), () => { s.leaving = false; s.close(); setY(s, 0); });
  }

  function drag(s, handle) {
    let start = null;
    handle.addEventListener('pointerdown', (e) => {
      if (!PHONE.matches || e.button !== 0 || e.target.closest(NO_DRAG) || s.leaving) return;
      s.stop?.();
      start = { y: e.clientY, from: s.y, id: e.pointerId, moved: false, trail: [[e.timeStamp, e.clientY]] };
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      // A few pixels first, so a tap on the header stays a tap.
      if (!start.moved) {
        if (Math.abs(dy) < 8) return;
        start.moved = true;
        handle.setPointerCapture(e.pointerId);
      }
      const y = start.from + dy;
      setY(s, y >= 0 ? y : rubber(y, height(s)));
      start.trail.push([e.timeStamp, e.clientY]);
      if (start.trail.length > 6) start.trail.shift();
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const was = start;
      start = null;
      if (!was.moved) return;
      const [t0, y0] = was.trail[0];
      const [t1, y1] = was.trail[was.trail.length - 1];
      const velocity = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0;
      // Decided by where the flick would carry it, not only where the finger let go.
      if (s.y + project(velocity) > height(s) * 0.4 || velocity > 1100) dismiss(s, velocity);
      else s.stop = spring(s.y, 0, velocity, 0.36, (y) => setY(s, y));
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // A sheet another module opens and closes by its `hidden` (map.js, same-count.js, search-sheet.js): it comes up when
  // it is shown; a drag down or its × takes it down first and then presses its own close button.
  // Options: scrim (default true) dims the page behind it; slide (default true) lets this module move it in and out
  // (false for a sheet that animates itself; a drag still closes it); onShow runs each time it comes up.
  function adopt(id, { handle, closeButton, scrim = true, slide = true, onShow }) {
    const node = document.getElementById(id);
    const s = { node, y: 0, stop: null, own: false, leaving: false, scrim, slide, close: () => { s.passing = true; document.getElementById(closeButton).click(); s.passing = false; } };
    sheets.set(id, s);
    new MutationObserver(() => {
      if (!node.hidden) { if (!s.shown) { s.shown = true; present(s); onShow?.(); } }
      else if (s.shown) { s.shown = false; s.holding = false; s.stop?.(); setY(s, 0); showScrim(s, false); }
    }).observe(node, { attributes: true, attributeFilter: ['hidden'] });
    document.getElementById(closeButton).addEventListener('click', (e) => {
      if (s.passing || !PHONE.matches || quick() || s.leaving || !s.slide) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      dismiss(s);
    }, true);
    drag(s, node.querySelector(handle));
  }

  // A sheet of this page's own (Aa, the install guide): opened and closed only through here.
  function own(id, { handle, onClose }) {
    const node = document.getElementById(id);
    const s = { node, y: 0, stop: null, own: true, leaving: false, scrim: true, slide: true, close: () => { node.hidden = true; onClose?.(); } };
    sheets.set(id, s);
    drag(s, node.querySelector(handle));
  }

  function open(id) {
    const s = sheets.get(id);
    if (!s.own || !s.node.hidden) return;
    s.node.hidden = false;
    present(s);
  }
  function close(id) {
    const s = sheets.get(id);
    if (!s || s.node.hidden || s.leaving) return;
    if (s.own) dismiss(s);
    else document.getElementById(s.node.id === 'map' ? 'map-close' : s.node.id === 'same' ? 'same-close' : 'search-close').click();
  }
  scrim.addEventListener('click', () => { if (scrimFor) close(scrimFor.node.id); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const [id, s] of sheets) if (s.own && !s.node.hidden) close(id); });
  const anyOpen = () => [...sheets.values()].some((s) => !s.node.hidden);
  return { adopt, own, open, close, anyOpen };
}

// Back by a swipe from the left edge, for the installed iPhone app, which has no browser back button. The page
// follows the finger; let go past a third of the screen, or with a flick, and it slides off and goes back.
export function edgeBack({ target, canStart, onBack, reduced }) {
  let g = null;
  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.touches[0].clientX > 22 || !canStart()) return;
    g = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false, trail: [[e.timeStamp, e.touches[0].clientX]] };
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!g) return;
    const dx = e.touches[0].clientX - g.x;
    const dy = e.touches[0].clientY - g.y;
    if (!g.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > dx) { g = null; return; }
      if (dx < 10) return;
      g.on = true;
      target().style.willChange = 'transform';
      target().classList.add('swiping');
    }
    e.preventDefault();
    g.dx = Math.max(0, dx);
    target().style.transform = `translate3d(${g.dx}px, 0, 0)`;
    g.trail.push([e.timeStamp, e.touches[0].clientX]);
    if (g.trail.length > 6) g.trail.shift();
  }, { passive: false });
  const end = () => {
    if (!g) return;
    const was = g;
    g = null;
    if (!was.on) return;
    const node = target();
    const [t0, x0] = was.trail[0];
    const [t1, x1] = was.trail[was.trail.length - 1];
    const velocity = t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0;
    const done = () => { node.style.transform = ''; node.style.willChange = ''; node.classList.remove('swiping'); };
    if (was.dx + project(velocity) > innerWidth / 3 || velocity > 700) {
      if (reduced.matches) { done(); onBack(); return; }
      spring(was.dx, innerWidth, velocity, 0.3, (x) => { node.style.transform = `translate3d(${x}px, 0, 0)`; }, () => { onBack(); done(); });
    } else spring(was.dx, 0, velocity, 0.36, (x) => { node.style.transform = x ? `translate3d(${x}px, 0, 0)` : ''; }, done);
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
}
