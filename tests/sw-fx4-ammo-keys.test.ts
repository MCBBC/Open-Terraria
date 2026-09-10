// SW-FX4（2026-09-10）：弹药域四键收口回归（docs/audit/item-audit-2026-08-22 §三/§问题汇总
// ⚠️2 ⚠️3 ⚠️4 + ❌7；与 tests/ammo-parity-fixes.test.ts 互补——本文件锁「链上面」，彼文件锁「值面」）：
//   ❶ 5392-5394 黄/白/棕溶液（❌7）：值面（shoot 870-872/ammo 780）已由 ammo-parity 锁；
//     本文件锁获得链——ITEM_DEFS 存在（VANILLA_ITEM_KEY_BY_ID 反查）/图集图标条目/
//     蒸汽朋克 178 商店补货（downed_398 门）/弹药扫描谓词 ammoOf(d)===useAmmo 命中。
//   ❷ 照明弹六件 aiStyle 33（⚠️2）：Arrow FLARE_PROJS 接入 + FLARE_DUST 尘表 +
//     弹药数据（ammo=AmmoID.Flare 931）+ 信号枪 930 换弹替换链 + AI_033 停驻态
//     （damage=0/脱块复坠 localAI[1]=30）——贴壁建立已由 proj-wet-cache ★③ 锁,本文件锁余面。
//   ❸ proj 478 诅咒镖 penetrate（⚠️3）＝定谳非债：1457 权威值 3（Projectile.cs:5531
//     `penetrate = 3`;:5538。旧 1456 值 2 已随 2026-08-23 基准切换撤除,vanillaProjectiles.ts
//     头注 :111-112 记账）——本文件锁终值+物品 3010 全行防回潮。
//   ❹ 1349 派对弹 / 1351 爆破弹 Kill 视觉（⚠️4）：Projectile.Kill :77582-77610 彩带尘
//     139-142×10 + gore 276-282×5 / :77612-77652 Item14 音 + d31×7 + d6×{2.5×3,1.5×3}
//     + gore 61-63×1——Game.onProjectileDeath 单口分支行为锁（Game 壳桩,ammo 二值面）。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from '../src/core/Game';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { itemCombat, resolveAmmoProjId, AMMO_SOLUTION } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';
import { viIdFromKey } from '../src/data/vanillaItemCombat';
import { FLARE_PROJS, Arrow } from '../src/entities/Arrow';
import { resetGorePool, liveGorePieces } from '../src/entities/GorePiece';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

// =====================================================================
// ❶ 5392-5394 溶液获得链（值面见 ammo-parity ②）
// =====================================================================
describe('SW-FX4 ❶ 5392-5394 溶液获得链（item def/图集/商店/弹药谓词）', () => {
  it('ITEM_DEFS 存在且 ammoOf 谓词命中 780（Game 弹药扫描 ammoOf(d)===useAmmo 的数据前提）', () => {
    for (const vid of [5392, 5393, 5394]) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vid ${vid} 注册键`).toBeTruthy();
      const idx = ITEM_DEFS.findIndex((d) => d.key === key);
      expect(idx, `vid ${vid} def 在册`).toBeGreaterThanOrEqual(0);
      const d = ITEM_DEFS[idx];
      const v = d.vid ?? viIdFromKey(d.key);
      expect(v).toBe(vid);
      // Game.ts:14041 ammoOf 等价（legacy ammoId 优先,vi_ 走 combat.ammo 反查）
      const ammoOf = d.ammoId ?? (itemCombat(v)?.ammo ?? 0);
      expect(ammoOf, `vid ${vid} ammoOf → AmmoID.Solution`).toBe(AMMO_SOLUTION);
    }
  });

  it('图集图标条目在册（public/sprites/vanilla.json items["539x"]——无图标=获得后隐形）', () => {
    const atlas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public',
      'sprites', 'vanilla.json'), 'utf8')) as {
      items: Record<string, { icon: string; ix: number; iy: number; iw: number; ih: number }>;
    };
    for (const vid of [5392, 5393, 5394]) {
      const e = atlas.items[String(vid)];
      expect(e, `atlas items["${vid}"]`).toBeTruthy();
      expect(e.iw).toBeGreaterThan(0);
    }
  });

  it('蒸汽朋克 178 出售三溶液（cond=downed_398=月总已败;Chest.cs case 178）——换弹货源面', () => {
    const stockjson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src',
      'data', 'vanilla-shopstock.json'), 'utf8')) as {
      shops: Record<string, Array<{ id: number; price: number | null; cond: string | null }>>;
    };
    const stock = stockjson.shops['178']!;
    for (const vid of [5392, 5393, 5394]) {
      const e = stock.find((s) => s.id === vid);
      expect(e, `shop 178 → ${vid}`).toBeTruthy();
      expect(e!.cond).toBe('downed_398');
      expect(e!.price).toBe(1500);                    // buyPrice(0,0,15)=15 银（DefaultToSolution :47805）
    }
  });

  it('发射链终点弹型（Clentaminator 779·shoot 145 / MK2 5134 + 溶液加法 → 1015/1016/1017 沙雪泥喷束）', () => {
    // ★5307 系 ReefWall 墙皮（Item.cs:42111 DefaultToPlaceableWall(319)）——审计文
    //   「Clentaminator」勿按 5307 反查（vid 双域撞车,与审计 §二 4790 骑枪同族教训）
    expect(itemCombat(779)?.useAmmo).toBe(AMMO_SOLUTION);
    expect(itemCombat(779)?.shoot).toBe(145);
    expect(resolveAmmoProjId(779, 5392, AMMO_SOLUTION, 145, 870)).toBe(1015);
    expect(resolveAmmoProjId(779, 5393, AMMO_SOLUTION, 145, 871)).toBe(1016);
    expect(resolveAmmoProjId(779, 5394, AMMO_SOLUTION, 145, 872)).toBe(1017);
    expect(resolveAmmoProjId(5134, 5392, AMMO_SOLUTION, 145, 870)).toBe(1015);   // MK2 同链
  });
});

// =====================================================================
// ❷ 照明弹六件（931/1614/5377-5380 → 弹 163/310/1008-1011,aiStyle 33）
// =====================================================================
describe('SW-FX4 ❷ 照明弹六件 aiStyle33（FLARE_PROJS/尘表/弹药数据/停驻态余面）', () => {
  it('FLARE_PROJS = 六弹全集（Arrow.ts FLARE 域,SetDefaults aiStyle=33 :2517-2526/:9592-9601）', () => {
    expect([...FLARE_PROJS].sort((a, b) => a - b)).toEqual([163, 310, 1008, 1009, 1010, 1011]);
    for (const pid of [163, 310, 1008, 1009, 1010, 1011]) {
      expect(projectileData(pid)?.aiStyle, `proj ${pid}`).toBe(33);
    }
  });

  it('弹药数据：ammo=AmmoID.Flare 931 + shoot/dmg1/kb1.5/spd6（Item.cs:19125/:42601-42649）', () => {
    const PAIRS: Array<[number, number]> = [[931, 163], [1614, 310], [5377, 1008],
      [5378, 1009], [5379, 1010], [5380, 1011]];
    for (const [vid, shoot] of PAIRS) {
      const c = itemCombat(vid)!;
      expect([c.ammo, c.shoot, c.damage, c.knockBack, c.shootSpeed], `vid ${vid}`)
        .toEqual([931, shoot, 1, 1.5, 6]);
      expect(c.consumable).toBe(true);
    }
  });

  it('信号枪 930（useAmmo 931）换弹替换链：弹种由弹药 shoot 替换（PickAmmo :52656-52659 尾链）', () => {
    const gun = itemCombat(930)!;
    expect([gun.useAmmo, gun.shoot, gun.shootSpeed]).toEqual([931, 163, 6]);
    // 尾链 = 弹药 shoot>0 替换发射器 shoot：1614→310 / 5378→1009（931 自身 shoot=163 直飞）
    expect(resolveAmmoProjId(930, 931, 931, 163, 163)).toBe(163);
    expect(resolveAmmoProjId(930, 1614, 931, 163, 310)).toBe(310);
    expect(resolveAmmoProjId(930, 5378, 931, 163, 1009)).toBe(1009);
  });

  it('AI_033 停驻态余面：贴壁中 damage=0（:27493）;脱块复坠 localAI[1]=30 立即续坠（:27480-27483）', () => {
    const st = new TileStore(60, 160);
    st.type[st.idx(21, 40)] = 2; st.flags[st.idx(21, 40)] = 1;   // 石列 21 [336,352]
    const player = { x: 800, y: 1440, w: 20, h: 42, cx: 810, cy: 1461, dead: false, iframes: 0, equipStats: {} };
    const g = {
      world: { store: st } as never, player,
      enemies: () => [], critters: () => [], npcs: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
      showPickupLabel: () => {}, mapFullscreen: () => false, spawnDust: () => null,
      onProjectileDeath: () => {}, addLightAt: () => {},
    } as unknown as GameHooks;
    const flare = new Arrow(334, 637, 6, 0, 12, 1, 163, { grav: 0 });
    flare.w = 10; flare.h = 10;
    const tick = (n: number) => { for (let i = 0; i < n && !flare.dead; i++) flare.fixedUpdate(1 / 60, g); };
    tick(2);
    const F = flare as unknown as { flareStuck: number; flareGravT: number; damage: number; x: number };
    expect(F.flareStuck).toBe(1);                     // 首触嵌入贴壁（:18744 localAI[0]=1,拍1 HandleMovement）
    expect(flare.vx).toBe(0); expect(flare.vy).toBe(0);
    expect(flare.damage).toBe(0);                     // 停驻弹不伤人（:27493 damage=0,拍2 AI 停驻支）
    // 脱块（块被挖/飞离）：localAI[0]=0 + localAI[1]=30（=立即续坠档,非重新计 30 拍）
    flare.x = 300;                                    // 移出石列 → SolidCollision false
    tick(1);
    expect(F.flareStuck).toBe(0);
    expect(F.flareGravT).toBe(30);
    expect(flare.damage).toBe(0);                     // 原版无恢复臂（单写面,定谳）
  });
});

// =====================================================================
// ❸ proj 478 penetrate＝1457 终值 3（定谳非债,防 1456 值回潮）+ 3010 全行
// =====================================================================
describe('SW-FX4 ❸ proj478/3010（⚠️3 定谳:1457 penetrate=3 权威,P.cs:5531/:5538）', () => {
  it('弹面：penetrate=3 / 14×14 / aiStyle1 / timeLeft 300（:5531-5540）', () => {
    const p = projectileData(478)!;
    expect([p.penetrate, p.width, p.height, p.aiStyle, p.timeLeft]).toEqual([3, 14, 14, 1, 300]);
  });

  it('物品 3010 全行（Item.cs:27815-27827：dmg9/kb2.2/spd3/shoot478/ammo Dart283）', () => {
    const c = itemCombat(3010)!;
    expect([c.damage, c.knockBack, c.shootSpeed, c.shoot, c.ammo])
      .toEqual([9, 2.2, 3, 478, 283]);
    expect([c.consumable, c.ranged]).toEqual([true, true]);
  });
});

// =====================================================================
// ❹ 1349/1351 Kill 视觉（⚠️4）：onProjectileDeath 284/286 分支行为锁
// =====================================================================
/** onProjectileDeath 壳（active-gates-tb4 同式桩面）+ 尘/音/gore 三通道记录 */
function deathShell(dust: Array<{ type: number; scale: number; noGravity?: boolean; vx: number; vy: number }>,
  sfx: string[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = new TileStore(40, 40);
  g.chunks = { markDirtyArea: () => {} };
  g.player = { cx: 200, cy: 200, critChance: () => 4 };
  g.spawnDust = (x: number, y: number, w: number, h: number, type: number,
    vx: number, vy: number, _al: number, _c: unknown, scale: number, noGravity?: boolean) => {
    dust.push({ type, scale, noGravity, vx, vy });
    return { vx: 1, vy: 1, scale };
  };
  g.playSfxFiles = (names: string[]) => { for (const n of names) sfx.push(n); };
  g.entities = { enemies: [] };
  return g as unknown as {
    onProjectileDeath: (p: number, x: number, y: number, w?: number, h?: number,
      ovx?: number, ovy?: number, dmg?: number,
      flags?: { hostile?: boolean; ai0?: number; kb?: number; arpen?: number; sc?: number }) => void;
  };
}

describe('SW-FX4 ❹ 1349 派对弹/1351 爆破弹 Kill 视觉（P.cs:77582-77610/:77612-77652）', () => {
  it('284 派对弹：彩带尘 139-142×10（−oldVel×0.3 基向+扰动,scale1.2）+ gore 276-282×5', () => {
    resetGorePool();
    const dust: Array<{ type: number; scale: number; noGravity?: boolean; vx: number; vy: number }> = [];
    const sfx: string[] = [];
    deathShell(dust, sfx).onProjectileDeath(284, 100, 100, 4, 4, 3, -2, 10);
    expect(dust).toHaveLength(10);
    for (const d of dust) {
      expect(d.type).toBeGreaterThanOrEqual(139);     // Next(139,143)
      expect(d.type).toBeLessThanOrEqual(142);
      expect(d.scale).toBeCloseTo(1.2, 5);
    }
    // 基向 = −oldVel×0.3（首尘 vx=-0.9,vy=0.6;扰动项 ±0.65/±0.05 不掩盖基向）
    expect(dust[0].vx).toBeCloseTo(-3 * 0.3, 5);
    expect(dust[0].vy).toBeCloseTo(2 * 0.3, 5);
    const gores = liveGorePieces().map((x) => x.goreId);
    expect(gores).toHaveLength(5);
    for (const t of gores) {
      expect(t).toBeGreaterThanOrEqual(276);          // Next(276,283)
      expect(t).toBeLessThanOrEqual(282);
    }
    expect(sfx).toEqual([]);                          // 284 无 Kill 音（原版同）
  });

  it('286 爆破弹：Item14 音 + d31×7(scale1.5) + d6×{2.5×3 v×3,1.5×3 v×2} + gore 61-63×1', () => {
    resetGorePool();
    const dust: Array<{ type: number; scale: number; noGravity?: boolean; vx: number; vy: number }> = [];
    const sfx: string[] = [];
    deathShell(dust, sfx).onProjectileDeath(286, 100, 100, 4, 4, 0, 0, 10, { hostile: true });
    expect(sfx).toEqual(['Item_14']);                 // SoundID.Item14（:77613）
    expect(dust.filter((d) => d.type === 31)).toHaveLength(7);   // ×7（:77615-77617）
    const d31 = dust.filter((d) => d.type === 31)!;
    for (const d of d31) expect(d.scale).toBeCloseTo(1.5, 5);
    const d6big = dust.filter((d) => d.type === 6 && d.scale === 2.5);
    const d6small = dust.filter((d) => d.type === 6 && d.scale === 1.5);
    expect(d6big).toHaveLength(3);                    // 3 循环 × {2.5, 1.5}（:77619-77627）
    expect(d6small).toHaveLength(3);
    for (const d of d6big) expect(d.noGravity).toBe(true);
    const gores = liveGorePieces().map((x) => x.goreId);
    expect(gores).toHaveLength(1);                    // Next(61,64) 单枚（:77629）
    expect(gores[0]).toBeGreaterThanOrEqual(61);
    expect(gores[0]).toBeLessThanOrEqual(63);
  });

  it('弹药面：1349/1351 = Bullet 97 弹药（Item.cs:16670-16682/:16696-16708）', () => {
    expect([itemCombat(1349)!.damage, itemCombat(1349)!.shoot, itemCombat(1349)!.ammo,
      itemCombat(1349)!.shootSpeed]).toEqual([10, 284, 97, 5.1]);
    expect([itemCombat(1351)!.damage, itemCombat(1351)!.shoot, itemCombat(1351)!.ammo,
      itemCombat(1351)!.shootSpeed]).toEqual([10, 286, 97, 4.7]);
    expect(projectileData(284)?.penetrate).toBe(1);
    expect(projectileData(286)?.penetrate).toBe(1);
  });

  it('资产面：Kill 视觉依赖的 gore 贴图档（_meta.tex 61-63/276-282）在册', () => {
    const gore = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src',
      'data', 'vanilla-gore.json'), 'utf8')) as { _meta?: { tex?: Record<string, { w: number; h: number }> } };
    const tex = gore._meta?.tex ?? {};
    for (const t of [61, 62, 63, 276, 277, 278, 279, 280, 281, 282]) {
      expect(tex[String(t)], `gore tex ${t}`).toBeTruthy();   // 缺档=GorePiece 回退盒
    }
  });
});
