// 通行性行为测试（数据对账见 tile-collision-parity.test.ts；本文件测碰撞层语义）：
// 站台面 frameY==0 顶行站立 / 致动器门 / holdsMatching 踏上站台 / 漏实心补齐。
// 语义源：Collision.TileCollision :2064/:2165/:2331（solidTop && frameY==0、nactive 门）、
// Collision.StepUp :3713-3721（holdsMatching 落脚分支）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const mkWorld = () => new World(40, 40, 7, 'passability');
const body = (x: number, y: number, over: Partial<Body> = {}): Body => ({
  x, y, w: 20, h: 42, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
  stepUp: true, stepDownGate: 'gravity', ...over,
});
const idOf = (key: string) => {
  const id = TILE_BY_KEY[key];
  expect(id, key).toBeDefined();
  return id!;
};

describe('站台面（tileSolidTop）通行语义', () => {
  it('桌子顶行(frameY=0)可站：下落停在顶面', () => {
    const w = mkWorld();
    const TABLE = idOf('table');
    // 3×2 木桌：顶行 (10..12,20) frameY=0；腿行 (10..12,21) frameY=18
    for (let x = 10; x <= 12; x++) {
      w.store.setTileSilent(x, 20, TABLE, 0, 0);
      w.store.setTileSilent(x, 21, TABLE, 0, 18);
    }
    const b = body(10 * 16 + 4, 16 * 16);    // 底 298 < 顶行 320
    moveAndCollide(b, w, 0, 8);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBe(20 * 16);          // 顶行格顶
  });

  it('桌腿(frameY≠0)不挡：横向穿过 + 下落穿过', () => {
    const w = mkWorld();
    const TABLE = idOf('table');
    for (let x = 10; x <= 12; x++) w.store.setTileSilent(x, 21, TABLE, 0, 18);
    // 地板在 22 行（防止穿到世界底）
    for (let x = 8; x <= 16; x++) w.store.setTileSilent(x, 22, idOf('dirt'));
    const b = body(8 * 16, 21 * 16 - 42);     // 站地板、身体覆盖腿行
    moveAndCollide(b, w, 3, 0);               // 横移穿桌腿
    expect(b.hitWall).toBe(false);
    expect(b.x).toBeGreaterThan(8 * 16 + 2);
    const b2 = body(10 * 16 + 4, 19 * 16 - 10); // 底 314，从腿行上方落入
    moveAndCollide(b2, w, 0, 8);
    expect(b2.onGround).toBe(true);
    expect(b2.y + b2.h).toBe(22 * 16);        // 穿过腿行落在地板
  });

  it('致动平台不可站（nactive 门）：致动后下落穿过', () => {
    const w = mkWorld();
    const PLAT = idOf('platform');
    for (let x = 10; x <= 12; x++) w.store.setTileSilent(x, 20, PLAT);
    for (let x = 8; x <= 16; x++) w.store.setTileSilent(x, 24, idOf('dirt'));
    const b0 = body(10 * 16 + 4, 16 * 16);
    moveAndCollide(b0, w, 0, 8);
    expect(b0.onGround).toBe(true);           // 正常平台站住
    for (let x = 10; x <= 12; x++) w.store.setActuated(x, 20, true);
    const b1 = body(10 * 16 + 4, 16 * 16);
    moveAndCollide(b1, w, 0, 8);
    expect(b1.onGround).toBe(false);          // 致动后穿过
    expect(b1.y + b1.h).toBe(24 * 16);
  });

  it('平台下落穿行 / 上升穿行（单向语义保持）', () => {
    const w = mkWorld();
    const PLAT = idOf('platform');
    for (let x = 10; x <= 12; x++) w.store.setTileSilent(x, 20, PLAT);
    const up = body(10 * 16 + 4, 0, { vy: -6 });
    up.y = 20 * 16 + 2;                       // 平台下方 2px 起跳
    moveAndCollide(up, w, 0, -6);             // 从下向上穿
    expect(up.hitHead).toBe(false);
    expect(up.y).toBeLessThan(20 * 16);       // 已穿到平台上方
  });
});

describe('StepUp holdsMatching（:3713-3721 踏上站台面）', () => {
  it('按住 Up 行走踏上前方平台（玩家 controlUp 语义）', () => {
    const w = mkWorld();
    const PLAT = idOf('platform');
    for (let x = 8; x <= 16; x++) w.store.setTileSilent(x, 22, idOf('dirt'));   // 地板
    for (let x = 11; x <= 15; x++) w.store.setTileSilent(x, 21, PLAT);          // 前方 1 高平台（探柱列 11）
    const bx = 10 * 16;
    const hold = body(bx, 22 * 16 - 42, { vx: 3, stepUpHolds: true });
    moveAndCollide(hold, w, 3, 0);
    expect(hold.onGround).toBe(true);
    expect(hold.y + hold.h).toBe(21 * 16);    // 抬升到平台顶
    const noHold = body(bx, 22 * 16 - 42, { vx: 3, stepUpHolds: false });
    moveAndCollide(noHold, w, 3, 0);
    expect(noHold.y + noHold.h).toBe(22 * 16); // 未按 Up：留在地板（平台可穿）
  });

  it('NPC 排除集：工作台(18) NPC 不踏（IgnoredByNpcStepUp）', () => {
    const w = mkWorld();
    const WB = TILE_DEFS.findIndex((d) => (d as unknown as { vanilla?: { sheet?: number } }).vanilla?.sheet === 18);
    expect(WB).toBeGreaterThan(0);
    for (let x = 8; x <= 16; x++) w.store.setTileSilent(x, 22, idOf('dirt'));
    for (let x = 11; x <= 14; x++) w.store.setTileSilent(x, 21, WB);
    const npc = body(10 * 16, 22 * 16 - 42, { vx: 3, stepUpHolds: true, stepUpNpc: true });
    moveAndCollide(npc, w, 3, 0);
    expect(npc.y + npc.h).toBe(22 * 16);      // 留在地板（排除集内）
    const player = body(10 * 16, 22 * 16 - 42, { vx: 3, stepUpHolds: true });
    moveAndCollide(player, w, 3, 0);
    expect(player.y + player.h).toBe(21 * 16); // 玩家可踏
  });
});

describe('漏实心补齐（穿墙修复）', () => {
  it('树叶块(192)/裂缝地牢砖(481-483) 挡横向移动', () => {
    const w = mkWorld();
    for (const sheet of [192, 481, 482, 483]) {
      const tid = TILE_DEFS.findIndex((d) => (d as unknown as { vanilla?: { sheet?: number } }).vanilla?.sheet === sheet);
      expect(tid, `sheet ${sheet}`).toBeGreaterThan(0);
      w.store.setTileSilent(15, 21, tid);
      w.store.setTileSilent(15, 22, tid);
      const b = body(14 * 16, 0, { vx: 3 });
      b.y = 20 * 16 + 10;                     // 身体跨 21/22 行（右缘 col15）
      const x0 = b.x;
      moveAndCollide(b, w, 3, 0);
      expect(b.hitWall, `sheet ${sheet}`).toBe(true);
      expect(b.x - x0).toBeLessThan(3 * 16);  // 被墙挡停
      w.store.setTileSilent(15, 20, 0);
      w.store.setTileSilent(15, 21, 0);
    }
  });
});
