// ★SW-RB12b（2026-09-10）FX20 红队复核守卫：III224 深度重力块 NaN 防灌的
//  ①夹具动物园扫掠 + ②双块结构锁。
//  背景：FX20 定谳 = III224 块（Player.ts:5585-5604 ← Player.cs:24861-24883）读
//  world.w / world.groundLevel，半成品 world 夹具（`{store}` 族）喂入 → num6=NaN
//  穿透两道钳 → grav*=NaN → vy=NaN 整链冻结（wing-flight 两例红根因）。
//  守卫 = `Number.isNaN(num6) → 下钳档 0.25/0.1`，同款 twin 在 WallslideMovement
//  num6Ws 块（:5488-5497,后者此前零测试覆盖）。
//  金标：Player.cs:24861-24883（num5/num6/remix 钳 0.1·0.25/上钳 1/gravity*=num6）。
//  变异证红（RB12b 实测）：摘除 :5603 守卫 → sw-fx20-physics-nan ②/②b 即红
//  （首拍 vy=NaN）；本文件锁「守卫在场」+「五类夹具形态物理面有限」两道防线。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const PLAYER_TS = join(dirname(__dirname), 'src', 'entities', 'Player.ts');

// 夹具动物园：全库测试 309 文件 `as never` 钩子里 world 形态的全类型采样
// （store-only / 缺 w / 缺 groundLevel / 退化零值 / 毒值 NaN——前四类=既有夹具,
//  末类=FX20 毒面）。每类 ×{remix:false,true} 驱动 150 拍真实 Player 物理链。
type WorldStub = Record<string, unknown>;
const FIXTURES: Array<[string, (st: TileStore) => WorldStub]> = [
  ['{store}（a-batch2/accessory-systematic 形态）', (st) => ({ store: st })],
  ['{store,w,h} 缺 groundLevel（dart-rocket-trail 族）', (st) => ({ store: st, w: 4200, h: 1200 })],
  ['{store,groundLevel} 缺 w', (st) => ({ store: st, groundLevel: 100 })],
  ['退化零值 {store,w:0,groundLevel:0}（未生成世界）', (st) => ({ store: st, w: 0, groundLevel: 0 })],
  ['毒值 {store,w:NaN,groundLevel:NaN}（FX20 原始毒面推广）', (st) => ({ store: st, w: Number.NaN, groundLevel: Number.NaN })],
];

function drive(worldStub: WorldStub, remix: boolean, ticks = 150): Player {
  const w = new World(160, 300, 30, 'open');
  for (let x = 0; x < 120; x++) w.store.setTile(x, 100, 1);
  const p = new Player(50 * TILE, 96 * TILE, new Inventory());
  p.hp = 100;
  p.x = 50 * TILE; p.y = 96 * TILE;
  const hooks = {
    world: { ...worldStub, seedFlags: remix ? { remix: true } : {} } as never,
    player: p as never,
    enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  for (let t = 0; t < ticks; t++) p.fixedUpdate(1 / 60, hooks);
  return p;
}

describe('SW-RB12b FX20 夹具动物园扫掠（守卫后物理面有限性）', () => {
  for (const [name, mk] of FIXTURES) {
    for (const remix of [false, true]) {
      it(`${name} remix=${remix}：150 拍 x/y/vx/vy 有限且落地`, () => {
        const st = new TileStore(160, 300);
        for (let x = 0; x < 120; x++) st.setTile(x, 100, 1);
        const p = drive(mk(st), remix);
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.vx)).toBe(true);
        expect(Number.isFinite(p.vy)).toBe(true);
        expect(p.onGround).toBe(true);   // 链未冻结（NaN 定身症状反面）
      });
    }
  }
});

describe('SW-RB12b FX20 结构锁（双块守卫在场,防单块回退）', () => {
  const src = readFileSync(PLAYER_TS, 'utf8');
  const countOf = (needle: string): number => src.split(needle).length - 1;
  it('III224 块与 Wallslide twin 块各持一道 NaN 守卫（各恰 1 处）', () => {
    expect(countOf('if (Number.isNaN(num6Ws)) num6Ws =')).toBe(1);   // :5496 wallslide
    expect(countOf('if (Number.isNaN(num6)) num6 =')).toBe(1);       // :5603 III224
  });
  it('守卫语义锁：fallback = 下钳档 0.1/0.25（remix 三元）,非早期草稿 num6≡1', () => {
    expect(src).toContain('num6Ws = game.world.seedFlags?.remix ? 0.1 : 0.25;');
    expect(src).toContain('num6 = world.seedFlags?.remix ? 0.1 : 0.25;');
    // 注:`if (num6 > 1) num6 = 1;` = 原版上钳合法在位;锁的是 NaN fallback 不得为 1
    expect(src).not.toContain('Number.isNaN(num6)) num6 = 1');
    expect(src).not.toContain('Number.isNaN(num6Ws)) num6Ws = 1');
  });
});
