// IIII108b2（2026-09-04）winter B 格 (1762,1106) Piles 窗写序取证 v2（一次性诊断）。
// @BEACHHEAD(call7) 武装：defineProperty 持位（捕捉数组整体替换并重包 Proxy）+ 逐写记录；
// 全管线跑完落盘。用法：cd game && SW_I139B=1 npx vitest run tools/_iii139b.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I139B === '1';
const SEED = '1.1.1.0.winteriscoming|20260914';
const OUT = '/tmp/iii139-out';
const W = 4200, H = 1200;
const X0 = 1760, X1 = 1764, Y0 = 1103, Y1 = 1109;

const log: string[] = [];
let armed = false;
let calls = 0;
let rollCount = 0;
let passK = 0;
let store: Record<string, unknown> | null = null;
let rawTyp: Uint16Array | null = null;
let rawFlags: Uint8Array | null = null;

function makeProxy(name: string, arr: Uint16Array | Uint8Array): ProxyConstructor {
  return new Proxy(arr, {
    get(t, p, _r) { return Reflect.get(t, p, t); },
    has(t, p) { return Reflect.has(t, p); },
    set(t, p, v): boolean {
      const i = typeof p === 'string' ? Number(p) : (typeof p === 'number' ? p : NaN);
      if (Number.isInteger(i) && i >= 0) {
        const x = i % W, y = (i - (i % W)) / W;
        if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && t[i] !== v) log.push(`W ${name} (${x},${y}) ${t[i]}->${v}`);
      }
      t[i] = v;
      return true;
    },
  }) as unknown as ProxyConstructor;
}

(RUN ? it : it.skip)('III139B winter piles window forensics v2', async () => {
  mkdirSync(OUT, { recursive: true });
  (globalThis as { __swI87Cap?: unknown }).__swI87Cap = (rawSt: unknown) => {
    calls++;
    if (calls !== 7 || armed) return;   // @BEACHHEAD：Piles 前最后一个钩
    armed = true;
    const st = rawSt as Record<string, unknown>;
    store = st;
    rawTyp = st.type as Uint16Array;
    rawFlags = st.flags as Uint8Array;
    log.push(`ARMED @call7`);
    for (const name of ['type', 'flags', 'slope', 'wall'] as const) {
      let proxied = makeProxy(name, st[name] as Uint16Array | Uint8Array);
      Object.defineProperty(st, name, {
        get() { return proxied; },
        set(v: Uint16Array | Uint8Array) {
          log.push(`REPLACED ${name} → 重包`);
          proxied = makeProxy(name, v);
        },
        configurable: true,
      });
    }
  };
  let snapDone = false;
  (globalThis as { __swPTdbg?: unknown }).__swPTdbg = (s: string) => {
    if (!snapDone && store) {
      snapDone = true;
      const n = W * H;
      require('node:fs').writeFileSync('/tmp/iii139-out/js-piles-start.typ', Buffer.from(rawTyp!.buffer, rawTyp!.byteOffset, n * 2));
      log.push('SNAPSHOT typ @first PILES3x2');
      // 映射 JS 内部 id → vanilla sheet 后与 x86 076 原始 dump 对差（ghost 残型可见化）
      void (async () => {
        const { TILE_DEFS } = await import('../src/data/tiles');
        const fs2 = await import('node:fs');
        const sheet = TILE_DEFS.map((d: { vanilla?: { sheet?: number } }) => (typeof d?.vanilla?.sheet === 'number' ? d.vanilla.sheet : -1));
        const x86 = new Uint16Array(fs2.readFileSync(`${process.env.HOME ?? ''}/GoldenChains/golden-winter/076_Traps.typ`).buffer, 0, n);
        const mapped = new Uint16Array(n);
        for (let k = 0; k < n; k++) mapped[k] = rawTyp![k] < sheet.length ? Math.max(sheet[rawTyp![k]], 0) : 0;
        const diffs: number[] = [];
        for (let k = 0; k < n; k++) if (mapped[k] !== x86[k]) diffs.push(k);
        log.push(`MAPPED-DIFF count=${diffs.length}`);
        for (const d of diffs.slice(0, 60)) {
          const x = d % W, y = (d - x) / W;
          log.push(`MD (${x},${y}) x86=${x86[d]} js=${mapped[d]}`);
        }
        fs2.writeFileSync('/tmp/iii139-out/mapped-diff.txt', diffs.map((d) => { const x = d % W, y = (d - x) / W; return `(${x},${y}) x86=${x86[d]} js=${mapped[d]}`; }).join('\n'));
      })();
    }
    log.push(`DBG ${s}`);
  };
  (globalThis as { __swPilesCap?: unknown }).__swPilesCap = (x: number, y: number, t: number, s: number) => {
    if (x >= 1700 && x <= 1900 && y >= 1030 && y <= 1180) log.push(`PILE p${passK} r${rollCount} (${x},${y}) sheet=${t} style=${s}`);
  };
  // RNG 滚动计数（对齐 rig R 口径:全实例 InternalSample——__swOnRoll 同位钩,QQQQQQQQ）
  const rollBox = { v: 0 };
  (globalThis as { __swRollCount?: { v: number } }).__swRollCount = rollBox;
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = () => { rollCount++; rollBox.v = rollCount; };
  const { RNG } = await import('../src/core/rng');
  const rp = RNG.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const origReseed = rp.reseed;
  rp.reseed = function (this: unknown, s: number) {
    passK++;
    log.push(`PASS#${passK} r${rollCount}`);
    if (passK === 91 && rawTyp && rawFlags) {
      const n = W * H;
      const fs2 = require('node:fs') as typeof import('node:fs');
      fs2.writeFileSync('/tmp/iii139-out/js-prepiles.typ', Buffer.from(rawTyp.buffer, rawTyp.byteOffset, n * 2));
      fs2.writeFileSync('/tmp/iii139-out/js-prepiles.act', Buffer.from(rawFlags.buffer, rawFlags.byteOffset, n));
      log.push('SNAPSHOT pre-Piles @reseed91');
    }
    return (origReseed as (...a: unknown[]) => void).call(this, s);
  };
  await generateWorld({ width: W, height: H, seedText: SEED });
  log.push('DONE');
  writeFileSync(`${OUT}/writelog-b2.txt`, log.join('\n'));
}, 600_000);

