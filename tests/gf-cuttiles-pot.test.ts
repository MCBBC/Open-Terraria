// 冰川之牙弹体 CutTiles 回归（2026-08-26 用户报：冰矛穿瓦罐不碎）。
// 原版链：Projectile.Damage→CutTiles(:12517/:15276)→CutTilesAt(:15454) 弹盒(+1 格
// 右/下外沿)逐格砍 Main.tileCut 物；CanCutTiles(:15407) 排除表无 1115/1116/731。
// 瓦罐(pot)=非实心 decor——旧实现只查 isSolid 撞块亡，非实心可砍物全程漏砍。
// 本测锁：三型弹飞行路径上的瓦罐格必须被上报 game.cutTile（pot→smashPot 的路由
// 在 Game.cutTile 内，另有覆盖；此处锁"弹盒扫到即上报"的实体侧契约）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { GlacierFangShot, PetalstormShot, ThunderBoltShot } from '../src/entities/proj1457';
import type { GameHooks } from '../src/entities/types';
import { TILE_BY_KEY } from '../src/data/tiles';

const POT = TILE_BY_KEY['pot'];

function makeHooks(store: TileStore, cutCalls: string[]): GameHooks {
  return {
    world: { store } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0,
    },
    enemies: () => [],
    critters: () => [],
    npcs: () => [],
    // 契约记录器：真实 pot→smashPot 路由在 Game.cutTile（Game.ts），此处只锁
    // "弹盒扫到的格被逐格上报"
    cutTile: (x: number, y: number) => { cutCalls.push(`${x},${y}`); },
    spawnParticles: () => {},
    playSfxWav: () => {},
    addLightAt: () => {},
    entities: { add: () => {} },
  } as unknown as GameHooks;
}

/** 弹道上铺一堵 3×3 瓦罐墙（非实心，弹体自由穿过），断言穿行后至少一个瓦罐格
 *  被上报 cutTile（原版 CutTilesAt 含弹盒右/下 +1 外沿，扫到即砍）。
 *  offTiles/vx 按弹型给：1116 前 20t 减速段、731 第 10t 起之字上飘——都必须在
 *  变轨前抵达瓦罐带（否则测的是弹道没到，不是没砍） */
function flyThrough(
  mk: (x: number, y: number, vx: number, vy: number) => { fixedUpdate: (dt: number, g: GameHooks) => void; dead: boolean },
  offTiles = 6,
  vx = 8,
): boolean {
  const st = new TileStore(200, 120);
  const wallX = 100;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) st.setTileSilent(wallX + dx, 60 + dy, POT);
  const cutCalls: string[] = [];
  const g = makeHooks(st, cutCalls);
  const pr = mk((wallX - offTiles) * 16, 60 * 16 + 8, vx, 0);
  for (let i = 0; i < 120 && !pr.dead; i++) pr.fixedUpdate(1 / 60, g);
  return cutCalls.some((c) => {
    const [x, y] = c.split(',').map(Number);
    return Math.abs(x - wallX) <= 2 && Math.abs(y - 60) <= 2;
  });
}

describe('proj1457 三型弹 CutTiles（Damage→CutTiles :12517/:15276）', () => {
  it('1115 GlacierFangShot：释放态穿过瓦罐墙 → 瓦罐格被上报砍（2026-08-26 用户报回归锁）', () => {
    expect(flyThrough((x, y, vx, vy) => {
      const s = new GlacierFangShot(x, y, vx, vy, 11, 2, {
        channel: () => false, aim: () => ({ x, y }), payMana: () => {}, chargeRate: () => 1,
      });
      return s as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void; dead: boolean };
    }, 6, 8)).toBe(true);
  });
  it('1116 PetalstormShot：飘穿瓦罐墙 → 瓦罐格被上报砍（CanCutTiles 排除表无 1116）', () => {
    expect(flyThrough((x, y, vx, vy) => new PetalstormShot(x, y, vx, vy, 11, 2, 0) as never)).toBe(true);
  });
  it('731 ThunderBoltShot：之字穿瓦罐墙 → 瓦罐格被上报砍（排除表无 731；须在 ai0=10 变轨前抵达）', () => {
    expect(flyThrough((x, y, vx, vy) => new ThunderBoltShot(x, y, vx, vy, 11, 2) as never, 3, 16)).toBe(true);
  });
  it('1115 撞实心块仍消亡（CutTiles 不改撞块语义 :37644）', () => {
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) for (let y = 80; y < 120; y++) st.setTileSilent(x, y, 1);
    const cutCalls: string[] = [];
    const g = makeHooks(st, cutCalls);
    const gf = new GlacierFangShot(40 * 16, 78 * 16, 0, 1, 11, 2, {
      channel: () => false, aim: () => ({ x: 640, y: 1400 }), payMana: () => {}, chargeRate: () => 1,
    });
    gf.fixedUpdate(1 / 60, g);                       // 释放帧
    let ticks = 0;
    while (!gf.dead && ticks < 200) { gf.fixedUpdate(1 / 60, g); ticks++; }
    expect(gf.dead).toBe(true);
  });
});
