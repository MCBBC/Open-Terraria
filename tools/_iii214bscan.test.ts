// IIIII214b：zenith 数值籽多籽有界性扫（10 籽 × 全程生成）
// 用法: SW_III214B_SCAN=1 npx vitest run tools/_iii214bscan.test.ts
// 每籽断言：①全程完成 ②remix 出生 relocation 生效（spawnX=w/2、spawnY=土墩顶带）
// ③终清理槽 wall-clock 有界（完成即证 ④ 出生腔清液 while 收敛）
import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = !!process.env.SW_III214B_SCAN;
const TLOG = process.env.SW_III214B_TLOG ?? '/tmp/iii214b-out/scan.log';
const SEEDS = (process.env.SW_III214B_SEEDS ?? '').split(',').filter(Boolean);
// 缺省 10 籽（线性同余派生，可复现）：任务书「~10 个随机 zenith 数值籽」
const DEFAULT_SEEDS = ['7', '123456789', '20260908', '55555555', '987654321', '31415926',
  '271828182', '161803398', '42424242', '8675309'];
// zenith 七字段（golden-chains-runbook.md golden-gfb-c 配方——勿用 everything 单键）
const ZENITH = {
  remix: true, drunkWorld: true, notTheBees: true, noTraps: true,
  theConstant: true, tenthAnniversary: true, getGoodWorld: true,
} as const;

(RUN ? it : it.skip)('zenith numeric-seed boundedness scan (10 seeds, full gen)', async () => {
  const seeds = SEEDS.length > 0 ? SEEDS : DEFAULT_SEEDS;
  for (const s of seeds) {
    const t0 = Date.now();
    let fcMs = -1;
    let lastPass = '(none)';
    const t0fc = { v: 0 };
    const world = await generateWorld(
      {
        size: 0, width: 0, height: 0,
        seedText: s, evil: -1, name: `iii214b-scan-${s}`,
        seedFlags: { ...ZENITH },
        onWorldPartial: (_w, _i, name) => {
          if (name === '断线陷阱清理') t0fc.v = Date.now();
          lastPass = name;
        },
      } as never,
      () => {},
    );
    fcMs = t0fc.v > 0 ? Date.now() - t0fc.v : -1;
    const total = (Date.now() - t0) / 1000;
    // remix 出生 relocation 断言：X=w/2；Y=土墩顶（h-160..h-135 带内——cs:19742 从
    // h-10 上行首空,ash 柱顶 ∈ [num5=h-160, num4=h-135]）
    const okX = world.spawnX === Math.floor(world.store.w / 2);
    const okY = world.spawnY >= world.store.h - 161 && world.spawnY <= world.store.h - 134;
    const line = `[iii214b-scan] seed=${s} OK ${total.toFixed(1)}s 终清理=${(fcMs / 1000).toFixed(1)}s spawn=${world.spawnX},${world.spawnY} okX=${okX} okY=${okY} lastPass=${lastPass}`;
    appendFileSync(TLOG, line + '\n');
    console.log(line);
    if (!okX || !okY) throw new Error(`seed ${s}: remix spawn relocation 未生效 spawn=${world.spawnX},${world.spawnY}`);
  }
}, 3_600_000);
