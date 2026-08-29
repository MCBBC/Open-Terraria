// IIII43 一次性仪②：Sand_Patches 槽 JS↔x86 沙团几何对位诊断。
// 用法：cd game && SW_I43B=1 npx vitest run tools/_i43b.test.ts
// （读 G2=/tmp/iii45-out/x86-remix 的 003_Sand_Patches.{typ,act} 与同种子 JS 管线捕获态）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I43B === '1';
const G2 = process.env.SW_I43B_G2 ?? '/tmp/iii45-out/x86-remix';
const DUMP = process.env.SW_I43B_DUMP ?? '003_Sand_Patches';
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Cl { cx: number; cy: number; x0: number; x1: number; y0: number; y1: number; n: number }

function clusters(mask: Uint8Array, minN = 400): Cl[] {
  const seen = new Uint8Array(W * H);
  const out: Cl[] = [];
  const q = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    let head = 0, tail = 0; q[tail++] = s; seen[s] = 1;
    let n = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (head < tail) {
      const p = q[head++]; const px = p % W, py = (p / W) | 0;
      n++; sx += px; sy += py;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (const d of [-1, 1, -W, W]) {
        const t = p + d; if (t < 0 || t >= W * H || seen[t] || !mask[t]) continue;
        seen[t] = 1; q[tail++] = t;
      }
    }
    if (n >= minN) out.push({ cx: sx / n, cy: sy / n, x0, x1, y0, y1, n });
  }
  return out.sort((a, b) => b.n - a.n);
}

(RUN ? it : it.skip)('i43b sand geometry', async () => {
  // x86 侧
  const xb = readFileSync(`${G2}/${DUMP}.typ`);
  const xt = new Uint16Array(xb.buffer, xb.byteOffset, xb.length >> 1);
  const xa = readFileSync(`${G2}/${DUMP}.act`);
  const vSand = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (xa[i] && xt[i] === 53) vSand[i] = 1;
  const vc = clusters(vSand);
  console.log(`x86 ${DUMP}: sand=${vSand.reduce((a, b) => a + b, 0)} clusters≥400=${vc.length}`);
  for (const c of vc.slice(0, 20)) console.log(`  V (${c.cx.toFixed(0)},${c.cy.toFixed(0)}) n=${c.n} box=[${c.x0},${c.y0}..${c.x1},${c.y1}]`);

  // JS 侧：reseed 钩捕 Tunnels 前态
  let captured = false;
  let cur: { flags: Uint8Array; type: Uint16Array } | null = null;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (cur && !captured) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_i43b')) {
          if (labelOf(m[1], Number(m[2])) === 'Tunnels') {
            captured = true;
            const st = cur!;
            const jSand = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) {
              if ((st.flags[i] & 1) === 0) continue;
              const sh = SHEET[st.type[i]];
              if (sh === 53) jSand[i] = 1;
            }
            const jc = clusters(jSand);
            console.log(`JS  pre-Tunnels  : sand=${jSand.reduce((a, b) => a + b, 0)} clusters≥400=${jc.length}`);
            for (const c of jc.slice(0, 20)) console.log(`  J (${c.cx.toFixed(0)},${c.cy.toFixed(0)}) n=${c.n} box=[${c.x0},${c.y0}..${c.x1},${c.y1}]`);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '1138154190', evil: 0, seedFlags: { remix: true },
      onWorldPartial: (w) => { if (!cur) cur = w.store as never as { flags: Uint8Array; type: Uint16Array }; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!captured) throw new Error('Tunnels label not captured');
}, 900_000);
