// 地牢裂砖族破坏链对账（WorldGen.cs:63837-63895 KillTile 段 + Player.cs:23040-23110
// CheckCrackedBrickBreak + Debris proj 736-738 Kill :75336-75360）。
// 生成端（16.6% 裂砖走廊 DungeonPass / 坑陷阱盖板）与运行时实心、tileNoFail 秒挖、
// 爆炸可毁、腐化不可替换、钩爪 1/16 抓碎在各自模块已有实现/测试——本文件测新增三链。
import { describe, expect, it, vi } from 'vitest';
import { World } from '../src/world/World';
import { crackedChainKill, isCrackedSheet } from '../src/world/CrackedBricks';
import { DebrisProj } from '../src/entities/DebrisProj';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const CRACK = () => TILE_BY_KEY['v_482_cracked_green_brick']!;
const DIRT = () => TILE_BY_KEY['dirt']!;

describe('crackedChainKill（连锁崩塌 :63838-63866）', () => {
  it('掷签全中：3×3 裂砖从中心碎穿全墙（noItem 防重入不死循环）', () => {
    const w = new World(40, 100, 7, 'chain');
    for (let x = 19; x <= 21; x++) for (let y = 19; y <= 21; y++) w.store.setTileSilent(x, y, CRACK());
    w.store.setTileSilent(20, 20, 0);                       // 首格由调用方清
    const killed = crackedChainKill(w.store, 20, 20, () => 0);   // rng 恒中（Next(den)==0）
    expect(killed.length).toBe(8);                          // 3×3-首格
    for (let x = 19; x <= 21; x++) for (let y = 19; y <= 21; y++) {
      expect(w.store.get(x, y), `${x},${y}`).toBe(0);       // 全清
    }
  });

  it('掷签全不中：零连锁', () => {
    const w = new World(40, 100, 7, 'chain0');
    for (let x = 19; x <= 21; x++) for (let y = 19; y <= 21; y++) w.store.setTileSilent(x, y, CRACK());
    w.store.setTileSilent(20, 20, 0);
    expect(crackedChainKill(w.store, 20, 20, () => 0.99).length).toBe(0);
    expect(w.store.get(19, 20)).toBe(CRACK());              // 邻格原样
  });

  it('邻域非裂砖格不传染（普通地牢砖完好）', () => {
    const w = new World(40, 100, 7, 'chain1');
    w.store.setTileSilent(20, 20, 0);
    w.store.setTileSilent(19, 20, TILE_BY_KEY['v_43_green_dungeon_brick'] ?? 43);  // 普通绿砖
    const killed = crackedChainKill(w.store, 20, 20, () => 0);
    expect(killed.length).toBe(0);
  });

  it('isCrackedSheet：481-483 命中、480/484 与 undefined 不中', () => {
    expect(isCrackedSheet(481)).toBe(true);
    expect(isCrackedSheet(483)).toBe(true);
    expect(isCrackedSheet(480)).toBe(false);
    expect(isCrackedSheet(484)).toBe(false);
    expect(isCrackedSheet(undefined)).toBe(false);
  });

  it('掉落映射：275/276/277（同色地牢砖物品，:67003）均有物品 key', () => {
    for (const vid of [275, 276, 277]) {
      expect(VANILLA_ITEM_KEY_BY_ID[vid], `item ${vid}`).toBeTruthy();
    }
  });
});

describe('DebrisProj（弹片 736-738，:7466 + Kill :75336-75360）', () => {
  const mkHooks = (w: World, breakTile?: (x: number, y: number) => void) => ({
    world: w,
    player: { dead: true } as never,          // hitPlayer 的 p.dead 短路
    spawnDrop: () => null,
    spawnParticles: vi.fn(),
    playSfxFile: vi.fn(),
    breakTile,
  }) as unknown as GameHooks;

  it('构造：sheet→projId 映射 + 格心定位 + 初速 (0, 0.41)（:63887-63895）', () => {
    const d = new DebrisProj(482, 1000, 500);
    expect((d as unknown as { projId: number }).projId).toBe(737);
    expect(d.cx).toBe(1000);
    expect(d.cy).toBe(500);
    expect(d.vx).toBe(0);
    expect(d.vy).toBe(0.41);
    expect(d.w).toBe(10);
    expect(d.h).toBe(10);
  });

  it('落地 Kill：正下格裂砖 1/2 掷中 → breakTile 连锁（:75345-75352）', () => {
    const w = new World(40, 100, 7, 'debris');
    const broke: Array<[number, number]> = [];
    const hooks = mkHooks(w, (x, y) => broke.push([x, y]));
    // 弹片在 (20,19) 格心、正下 (20,20) 是裂砖、弹心格 (20,19) 实心（触发 Kill）
    w.store.setTileSilent(20, 19, DIRT());
    w.store.setTileSilent(20, 20, CRACK());
    const d = new DebrisProj(482, 20 * 16 + 8, 19 * 16 + 8);
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1);  // 1/2 掷中
    try {
      d.fixedUpdate(1 / 60, hooks);
      expect(d.dead).toBe(true);                     // 撞块 Kill
      expect(broke).toEqual([[20, 20]]);             // 下格连锁 KillTile（掉落门在 breakTile）
    } finally {
      rnd.mockRestore();
    }
  });

  it('落地 Kill：1/2 掷不中 → 不连锁', () => {
    const w = new World(40, 100, 7, 'debris2');
    const broke: Array<[number, number]> = [];
    const hooks = mkHooks(w, (x, y) => broke.push([x, y]));
    w.store.setTileSilent(20, 19, DIRT());
    w.store.setTileSilent(20, 20, CRACK());
    const d = new DebrisProj(482, 20 * 16 + 8, 19 * 16 + 8);
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9);  // 1/2 掷不中
    try {
      d.fixedUpdate(1 / 60, hooks);
      expect(d.dead).toBe(true);
      expect(broke).toEqual([]);
    } finally {
      rnd.mockRestore();
    }
  });
});

describe('Player.checkCrackedBrickBreak（跑/落撞碎 :23040-23110）', () => {
  const mkHooks = (w: World, breakTile?: (x: number, y: number) => void) => ({
    world: w,
    spawnDrop: () => null,
    spawnParticles: vi.fn(),
    playSfx: vi.fn(),
    addDamageNumber: vi.fn(),
    onInventoryChanged: vi.fn(),
    breakTile,
  }) as unknown as GameHooks;

  it('下落砸穿裂砖平台：vy 过门、破坏区碎一片（掉落走 breakTile）', () => {
    const w = new World(60, 120, 7, 'smash');
    const broke: Array<[number, number]> = [];
    const hooks = mkHooks(w, (x, y) => broke.push([x, y]));
    for (let x = 24; x <= 32; x++) w.store.setTileSilent(x, 30, CRACK());  // 裂砖平台
    // num3=当前脚行（:23076 position.Y 非 y+vy）——须贴平台（脚底距行顶 ≤2px）才扫到；
    // y=438 → y+h+1=481 → num3=30，Inflate(1,1) 盒底 481 与行 30 顶 480 相交
    const p = new Player(28 * 16, 438, new Inventory());
    p.vy = 12;                                              // > rand(2,12) 上限 11.9
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      (p as unknown as { checkCrackedBrickBreak: (g: GameHooks) => void }).checkCrackedBrickBreak(hooks);
      expect(broke.length).toBeGreaterThan(0);              // 砸穿
      expect(p.vy).toBe(1);                                 // :23091 速度钳
      for (const [bx, by] of broke) expect(w.store.get(bx, by) >= 0).toBe(true);
    } finally {
      rnd.mockRestore();
    }
  });

  it('站普通地面水平跑：脚底三点为实心非裂砖 → 不触发（:23060）', () => {
    const w = new World(60, 120, 7, 'smash2');
    const broke: Array<[number, number]> = [];
    const hooks = mkHooks(w, (x, y) => broke.push([x, y]));
    for (let x = 24; x <= 32; x++) w.store.setTileSilent(x, 30, DIRT());   // 普通地板
    for (let y = 26; y <= 29; y++) w.store.setTileSilent(32, y, CRACK());  // 前方裂砖墙
    const p = new Player(28 * 16, 29 * 16 + 16 - 42, new Inventory());     // 站地板
    p.vx = 12;
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      (p as unknown as { checkCrackedBrickBreak: (g: GameHooks) => void }).checkCrackedBrickBreak(hooks);
      expect(broke).toEqual([]);                            // 不触发（须跳/落撞）
    } finally {
      rnd.mockRestore();
    }
  });
});
