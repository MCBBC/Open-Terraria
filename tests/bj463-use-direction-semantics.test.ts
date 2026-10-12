// ★BJ463（2026-10-03）用户实报「使用工具时点击角色左边或右边可以改变角色朝向，怀疑与
// 原版不同」定谳 + 落刀回归。
//
// 金标（Terarria1457 反编译 Player.cs 朝向写位穷举 census——ChangeDir 调用 11 处 /
// direction 直写 12 处 / 变体写位(*=) 0 处全表核对）：
//  - 唯二常规面向写位：
//    ① HorizontalMovement :19962-19973 移动键门——
//       flag3 = (itemAnimation == 0 || useTurn) && mount.AllowDirectionChange && !sandStorm
//       → ChangeDir(controlRight - controlLeft)。挥动中：useTurn=true 件（镐/斧/锤/
//       模板 1/10/7 等）可被移动键中途转向；useTurn=false 件（阔剑模板 4）全程锁向。
//    ② ItemCheck_Shoot :47625-47634 Dot 门面向鼠标（Main.MouseWorld -
//       RotatedRelativePoint(MountedCenter)），调用门 OwnerOnlyCode :43902-43904
//       `(sItem.shoot > 0) & flag4`，flag4 = :43848 `(itemAnimation > 0 &&
//       ItemTimeIsZero) & flag`——**仅 shoot>0 物品**面向鼠标；shootsEveryUse 件降为
//       仅起手 tick（:43855-43857）。
//  - shoot=0 工具【无任何点击面向】：铜镐 3509（SetDefaults1(1) pick=35）/ 铜斧 3506
//    （SetDefaults1(10) axe=7）/ 铜锤 3505（SetDefaults1(7) hammer=35）shoot=0；
//    挖掘全路径 ItemCheck_UseMiningTools :45971-46031 + ActuallyUseMiningTool
//    :46033-46220 零 direction 写位；放置全路径 PlaceThing :39891-41100 区零
//    ChangeDir / 零 direction 直写（油漆/电路/铺墙/物块同区）。
//  - 「高级镐」特例 = channel 弹族（Drax 579 shoot=107 / 激光钻 2798→445 /
//    屠夫链锯 3098→509 / 叶绿插孔锤 1262→252；useStyle 5 + channel + noUseGraphic，
//    弹 aiStyle 20/75）：起手 ItemCheck_Shoot 面向 + AI_020 弹体逐 tick
//    ChangeDir(velocity.X 符号)（Projectile.cs :25875-25883）。
//  - 短剑族（铜短剑 3507 shoot=938，SetDefaults1(6) 短剑模板 shoot=940 被逐件覆写
//    938-945，弹 aiStyle 161）= shoot>0 → ItemCheck_Shoot 面向光标。
// 用户实机原版对拍（2026-10-03）：「武器可按光标点击转向 / 斧头镐子不可 / 部分高级镐
// （钻锯族）可」——与源码 census 逐点互证。
// 本仓差异（落刀面）：工具支起手无条件面向目标格（旧 Game.ts :15523）+ 放置四支
//    faceCursor（旧 :15610/:15628/:15640/:15658，油漆/电路/铺墙/物块）——系 2026-08-31
//    「ChangeDir 家族合并口」把 ItemCheck_Shoot 的 shoot>0 门误植到 shoot=0 全物品面
//    （旧注引 1456 :46561-46589 即 ItemCheck_Shoot 本体，非全物品面）。
// 修复：删工具支面向写位 + 删放置四支 faceCursor 调用；保留 Dirt Rod（shoot=17>0，
//    :22776）与钻锯支（aiStyle 20/75）面向 = 原版同相。
import { describe, it, expect } from 'vitest';

import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { newWiresRadialState } from '../src/stats/wiresRadial';

const iidOf = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 直驱最小 Game 桩（bj257 stubGame 惯例；mouseWorld 可调光标世界侧向，
 *  tile 参数随光标侧对齐——tileUnder 与 screenToWorld 同侧,防镜像用例假绿） */
function stubGame(heldVid: number, mouseWorld: [number, number], facing: -1 | 1, tile: [number, number] = [60, 60]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iidOf(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iidOf(heldVid));
  player.inv.selected = Math.max(0, sel);
  player.facing = facing;
  g.player = player;
  g.world = new World(120, 120, 30, 'bj463');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: () => {} };
  g.input = {
    mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = {
    tileUnder: () => tile,
    screenToWorld: () => mouseWorld,
    x: 800, y: 0,
  };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  // ★BJ662（2026-10-12）BJ626 bj545/bj536 壳桩同款：updateUse 头 tickWiresRadial
  //  （BJ572 落线）读 this.wiresRadial——Object.create 壳无构造器字段 →
  //  flowerUpdate(st=undefined) TypeError（BJ646/BJ651 登记存量红,桩仅为通路;
  //  镐/斧/锤/物块族非 wire 工具走 flowerUpdate 早退支）
  g.wiresRadial = newWiresRadialState();
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.sfx = { play: () => {}, playWav: () => {}, playWavFile: () => {}, playFiles: () => {} };
  g.playSfxFile = () => {};
  g.playSfxWav = () => {};
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.newText = () => {};
  g.recLog = () => {};
  return {
    g, player,
    run: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60),
  };
}

/** 光标世界位：玩家中心 cx=810，右侧取 1200 / 左侧取 400；tile 列随侧向对齐
 *  （玩家 x=800 → 右=60 列 / 左=40 列，tileUnder 与 screenToWorld 同侧） */
const RIGHT: [number, number] = [1200, 500];
const LEFT: [number, number] = [400, 500];
const TILE_RIGHT: [number, number] = [60, 60];
const TILE_LEFT: [number, number] = [40, 60];

describe('BJ463 定谳：shoot=0 工具（镐/斧/锤）点击不改变朝向（原版 census 锁）', () => {
  it('铜镐 3509 面朝左、点身位右侧：起手挥击照常，但朝向保持 -1（判别——落刀前红）', () => {
    const s = stubGame(3509, RIGHT, -1);
    s.run();
    // 挥击确实起手（useTime=spd>0）——排除"分支没进"假绿
    expect(s.player.useTime).toBeGreaterThan(0);
    // ★原版：shoot=0 工具无点击面向（ItemCheck_Shoot 门 :43902-43904 恒不进）
    expect(s.player.facing).toBe(-1);
  });
  it('铜镐 3509 面朝右、点身位左侧：不转向（镜像对称）', () => {
    const s = stubGame(3509, LEFT, 1, TILE_LEFT);
    s.run();
    expect(s.player.useTime).toBeGreaterThan(0);
    expect(s.player.facing).toBe(1);
  });
  it('铜镐对空气格点击（tileUnder=空域）：同样不转向（空点击判别）', () => {
    const s = stubGame(3509, RIGHT, -1, [70, 15]);
    (s.g.camera as { tileUnder: () => [number, number] }).tileUnder = () => [70, 15]; // 高空空域
    s.run();
    expect(s.player.useTime).toBeGreaterThan(0);
    expect(s.player.facing).toBe(-1);
  });
});

describe('BJ463 定谳：放置路径点击不改变朝向（PlaceThing :39891-41100 零 ChangeDir census 锁）', () => {
  it('泥块 2 面朝左、点身位右侧：起手放置照常，但朝向保持 -1（判别——落刀前红）', () => {
    const s = stubGame(2, RIGHT, -1);
    s.run();
    expect(s.player.facing).toBe(-1);
  });
});

describe('BJ463 同相锁：shoot>0 面向语义保留（用户实测"武器可转向/高级镐特例"）', () => {
  it('铜短剑 3507（shoot=938，aiStyle 161 stab）点击身位右侧：面向光标（ItemCheck_Shoot 同相）', () => {
    const s = stubGame(3507, RIGHT, -1);
    s.run();
    expect(s.player.facing).toBe(1);
  });
  it('铜阔剑 3508（shoot=0，SetDefaults1(4) useTurn=false）：点击不转向（判别——落刀前红）', () => {
    const s = stubGame(3508, RIGHT, -1);
    s.run();
    expect(s.player.facing).toBe(-1);
  });
  it('Drax 579（shoot=107，弹 aiStyle 20 channel）点击身位右侧：面向光标（AI_020 弹体 ChangeDir 同相）', () => {
    const s = stubGame(579, RIGHT, -1);
    s.run();
    expect(s.player.facing).toBe(1);
  });
});

// ============ 移动键 useTurn 门（HorizontalMovement :19962-19973 唯二面向源①）============
const fakeHooks = (w: World, p?: Player) => ({
  world: w,
  player: p,
  enemies: () => [],
  critters: () => [],
  npcs: () => [],
  spawnDrop: () => null,
  damagePlayer: (): number => 0,
  addDamageNumber: () => {},
  cutTile: () => {},
  breakTile: () => {},
  onEnemyKilled: () => {},
  spawnEnemy: () => {},
  spawnParticles: () => {},
  spawnDust: () => null,
  notifyInventoryChanged: () => {},
  playSfx: () => {},
  playSfxFiles: () => {},
  showPickupLabel: () => {},
});
const mkWorld = (): World => {
  const w = new World(60, 100, 72, 'bj463-move');
  for (let x = 12; x <= 40; x++) w.store.setTileSilent(x, 60, 1);
  return w;
};
const mkPlayer = (): Player => new Player(20 * 16, 57 * 16, new Inventory());
const settle = (p: Player, w: World, ticks = 16): void => {
  for (let i = 0; i < ticks; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};

describe('BJ463 定谳：挥动中朝向控制归移动键（useTurn 门），不归点击', () => {
  it('挥动中（useTurn=true 工具族）持反向移动键：朝向随移动键翻转（:19965 门放行）', () => {
    const w = mkWorld();
    const p = mkPlayer();
    settle(p, w);
    p.inputX = 1;
    p.itemAnimTicks = 10;      // 挥动窗（Game 注入等效 :9889）
    p.itemUseTurn = true;      // 镐/斧/锤 useTurn=true（模板 1/10/7）
    p.facing = -1;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.facing).toBe(1);
  });
  it('挥动中（useTurn=false 阔剑族）：移动键不翻面（:19965 门锁向）', () => {
    const w = mkWorld();
    const p = mkPlayer();
    settle(p, w);
    p.inputX = 1;
    p.itemAnimTicks = 10;
    p.itemUseTurn = false;     // 阔剑模板 4 useTurn=false
    p.facing = -1;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.facing).toBe(-1);
  });
  it('非挥动中（itemAnimTicks=0）：移动键正常翻面（itemAnimation==0 支）', () => {
    const w = mkWorld();
    const p = mkPlayer();
    settle(p, w);
    p.inputX = 1;
    p.itemAnimTicks = 0;
    p.useTime = 0;
    p.itemUseTurn = false;     // 非 useTurn 件闲置时移动键照常转向
    p.facing = -1;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.facing).toBe(1);
  });
});
