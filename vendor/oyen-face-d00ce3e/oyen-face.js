// Oyen's face: the Oyenza mark (Oyen's head) with eyes that change mood, in the logo's flat style.
// The head, the folded ear and the eye positions are the mark's own geometry; only the eyes and the folded ear move.
// Every mood is a pure function of time t (seconds), so a frame can be drawn, recorded or scrubbed exactly.
//   import { faceSVG, MOODS } from './oyen-face.js';  faceSVG('happy', 0.4)  ->  '<svg ...>'
//   <oyen-face mood="love" size="128"></oyen-face>   (after defineOyenFace())
import { BODY, FLAP } from './mark-data.js';

const ORANGE = '#F0892E', FOLD = '#C9581A', INK = '#171717', PINK = '#FF4F8B', WHITE = '#FFFFFF';
const A = 52, B = A / 1.35;
const EYE = { x: 18.2, y: 6.163, r: 6.76 };
const P1 = [-19.4376, -51.0062], P2 = [-42.8636, -36.3076];      // the crease (geometry.json)
const APEX = [-0.66 * A, -1.78 * B];                               // the left ear's tip before the fold

// one loop per mood (seconds); the 2D and 3D sets share these
export const MOODS = {
  oyen: 2.4, hello: 1.6, happy: 1.2, love: 1.2, wink: 1.6, wow: 1.6,
  sly: 2.0, think: 2.0, look: 2.4, sad: 2.0, sleep: 2.4, tercatat: 1.6,
};

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const back = (x, s = 1.7) => { x = clamp(x) - 1; return x * x * ((s + 1) * x + s) + 1; };   // overshoot
const pulse = (t, at, len) => (t >= at && t < at + len ? Math.sin(Math.PI * (t - at) / len) : 0);
const f = (n) => (Math.round(n * 100) / 100).toString();
// The whole head's transform keeps four decimals: at two, a 1.2% breath has only three sizes and steps instead of gliding.
const f4 = (n) => (Math.round(n * 1e4) / 1e4).toString();

function roundedPoly(pts, radii, seg = 8) {
  const out = []; const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], r = radii[i];
    if (!r) { out.push(p); continue; }
    let ux = a[0] - p[0], uy = a[1] - p[1]; const lu = Math.hypot(ux, uy); ux /= lu; uy /= lu;
    let vx = b[0] - p[0], vy = b[1] - p[1]; const lv = Math.hypot(vx, vy); vx /= lv; vy /= lv;
    const ang = Math.acos(clamp(ux * vx + uy * vy, -1, 1));
    let t = Math.min(r / Math.tan(ang / 2), 0.48 * Math.min(lu, lv)); const rr = t * Math.tan(ang / 2);
    let bx = ux + vx, by = uy + vy; const lb = Math.hypot(bx, by); bx /= lb; by /= lb;
    const dc = rr / Math.sin(ang / 2), cx = p[0] + bx * dc, cy = p[1] + by * dc;
    const p1 = [p[0] + ux * t, p[1] + uy * t], p2 = [p[0] + vx * t, p[1] + vy * t];
    let a1 = Math.atan2(p1[1] - cy, p1[0] - cx), a2 = Math.atan2(p2[1] - cy, p2[0] - cx), da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= seg; k++) out.push([cx + rr * Math.cos(a1 + da * k / seg), cy + rr * Math.sin(a1 + da * k / seg)]);
  }
  return out;
}
const polyD = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

// The folded ear: the tip turns about the crease. fold = 1 is the logo (folded flat), 0 is upright.
const TIP = roundedPoly([lerp(P1, [-0.12 * A, -0.92 * B], 0.07), APEX, lerp(P2, [-0.97 * A, -0.2 * B], 0.07)], [2.5, 6, 2.5]);
function flap(fold) {
  if (fold >= 0.999) return { d: FLAP, fill: FOLD };
  const c = Math.cos(Math.PI * fold);
  const dx = P2[0] - P1[0], dy = P2[1] - P1[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const pts = TIP.map(([x, y]) => {
    const s = (x - P1[0]) * ux + (y - P1[1]) * uy, fx = P1[0] + ux * s, fy = P1[1] + uy * s;
    return [fx + (x - fx) * c, fy + (y - fy) * c];
  });
  return { d: polyD(pts), fill: c >= 0 ? ORANGE : FOLD };
}

// ---------------------------------------------------------------- eye shapes (mark units)
const dot = (cx, cy, r, sy = 1, fill = INK) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy + r * (1 - sy) * 0.15)}" rx="${f(r)}" ry="${f(Math.max(0.35, r * sy))}" fill="${fill}"/>`;
const arc = (cx, cy, r, up = true, w = 0.5) => {
  const y0 = cy + (up ? r * 0.3 : -r * 0.2), yc = cy + (up ? -r * 0.95 : r * 0.8);
  return `<path d="M${f(cx - r)} ${f(y0)}Q${f(cx)} ${f(yc)} ${f(cx + r)} ${f(y0)}" fill="none" stroke="${INK}" stroke-width="${f(r * w)}" stroke-linecap="round"/>`;
};
const heart = (cx, cy, s, fill = PINK) => {
  const pts = [];
  for (let k = 0; k < 48; k++) {
    const t = 2 * Math.PI * k / 48;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([cx + x / 17 * s, cy - (y + 2) / 17 * s]);
  }
  return `<path d="${polyD(pts)}" fill="${fill}"/>`;
};
const sparkle = (cx, cy, s, fill = INK) => {
  const q = s * 0.22;
  return `<path d="M${f(cx)} ${f(cy - s)}Q${f(cx + q)} ${f(cy - q)} ${f(cx + s)} ${f(cy)}Q${f(cx + q)} ${f(cy + q)} ${f(cx)} ${f(cy + s)}Q${f(cx - q)} ${f(cy + q)} ${f(cx - s)} ${f(cy)}Q${f(cx - q)} ${f(cy - q)} ${f(cx)} ${f(cy - s)}Z" fill="${fill}"/>`;
};
const zee = (x, y, s, op) =>
  `<path d="M${f(x)} ${f(y)}h${f(s)}l${f(-s)} ${f(s)}h${f(s)}" fill="none" stroke="${INK}" stroke-width="${f(s * 0.28)}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(op)}"/>`;
const check = (x, y, s, k) => {
  const len = 2.2 * s;
  return `<path d="M${f(x - s)} ${f(y)}l${f(s * 0.7)} ${f(s * 0.7)}l${f(s * 1.5)} ${f(-s * 1.5)}" fill="none" stroke="#1E9E4A" stroke-width="${f(s * 0.42)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${f(len * 1.6)}" stroke-dashoffset="${f(len * 1.6 * (1 - k))}"/>`;
};

// ---------------------------------------------------------------- moods: (t) -> { eyes, extra, fold, head }
function blink(t, at, len = 0.16) {
  const x = (t - at) / len;
  return x < 0 || x > 1 ? 1 : 1 - Math.sin(Math.PI * x) * 0.94;
}
const L = -EYE.x, R = EYE.x, Y = EYE.y, r = EYE.r;

const MOOD = {
  oyen(t) {                                   // idle: one blink, a tiny ear flick
    const s = blink(t, 1.7);
    return { eyes: dot(L, Y, r, s) + dot(R, Y, r, s), fold: 1 - 0.12 * pulse(t, 0.6, 0.35) };
  },
  hello(t) {                                  // the folded ear waves: up, and folds back down
    const up = t < 0.75 ? back(t / 0.45, 1.2) : 1 - ease((t - 0.75) / 0.45);
    const s = blink(t, 1.3, 0.14);
    return { eyes: arc(L, Y, r, true) + arc(R, Y, r, true), fold: 1 - 0.92 * clamp(up), tilt: -4 * Math.sin(Math.PI * clamp(t / 1.2)), s };
  },
  happy(t) {
    const b = Math.abs(Math.sin(Math.PI * t / 0.6));
    return { eyes: arc(L, Y, r) + arc(R, Y, r), bounce: b };
  },
  love(t) {
    const k = 1 + 0.12 * Math.max(0, Math.sin(2 * Math.PI * t / 0.6));
    return { eyes: heart(L, Y + 1, r * 1.3 * k) + heart(R, Y + 1, r * 1.3 * k), bounce: 0.35 * Math.abs(Math.sin(Math.PI * t / 0.6)) };
  },
  wink(t) {
    const w = t > 0.25 && t < 1.15;
    const k = ease((t - 0.3) / 0.25) * (1 - ease((t - 1.0) / 0.3));
    return {
      eyes: dot(L, Y, r) + (w ? arc(R, Y, r) : dot(R, Y, r, blink(t, 0.12, 0.14))),
      extra: k > 0 ? sparkle(R + r * 2.3, Y - r * 2.2, 5.5 * k) : '', tilt: 3 * k,
    };
  },
  wow(t) {
    const g = back(t / 0.35, 2.2), s = 1 + 0.32 * g;
    const hl = (x) => `<circle cx="${f(x - r * 0.38 * s)}" cy="${f(Y - r * 0.4 * s)}" r="${f(r * 0.26 * s)}" fill="${WHITE}"/>`;
    return { eyes: dot(L, Y, r * s) + dot(R, Y, r * s) + hl(L) + hl(R), bounce: 0.6 * pulse(t, 0, 0.35), fold: 1 - 0.5 * pulse(t, 0.05, 0.5) };
  },
  sly(t) {                                    // half-lidded, slanted lids, eyes slide to one side and back
    const dx = 3.2 * ease(t / 0.4) * (1 - ease((t - 1.4) / 0.4));
    const lid = (cx, side) => {
      const id = 'lid' + side, ang = side === 'r' ? -10 : 10;
      return `<clipPath id="${id}"><rect x="${f(cx - r - 3)}" y="${f(Y - r * 0.08)}" width="${f(2 * r + 6)}" height="${f(2 * r)}" transform="rotate(${ang} ${f(cx)} ${f(Y)})"/></clipPath>` +
        `<g clip-path="url(#${id})">${dot(cx + dx, Y, r)}</g>`;
    };
    return { eyes: lid(L, 'l') + lid(R, 'r'), tilt: -2 * ease(t / 0.4) * (1 - ease((t - 1.4) / 0.4)) };
  },
  think(t) {                                  // eyes up and to the right, three dots appear by the ear
    const dx = 2.2, dy = -2.6;
    const dots = [0, 1, 2].map((i) => {
      const k = ease((t - 0.25 - i * 0.28) / 0.2) * (1 - ease((t - 1.6) / 0.3));
      return `<circle cx="${f(-6 + i * 9)}" cy="${f(-50)}" r="${f(3.4 * k)}" fill="${INK}"/>`;
    }).join('');
    const s = blink(t, 1.75, 0.14);
    return { eyes: dot(L + dx, Y + dy, r * 0.92, s) + dot(R + dx, Y + dy, r * 0.92, s), extra: dots };
  },
  look(t) {                                   // looks left, right, back to you
    const x = t < 0.8 ? -4 * ease(t / 0.25) : t < 1.6 ? -4 + 8 * ease((t - 0.8) / 0.3) : 4 - 4 * ease((t - 1.6) / 0.3);
    const s = blink(t, 2.1, 0.14);
    return { eyes: dot(L + x, Y, r, s) + dot(R + x, Y, r, s), tilt: x * 0.5 };
  },
  sad(t) {                                    // droopy domes, inner corners up, one tear
    const k = ease(t / 0.5);
    const drop = (cx, side) => {
      const ang = (side === 'l' ? -14 : 14) * k;
      return `<path d="M${f(cx - r)} ${f(Y - 1)}A${f(r)} ${f(r * 0.85)} 0 0 0 ${f(cx + r)} ${f(Y - 1)}Z" fill="${INK}" transform="rotate(${f(ang)} ${f(cx)} ${f(Y)})"/>`;
    };
    const ty = Y + r * 0.9 + 9 * ease((t - 0.6) / 1.0), top = 1 - ease((t - 1.5) / 0.4);
    const tear = t > 0.6 ? `<path d="M${f(R + r * 0.6)} ${f(ty - 3.2)}Q${f(R + r * 0.6 + 2.2)} ${f(ty)} ${f(R + r * 0.6)} ${f(ty + 1.6)}Q${f(R + r * 0.6 - 2.2)} ${f(ty)} ${f(R + r * 0.6)} ${f(ty - 3.2)}Z" fill="#7FB8FF" opacity="${f(top)}"/>` : '';
    return { eyes: drop(L, 'l') + drop(R, 'r') + tear, sink: 2 * k };
  },
  sleep(t) {
    const zz = [0, 1].map((i) => {
      const k = ((t / 2.4 + i * 0.5) % 1);
      return zee(20 + i * 12 + k * 6, -44 - i * 10 - k * 8, 9 - i * 2.5, Math.sin(Math.PI * k));
    }).join('');
    return { eyes: arc(L, Y, r * 0.95, false, 0.42) + arc(R, Y, r * 0.95, false, 0.42), extra: zz, breathe: Math.sin(2 * Math.PI * t / 2.4) };
  },
  tercatat(t) {                               // logged: the ear flips up and snaps down like a page corner, a check
    const up = t < 0.35 ? easeOut(t / 0.35) : 1 - back((t - 0.35) / 0.3, 2.4);
    const k = ease((t - 0.62) / 0.3) * (1 - ease((t - 1.35) / 0.25));
    return { eyes: arc(L, Y, r) + arc(R, Y, r), fold: 1 - 0.85 * clamp(up, 0, 1.2), extra: check(0, -48, 6.5, k), bounce: 0.7 * pulse(t, 0.62, 0.3) };
  },
};

// ---------------------------------------------------------------- assemble
export function faceSVG(mood = 'oyen', t = 0, { size = 256, bg = null } = {}) {
  const fn = MOOD[mood] || MOOD.oyen;
  const m = fn(((t % MOODS[mood]) + MOODS[mood]) % MOODS[mood]);
  const fold = m.fold == null ? 1 : m.fold;
  const fl = flap(fold);
  const bounce = m.bounce || 0, tilt = m.tilt || 0, sink = m.sink || 0, br = m.breathe || 0;
  const sy = 1 - 0.035 * bounce + 0.012 * br, sx = 1 + 0.03 * bounce;
  const lift = -5 * bounce + sink;
  // pivot at the chin so squash and tilt read like a soft toy
  const tf = `translate(0 ${f4(38.5 + lift)}) rotate(${f4(tilt)}) scale(${f4(sx)} ${f4(sy)}) translate(0 -38.5)`;
  const flapAbove = fold < 0.5;               // an upright tip sits behind nothing; a folded one lies on the ear
  const vb = '-64 -84 128 128';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}">` +
    (bg ? `<rect x="-64" y="-84" width="128" height="128" fill="${bg}"/>` : '') +
    `<g transform="${tf}">` +
    (flapAbove ? `<path d="${fl.d}" fill="${fl.fill}"/>` : '') +
    `<path d="${BODY}" fill="${ORANGE}"/>` +
    (flapAbove ? '' : `<path d="${fl.d}" fill="${fl.fill}"/>`) +
    m.eyes + (m.extra || '') + `</g></svg>`;
}

export function defineOyenFace(tag = 'oyen-face') {
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    static get observedAttributes() { return ['mood', 'size']; }
    connectedCallback() {
      this.t0 = performance.now();
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const tick = (now) => {
        const mood = this.getAttribute('mood') || 'oyen', size = +this.getAttribute('size') || 128;
        this.innerHTML = faceSVG(mood, reduce ? 0 : (now - this.t0) / 1000, { size });
        if (!reduce) this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
    disconnectedCallback() { cancelAnimationFrame(this.raf); }
    attributeChangedCallback() { this.t0 = performance.now(); }
  });
}

// The logo itself with the folded ear at any angle: fold 0 = the tip upright, 1 = the logo (folded flat).
export function markSVG(fold = 1, { size = 256 } = {}) {
  const fl = flap(fold), above = fold < 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -84 128 128" width="${size}" height="${size}">` +
    (above ? `<path d="${fl.d}" fill="${fl.fill}"/>` : '') + `<path d="${BODY}" fill="${ORANGE}"/>` +
    (above ? '' : `<path d="${fl.d}" fill="${fl.fill}"/>`) + dot(L, Y, r) + dot(R, Y, r) + `</svg>`;
}
