// IIII186 批一次性取证仪③（源=_iii186win 范式克隆改锚）：REMIX #71 Pots 窗。
// 窗=瓦罐槽头 reseed（'快清理' 槽 onWorldPartial 后下一 reseed）开 → '瓦罐' 槽闭。
// 产出 js-win71.txt / js-win71-sites.txt / js-reseeds71.txt。
// 用法：cd game && SW_I186POTS=1 SW_I186_OUT=/tmp/iii186-out npx vitest run tools/_iii186pots.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I186POTS === '1';
const OUT = process.env.SW_I186_OUT ?? '/tmp/iii186-out';
const SEED = process.env.SW_I186_SEED ?? '1138154190';
const OPEN_AFTER = process.env.SW_I186POTS_OPEN ?? '快清理';
const CLOSE_AFTER = process.env.SW_I186POTS_CLOSE ?? '瓦罐';
const TAG = process.env.SW_I186POTS_TAG ?? '71';

(RUN ? it : it.skip)('iii186 remix Pots window value stream', { timeout: 900_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  mkdirSync(OUT, { recursive: true });
  const vals: number[] = [];
  const sites: string[] = [];
  let ln = 0;
  let gln = 0;
  let pendingOpen = false;
  let opened = false;
  let closed = false;
  const siteOf = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    let n = 0;
    const out: string[] = [];
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii186')) {
        out.push(`${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`);
        if (++n >= 2) break;
      }
    }
    return out.join(' | ');
  };

  RNGp.reseed = function (this: unknown, s: number) {
    if (pendingOpen && !opened) {
      opened = true; pendingOpen = false; ln = 0;
      vals.length = 0; sites.length = 0;
      vals.push(-1); sites.push(`---RESEED${TAG}`);
      console.log(`[I186P] window opened gln=${gln}`);
    }
    return oReseed.call(this, s);
  };

  g.__swOnRoll = (v: number, inst?: object) => {
    gln++;
    if (opened && !closed) {
      ln++;
      vals.push(v);
      sites.push(siteOf());
    }
    oRoll?.(v, inst);
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { remix: true },
      onWorldPartial: (_w2, i, name) => {
        if (name === OPEN_AFTER && !pendingOpen && !opened) {
          pendingOpen = true;
          console.log(`[I186P] cap on after '${name}' (#${i}) gln=${gln}`);
        } else if (name === CLOSE_AFTER && opened && !closed) {
          closed = true;
          console.log(`[I186P] cap off after '${name}' (#${i}) ln=${ln}`);
          writeFileSync(`${OUT}/js-win${TAG}.txt`, vals.map((v) => (v < 0 ? `---RESEED${TAG}` : String(v))).join('\n') + '\n');
          writeFileSync(`${OUT}/js-win${TAG}-sites.txt`, sites.join('\n') + '\n');
        }
      },
    });
  } finally {
    if (opened && !closed) {
      writeFileSync(`${OUT}/js-win${TAG}.txt`, vals.map((v) => (v < 0 ? `---RESEED${TAG}` : String(v))).join('\n') + '\n');
      writeFileSync(`${OUT}/js-win${TAG}-sites.txt`, sites.join('\n') + '\n');
      console.log(`[I186P] fallback close ln=${ln}`);
    }
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
  }
});

/** 离线对拍：x86 rollwin71 ↔ JS js-win71 逐位;报首差位。 */
(it as (n: string, f: () => void) => void)('IIIII186 pots offline diff', () => {
  const readVals = (p: string): number[] => {
    const out: number[] = [];
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const t = l.trim();
      if (t === '' || t.startsWith('---')) continue;
      out.push(Number(t));
    }
    return out;
  };
  const x86 = readVals(`${OUT}/x86-rollwin71.txt`);
  const js = readVals(`${OUT}/js-win71.txt`);
  let firstDif = -1;
  const n = Math.min(js.length, x86.length);
  for (let k = 0; k < n; k++) {
    if ((js[k]! >>> 0) !== (x86[k]! >>> 0)) { firstDif = k; break; }
  }
  console.log(`[i186p-off] JS=${js.length} x86=${x86.length} (Δ=${js.length - x86.length}) 首差位=${firstDif}` +
    (firstDif >= 0 ? ` JS=${js[firstDif]} x86=${x86[firstDif]}` : ''));
  if (firstDif >= 0) {
    const lines = readFileSync(`${OUT}/js-win71-sites.txt`, 'utf8').split('\n');
    for (let k = Math.max(1, firstDif - 2); k <= Math.min(lines.length - 1, firstDif + 2); k++) {
      console.log(`[i186p-off] site[${k}] ${lines[k]}`);
    }
  }
  // 普适流前缀验证（x86 侧）
  const ur = new UnifiedRandom(Number(SEED));
  let uniFirstDif = -1;
  for (let k = 0; k < x86.length; k++) {
    if (ur.next() !== x86[k]) { uniFirstDif = k; break; }
  }
  console.log(`[i186p-off] x86 普适流首差=${uniFirstDif < 0 ? '无(全等)' : uniFirstDif}`);
});
