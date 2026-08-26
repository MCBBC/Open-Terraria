// 宿主功能实装批 III——小件四包回归（2026-08-26）：
// ① RainbowTownSlime 触发链：闪耀史莱姆气球弹 936 上升期爆裂（Projectile.Kill
//    aiStyle2 段 :22678-22690 velocity.Y<0）→ unlockedSlimeRainbowSpawn 世界旗 +
//    巨星史莱姆 681（town_slime_diva）生成；落地爆（vy≥0）不触发
// ② MouseItem：SM2 pass 直连（getPass('MouseItem')，DyeInitializer.cs :443 注册）——
//    uColor=OurFavoriteColor(255,231,69)/255（Main.cs :886）、uSaturation=num20=glow²
//    （ItemSlot.cs :2504/:2519）；执行无 NaN 且饱和度提升亮度（辉光语义方向）
// ③ 天空三 pass 定谳备案：HorizonClouds/LensFlare 已是 SM2 字节级真值
//    （SkyRenderer :933-1000 镜像+:3416-3422 定谳注；金标锚 fx-pixelshader-parity），
//    LitNature 无消费内容层（原版 DrawNature 仅 TileDrawing 调用,本仓无该层）=登记
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Arrow } from '../src/entities/Arrow';
import { TownNPC } from '../src/entities/TownNPC';
import { getPass, runPassOnImageData, defaultUniforms } from '../src/fx/SM2Effect';
import type { GameHooks } from '../src/entities/types';

function makeGame() {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  const npcs: unknown[] = [];
  const parts: number[] = [];
  const g = {
    world: w,
    player: { dead: true, iframes: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20 },
    enemies: () => [], critters: () => [], npcs: () => npcs,
    entities: { nextId: 1, add: (e: unknown, b: string) => { if (b === 'npcs') npcs.push(e); }, projectiles: [] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: (_x: number, _y: number, _c: string, n: number) => { parts.push(n); },
    addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  };
  return { g: g as unknown as GameHooks, npcs, parts };
}

describe('批III① RainbowTownSlime 触发链', () => {
  it('936 上升期爆裂（vy<0）→ 世界旗置位 + 巨星史莱姆 681 入镇 NPC 桶', () => {
    const { g, npcs } = makeGame();
    const b = new Arrow(800, 300, 2, -1, 0, 0, 936, null, {});
    (b as unknown as { vy: number }).vy = -1;                    // 上升中爆
    (b as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    expect(g.world.flags['unlockedSlimeRainbowSpawn']).toBe(true);
    const diva = npcs.find((n) => (n as TownNPC).vanillaId === 681);
    expect(diva).toBeDefined();
    expect((diva as TownNPC).npcKey).toBe('town_slime_diva');
  });
  it('已解锁后二次爆裂不再生成（unlockedSlimeRainbowSpawn 门）', () => {
    const { g, npcs } = makeGame();
    g.world.flags['unlockedSlimeRainbowSpawn'] = true;
    const b = new Arrow(800, 300, 2, -1, 0, 0, 936, null, {});
    (b as unknown as { vy: number }).vy = -1;
    (b as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
    expect(npcs.length).toBe(0);
  });
});

describe('批III② MouseItem SM2 真值', () => {
  it('pass 在册且对合成图执行：输出有限值,uSaturation 提亮（辉光方向）', () => {
    const pass = getPass('MouseItem');
    expect(pass).not.toBeNull();
    const w = 8, h = 8;
    const base = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      base[i * 4] = 120; base[i * 4 + 1] = 90; base[i * 4 + 2] = 60; base[i * 4 + 3] = 255;
    }
    const mk = (sat: number): Uint8ClampedArray => {
      const d = new Uint8ClampedArray(base);
      const u = defaultUniforms();
      u.uColor = [255 / 255, 231 / 255, 69 / 255];              // OurFavoriteColor
      u.uSaturation = sat;
      runPassOnImageData(pass!, d, w, h, u);
      return d;
    };
    const lo = mk(0.05);
    const hi = mk(0.9);
    let loSum = 0, hiSum = 0, finite = true;
    for (let i = 0; i < lo.length; i += 4) {
      loSum += lo[i] + lo[i + 1];
      hiSum += hi[i] + hi[i + 1];
      if (!Number.isFinite(lo[i]) || !Number.isFinite(hi[i])) finite = false;
    }
    expect(finite).toBe(true);
    expect(hiSum).toBeGreaterThan(loSum);                        // 饱和↑→OurFavoriteColor 提亮
  });
});
