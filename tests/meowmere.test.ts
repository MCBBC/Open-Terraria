// 喵刀（Meowmere 3063 → 弹 502）特效/音效 1:1 回归：
//   · AI_008 弹跳（Projectile.cs:18165-18206）：tink 音 + ai[0] 计数 5 次消亡、全速翻面
//   · 命中喵叫（Damage_EVP :16794-16806）：ai[0] 1..5 递增（与弹跳共享）、第 5 命中消亡
//   · localNPCHitCooldown 10t（SetDefaults :5466-5468）：同敌冷却后可再咬
//   · 前段平飞后重力 0.2（:22656 ai[1]>=20）+ 终端 16
//   · 迪斯科点光（:22613-22621 (Disco+0.5)/2，DoUpdate_AnimateDiscoRGB :19441 六段 ±7）
//   · 彩虹拖尾采样（Main.cs:32495-32513 oldPos 10 点环）
//   · melee-shoot 穿透取投射物表原值（Game.ts 去 min-3 钳，penetrate=5）
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makeGame(w: World, list: unknown[] = []) {
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: (e: unknown, b: string) => { if (b !== 'projectiles') list.push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(120, 120, 30, 'open');
  // 地面：y=100 行实心
  for (let x = 0; x < 120; x++) w.store.setTileSilent(x, 100, 1, 0, 0);
  return w;
}

describe('喵刀弹 502（Meowmere Cat）', () => {
  it('平飞 20t 后落体重力，落地弹跳 tink+计数，5 弹消亡', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const cat = new Arrow(50 * TILE, 80 * TILE, 0, 0, 100, 6.5, 502, null,
      { grav: 0.2, gravDelay: 20, life: 600, pierce: 5 });
    // 平飞期（age≤19）无重力
    for (let t = 0; t < 19; t++) cat.fixedUpdate(1, game);
    expect(cat.vy).toBe(0);
    cat.fixedUpdate(1, game);
    expect(cat.vy).toBeGreaterThan(0);            // ai[1]>=20（:22651-22653）→ vy+=0.2
    // 落地（~16px 上方 × 若干 tick）
    let guard = 0;
    while (cat.vy > 0 && !cat.dead && guard++ < 400) cat.fixedUpdate(1, game);
    expect(cat.meowCount).toBe(1);                // 首次弹跳 tink+ai[0]++
    expect(cat.vy).toBeLessThan(0);               // 全速翻面（无 ×0.9 衰减）
    // 再弹 4 次后消亡（:18183-18186 ai[0]>=5 → Kill）
    while (!cat.dead && guard++ < 2000) cat.fixedUpdate(1, game);
    expect(cat.meowCount).toBe(5);
    expect(cat.dead).toBe(true);
  });

  it('命中无喵叫/无计数（唯一 PlaySound(37) 在撞块链）+同敌 10t 冷却不消亡', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    const enemy = {
      id: 1, x: 50 * TILE, y: 80 * TILE, w: 24, h: 18, dead: false,
      hurt: () => true, def: { hitSound: ['NPC_Hit_1'] },
    };
    list.push(enemy);
    const cat = new Arrow(50 * TILE, 80 * TILE, 0, 0, 100, 6.5, 502, null,
      { grav: 0, life: 180, pierce: 5 });
    // 命中：伤害结算但 ai[0] 不动（计数属撞块链 HandleMovement :16796，
    // 全库唯一 PlaySound(37) :16797——2026-08-13 实测复核修正）
    cat.fixedUpdate(1, game);
    expect(cat.meowCount).toBe(0);
    expect(cat.dead).toBe(false);
    // 冷却期内（10t）同敌不再咬，冷却后可再咬（穿透预算逐次消耗，非计数消亡）
    for (let t = 0; t < 9; t++) cat.fixedUpdate(1, game);
    expect(cat.meowCount).toBe(0);
    let hits = 0;
    const orig = (enemy as { hurt: () => boolean }).hurt;
    (enemy as { hurt: () => boolean }).hurt = () => { hits++; return orig(); };
    for (let t = 0; t < 120; t++) cat.fixedUpdate(1, game);
    // 首咬已耗 1 穿透 → 冷却环再咬至穿透 5 耗尽（约 4 次）
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(cat.meowCount).toBe(0);               // 命中永不计数
  });

  it('迪斯科点光 + 彩虹拖尾采样每 tick 推进', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const cat = new Arrow(50 * TILE, 80 * TILE, 8, 0, 100, 6.5, 502, null,
      { grav: 0, life: 180, pierce: 5 });
    cat.fixedUpdate(1, game);
    expect(cat.lightRGB).toBeTruthy();            // :22613 (Disco+0.5)/2
    const [r, g, b] = cat.lightRGB!;
    expect(r + g + b).toBeGreaterThan(0.75);      // 初值 R=255 → r=0.75
    for (let t = 0; t < 12; t++) cat.fixedUpdate(1, game);
    expect(g).toBeLessThanOrEqual(cat.lightRGB![1]);  // DiscoG 爬升
    expect(cat['meowTrail'].length).toBeGreaterThan(0);   // oldPos 环采样
  });

  it('melee-shoot 穿透数据驱动：502 penetrate=5 不再被 min-3 钳', () => {
    // 5 敌逐个咬：穿透预算 5 全部消耗才消亡（min-3 钳下第 4 咬就会消失）
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list);
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      list.push({ id: 10 + i, x: 50 * TILE + i * 64, y: 80 * TILE, w: 24, h: 18,
        dead: false, hurt: () => { hits++; return true; }, def: { hitSound: ['NPC_Hit_1'] } });
    }
    const cat = new Arrow(50 * TILE, 80 * TILE, 0, 0, 100, 6.5, 502, null,
      { grav: 0, life: 180, pierce: 5 });
    // 逐敌重定位咬（不同敌无冷却门，每 tick 咬一只）
    for (let i = 0; i < 5 && !cat.dead; i++) {
      cat.x = 50 * TILE + i * 64 - 4;
      cat.y = 80 * TILE;
      cat.fixedUpdate(1, game);
    }
    expect(hits).toBe(5);                            // 5 咬全命中
    expect(cat.dead).toBe(true);                     // 第 5 咬穿透耗尽消亡
    expect(cat.meowCount).toBe(0);                   // 命中链不碰计数
  });
});
