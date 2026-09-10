// SW-RB11f 红蓝对抗审计批（FX14/FX16/FX19/BJ55 四批交叉复核）修复面回归。
//  每组给出「旧实现退化值」——回退任一刀对应断言必红（变异证红面）。
//  F1/F2 重力总闸调用点：Player.cs:25436(CCed 清零)→:26892(翻转门)→:29324(快照)
//  F3 tier2 倒挂头门带：Player.cs:21957 (vy>0∧gd==1)∨(vy<gravity∧gd==-1)
//  F4 图标列顶 Y：Main.cs:48166-48169 start.Y += 24*torchGodIcons − flag*24
//  F5 快捷栏一键多绑末槽胜：Player.cs:25289-25330 十连 if 顺序覆写 num7
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player, updateGravityControls } from '../src/entities/Player';
import { BuffType } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { options } from '../src/core/Options';
import { hotbarSlotOfCode } from '../src/core/Keybinds';
import { builderAccColumnTopY } from '../src/stats/builderAcc';
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

function flatWorld(): World {
  const w = new World(480, 80, 30, 'open');
  for (let x = 0; x < w.w; x++) {
    w.store.setTileSilent(x, 70, 1, 0, 0);
    w.store.setTileSilent(x, 71, 1, 0, 0);
  }
  return w;
}

/** 天花板+悬柱世界（sw-fx19-gravity 同基） */
function ceilingWorld(): World {
  const w = new World(480, 80, 30, 'open');
  for (let x = 40; x < 160; x++) {
    w.store.setTileSilent(x, 30, 1, 0, 0);
    w.store.setTileSilent(x, 31, 1, 0, 0);
  }
  for (let y = 30; y <= 69; y++) w.store.setTileSilent(100, y, 1, 0, 0);
  return w;
}

const step = (p: Player, game: GameHooks): void => p.fixedUpdate(1 / 60, game);

describe('RB11f F1/F2 重力总闸调用点（冻/惑清零之后 + 边沿锁全链）', () => {
  it('F1 按住 ↑ 整段只翻一次（边沿非电平——旧 Game 位 gravLatch 只清不置=每拍翻转必红）', () => {
    const game = makeGame(flatWorld());
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.buffs.apply(BuffType.Gravitation, 600);
    p.inputUp = true;
    step(p, game);
    expect(p.gravDir).toBe(-1);          // 按下沿翻转
    step(p, game);
    step(p, game);
    expect(p.gravDir).toBe(-1);          // ★F1：按住不连切（旧位电平 → +1 必红）
    p.inputUp = false;
    step(p, game);
    expect(p.gravDir).toBe(-1);          // 药水在身：松键不归位（:26936 else 支不进）
    p.inputUp = true;
    step(p, game);
    expect(p.gravDir).toBe(1);           // 松后再按 = 新边沿翻回
  });

  it('F2 冻结态清输入先于翻转门（Player.cs:25436→26892 位序——旧位读冻结前裸输入必红）', () => {
    const game = makeGame(flatWorld());
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.buffs.apply(BuffType.Gravitation, 600);
    p.buffs.apply(BuffType.Frozen, 60);
    p.inputUp = true;
    step(p, game);
    expect(p.gravDir).toBe(1);           // 冻结中不翻转
    p.buffs.remove(BuffType.Frozen);
    p.inputUp = false;
    step(p, game);                       // 冻结期间"看不见"的按住不消费（releaseUp 未写）
    p.inputUp = true;
    step(p, game);
    expect(p.gravDir).toBe(-1);          // 解冻后新边沿照常翻转
  });

  it('F2b 困惑换位 Up←后写 Right（=旧 Left,:25190）先于翻转门——按 ← 翻转（原版 quirk）', () => {
    const game = makeGame(flatWorld());
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.buffs.apply(BuffType.Gravitation, 600);
    p.buffs.apply(BuffType.Confused, 60);
    p.inputX = -1;                       // 按 ←（困惑换位 → inputUp）
    p.inputUp = false;
    step(p, game);
    expect(p.gravDir).toBe(-1);          // 换位后的 Up 边沿照常驱动翻转门
  });

  it('守恒：纯函数本体（upEdge/无源复位/骑乘门）不因调用点迁移变味', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.buffs.apply(BuffType.Gravitation, 600);
    updateGravityControls(p, true, undefined);
    expect(p.gravDir).toBe(-1);
    p.gravDir = -1;
    p.buffs.remove(BuffType.Gravitation);
    updateGravityControls(p, false, undefined);
    expect(p.gravDir).toBe(1);           // 无源复位（:26936-26937,死锁修复面守恒）
  });
});

describe('RB11f F3 tier2 倒挂头门 vy∈[0,gravity) 带（Player.cs:21957）', () => {
  it('倒挂+984 贴墙 vy=0（碰撞钳帧）仍驻停（旧门 vy*gd>0 在带内恒 false 必红）', () => {
    const game = makeGame(flatWorld());
    const inv = new Inventory();
    inv.armor[3] = { id: iid(984), stack: 1 };                 // spikedBoots=2
    const p = new Player(60 * TILE, 60 * TILE, inv);
    p.buffs.apply(BuffType.Gravitation, 9999);                 // 倒挂源（无源倒挂被总闸归 1）
    p.gravDir = -1;
    p.vy = 0;                              // 碰撞钳 0 帧/顶棚相邻态 = [0,0.4) 带
    p.inputX = 1;
    p.hitWall = true;
    p.onGround = false;
    step(p, game);
    expect(p.wallCling).toBe(true);        // ★F3：vy<gravity 带内即挂
  });

  it('守恒：gd=1 半边逐位恒等——下落中贴墙照常驻停（vy>0 支）', () => {
    const game = makeGame(ceilingWorld());
    const inv = new Inventory();
    inv.armor[3] = { id: iid(984), stack: 1 };
    const p = new Player(100 * 16 - 20, 34 * 16, inv);
    p.gravDir = 1;
    p.vy = 2;
    p.inputX = 1;
    p.hitWall = true;
    step(p, game);
    expect(p.wallCling).toBe(true);
  });

  it('守恒：gd=1 站地贴墙 vy=0 不挂（vy>0 支自然排除落地态——撤 !onGround 无外溢）', () => {
    const w = flatWorld();
    for (let y = 60; y <= 69; y++) w.store.setTileSilent(62, y, 1, 0, 0);   // 玩家右侧立柱
    const game = makeGame(w);
    const inv = new Inventory();
    inv.armor[3] = { id: iid(984), stack: 1 };
    const p = new Player(61 * TILE - 20, 0, inv);
    p.y = 70 * TILE - p.h;                 // 站 y=70 行地板顶,右侧贴柱
    p.gravDir = 1;
    p.inputX = 1;
    for (let t = 0; t < 40; t++) step(p, game);
    expect(p.onGround).toBe(true);
    expect(p.wallCling).toBe(false);       // 落地态 vy=0 → 内层 vy>0 门排除（原版同）
  });
});

describe('RB11f F4 图标列顶 Y（Main.cs:48166-48169）', () => {
  it('炬神位 +24 与 total>=10 上移 −24 叠算（旧实现漏 torch 支=101 处恒 77 必红）', () => {
    expect(builderAccColumnTopY(false, false)).toBe(77);
    expect(builderAccColumnTopY(false, true)).toBe(53);
    expect(builderAccColumnTopY(true, false)).toBe(101);   // ★F4
    expect(builderAccColumnTopY(true, true)).toBe(77);     // 炬位与上移相抵=原版同值
  });
});

describe('RB11f F5 快捷栏一键多绑末槽胜（Player.cs:25289-25330）', () => {
  it('Digit5 ∈ Hotbar1∧Hotbar10 → 槽 9（旧实现首中=槽 0 必红）', () => {
    const saved = options.data.keybinds;
    options.data.keybinds = {
      ...saved, Hotbar1: ['Digit5'], Hotbar10: ['Digit5'],
    };
    try {
      expect(hotbarSlotOfCode('Digit5')).toBe(9);          // ★F5：十连 if 覆写,末写胜
      expect(hotbarSlotOfCode('Digit2')).toBe(1);          // 未改槽缺省基线不回退
      expect(hotbarSlotOfCode('Digit1')).toBe(null);       // 自定义表整表替换缺省（bindsOf 语义）
      expect(hotbarSlotOfCode('KeyQ')).toBe(null);         // 无命中
    } finally {
      options.data.keybinds = saved;
    }
  });
});
