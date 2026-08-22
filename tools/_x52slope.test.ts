// 一次性(X 批):全图@52 残余幻影坡溯源——首写事件 + 该格 type/wall + @52 时点态。
// SW_PARITY=1 npx vitest run tools/_x52slope.test.ts
// ★OOOOOO 批(2026-08-22)加存在性门:/tmp/sw-hsv 诊断资产已清,缺资产时静默 skip
//   (原模块级 readFileSync 收集期 ENOENT 炸红全量回归;W/X 批幻影坡案已结,工具留档)。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200, N = W * H;
const TV = '/tmp/sw-hsv';
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
// 缺资产→零长数组(it 体内判 length 后 skip),不再收集期抛 ENOENT
const rd0 = (p: string): ArrayBuffer => { try { return readFileSync(p).buffer.slice(0); } catch { return new ArrayBuffer(0); } };
const t52h = new Uint8Array(rd0(`${TV}/hs52.half`)), t52s = new Uint8Array(rd0(`${TV}/hs52.slope`));

let store: TileStore | null = null;
let completedSlot: string | null = null;
const labels: string[] = [];
// 每格 slope/half 非零首现事件下标(255=从未)
let firstEv: Uint8Array | null = null;
// @52 时点快照(全通道关键项)
let snap52: { s: Uint8Array; h: Uint8Array; t: Uint16Array; a: Uint8Array; w: Uint16Array } | null = null;

(RUN ? it : it.skip)('x52 whole-map phantom provenance', async () => {
  if (!t52h.length) { console.log('skip: /tmp/sw-hsv 资产缺失(hs52),按头注重建后复跑'); return; }
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
      if (!st) return;
      const ev = labels.length;
      if (ev >= 250) return;
      labels.push(label);
      if (label === 'head:海滩装饰' && !snap52) {
        snap52 = {
          s: st.slope.slice(), h: st.half.slice(), t: st.type.slice(),
          a: st.flags.slice(), w: st.wall.slice(),
        };
      }
      if (!firstEv) firstEv = new Uint8Array(N).fill(255);
      const fe = firstEv;
      for (let i = 0; i < N; i++) {
        if (fe[i] === 255 && (st.slope[i] || st.half[i])) fe[i] = ev;
      }
    } catch { /* ignore */ }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (_w, _i, name) => { if (!store) store = _w.store; completedSlot = name; },
    });
  } catch (e) { console.log('GEN-EX:', String(e).slice(0, 300)); } finally {
    (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  }
  if (!snap52 || !firstEv) { console.log('!! no @52 snapshot'); return; }
  const t52t = new Uint16Array(readFileSync(`${TV}/hs52.typ`).buffer.slice(0));
  const t52a = rd(`${TV}/hs52.act`);
  const t52w = new Uint16Array(readFileSync(`${TV}/hs52.wal`).buffer.slice(0));
  const sheetOf = (t: number) => { const s = TILE_DEFS[t]?.vanilla?.sheet; return typeof s === 'number' ? s : -1; };
  let phantom = 0, miss = 0, diffVal = 0;
  const prov = new Map<string, number>();
  const cellsByProv = new Map<string, string[]>();
  for (let i = 0; i < N; i++) {
    const js = snap52.s[i]! * 8 + snap52.h[i]!, tr = t52s[i]! * 8 + t52h[i]!;
    if (js === tr) continue;
    if (js && !tr) {
      phantom++;
      // 该格四通道是否也对不上(区分"纯坡位差"与"更深的 typ 债")
      const jsT = snap52.a[i] ? sheetOf(snap52.t[i]!) : 0;
      const trT = t52a[i] ? t52t[i]! : 0;
      const chOk = jsT === trT && snap52.w[i] === t52w[i];
      const fe = firstEv![i]!;
      // 快照在窗口头 reseed 时拍 → fe=K 的写入者实为 labels[K-1] 窗口(前一 pass)
      const evLabel = fe === 255 ? 'never(残留)' : fe === 0 ? '(init)' : labels[fe - 1]!;
      const key = `${evLabel} | js typ${jsT}${snap52.a[i] ? '' : '!act'} w${snap52.w[i]} | truth typ${trT} ${chOk ? '四通道同' : '★四通道异'}`;
      prov.set(key, (prov.get(key) ?? 0) + 1);
      if ((cellsByProv.get(key) ?? []).length < 6) {
        const arr = cellsByProv.get(key) ?? [];
        arr.push(`(${i % W},${(i / W) | 0})`);
        cellsByProv.set(key, arr);
      }
    }
    else if (!js && tr) miss++;
    else diffVal++;
  }
  console.log(`全图@52: 幻影=${phantom} 漏=${miss} 值差=${diffVal}`);
  for (const [k, v] of [...prov.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}   ${(cellsByProv.get(k) ?? []).join(' ')}`);
  }
}, 480000);
