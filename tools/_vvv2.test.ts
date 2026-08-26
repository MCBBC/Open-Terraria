// VVV 批探针：二次沉降（pass 98 Settle_Liquids_Again）全程样本流标定点（JS 侧）。
// 与 /tmp/vvv-out/rig-src JJHook.OnRoll 的 SW_TAGLOG 同格式：窗口开启期间每个
// internalSample 记一行 "ln|value|api|chain..."，对拍首分歧标签即真凶消费类。
// 用法：SW_VVV=1 SW_MB_1457=1 npx vitest run tools/_vvv2.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_VVV === '1';
const TAG = '/tmp/vvv-out/j-tag.txt';
const KLOG = '/tmp/vvv-out/j-klog.txt';
const ENTRY_DIR = '/tmp/vvv-out/jdump-entry';
const SEED = process.env.SW_M8_SEED ?? '9293480';
const EVIL = Number(process.env.SW_M8_EVIL ?? 0);

let lastWorld: import('../src/world/World').World | null = null;

let kwin: { on: boolean; buf: string[]; n: number } | null = null;
(globalThis as Record<string, unknown>).__swLqKill = (
  x: number, y: number, sheet: number, fx: number, fy: number,
) => {
  if (!kwin?.on) return;
  kwin.buf.push(`K ${++kwin.n} ${x} ${y} ${sheet} ${fx} ${fy}`);
};
// VVV 批：wc 死亡判定分支首见覆盖集（与 rig SW_WCPROBE 同口径）
const WLOG = '/tmp/vvv-out/j-wc.txt';
const wcSeen = new Set<string>();
const wcBuf: string[] = [];
(globalThis as unknown as { __swWcProbe?: unknown }).__swWcProbe = (
  x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number,
) => {
  const key = x + '_' + y;
  if (wcSeen.has(key)) return;
  wcSeen.add(key);
  if (!kwin?.on) return;
  wcBuf.push(`W ${kwin.n} ${x} ${y} ${sheet} ${fx} ${fy} ${liq} ${lty}`);
};
(globalThis as unknown as { __swWcVerdict?: unknown }).__swWcVerdict = (
  x: number, y: number, dl: boolean, dw: boolean,
) => {
  const key = x + '_V';
  if ((wcSeen as Set<string>).has(key)) return;
  (wcSeen as Set<string>).add(key);
  if (!kwin?.on || (!dl && !dw)) return;
  wcBuf.push(`V ${kwin.n} ${x} ${y} dl=${dl ? 1 : 0} dw=${dw ? 1 : 0}`);
};

it('vvv tagged sample stream', async () => {
  if (!RUN) return;
  let win = false;
  let ln = 0;
  const buf: string[] = [];
  const oIS = UnifiedRandom.prototype.internalSample;
  (UnifiedRandom.prototype as unknown as Record<string, unknown>).internalSample =
    function (this: UnifiedRandom): number {
      const v = oIS.call(this);
      if (!win) return v;
      ln++;
      const st = new Error().stack ?? '';
      const frames = st.split('\n').slice(2)
        .map((l) => l.trim())
        .filter((l) => !l.includes('core/rng') && !l.includes('_vvv2'))
        .map((l) => {
          const m = l.match(/^at\s+(\S+?)\s+\(/);
          if (m) return m[1];
          const f = l.match(/^at\s+(\S+:\d+:\d+)/);
          return f ? `@${f[1]}` : '';
        })
        .filter((n) => n && n !== 'Array.forEach' && n !== 'Array.map' && n !== 'Object.<anonymous>')
        .slice(0, 6);
      buf.push(`${ln}|${v}|UnifiedRandom.internalSample|${frames.join('|')}|`);
      return v;
    };
  try {
    await generateWorld({
      width: 4200,
      height: 1200,
      seedText: SEED,
      evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w) => { lastWorld = w; },
    }, (label) => {
      if (label === '二次沉降') {
        win = true;
        ln = 0;
        kwin = { on: true, buf: [], n: 0 };
        // 窗口入口全通道快照（x86 dump097 对拍）——十通道原始字节存档，
        // 供离线 quickWater/WaterCheck 重放（SW_LQREPLAY=1 时）
        try {
          const fsmod = require('node:fs') as typeof import('node:fs');
          const stRaw = lastWorld as unknown as { store: Record<string, unknown> };
          const st = stRaw.store;
          const anySt = st as unknown as Record<string, unknown>;
          const w = Number(anySt.w), h = Number(anySt.h);
          const dim = w * h;
          const ch = (name: string): Uint8Array => anySt[name] as Uint8Array;
          const typeU = ch('type');
          const typSheet = new Uint16Array(dim);
          for (let k = 0; k < dim; k++) {
            const tid = typeU[k] ?? 0;
            let s = (TILE_DEFS[tid] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
            if (s === undefined) s = tid === 0 ? 0 : 65535;
            typSheet[k] = s;
          }
          const ltj = ch('liquidType');
          const ltyv = new Uint8Array(dim);
          for (let k = 0; k < dim; k++) { const v = ltj[k]; ltyv[k] = v > 0 ? v - 1 : 0; }
          const actv = new Uint8Array(dim);
          for (let k = 0; k < dim; k++) actv[k] = (ch('flags')[k] ?? 0) & 1;
          fsmod.mkdirSync('/tmp/vvv-out/jdump-entry', { recursive: true });
          const wb = (a: Uint8Array | Uint16Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
          fsmod.writeFileSync('/tmp/vvv-out/jdump-entry/K.typ', wb(typSheet));
          fsmod.writeFileSync('/tmp/vvv-out/jdump-entry/K.act', wb(actv));
          fsmod.writeFileSync('/tmp/vvv-out/jdump-entry/K.liq', wb(ch('liquid')));
          fsmod.writeFileSync('/tmp/vvv-out/jdump-entry/K.lty', wb(ltyv));
          const walU = ch('wall') as unknown as Uint16Array;
          const wal16 = new Uint16Array(dim);
          for (let k = 0; k < dim; k++) wal16[k] = walU[k];
          fsmod.writeFileSync('/tmp/vvv-out/jdump-entry/K.wal', wb(wal16));
          // 十通道重放原料（内部编码原样）
          fsmod.mkdirSync('/tmp/vvv-out/replay', { recursive: true });
          const chanNames = ['type', 'flags', 'wall', 'liquid', 'liquidType', 'frameX', 'frameY', 'half', 'slope', 'wire'] as const;
          for (const cn of chanNames) {
            const arr = ch(cn);
            fsmod.writeFileSync(`/tmp/vvv-out/replay/${cn}.bin`, wb(arr.slice() as Uint8Array));
          }
        } catch (e) { console.error('entry dump failed', e); }
        return;
      }
      // 槽名驱动关窗
      if (win) {
        win = false;
        if (kwin) kwin.on = false;
      }
    });
  } finally {
    win = false;
    if (kwin) kwin.on = false;
    (UnifiedRandom.prototype as unknown as Record<string, unknown>).internalSample = oIS;
  }
  writeFileSync(TAG, buf.join('\n') + '\n');
  if (kwin) writeFileSync(KLOG, kwin.buf.join('\n') + '\n');
  writeFileSync(WLOG, wcBuf.join('\n') + '\n');
}, 600000);
