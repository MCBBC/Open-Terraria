// IIII61 一次性仪：JS SpreadWallDungeon 全调用量测流（与 x86 rig SW_WVLOG 同格式）
// 用法：SW_M8=1 ... npx vitest run tools/_iii61wv.test.ts → /tmp/iii61-out/wv-js.log
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I61WV === '1';
const SEED = process.env.SW_M8_SEED ?? '51620200';
const EVIL = Number(process.env.SW_M8_EVIL ?? -1);
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);

(RUN ? it : it.skip)('iii61 wv-log', async () => {
  (globalThis as unknown as { __swWvLog?: unknown; __wvLines?: string[] }).__swWvLog = '/tmp/iii61-out/wv-js.log';
  (globalThis as unknown as { __wvLines?: string[] }).__wvLines = [];
  const t0 = Date.now();
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: { drunkWorld: true },
  });
  const lines = (globalThis as unknown as { __wvLines?: string[] }).__wvLines ?? [];
  writeFileSync('/tmp/iii61-out/wv-js.log', lines.join('\n') + '\n');
  console.log(`[i61wv] lines=${lines.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
