// IIII99c 一次性取证仪：REMIX #59 窗内逐「reseed 事件」八通道面对拍。
// 目的：解决 [replay chain uhbc vs dump059 差数千格] 与 [mile8 全管线同窗 A56/T56] 的矛盾——
// 在全管线生成过程中，每个 rng.reseed 调用点都拍一次八通道 face，
// 同时对 dump058(Statues)/dump059(Buried_Chests) 各算一次差值并打印
// 「自上一事件以来耗骰数」，即可看到状态何时变成 x86 相等 / 何时漂走。
// 用法：
//   cd game && SW_MB_1457=1 SW_I112FACE=1 \
//     SW_TM_G2=/tmp/iii89-out/rigb/dumps npx vitest run tools/_iii112face.test.ts
// 可选 SW_I112_DUMP=/tmp/iii112-out/dump-events.json —— 每个 reseed 事件 face 深拷贝落盘
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I112FACE === '1';
const G2 = process.env.SW_TM_G2 ?? '/tmp/iii89-out/rigb/dumps';
const SEED = process.env.SW_M8_SEED ?? '1138154190';
const OUTDUMP = process.env.SW_I112_DUMP ?? '';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
let DUMPNAME = new Map<number, string>();
{
  try {
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* */ }
}
function loadDump(idx: number): Ch {
  const nm = DUMPNAME.get(idx);
  const p = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  return {
    t: le16(`${p}.typ`), a: readFileSync(`${p}.act`), w: le16(`${p}.wal`),
    l: readFileSync(`${p}.liq`), hf: readFileSync(`${p}.half`), sl: readFileSync(`${p}.slope`),
    lt: readFileSync(`${p}.lt`.replace('.lt', '.lty')), ia: readFileSync(`${p}.inact`),
  };
}
function diffCount(c: Ch | null, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}): string {
  if (!c) return '(no dump)';
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, fI = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    let bad = false;
    if (va !== ja) { dA++; bad = true; }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; bad = true; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (c.w[i] !== st.wall[i]) { dW++; bad = true; }
    if (c.l[i] !== st.liquid[i]) { dL++; bad = true; }
    if (c.hf[i] !== st.half[i]) { dHf++; bad = true; }
    if (c.sl[i] !== st.slope[i]) { dSl++; bad = true; }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; bad = true; }
    if ((c.ia[i] ? 1 : 0) !== ((st.wire[i] >>> 5) & 1)) { dIa++; bad = true; }
    if (bad && fI < 0) fI = i;
  }
  const pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, n]) => `${k}×${n}`).join(' ');
  return `A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}${badFirst(fI)}${pairs ? ' pairs:' + pairs : ''}`;
}
function badFirst(fI: number): string { return fI >= 0 ? ` @(${fI % W},${(fI / W) | 0})` : ''; }

(RUN ? it : it.skip)('REMIX reseed-event face probe', async () => {
  const d58 = DUMPNAME.has(58) ? loadDump(58) : null;
  const d59 = DUMPNAME.has(59) ? loadDump(59) : null;
  let cur: Parameters<typeof diffCount>[1] | null = null;
  let evN = 0;
  let rolls = 0;
  const g = globalThis as unknown as { __swOnRoll?: (v: number) => void };
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = () => { rolls++; };
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { src = readFileSync(file, 'utf8').split('\n'); srcCache.set(file, src); }
    const parts: string[] = [];
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) parts.push(m[1].trim());
    }
    return parts.join('>>');
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const outPath = process.env.SW_I112_LOG ?? '/tmp/iii112-out/facelog.txt';
  try { mkdirSync('/tmp/iii112-out', { recursive: true }); } catch { /* */ }
  try { appendFileSync(outPath, ''); } catch { /* ignore */ }
  const LOGF = outPath;
  RNGp.reseed = function (this: unknown, s: number) {
    if (cur) {
      const stack = new Error().stack ?? '';
      let site = '?'; let lab = '?';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii112')) {
          site = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
          lab = labelOf(m[1], Number(m[2])) || '(none)';
          break;
        }
      }
      evN++;
      const r59 = diffCount(d59, cur);
      const r58 = diffCount(d58, cur);
      console.log(`EV#${evN} rolls=${rolls} ${site} lab=${lab}\n   vs059 ${r59}\n   vs058 ${r58}`);
      try { appendFileSync(LOGF, `EV#${evN}|rolls=${rolls}|${site}|lab=${lab}|59:${r59}|58:${r58}\n`); } catch { /* */ }
      rolls = 0;
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0,
      seedFlags: { remix: true },
      onWorldPartial: (w2) => { cur = w2.store as never as typeof cur; },
    });
  } finally { RNGp.reseed = oReseed; g.__swOnRoll = oRoll; }
}, 600_000);

void existsSync; void OUTDUMP;
