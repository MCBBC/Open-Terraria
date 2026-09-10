// SW-FX19 域①：反重力 gravDir 消费矩阵补齐回归（1457 金标逐锚）。
//  金标：Player.cs:26893-26937（gravControl 总闸）/ :21955-22016（WallslideMovement
//  双档 ×gravDir）/ :23168-23208（StickyMovement Y 阻尼镜像）/ :26312-26314
//  （倒挂禁飞毯新激活）/ :27866-27869（倒挂禁水上行走）。
//  ★变异证红：每断言组给出「旧实现退化值」——回退任一刀对应组必红。
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player, updateGravityControls } from '../src/entities/Player';
import { BuffType } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { GRAVITY, TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

function makeGame(w: World, hooks?: Partial<GameHooks>): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    vanillaDust: { spawn: () => null } as never,
    ...hooks,
  } as unknown as GameHooks;
}

/** 平地世界（480×80 像素边 ≤1280 → bordersMovement 豁免,player-ledger-aug31 同基） */
function flatWorld(): World {
  const w = new World(480, 80, 30, 'open');
  for (let x = 0; x < w.w; x++) {
    w.store.setTileSilent(x, 70, 1, 0, 0);
    w.store.setTileSilent(x, 71, 1, 0, 0);
  }
  return w;
}

const step = (p: Player, game: GameHooks): void => p.fixedUpdate(1 / 60, game);

describe('重力倒置总闸 updateGravityControls（Player.cs:26893-26937）', () => {
  it('① 药水 buff 18 + Up 按下沿 → 翻转 gravDir + fallStart 重置 + jump=0 + 音效 8', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.buffs.apply(BuffType.Gravitation, 180);
    p.fallStartY = null;
    p.jumpHold = 12;
    const sfx: string[] = [];
    updateGravityControls(p, true, (n) => sfx.push(n));       // Up 按下沿
    expect(p.gravDir).toBe(-1);
    expect(p.fallStartY).toBe(p.y);                            // fallStart = position.Y/16
    expect(p.jumpHold).toBe(0);                                // jump = 0
    expect(sfx).toEqual(['door_open']);                        // SoundID.Item8=DoorOpen
    updateGravityControls(p, true, undefined);                 // 再按（新边沿）翻回
    expect(p.gravDir).toBe(1);
  });
  it('② 非沿（按住 Up）不翻转（releaseUp 上一帧值语义）', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.buffs.apply(BuffType.Gravitation, 180);
    updateGravityControls(p, false, undefined);
    expect(p.gravDir).toBe(1);                                 // 恒 1（无翻转）
    updateGravityControls(p, true, undefined);
    expect(p.gravDir).toBe(-1);
    updateGravityControls(p, false, undefined);                // 下一帧按住不放 → 沿已消费
    expect(p.gravDir).toBe(-1);                                // 不连切
  });
  it('③ ★无源每 tick 复位 gravDir=1（:26936-26937）——药水过期后不再死锁倒挂', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.gravDir = -1;                                            // 倒挂态（旧 buff 残留）
    updateGravityControls(p, false, undefined);                // buff 已过期（无源）
    expect(p.gravDir).toBe(1);                                 // 旧实现无 else 支 → 恒 -1 死锁
  });
  it('④ 骑乘门（flag18 = !mount.Active）——骑乘中不翻转且每 tick 归 1', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.buffs.apply(BuffType.Gravitation, 180);
    p.mount.active = true;
    updateGravityControls(p, true, undefined);
    expect(p.gravDir).toBe(1);                                 // :26936-26937 else 支
  });
  it('⑤ forcedGravity>0 → 恒 -1（:26894-26896,FTW 克脑）', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.forcedGravityT = 5;
    updateGravityControls(p, false, undefined);
    expect(p.gravDir).toBe(-1);
  });
});

describe('WallslideMovement 倒挂镜像（:21955-22016 全速 ×gravDir）', () => {
  /** 天花板+悬柱世界：顶棚 y=30/31 行,柱 x=100 行 30..44;玩家倒挂贴柱 */
  function ceilingWorld(): World {
    const w = new World(480, 80, 30, 'open');
    for (let x = 40; x < 160; x++) {
      w.store.setTileSilent(x, 30, 1, 0, 0);
      w.store.setTileSilent(x, 31, 1, 0, 0);
    }
    for (let y = 30; y <= 69; y++) w.store.setTileSilent(100, y, 1, 0, 0);
    return w;
  }
  it('① tier1（953 鞋钉）倒挂 ↓ 快滑 = 4×gravDir = −4（旧实现恒 +4）', () => {
    const game = makeGame(ceilingWorld());
    const inv = new Inventory();
    inv.armor[3] = { id: iid(953), stack: 1 };                 // spikedBoots=1
    const p = new Player(100 * 16 - 20, 34 * 16, inv);         // 柱左贴脸,倒挂上坠
    // ★SW-RB11f：倒挂态补重力源（buff 18——Player.cs:26893-26937 总闸迁入
    //  fixedUpdate 后,无源倒挂被 :26936-26937 else 支每拍归 1 = 原版不可达态;
    //  药水在身 + 不按 ↑ → else 支不进,倒挂驻存）
    p.buffs.apply(BuffType.Gravitation, 600);
    p.gravDir = -1;
    p.inputX = 1;
    p.inputDown = true;
    let saw = false;
    for (let t = 0; t < 120 && !saw; t++) { step(p, game); saw = p.wallCling && p.vy <= -3.9; }
    expect(saw).toBe(true);                                    // 快滑写 −4(+重力斜率 0.25×0.4=−0.1)
                                                               // 旧码 vy=+4（未 ×gravDir）→ +3.9 必红
  });
  it('② tier2（984）倒挂驻停 = (−gravity+1e-5)×gravDir ≈ +0.4 缓沉（旧实现 −0.3）', () => {
    const game = makeGame(ceilingWorld());
    const inv = new Inventory();
    inv.armor[3] = { id: iid(984), stack: 1 };                 // spikedBoots=2（:15180 =2）
    const p = new Player(100 * 16 - 20, 34 * 16, inv);
    p.buffs.apply(BuffType.Gravitation, 600);                  // ★SW-RB11f：倒挂源同上
    p.gravDir = -1;
    p.inputX = 1;
    let saw = false;
    for (let t = 0; t < 120 && !saw; t++) {
      step(p, game);
      saw = p.wallCling && p.vy > 0.27 && p.vy < 0.35;         // 写 (−0.4+1e-5)×(−1)=0.39999
    }                                                          // +松键衰减 0.01+重力斜率 0.1 → 0.29
    expect(saw).toBe(true);                                    // 驻停镜像:倒挂=向 +y 缓沉;旧码 +0.5 必红
  });
  // ③ 普通重力基线由既有套件覆盖（tests/player-ledger-aug31.test.ts 贴墙缓降）——略。
});

describe('StickyMovement Y 阻尼镜像（Player.cs:23168-23208 双支）', () => {
  it('倒挂蛛网：下落钳 +5、vy>0 ×0.96（旧实现走 gravDir=1 半边 → 0.3 级）', () => {
    const mk = (gravDir: 1 | -1): Player => {
      const w = new World(40, 40, 42, 'open');
      const WEB = TILE_BY_KEY['v_51_cobweb']!;
      for (let y = 18; y <= 21; y++) w.store.setTileSilent(20, y, WEB);
      const p = new Player(20 * 16, 17 * 16, new Inventory());
      p.buffs.apply(BuffType.Gravitation, 600);                // ★SW-RB11f：倒挂源（同上）
      p.gravDir = gravDir;
      p.vy = 8;
      p.fixedUpdate(1 / 60, makeGame(w));
      return p;
    };
    const inverted = mk(-1);
    const normal = mk(1);
    // 倒挂支：重力 −0.4 → vy≈7.6 → 钳 +5 → ×0.96 = 4.8（旧码 0.3 级必红）
    expect(inverted.vy).toBeGreaterThan(4);
    expect(inverted.vy).toBeLessThanOrEqual(5);
    // 普通支对照（基线不回退）：<1 缓沉
    expect(normal.vy).toBeLessThan(1);
  });
});

describe('飞毯倒挂禁新激活（Player.cs:26312-26314;已激活续期 :22038 不受限）', () => {
  it('倒挂中按跳不再点燃飞毯（carpetTime 不走）;普通重力对照 =299', () => {
    const mk = (gravDir: 1 | -1): number => {
      const w = flatWorld();
      const game = makeGame(w);
      const inv = new Inventory();
      inv.armor[3] = { id: iid(934), stack: 1 };               // Flying Carpet → carpet
      const p = new Player(100 * 16, 40 * 16, inv);
      p.buffs.apply(BuffType.Gravitation, 600);                // ★SW-RB11f：倒挂源（同上）
      p.gravDir = gravDir;
      p.vy = gravDir === 1 ? 2 : -2;
      p.inputJump = true;
      step(p, game);
      return p.carpetTime;
    };
    expect(mk(-1)).toBe(0);                                    // 旧码 =299（新激活未禁）必红
    expect(mk(1)).toBe(299);                                   // 基线：300 计入后 −1
  });
});
