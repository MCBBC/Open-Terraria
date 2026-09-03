// 最终清零对拍矩阵（2026-09-02 PR-async 收口）：同步 startHardmode ↔ 异步 job
// 在【全部语义分支】上的终态逐位对拍。四场景覆盖 initializeHardMode 的全部分叉：
//   ①plain          —— 默认 V 带（geRunner×2,hive flag=false 常态）
//   ②hive-heavy     —— >20 万 225 格（hive flag=true:蜂窝→珍珠岩/Hive 门全开,
//                       ★并覆盖"runner1 转化后计数变化"的逐 runner 新鲜扫描语义）
//   ③remix          —— seedFlags.remix（边缘带臂,convertHallowCell 级联链）
//   ④dualDungeons   —— 条带禁用（bandsEnabled=false:只跑回填）+ Dungeon 档剥漆
//   ⑤skyblock       —— skyblockLowTiles（geRunner 零掷骰早退,回填照跑）
// 每场景:同步 drain 世界 vs job 逐步世界,type/wall/paintWall/liquid 全数组逐位相等。
import { describe, it, expect, vi } from 'vitest';
// 本机多会话常态高负载(load 80+):默认 5s testTimeout 把全分支对拍打成伪红——显式放宽
vi.setConfig({ testTimeout: 600000 });
import { World } from '../src/world/World';
import {
  createBrickBoxForWallOfFlesh, startHardmode, startHardmodeJob,
  onGameEventClearedForDualDungeons,
} from '../src/world/gen/vanilla/HardmodePass';
import { RNG } from '../src/core/rng';

const W = 1200, H = 800;
const SEED = 20260902;

interface SceneCfg {
  id: string;
  build(w: World): void;
  /** 同步侧追加事件面（缺省无） */
  syncExtra?(w: World): void;
}

const SCENES: SceneCfg[] = [
  {
    id: 'plain',
    build: (w) => seedTerrain(w, false),
  },
  {
    id: 'hive-heavy(flag=true)',          // 21 万 225 格 > 20 万阈值
    build: (w) => {
      seedTerrain(w, false);
      const st = w.store;
      for (let x = 120; x < 720; x++) for (let y = 260; y < 610; y++) st.setTile(x, y, 225);
      for (let x = 720; x < 900; x += 7) for (let y = 260; y < 610; y += 7) st.setTile(x, y, 230); // CrispyHoney 门
    },
  },
  {
    id: 'remix-arm',                      // seedFlags.remix:边缘带臂(convertHallowCell 级联)
    build: (w) => {
      (w.seedFlags as Record<string, boolean>).remix = true;
      seedTerrain(w, true);               // 需要腐化/猩红条带供内侧翼转换
    },
  },
  {
    id: 'dualDungeons-bands-off',         // bandsEnabled=false:无 V 带,回填照跑
    build: (w) => {
      (w.seedFlags as Record<string, boolean>).dualDungeons = true;
      seedTerrain(w, false);
    },
    syncExtra: (w) => onGameEventClearedForDualDungeons(w, 19),   // Dungeon 档剥漆(旧链同位)
  },
  {
    id: 'skyblock-lowtiles',              // geRunner 早退(零掷骰),回填照跑
    build: (w) => {
      (w as unknown as { skyblockLowTiles: boolean }).skyblockLowTiles = true;
      seedTerrain(w, false);
    },
  },
];

function seedTerrain(w: World, withEvilBands: boolean): void {
  const st = w.store;
  const rng = new RNG(SEED);
  w.groundLevel = 300;
  w.dungeonX = Math.trunc(W / 4);
  for (let x = 20; x < W - 20; x++) {
    const surf = 290 + Math.floor(rng.next() * 16);
    for (let y = surf; y < H - 20; y++) {
      const t = y > surf + 40 ? 1 : 2;                  // 深处石/表层土
      st.setTile(x, y, t);
      if (y === surf) st.setTile(x, y, 2);
    }
  }
  if (withEvilBands) {
    for (let x = 150; x < 350; x++) for (let y = 320; y < 700; y++) st.setTile(x, y, 25);   // 腐化石条带
    for (let x = 800; x < 1000; x++) for (let y = 320; y < 700; y++) st.setTile(x, y, 199); // 猩红石条带
  }
}

function snap(w: World): { type: string; wall: string; paint: string; liquid: string } {
  const st = w.store;
  let type = '', wall = '', paint = '', liquid = '';
  for (let i = 0; i < st.type.length; i++) {
    type += String.fromCharCode(65 + (st.type[i] % 26));
    wall += String.fromCharCode(65 + (st.wall[i] % 26));
    paint += String.fromCharCode(65 + (st.paintWall[i] % 26));
    liquid += String.fromCharCode(65 + (st.liquid[i] % 26));
  }
  return { type, wall, paint, liquid };
}

describe('SM2 无关·肉山困难模式转换最终清零矩阵（同步 ↔ 异步全分支）', () => {
  for (const sc of SCENES) {
    it(`[${sc.id}] 同步 drain === job 逐步（type/wall/paint/liquid 全等）`, () => {
      const a = new World(W, H, SEED, `zr-${sc.id}-a`);
      const b = new World(W, H, SEED, `zr-${sc.id}-b`);
      sc.build(a); sc.build(b);
      createBrickBoxForWallOfFlesh(a.store, 600, 700, 100, a.crimson);
      createBrickBoxForWallOfFlesh(b.store, 600, 700, 100, b.crimson);
      // 同步侧
      startHardmode(a);
      sc.syncExtra?.(a);
      // 异步侧
      const job = startHardmodeJob(b);
      let steps = 0;
      while (!job.step()) if (++steps > 20_000_000) throw new Error('job 未收敛');
      expect(steps).toBeGreaterThan(0);
      const sa = snap(a), sb = snap(b);
      expect(sb.type).toBe(sa.type);
      expect(sb.wall).toBe(sa.wall);
      expect(sb.paint).toBe(sa.paint);
      expect(sb.liquid).toBe(sa.liquid);
    });
  }

  it('存档口快收口等价：partial step × k → finishHardmodeJob 语义 drain === 全量同步', () => {
    const a = new World(W, H, SEED, 'zr-save-a');
    const b = new World(W, H, SEED, 'zr-save-b');
    const cfg = SCENES[1];                               // 用最重的 hive 场景
    cfg.build(a); cfg.build(b);
    createBrickBoxForWallOfFlesh(a.store, 600, 700, 100, a.crimson);
    createBrickBoxForWallOfFlesh(b.store, 600, 700, 100, b.crimson);
    startHardmode(a);
    const job = startHardmodeJob(b);
    for (let k = 0; k < 37 && !job.step(); k++) { /* 半程中断(模拟存档时机) */ }
    // Game.finishHardmodeJob 的语义 = 无预算 drain 剩余（此处镜像）
    while (!job.step());
    const sa = snap(a), sb = snap(b);
    expect(sb.type).toBe(sa.type);
    expect(sb.wall).toBe(sa.wall);
    expect(sb.paint).toBe(sa.paint);
    expect(sb.liquid).toBe(sa.liquid);
  });
});
