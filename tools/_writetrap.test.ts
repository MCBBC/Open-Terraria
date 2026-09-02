// 一次性诊断（cascade-fix 2026-09-02）：TileStore.type 数组 Proxy 陷阱。
// 捕获 initializeHardMode 期间目标矩形内**一切** type 写（含级联的直写与
// killTileGen/setTileSilent），带调用栈归因 + 掷序号。
// 用法：cd game && SW_TRAP=1 SW_TRAP_OUT=/tmp/cascade-fix/trap.txt npx vitest run tools/_writetrap.test.ts
import { it } from 'vitest';
process.env.SW_MB_1457 = '1';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';
import { RNG } from '../src/core/rng';
import type { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_TRAP === '1';
const OUT = process.env.SW_TRAP_OUT ?? '/tmp/cascade-fix/trap.txt';
const X0 = Number(process.env.SW_TRAP_X0 ?? 2275), X1 = Number(process.env.SW_TRAP_X1 ?? 2295);
const Y0 = Number(process.env.SW_TRAP_Y0 ?? 225), Y1 = Number(process.env.SW_TRAP_Y1 ?? 235);

(RUN ? it : it.skip)('write-trap: type 直写捕获', async () => {
  const world: World = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const st: TileStore = world.store;
  const log: string[] = [];
  let rollCount = 0;
  const g = globalThis as unknown as { __swOnRoll?: (v: number, i: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = () => { rollCount++; };
  const realType = st.type;
  const inRect = (i: number): boolean => {
    const x = i % st.w, y = Math.floor(i / st.w);
    return x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
  };
  const proxy = new Proxy(realType, {
    set(target: Uint8Array, prop: string | symbol, value: number): boolean {
      const idx = typeof prop === 'string' ? Number(prop) : NaN;
      if (Number.isInteger(idx) && inRect(idx) && target[idx] !== value) {
        const x = idx % st.w, y = Math.floor(idx / st.w);
        const stk = (new Error().stack ?? '').split('\n').slice(2, 10)
          .map((s) => { const m = s.match(/\(?([^\s()/]*\.ts):(\d+):\d+/); return m ? `${m[1]!.split('/').pop()}:${m[2]}` : ''; })
          .filter(Boolean).join('<');
        log.push(`W (${x},${y}) ${target[idx]}->${value} rc=${rollCount} by=${stk}`);
      }
      (target as unknown as Record<string, number>)[prop as string] = value;
      return true;
    },
  });
  Object.defineProperty(st, 'type', { get: () => proxy, configurable: true });
  try {
    initializeHardMode(world, new RNG(world.seed));
  } finally {
    Object.defineProperty(st, 'type', { get: () => realType, configurable: true });
    g.__swOnRoll = prev;
  }
  writeFileSync(OUT, log.join('\n') + '\n');
  console.log(`[write-trap] captured ${log.length} writes -> ${OUT}`);
}, 600000);
