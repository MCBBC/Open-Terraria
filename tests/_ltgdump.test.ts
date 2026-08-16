// 一次性探针（种子等价 livingtrees 对拍）：dump SandboxWorld livingtrees 检查点网格。
// __cavesGridExport 落原始本地 id typ → 本探针再按 V_ID 映射 vanilla sheet 重写 .vtyp。
// 用法：HD_SEED=HD_EVIL 控制种子；跑完即删。
import { it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('dump livingtrees grid', async () => {
  process.env.SW_FREEZE_CAVES = '1';   // 让位 chainCheckpoints 所在文件的 describe（防整链双跑）
  const { chainCheckpoints } = await import('./caves-checkpoint.test');
  const at = process.env.HD_AT ?? 'livingtrees';
  const dir = process.env.HD_OUT ?? '/tmp/sbw-lt-js';
  const seedText = process.env.HD_SEED ?? 'SandboxWorld';
  const evil = (process.env.HD_EVIL ?? '1') === '1' ? 1 : 0;
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = { at, dir };
  chainCheckpoints(seedText, evil as 0 | 1);
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = undefined;
  // raw local typ → vanilla sheet 映射（与 hashGrids 同口径；无映射格 0x7fff）
  const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const sheet = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof sheet === 'number') V_ID[i] = sheet;
  }
  const raw = readFileSync(`${dir}.typ`);
  const out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length / 2; i++) {
    const v = V_ID[raw.readUInt16LE(i * 2)];
    out.writeUInt16LE(v < 0 ? 0x7fff : v, i * 2);
  }
  writeFileSync(`${dir}.vtyp`, out);
  console.log(`LTG dump done: ${dir}.{typ,act,wal} + .vtyp @${at} seed=${seedText}`);
  expect(true).toBe(true);
}, 300000);
