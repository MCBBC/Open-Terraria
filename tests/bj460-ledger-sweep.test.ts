// ★BJ460 登记账扫尾三件（2026-10-03）——判别测试。
//
// ①X4-债16③ MP netCameraTarget 定谳销账（只改账,行为面既有锁）：
//   清偿刀 D 已全链建模（写 Game.ts notifyCameraTarget 三域并集 → ClientNet msg13
//   flagBits[5]+尾随 Vector2 → room.ts entityAoiCenter AOI 消费）——行为判别面
//   =tests/mp-net-camera-target.test.ts（16 测,回归跑）,本档不重复。
//
// ②breakTileBody 特支装饰近似定谳（BJ444 域外登记「门 8/轨道 6/花苞 8/锚桩 6/
//   巨石 8」残余 spawnParticles）——原版逐支亲读定谳（Terarria1457/Terraria/WorldGen.cs）：
//   · 巨石族（654/全 Boulders 集）＝【A 原版真无】→ 本仓装饰自造,退役:
//       KillTile_GetTileDustAmount :67130 case 654 → 0;:67144-67177 零尘族收全
//       TileID.Sets.Boulders（TileID.cs:195 = {138,484,664,665,711-716},本仓
//       BOULDERS_SHEETS 同表）——Check2x2 级联逐格 KillTile（:48973-48983）尘亦 0
//       ⇒ 巨石破坏全程零尘。BJ444 原判「巨石 8」成立。
//   · 门（10 闭/11 开）＝【B 原版有但形态不同】→ 按原版重做:
//       BJ444 原判「TileFrame 级联直清无逐格尘」对门【不成立】——CheckDoorClosed
//       :87774-87786 对闭门 1×3 余格逐 KillTile / CheckDoorOpen :87673-87681 对
//       开门 2×3 余格逐 KillTile,每格走 :64212 尘段（10/11 表外=default 10 粒）。
//       原版总量=闭门 3×10 / 开门 6×10（被击格+级联格）;旧码=头位 10+单点装饰 8
//       且级联直清无尘。修=单点装饰退役+余格逐格补 spawnTileDustAt（clearDoorAt 前
//       =格尚在,原版尘位在格清前同相）。
//   · 花苞（238/236/702）＝【B 原版有但形态不同】→ 按原版重做:
//       CheckJunglePlant :48452-48463 对 2×2 余格逐 KillTile（每格 default 10 粒;
//       被击格已死被跳过）——原判「级联直清无尘」同样不成立。修=清格循环对非被击格
//       补 spawnTileDustAt+单点装饰退役。
//   · 轨道（314）＝【B→按原版=退役装饰】:原版轨道破坏尘=仅被击格 :64212（表外
//       default 10 粒,头位已单源承担）;邻轨只 reframe 不破坏（TileFrameImportant
//       轨道段无 KillTile）＝无级联尘——旧 6 粒装饰为超原版面,退役。
//   · 锚桩（723/724）＝【B→按原版=退役装饰】:原版锚桩破坏=被击格 KillTile :64212
//       （表外 default 10 粒;:64205 DropItemForTileBreak 无 return 尘照发）;1×1 无
//       级联面——旧 6 粒装饰为超原版面,退役。
//   判别面（本档）：破坏各 tile → spawnParticles 装饰零调用;门/花苞级联余格逐格
//   spawnTileDustAt;轨道/锚桩/巨石仅被击格单尘位;巨石零尘表锚（getTileDustAmount）。
//
// ③尘池 spawn 期屏外裁剪（BJ444 观察项）：原版语义定谳（只定谳,落刀排 BJ457 后,
//   同域 VanillaDust.ts 在途）——Dust.NewDust :97-101:margin=(int)(400×(1−dCount)),
//   视口=screenPosition 外扩 margin 四向,spawn 盒=(Position,10,10) 恒定（非 w/h 形参）,
//   不相交→return 6000（拒且零 RNG 消费,先于密度梯 :106-151）;dCount 阶梯=
//   UpdateDust 尾 :2465-2496 按活跃数/maxDustToDraw 分位 {0,0.5,0.6,0.7,0.8,0.9}
//   （margin ∈ {400,200,160,120,80,40}）;NewDustPerfect :52-63 无此裁剪（本仓
//   perfect/prettySparkle 载体通道同相豁免）。落刀方案（排 BJ457 后）：
//   VanillaDust.spawn 头（ps/载体豁免支之后、密度门之前,零 RNG 早退）+update 暂存
//   视口（screenX/Y/W/H 已有形参）+dCount 阶梯（activeCount 既有逐帧重数）——
//   判别：屏外 spawn 拒（池零新增）/视口外 margin 内照常入池/Perfect 通道不裁。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { T, TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { getTileDustAmount } from '../src/world/TileDust';
import { placeDoorClosed } from '../src/world/Door';

const S = (sheet: number): number => {
  const id = TILE_INTERNAL_BY_SHEET.get(sheet);
  if (id === undefined) throw new Error(`TILE_INTERNAL_BY_SHEET 缺 sheet ${sheet}`);
  return id;
};

interface ParticleRec { x: number; y: number; color: string; count: number; speed: number }
interface DustRec { x: number; y: number; fail: boolean }
interface Rec {
  parts: ParticleRec[];
  dust: DustRec[];
  rolls: number[];
  boss: number[];
}

/** breakTile 可驱动面最小桩（shell 形制同 tests/bj113-breakhive-tileface.test.ts） */
function mkShell(): { g: Game & Record<string, unknown>; w: World; rec: Rec } {
  const w = new World(60, 60, 1, 'bj460sweep');
  const rec: Rec = { parts: [], dust: [], rolls: [], boss: [] };
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown> & {
    breakTile(x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {} } as never;
  g.recLog = () => {};
  // 记录器：spawnParticles=装饰面（BJ460② 判零）;spawnTileDustAt=原版 :64212 尘位
  // 接线面（量值语义由 getTileDustAmount 1:1 表另行锁定, BJ444 套件）
  g.spawnParticles = (x: number, y: number, color: string, count: number, speed: number) => {
    rec.parts.push({ x, y, color, count, speed });
  };
  g.spawnTileDustAt = (x: number, y: number, fail: boolean) => {
    rec.dust.push({ x, y, fail });
  };
  g.spawnDrop = () => null;
  // 私有方法桩走索引别名（TS2341 面）——shell 型制同 bj113（Game & Record<string,unknown>）
  const priv = g as unknown as Record<string, unknown>;
  priv.spawnBoulderFamilyRoll = (ax: number, ay: number, sheet: number) => {
    rec.rolls.push(sheet + ax * 0 + ay * 0);
  };
  priv.killTileBreakSound = () => {};
  g.spawnBossOnPlayer = ((id: number) => { rec.boss.push(id); }) as never;
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.leashed = { netIdsAt: () => [], removeAt: () => {} } as never;
  // 玩家钉远处（>50 格）：花苞支 SpawnOnPlayer 距离门外（原版 :48423 同门）
  g.player = { x: 5000 * 16, y: 5000 * 16, cx: 5000 * 16, cy: 5000 * 16, equipStats: {} } as never;
  g.trackTile = TILE_BY_KEY['v_314_minecart_track'] ?? 0;
  return { g, w, rec };
}

const dustCells = (rec: Rec): string[] => rec.dust.map((d) => `${d.x},${d.y}`);

describe('BJ460② A 面：巨石族原版零尘（GetTileDustAmount :67130/:67144 零尘族）', () => {
  it('零尘表锚：654 + 全 Boulders 集（TileID.cs:195 {138,484,664,665,711-716}）恒 0', () => {
    for (const s of [654, 138, 484, 664, 665, 711, 712, 713, 714, 715, 716]) {
      expect(getTileDustAmount(false, s, 0)).toBe(0);
    }
  });

  it('654 炸药桶挖除：装饰零粒子+单尘位（被击格头位）+滚石单发保留', () => {
    const { g, w, rec } = mkShell();
    const t = S(654);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTile(20 + dx, 20 + dy, t, dx * 18, dy * 18);
    }
    g.breakTile(20, 20, true);
    expect(rec.parts.length).toBe(0);                       // 8 粒装饰退役=零装饰面
    expect(dustCells(rec)).toEqual(['20,20']);              // 仅被击格头位（级联零尘）
    expect(rec.rolls.length).toBe(1);                       // 滚石单发（BJ102 归一面不动）
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(20 + dx, 20 + dy)).toBe(0);        // 2×2 整件清
    }
  });

  it('巨石族 138 挖除：装饰零粒子+单尘位', () => {
    const { g, w, rec } = mkShell();
    const t = S(138);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTile(20 + dx, 20 + dy, t, dx * 18, dy * 18);
    }
    g.breakTile(21, 21, true);                              // 打右下格（锚反推面）
    expect(rec.parts.length).toBe(0);                       // 6 粒装饰退役
    expect(dustCells(rec)).toEqual(['21,21']);
    expect(rec.rolls.length).toBe(1);
  });
});

describe('BJ460② B 面：门级联逐格尘（CheckDoorClosed :87774/CheckDoorOpen :87673）', () => {
  it('原版量基座：10/11 表外=default 10（每格 KillTile :64212 尘段）', () => {
    expect(getTileDustAmount(false, 10, 0)).toBe(10);
    expect(getTileDustAmount(false, 11, 0)).toBe(10);
  });

  it('闭门 1×3 破中格：3 尘位（被击+2 余格）、装饰零粒子、整门清', () => {
    const { g, w, rec } = mkShell();
    placeDoorClosed(w.store, 20, 20, 0);                    // cells (20,20..22)
    g.breakTile(20, 21, true);
    expect(rec.parts.length).toBe(0);                       // 8 粒单点装饰退役
    expect(dustCells(rec).sort()).toEqual(['20,20', '20,21', '20,22'].sort());
    for (let dy = 0; dy < 3; dy++) expect(w.store.get(20, 20 + dy)).toBe(0);
  });

  it('开门 2×3 破右列中格：6 尘位（被击+5 余格）、装饰零粒子、整门清', () => {
    const { g, w, rec } = mkShell();
    for (let dy = 0; dy < 3; dy++) {
      w.store.setTile(20, 20 + dy, T.DOOR_OPEN, 0, dy * 18);   // 左列（锚列 fx≡0）
      w.store.setTile(21, 20 + dy, T.DOOR_OPEN, 18, dy * 18);  // 右列 fx=18
    }
    g.breakTile(21, 21, true);
    expect(rec.parts.length).toBe(0);
    expect(dustCells(rec).sort()).toEqual(
      ['21,21', '20,20', '20,21', '20,22', '21,20', '21,22'].sort());
    for (let dy = 0; dy < 3; dy++) {
      expect(w.store.get(20, 20 + dy)).toBe(0);
      expect(w.store.get(21, 20 + dy)).toBe(0);
    }
  });
});

describe('BJ460② B 面：花苞级联逐格尘（CheckJunglePlant :48452-48463 逐格 KillTile）', () => {
  it('238 花苞 2×2 破一格：4 尘位（被击+3 余格）、装饰零粒子、远处不出主', () => {
    const { g, w, rec } = mkShell();
    const t = TILE_BY_KEY['v_238_plantera_s_bulb'];
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTile(20 + dx, 20 + dy, t, dx * 18, dy * 18);
    }
    g.breakTile(21, 20, true);                              // 打右上格（锚反推面）
    expect(rec.parts.length).toBe(0);                       // 8 粒装饰退役
    expect(dustCells(rec).sort()).toEqual(
      ['21,20', '20,20', '20,21', '21,21'].sort());
    expect(rec.boss.length).toBe(0);                        // 玩家 >50 格距离门
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(20 + dx, 20 + dy)).toBe(0);
    }
  });
});

describe('BJ460② B 面：轨道/锚桩仅被击格单尘位（装饰退役）', () => {
  it('原版量基座：314/238/236/702/723/724 表外=default 10', () => {
    for (const s of [314, 238, 236, 702, 723, 724]) {
      expect(getTileDustAmount(false, s, 0)).toBe(10);
    }
  });

  it('轨道 314 破坏：装饰零粒子+单尘位（邻轨 reframe 不破坏=无级联尘）', () => {
    const { g, w, rec } = mkShell();
    w.store.setTile(20, 20, S(314), 0, 0);
    g.breakTile(20, 20, true);
    expect(rec.parts.length).toBe(0);                       // 6 粒装饰退役
    expect(dustCells(rec)).toEqual(['20,20']);
    expect(w.store.get(20, 20)).toBe(0);
  });

  it('锚桩 724 破坏：装饰零粒子+单尘位（1×1 无级联面）', () => {
    const { g, w, rec } = mkShell();
    w.store.setTile(20, 20, TILE_BY_KEY['v_724_critter_anchor'], 0, 0);
    g.breakTile(20, 20, true);
    expect(rec.parts.length).toBe(0);                       // 6 粒装饰退役
    expect(dustCells(rec)).toEqual(['20,20']);
    expect(w.store.get(20, 20)).toBe(0);
  });
});
