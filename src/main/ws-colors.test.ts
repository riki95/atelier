import { expect, test } from 'vitest';
import { resolveHex } from '@shared/theme-resolve';
import { THEMES } from '@shared/themes';
import { PROJECT_COLOR_COUNT } from '@shared/project-color';
import { THEME_BLOCKS } from './theme-chrome';
import { LOOK_TOKENS } from './remote/look';

// The workspace colors (`--ws-1…12`) tell windows, workspaces and activities apart: in every theme, every pair must
// stay far enough apart to be told at a glance. Distances are CIEDE2000 between the plain colors: under 10 two colors
// read as one, over 20 they part without effort. Ink mutes its colors on purpose, so its floor is lower.
const FLOOR: Record<string, number> = { ink: 10 };
const floorOf = (id: string, appearance: string) => FLOOR[id] ?? (appearance === 'light' ? 18 : 19);

function lab(hex: string): [number, number, number] {
  const lin = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = lin as [number, number, number];
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function de2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180, C1 = Math.hypot(a1!, b1!), C2 = Math.hypot(a2!, b2!), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))), a1p = a1! * (1 + G), a2p = a2! * (1 + G);
  const C1p = Math.hypot(a1p, b1!), C2p = Math.hypot(a2p, b2!);
  const h1p = (Math.atan2(b1!, a1p) / rad + 360) % 360, h2p = (Math.atan2(b2!, a2p) / rad + 360) % 360;
  let dh = 0;
  if (C1p * C2p) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dL = L2! - L1!, dC = C2p - C1p, dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad), Lb = (L1! + L2!) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p) { hb = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2; if (hb >= 360) hb -= 360; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T, Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

const colorsOf = (id: string) => Array.from({ length: PROJECT_COLOR_COUNT }, (_, i) => resolveHex(THEME_BLOCKS, id, `--ws-${i + 1}`));

test('there are twelve workspace colors, and phones get all of them', () => {
  expect(PROJECT_COLOR_COUNT).toBe(12);
  expect(LOOK_TOKENS).toEqual(expect.arrayContaining(Array.from({ length: 12 }, (_, i) => `ws-${i + 1}`)));
  expect(LOOK_TOKENS).not.toContain('ws-13');
});

test.each(THEMES.map((t) => [t.id, t.appearance] as const))('%s defines twelve opaque workspace colors, each pair easy to tell apart', (id, appearance) => {
  const colors = colorsOf(id);
  for (const c of colors) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  const close: string[] = [];
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
    const d = de2000(lab(colors[i]!), lab(colors[j]!));
    if (d < floorOf(id, appearance)) close.push(`--ws-${i + 1}/--ws-${j + 1} ${d.toFixed(1)}`);
  }
  expect(close, `pairs too close in ${id}`).toEqual([]);
});
