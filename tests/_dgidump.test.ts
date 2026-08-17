// 一次性诊断（dungeonI 转写债，2026-08-16 已修复收档）：dungeonG/dungeonI 检查点
// JS 网格 dump，与 oracle GRID_DUMP 产物（/tmp/cs-dg{g,i}.*）对拍。
// ★默认让位（SW_DGI_DUMP=1 才跑）：避免拖慢全量 vitest。
// ★必须每进程只跑一次 chainCheckpoints——同进程二跑会带模块级残留
// （实测二跑 beaches 流指纹 fb014fa7→9b4041bd），用 SW_DGI_AT 选检查点。
// typ=internal id（hook 原样）；对拍经 _dgidiff.test.ts 映射回原版空间。
import { it } from 'vitest';
import { chainCheckpoints } from './caves-checkpoint.test';

(!!process.env.SW_DGI_DUMP ? it : it.skip)('dump dungeon grid', () => {
  const at = process.env.SW_DGI_AT || 'dungeonI';
  const seed2 = !!process.env.SW_DGI_SEED2;   // Z 批：第二种子自洽（SandboxWorld/evil1）
  const g = globalThis as { __cavesGridExport?: { at: string; dir: string } };
  g.__cavesGridExport = { at, dir: `/tmp/js-${at === 'dungeonG' ? 'dgg' : (seed2 ? 'dgi2' : 'dgi')}` };
  chainCheckpoints(seed2 ? 'SandboxWorld' : '9293480', seed2 ? 1 : 0);
  g.__cavesGridExport = undefined;
  console.log(`dumped ${at}`);
}, 600000);
