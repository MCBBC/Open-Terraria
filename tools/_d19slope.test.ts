// 一次性(W 批续):沙漠带幻影坡首个写入 pass 定位(#20-#52 逐事件边界)。
// SW_PARITY=1 npx vitest run tools/_d19slope.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';

const W = 4200, H = 1200, N = W * H;
const TV = '/tmp/sw-hsv';
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const t52h = rd(`${TV}/hs52.half`), t52s = rd(`${TV}/hs52.slope`);
const t19h = rd(`${TV}/hs19.half`), t19s = rd(`${TV}/hs19.slope`);

const DX0 = 2427, DX1 = 2786, DY0 = 210, DY1 = 959, DW = DX1 - DX0 + 1, DH = DY1 - DY0 + 1;
let store: TileStore | null = null;
let completedSlot: string | null = null;
// 目标格集:truth@19 有坡 或 truth@52 无坡(JS 幻影候选) —— 全部 bbox 格都盯
const snaps: Array<{ label: string; s: Uint8Array; h: Uint8Array }> = [];
let full52: { h: Uint8Array; s: Uint8Array } | null = null;

(RUN ? it : it.skip)('d19 phantom first-writer bisect', async () => {
  const origReseed = RNG.prototype.reseed;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    try {
      const stackLine = (new Error().stack ?? '').split('\n')
        .find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      const mFn = /at\s+(?:async\s+)?(\S+)\s+\(/.exec(stackLine);
      const func = mFn ? mFn[1] : '?';
      let label: string;
      if (func.includes('generateWorld')) {
        label = `head:${completedSlot ?? 'start'}`;
      } else {
        const mLoc = /\(.*(src\/[^\s?]+):(\d+):\d+\)/.exec(stackLine);
        label = '?';
        if (mLoc) {
          const rel = mLoc[1]!.slice(mLoc[1]!.indexOf('src/'));
          const src = readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/game/${rel}`, 'utf8').split('\n');
          for (let k = +mLoc[2]; k >= Math.max(0, +mLoc[2] - 2); k--) {
            const cm = /\/\/\s*▶([^\s(（]+)/.exec(src[k - 1] ?? '');
            if (cm) { label = cm[1]!; break; }
          }
        }
      }
      const st = store;
      if (!st || snaps.length && snaps[snaps.length - 1]!.label === label) return;
      if (label === 'head:海滩装饰' && !full52) full52 = { h: st.half.slice(), s: st.slope.slice() };
      // 快照沙漠带 slope/half(全事件——只为找首个出现)
      const s = new Uint8Array(DW * DH), h = new Uint8Array(DW * DH);
      for (let y = DY0; y <= DY1; y++) for (let x = DX0; x <= DX1; x++) {
        const i = st.idx(x, y), k = (y - DY0) * DW + (x - DX0);
        s[k] = st.slope[i]!; h[k] = st.half[i]!;
      }
      snaps.push({ label, s, h });
    } catch { /* ignore */ }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w, _i, name) => { if (!store) store = w.store; completedSlot = name; },
    });
  } catch (e) { console.log('GEN-EX:', String(e).slice(0, 300)); } finally {
    (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  }
  // 真 @52 = head:海滩装饰 事件(海滩装饰槽完成、半砖平滑未跑——completedSlot 标签
  // 是"刚完成的槽",head:海滩装饰 在 #53 SmoothWorld 之前触发)
  console.log('--- 全事件序列(bbox nz slope+half) ---');
  for (let q = 0; q < snaps.length; q++) {
    const e = snaps[q]!;
    let nz = 0; for (let k = 0; k < DW * DH; k++) if (e.s[k] || e.h[k]) nz++;
    let d = 0;
    if (q > 0) { const p = snaps[q - 1]!; for (let k = 0; k < DW * DH; k++) if (p.s[k] !== e.s[k] || p.h[k] !== e.h[k]) d++; }
    if (q > 50 || d > 0) console.log(`  #${String(q).padStart(3)} ${e.label.padEnd(28)} nz=${String(nz).padStart(5)} Δ=${d}`);
  }
  const i52 = snaps.findIndex((e) => e.label === 'head:海滩装饰');
  if (i52 < 0) { console.log('!! no @52 snapshot'); return; }
  const s52 = snaps[i52]!;
  let phantom = 0, miss = 0, diffVal = 0;
  const phSet = new Set<number>(), missSet = new Set<number>();
  for (let y = DY0; y <= DY1; y++) for (let x = DX0; x <= DX1; x++) {
    const k = (y - DY0) * DW + (x - DX0), i = y * W + x;
    const js = s52.s[k]! * 8 + s52.h[k]!, tr = t52s[i]! * 8 + t52h[i]!;
    if (js === tr) continue;
    if (js && !tr) { phantom++; phSet.add(k); }
    else if (!js && tr) { miss++; missSet.add(k); }
    else diffVal++;
  }
  console.log(`@52(海滩装饰槽头): 幻影=${phantom} 漏=${miss} 值差=${diffVal}`);
  // 全图 @52 口径(V 批基线 Δ=573)
  if (full52) {
    let gd = 0, gph = 0, gms = 0;
    const gcells: string[] = [];
    for (let i = 0; i < N; i++) {
      const js = full52.s[i]! * 8 + full52.h[i]!, tr = t52s[i]! * 8 + t52h[i]!;
      if (js === tr) continue;
      gd++;
      if (js && !tr) gph++; else if (!js && tr) gms++;
      if (gcells.length < 12) gcells.push(`(${i % W},${(i / W) | 0})s${full52.s[i]}>${t52s[i]}h${full52.h[i]}>${t52h[i]}`);
    }
    console.log(`全图@52: Δ=${gd} (幻影=${gph} 漏=${gms}) ${gcells.join(' ')}`);
  }
  // JS 侧逐事件变化:哪些事件在 bbox 写/清 slope/half(相邻快照 diff)
  console.log('--- JS bbox slope/half 逐事件变化(#19 后首事件起) ---');
  const i19 = snaps.findIndex((e) => e.label === 'GlowingMushroomPatches');
  for (let q = Math.max(1, i19); q < snaps.length; q++) {
    const a = snaps[q - 1]!, b = snaps[q]!;
    let d = 0;
    for (let k = 0; k < DW * DH; k++) if (a.s[k] !== b.s[k] || a.h[k] !== b.h[k]) d++;
    if (d > 0) console.log(`  ${b.label}: Δ=${d}`);
  }
  // 幻影格:首次获得 slope 的事件
  const fe = new Map<string, number>();
  for (const k of phSet) {
    let hit = -1;
    for (let q = 0; q <= i52; q++) if (snaps[q]!.s[k] || snaps[q]!.h[k]) { hit = q; break; }
    fe.set(hit < 0 ? 'never' : snaps[hit]!.label, (fe.get(hit < 0 ? 'never' : snaps[hit]!.label) ?? 0) + 1);
  }
  console.log('幻影首现:', [...fe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}=${v}`).join(' '));
  // truth@19有坡@52无坡(vanilla 自清)且 JS@52 仍有 → JS 缺清除动作
  let vanClearJsKeep = 0;
  const vckSet = new Set<number>();
  for (let y = DY0; y <= DY1; y++) for (let x = DX0; x <= DX1; x++) {
    const k = (y - DY0) * DW + (x - DX0), i = y * W + x;
    if ((t19s[i]! || t19h[i]!) && !t52s[i]! && !t52h[i]! && (s52.s[k] || s52.h[k])) { vanClearJsKeep++; vckSet.add(k); }
  }
  console.log(`vanilla自清但JS保留@52=${vanClearJsKeep}`);
  // 交集分析:幻影格 vs vanClearJsKeep 格是否同一批
  let overlap = 0; for (const k of vckSet) if (phSet.has(k)) overlap++;
  console.log(`两集合重叠=${overlap}`);
}, 480000);
