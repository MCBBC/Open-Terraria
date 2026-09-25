// BJ353 魔晶碎块（Crystal Vile Shard 3051 → 弹幕 494 杆/493 头,aiStyle 4 链族）判别测试：
//  原版锚 = Projectile.cs:5669-5681（SetDefaults 32×32/alpha 255/tileCollide false/
//    penetrate −1/magic/light 0.2/armorPenetration 10）+ AI_004 :23943-24080：
//    · 渐显 −100/t（:23962 −50 基档 + :23968-23970 493|494 再 −50）→ 3 拍转段
//    · 链生 :24012-24029：494→494,父 ai[1]≥7+rand(2) 该节升 493 头；升头伤/击退 ×1.25
//      （:24016-24021,(int)((double)damage*1.25) C# 截断）
//    · 穿 170 尘爆 :24046-24053：d=rand(68,71) ×8,scale1.3/noGravity/α200,v×0.025 起×0.5 收
//    · 淡出 +4/t（:24070）→ ≥255 Kill（:24076）
//    · 出生音 :23945-23954：type494 → Item101（首发段 ai[1]==0 && localAI[0]==0 单发门）
//    · 链生位 :24022 调用式 position+v+(w/2,h/2) 经 NewProjectile :10878-10879 居中 →
//      净效果 = 子段左上 = 父段左上 + v（无半盒项——R27 旧式每代半盒漂移已勘误）
//  使用音：Item.cs:28200-28216 case 3051 全块无 UseSound 行 → 施法静音（水晶音由弹侧播）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Arrow } from '../src/entities/Arrow';
import { itemUseSoundWav } from '../src/data/itemUseSound';
import { Game } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

interface DustRec {
  type: number; vx: number; vy: number; scale: number; noGravity: boolean;
  x: number; y: number; alpha: number;
}

function makeGame(w: World, enemies: unknown[] = [], hooks: Record<string, unknown> = {}): GameHooks {
  const dusts: DustRec[] = [];
  const sfx: string[] = [];
  const g = {
    world: w,
    player: { dead: true, iframes: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20 },
    enemies: () => enemies, critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {},
    playSfxFiles: (files: string[]) => { sfx.push(files.join(',')); },
    playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: (x: number, y: number, ww: number, hh: number, type: number,
      sx = 0, sy = 0, alpha = 0, _c = null, scale = 1, noGravity = false) => {
      const d: DustRec = { type, vx: sx, vy: sy, scale, noGravity, x, y, alpha };
      dusts.push(d);
      return d as never;
    },
    dusts, sfx,
    ...hooks,
  };
  return g as unknown as GameHooks;
}

function rec(game: GameHooks): { dusts: DustRec[]; sfx: string[] } {
  return game as unknown as { dusts: DustRec[]; sfx: string[] };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BJ353 魔晶碎块链（494 杆/493 头,aiStyle 4 :23943-24080）', () => {
  it('渐显步长 −100/t：3 拍转段（255→155→55→0）,首段补一步位移并链生', () => {
    const w = emptyWorld();
    const added: Arrow[] = [];
    const game = makeGame(w, [], {
      entities: { nextId: 1, add: (e: unknown) => added.push(e as Arrow), projectiles: [] },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // rand(2)=1 → 阈值 8（ai1=0 段必链 494）
    const root = new Arrow(80 * TILE, 100 * TILE, 32, 0, 25, 3, 494, {});
    expect(root.alpha).toBe(255);                    // SetDefaults :5677（PROJ_ALPHA0）
    root.fixedUpdate(1 / 60, game);
    expect(root.alpha).toBe(155);                    // −100
    root.fixedUpdate(1 / 60, game);
    expect(root.alpha).toBe(55);
    root.fixedUpdate(1 / 60, game);                  // 归零转段 + 链生
    expect(root.alpha).toBe(0);
    expect((root as unknown as { thornAi0: number }).thornAi0).toBe(1);
    expect(root.x).toBe(80 * TILE + 32);             // 首段补一步位移（:23981）
    expect(added.length).toBe(1);
    expect(added[0].projId).toBe(494);
    // vanilla：父段 ai[1] 0→1 自增（:23979-23981）后传 ai[1]+1 → 子段 ai[1]=2（同 7/8 族）
    expect((added[0] as unknown as { thornAi1: number }).thornAi1).toBe(2);
    // ★BJ353 出生位：NewProjectile :10878-10879 居中后 = 父左上 + v（无半盒项）
    expect(added[0].x).toBe(root.x + 32);
    expect(added[0].y).toBe(root.y);
    expect(added[0].damage).toBe(25);                // 杆伤同值（:24016 num33 仅升头 ×1.25）
  });

  it('链生：父 ai[1]≥7+rand(2) 升 493 头,伤/击退 ×1.25（C# 截断）;未达阈值续 494', () => {
    const w = emptyWorld();
    const added: Arrow[] = [];
    const game = makeGame(w, [], {
      entities: { nextId: 1, add: (e: unknown) => added.push(e as Arrow), projectiles: [] },
    });
    // rand=0 → 阈值 7：ai1=7 段升头
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const seg7 = new Arrow(80 * TILE, 100 * TILE, 32, 0, 25, 3, 494, { thornChainAi1: 7 });
    for (let t = 0; t < 3; t++) seg7.fixedUpdate(1 / 60, game);   // 渐显 3 拍
    expect(added.length).toBe(1);
    expect(added[0].projId).toBe(493);
    expect(added[0].damage).toBe(31);                // trunc(25×1.25)（:24018-24020）
    expect(added[0].knockback).toBeCloseTo(3.75);    // 3×1.25（:24021）
    // rand=0.99 → rand(2)=1 → 阈值 8：ai1=7 段续杆
    added.length = 0;
    vi.mocked(Math.random).mockReturnValue(0.99);
    const seg7b = new Arrow(80 * TILE, 100 * TILE, 32, 0, 25, 3, 494, { thornChainAi1: 7 });
    for (let t = 0; t < 3; t++) seg7b.fixedUpdate(1 / 60, game);
    expect(added.length).toBe(1);
    expect(added[0].projId).toBe(494);
    expect(added[0].damage).toBe(25);
    // 493 头尾端不再链生（仅 type==494 支 :24012）
    added.length = 0;
    vi.mocked(Math.random).mockReturnValue(0);
    const head = new Arrow(80 * TILE, 100 * TILE, 32, 0, 31, 3.75, 493, { thornChainAi1: 8 });
    for (let t = 0; t < 3; t++) head.fixedUpdate(1 / 60, game);
    expect(added.length).toBe(0);
  });

  it('淡出期：穿 170 尘爆 d68-70 ×8（v×0.025 起 ×0.5 收,scale1.3,noGravity）,+4/t 至 ≥255 消亡', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // rand(3)=1 → 尘号恒 69（判别面可断言）
    const root = new Arrow(80 * TILE, 100 * TILE, 32, 0, 25, 3, 494, {});
    for (let t = 0; t < 3; t++) root.fixedUpdate(1 / 60, game);   // 渐显毕
    const s0 = rec(game).sfx.length;
    let sawDustTick = false;
    for (let t = 0; t < 200 && !root.dead; t++) {
      root.fixedUpdate(1 / 60, game);
      if (rec(game).dusts.length > 0 && !sawDustTick) {
        sawDustTick = true;
        expect(rec(game).dusts.length).toBe(8);      // :24047 ×8
        for (const d of rec(game).dusts) {
          expect(d.type).toBe(69);                   // rand(68,71) 钳 69
          expect(d.scale).toBe(1.3);                 // :24050
          expect(d.noGravity).toBe(true);            // :24051
          expect(d.vx).toBeCloseTo(32 * 0.025 * 0.5); // :24048 ×:24052
          expect(d.alpha).toBe(200);                 // :24049
        }
      }
    }
    expect(sawDustTick).toBe(true);
    expect(root.dead).toBe(true);                    // :24076 alpha≥255 Kill
    expect(rec(game).dusts.length).toBe(8);          // 穿 170 仅一次
    expect(rec(game).sfx.length).toBe(s0);           // 淡出无声（:24077 无音行）
  });

  it('出生音：494 首发段 Item_101 单发（ai[1]==0 && localAI[0] 门 :23949-23951）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const root = new Arrow(80 * TILE, 100 * TILE, 32, 0, 25, 3, 494, {});
    root.fixedUpdate(1 / 60, game);
    expect(rec(game).sfx.filter((s) => s.includes('Item_101')).length).toBe(1);
    root.fixedUpdate(1 / 60, game);
    expect(rec(game).sfx.filter((s) => s.includes('Item_101')).length).toBe(1);   // 仍 1 次
    // 链生段静默
    const seg = new Arrow(80 * TILE, 100 * TILE, 32, 0, 25, 3, 494, { thornChainAi1: 1 });
    seg.fixedUpdate(1 / 60, game);
    expect(rec(game).sfx.filter((s) => s.includes('Item_101')).length).toBe(1);
  });

  it('使用音静音：case 3051 无 UseSound 行（Item.cs:28200-28216）→ fallback "tink" 抑制', () => {
    expect(itemUseSoundWav(3051)).toBeNull();
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const played: string[] = [];
    g.sfx = { play: (name: string) => { played.push(name); } };
    g.playSfxFile = () => {};
    const playUseSound = (g as unknown as { playUseSound: (vid: number, fb: string) => void }).playUseSound;
    playUseSound.call(g, 3051, 'tink');
    expect(played).toEqual([]);                      // 静音（R27 64/788 同族）
    playUseSound.call(g, 0, 'tink');                 // 对照组：无 UseSound 非豁免 vid 走 fallback
    expect(played).toEqual(['tink']);
  });
});
