// IIII92 一次性诊断：统计 JS 管线各 ▶锚 窗口的 InternalSample 掷数，与 x86 pc.txt
// 的 R 计数对读（定位「同输入不同结果」的窗口所在）。零主路径改动。
// 用法：SW_I92=1 SW_I92_SEED='doubledaringdangers|20260831' SW_I92_FLAGS=dualDungeons \
//        npx vitest run tools/_iii92rolls.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I92 === '1';
const SEED = process.env.SW_I92_SEED ?? '0';
const EVIL = process.env.SW_I92_EVIL !== undefined ? Number(process.env.SW_I92_EVIL) : 0;
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I92_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;

(RUN ? it : it.skip)('i92 per-anchor roll accounting', async () => {
  const srcCache = new Map<string, string[]>();
  function labelOf(file: string, line: number): string {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = (src[l] ?? '').match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1]!.trim();
    }
    return `${file.split('/').pop()}:${line}`;
  }

  const windows: Array<{ lab: string; inst: object }> = [];
  const rollsByInst = new Map<object, number>();
  const oReseed = (RNG.prototype as unknown as { reseed: (s: number) => void }).reseed;
  (RNG.prototype as unknown as { reseed: (s: number) => void }).reseed = function (this: unknown, s: number) {
    oReseed.call(this, s);
    // 取当前 ur 实例（reseed 后必为新 UnifiedRandom）
    const inst = (this as unknown as { ur: object }).ur;
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii92')) {
        windows.push({ lab: labelOf(m[1]!, Number(m[2])), inst });
        break;
      }
    }
    return;
  };
  const oOnRoll = (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  (globalThis as { __swOnRoll?: unknown }).__swOnRoll = (v: number, inst: object) => {
    void v;
    if (!rollsByInst.has(inst)) rollsByInst.set(inst, 0);
    rollsByInst.set(inst, (rollsByInst.get(inst) ?? 0) + 1);
  };
  try {
    await generateWorld({
      width: Number(process.env.SW_M8_W ?? 4200), height: Number(process.env.SW_M8_H ?? 1200),
      seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: Object.keys(FLAGS).length ? FLAGS : undefined,
    });
  } finally {
    (globalThis as { __swOnRoll?: unknown }).__swOnRoll = oOnRoll;
    (RNG.prototype as unknown as { reseed: (s: number) => void }).reseed = oReseed;
  }
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    const n = rollsByInst.get(w.inst) ?? 0;
    console.log(`win#${String(i).padStart(3)} ${w.lab} rolls=${n}`);
  }
}, 900_000);
