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
  (globalThis as { __swPilesCap?: unknown }).__swPilesCap = (x: number, y: number, t: number, s: number) => {
    if (x >= 1700 && x <= 1900 && y >= 1030 && y <= 1180) log.push(`PILE p${passK} r${rollCount} (${x},${y}) sheet=${t} style=${s}`);
  };
  // RNG 滚动计数（对齐 rig R 口径:全实例 InternalSample——__swOnRoll 同位钩,QQQQQQQQ）
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = () => { rollCount++; };
  const { RNG } = await import('../src/core/rng');
  const rp = RNG.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const origReseed = rp.reseed;
  rp.reseed = function (this: unknown, s: number) { passK++; log.push(`PASS#${passK} r${rollCount}`); return (origReseed as (...a: unknown[]) => void).call(this, s); };
  await generateWorld({ width: W, height: H, seedText: SEED });
  log.push('DONE');
  writeFileSync(`${OUT}/writelog-b2.txt`, log.join('\n'));
}, 600_000);

