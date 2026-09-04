// ★IIIII110b 一次性取证仪：randomSpawn 重掷核逐句移植对拍（JS trace vs x86 rig trace）。
// 只读诊断（tests/golden 零写入；trace 走 SW142_OUT 指定 /tmp 路径）。
// 用法（cd game）：
//   SW142_SEED='howdidigethere|20260904' SW142_FLAGS=randomSpawn \
//   SW142_OUT=/tmp/iii142-out/rndspawn-js-mch.txt \
//   npx vitest run tools/_iii142spawn.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { setTeleportSpotTrace } from '../src/world/gen/vanilla/TeleportSpotCheck';

const SEED = process.env.SW142_SEED ?? '';
const EVIL = Number(process.env.SW142_EVIL ?? 0);
const OUT = process.env.SW142_OUT ?? '';
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW142_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const W = Number(process.env.SW142_W ?? 4200), H = Number(process.env.SW142_H ?? 1200);

(!!SEED ? it : it.skip)('III142 randomSpawn trace', { timeout: 900_000 }, async () => {
  const lines: string[] = [];
  // ★IIIII110b：全实例掷计数（与 x86 rig SW_RSPROLL 同構——Rsp 行尾 |count）
  let rollCount = 0;
  const g = globalThis as { __swOnRoll?: (value: number, inst: object) => void };
  const prevHook = g.__swOnRoll;
  g.__swOnRoll = () => { rollCount++; };
  // ★IIIII110b：SQF 九宫掷耗计数出口（__swSqfCell + 计数 getter）
  (g as { __swRollCount?: { get(): number } }).__swRollCount = { get: () => rollCount };
  (g as { __swSqfCell?: unknown }).__swSqfCell = (k: number, l: number, t: number, before: number, after: number) => {
    lines.push(`R|SQF|${k}|${l}|${t}|${before}|${after}|${rollCount}`);
  };
  (g as { __swTfr?: unknown }).__swTfr = (x2: number, y2: number, t: number, c: number) => {
    lines.push(`R|TFR|${x2}|${y2}|${t}|${c}|${rollCount}`);
  };
  if (OUT) setTeleportSpotTrace((l) => lines.push(l + '|' + rollCount));
  try {
    const world = await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
    });
    console.log('SPAWN ' + JSON.stringify({ spawnX: world.spawnX, spawnY: world.spawnY }));
  } finally {
    g.__swOnRoll = prevHook;
    setTeleportSpotTrace(null);
    if (OUT) writeFileSync(OUT, lines.join('\n') + '\n');
  }
});

