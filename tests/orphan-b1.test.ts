// 孤儿武器 B1 波（buff/光环簇五件）回归（2026-08-30）：
//   ① 蜜雷锋 1130 → 弹 183 Kill 爆裂蜂群 N=rand.Next(15,25)=15..24（P.cs:78114-78122），
//     弹型/伤/kb = Player.beeType()/beeDamage(damage)/beeKB(0f)（Player.cs:12505-12531），
//     初速 = Next(-35,36)×0.02、出生点 = 消亡位 position 直传
//   ② 爱情药水 2352 → 弹 370 Kill：音 Item4 + 心尘 13×5 + 心脏 gore 331×30 +
//     80px 圈玩家/敌人各落 Lovestruck 记录 1800t=30s（P.cs:78889-78902/:78937-78962）
//   ②b 恶臭药水 2353 → 弹 371：同构 + legacy13=shatter 音 + 骨尘 gore 435-437×30 +
//     Stinky(120) 30s
//   ③ 微光气球 4986 → 弹 936 Kill：音 Item21 + d4 HSL 双档×20 对 + GelBalloonBuff(320)
//     1800t 施给圈内实体（P.cs:78919-78962）。
//     ★工单"NPC 不吃"与反编译相左：1456(:75203)/1458(:78955) 三药水共享 NPC 循环，
//     以源码为准走 applyAura 全集合——对 NPC 均为展示级纯计时（lovestruckT/gelBalloonT/
//     stinkyT），SUPPORTED 注册见 entities/projStatus.ts。
//   ③b 巨星解锁触发域修正（红队 B1-X3，2026-08-30）：解锁段原版唯一出处=Shimmer()
//     内 aiStyle==2 分支（P.cs:22564/:22676-22697，调用域 :17114 `if (shimmerWet)
//     Shimmer()`）——曾错挂 killNow 仅查 vy<0。③b 组断言：浸微光液+上升期才解锁、
//     非 Kill 单口；kill 路径/清水/下落期均不置位世界旗。
//   ④ 靓丽镜 5577 → 弹 1085 Kill（已由 Game.onProjectileDeath 承载,P.cs:72034-72057）：
//     Item106 音 + 尘330×10(v-=阻尼旧速) + gore 1394-1397 + 命中盒外扩150px 与玩家矩形
//     相交 → luckState.brokenMirrorBadLuckTime=25200（luck −0.25 消费端 Player.luck :6041）
//   ⑤ 恒消耗门（2026-08-30 蓝队 B1-3）：2352/2353/4986/5577 四件原版无任何回收语义
//     （SetDefaults Item.cs:23667/:23681/:40164/:43927 全无 + 各弹 Kill 段无
//     Item.NewItem）——通用投掷尾 dropKey 置 null（THROWN_NO_RECOVERY_VIDS），撞块
//     消亡不再走 Arrow 的 rand<1/3 回收掷（同雪球 949/beenade dropKey=null 先例）
import { describe, it, expect, vi } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { GorePiece } from '../src/entities/GorePiece';
import { projectileData } from '../src/data/vanillaProjectiles';
import { BuffType } from '../src/stats/Buffs';
import { LuckState } from '../src/stats/Luck';
import { Game, THROWN_NO_RECOVERY_VIDS } from '../src/core/Game';
import { LIQUID_TYPE } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { thrownCombat, combatWeapon, itemCombat } from '../src/data/vanillaItemCombat';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { Player } from '../src/entities/Player';
import { Enemy } from '../src/entities/Enemy';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const CX = 800;
const CY = 400;

/** 敌怪桩：仅读 dead/life/cx/cy；applyBuffTicks 直写字段 */
/** 桩实体（索引签名承载 aura 计时字段 lovestruckT/stinkyT/gelBalloonT 等运行时注入） */
type FakeEnt = { dead: boolean; life: number; cx: number; cy: number } & Record<string, unknown>;

function fakeEnemy(cx: number, cy: number, extra: Record<string, unknown> = {}): FakeEnt {
  return { dead: false, life: 100, cx, cy, ...extra };
}

interface DustRec {
  x: number; y: number; w: number; h: number; type: number;
  speedX: unknown; speedY: number | undefined; alpha: number | undefined;
  color: unknown; scale: number | undefined;
  /** 返回尘对象（调用侧乘链/noGravity 直接改写同一引用——断言读后置态） */
  ret: { vx: number; vy: number; noGravity: boolean };
}

function mkGame(opts: { strongBees?: boolean } = {}) {
  const sfxFiles: string[] = [];
  const sfxNames: string[] = [];
  const dusts: DustRec[] = [];
  const added: Array<{ entity: unknown; bucket: string }> = [];
  const playerBuffs: Array<[number, number]> = [];

  const localPlayer = {
    cx: CX + 10, cy: CY + 21, x: CX, y: CY, w: 20, h: 42, dead: false,
    buffs: { apply: (t: number, sec: number) => playerBuffs.push([t, sec]) },
    equipStats: { strongBees: opts.strongBees ?? false },
  };
  const enemies = [
    fakeEnemy(CX + 40, CY),                    // 圈内敌怪
    fakeEnemy(CX + 400, CY),                   // 圈外
    fakeEnemy(CX - 30, CY, { dead: true }),    // 死亡门
    fakeEnemy(CX - 50, CY, { life: 0 }),       // life 门
  ];
  const npcs = [fakeEnemy(CX + 20, CY)];                 // 城镇 NPC 圈内
  const critters = [fakeEnemy(CX - 20, CY + 10)];        // 小动物圈内

  const game = {
    player: localPlayer,
    candidatePlayers: () => [localPlayer],
    enemies: () => enemies,
    npcs: () => npcs,
    critters: () => critters,
    world: { flags: {} as Record<string, boolean>, store: null },
    playSfxFiles: (files: string[]) => void files.forEach((f) => sfxFiles.push(f)),
    playSfxFile: (n: string) => sfxFiles.push(n),
    playSfx: (n: string) => sfxNames.push(n),
    // Dust.NewDust 签名对齐：color 第 9 参、scale 第 10 参（fx/VanillaDust.spawn 同式）
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      speedX?: unknown, speedY?: number, alpha?: number,
      color?: { r: number; g: number; b: number; a: number } | null, scale?: number) => {
      const ret = { vx: 0.3, vy: 0.2, noGravity: false };
      dusts.push({ x, y, w, h, type, speedX, speedY, alpha, color, scale, ret });
      return ret;
    },
    spawnParticles: () => {},
    entities: { add: (e: unknown, bucket: string) => void added.push({ entity: e, bucket }) },
    onProjectileDeath: () => {},
  };
  return { game: game as unknown as GameHooks,
    sfxFiles, sfxNames, dusts, added, playerBuffs, enemies, npcs, critters };
}

/** 触发私有 killNow（消亡单口——撞块/寿命/命中敌全路径同此，见 Arrow.killNow 注） */
function kill(a: Arrow, g: GameHooks): void {
  (a as unknown as { killNow: (g: GameHooks) => void }).killNow(g);
}

// ===========================================================================
// 数据面 sanity（SetDefaults 面值承载在 vanilla-projectiles.json）
// ===========================================================================
it('数据面：370/371/936 均 aiStyle2 抛物线 penetrate1；183 为 aiStyle14/timeLeft180', () => {
  for (const id of [370, 371, 936]) {
    expect(projectileData(id)?.aiStyle).toBe(2);
    expect(projectileData(id)?.penetrate).toBe(1);
    expect(projectileData(id)?.tileCollide).not.toBe(false);
  }
  expect(projectileData(183)?.aiStyle).toBe(14);             // P.cs:2702
  expect(projectileData(183)?.timeLeft).toBe(180);           // 引信档（P.cs:2705）
});

// ===========================================================================
// ① 蜜雷锋 1130 → 弹 183（P.cs:78086-78122）
// ===========================================================================
describe('① 蜜雷锋 Kill 爆裂蜂群（P.cs:78086-78122）', () => {
  function burst(game: GameHooks, added: Array<{ entity: unknown; bucket: string }>): Arrow[] {
    const before = added.length;
    kill(new Arrow(790, 380, 3, 4, 12, 1, 183, null, {}), game);
    return added.slice(before)
      .filter((r) => r.bucket === 'projectiles')
      .map((r) => r.entity as Arrow);
  }

  it('无 Hive Pack：N∈[15,24]、蜂恒 181、伤=beeDamage(12)=12..13、kb=0、初速域', () => {
    for (let round = 0; round < 40; round++) {
      const { game, added } = mkGame();
      const bees = burst(game, added);
      expect(bees.length).toBeGreaterThanOrEqual(15);          // Next(15,25) 下界
      expect(bees.length).toBeLessThanOrEqual(24);             // 上界（右开区间）
      for (const b of bees) {
        expect(b.projId).toBe(181);                            // 无强蜂通道恒普通蜂
        expect(b.damage).toBeGreaterThanOrEqual(12);           // +Next(2)=+0..1
        expect(b.damage).toBeLessThanOrEqual(13);
        expect(b.knockback).toBe(0);                           // beeKB(0f) 普通档
        // 初速 = Next(-35,36)*0.02 ∈ (-0.70,0.70]
        expect(b.vx).toBeGreaterThan(-0.71);
        expect(b.vx).toBeLessThan(0.71);
        expect(b.vy).toBeGreaterThan(-0.71);
        expect(b.vy).toBeLessThan(0.71);
        expect(b.x).toBe(790);                                 // 出生点 = position 直传
        expect(b.y).toBe(380);
      }
    }
  });

  it('Hive Pack 3333 在身：强蜂 566 出现（beeDamage 强档 13..15 / beeKB 0.5）', () => {
    const seenIds = new Set<number>();
    let guard = 0;
    while (!seenIds.has(566) && guard++ < 40) {
      const { game, added } = mkGame({ strongBees: true });
      for (const b of burst(game, added)) {
        seenIds.add(b.projId);
        if (b.projId === 566) {
          expect(b.damage).toBeGreaterThanOrEqual(13);         // dmg+Next(1,4)=+1..3
          expect(b.damage).toBeLessThanOrEqual(15);
          expect(b.knockback).toBe(0.5);                       // 0.5+KB*1.1（KB=0）
        } else {
          expect(b.projId).toBe(181);
          expect(b.knockback).toBe(0);
        }
      }
    }
    expect(seenIds.has(566)).toBe(true);                       // 数百只样本必出强蜂
  });

  it('音 Item14 ×1 / 尘31(scale1.5,alpha100)×20 / 壳 gore 61-63×4 四象限终速域', () => {
    // 拦截并透传真实生成，回收实例读终态（被测侧出实例后才做 X/Y±=1、整体×0.3）
    const origNewGore = GorePiece.newGore.bind(GorePiece);
    const out: Array<InstanceType<typeof GorePiece>> = [];
    const goreSpy = vi.spyOn(GorePiece, 'newGore').mockImplementation(((type, x, y,
      vx?: number, vy?: number, scale?: number, perfect?: boolean) => {
      const g = origNewGore(type, x, y, vx ?? 0, vy ?? 0, scale, perfect);
      if (g) out.push(g);
      return g;
    }) as typeof GorePiece.newGore);
    const { game, sfxFiles, dusts } = mkGame();
    kill(new Arrow(700, 700, 0, 0, 12, 1, 183, null, {}), game);
    expect(sfxFiles.filter((f) => f === 'Item_14').length).toBe(1);
    const d31 = dusts.filter((d) => d.type === 31);
    expect(d31.length).toBe(20);
    expect(d31.every((d) => d.scale === 1.5 && d.alpha === 100)).toBe(true);
    const goreArgs = goreSpy.mock.calls.filter(([id]) => id >= 61 && id <= 63);
    goreSpy.mockRestore();
    expect(goreArgs.length).toBe(4);
    expect(out.length).toBe(4);
    // 初速 = default(Vector2)（P.cs:78094 等；扰动全由 NewGore 内部补，Gore.cs:1347-1348）
    for (const call of goreArgs) {
      expect(call[3]).toBe(0);                                 // 第 4 参 vx
      expect(call[4]).toBe(0);                                 // 第 5 参 vy
    }
    // 终域（P.cs:78109-78113 序：扰动+jitter 后 ±=1 → ×0.3）：
    //   vx = 0.3×(sx ± Next(0,20)*0.1) ∈ [-0.9,0.9]
    //   vy = 0.3×(sy − Next(10,30)*0.1) —— sy=+1 → [-0.6,0]，sy=-1 → [-1.2,-0.6]
    // （修复前散布 ~3×：vx∈[-2.3,2.3]/vy 可至 -3.3）
    for (const g of out) {
      expect(g.vx).toBeGreaterThan(-0.91);
      expect(g.vx).toBeLessThan(0.91);
      expect(g.vy).toBeGreaterThanOrEqual(-1.21);
      expect(g.vy).toBeLessThanOrEqual(0);
    }
  });

  it('壳 gore 终速域随缩放收敛（burst 级 max/min 界定两象限带）', () => {
    // 40 轮独立爆裂：每轮必含 sy=+1 支（max vy > −0.61）与 sy=-1 支（min vy < −0.59）
    // ——扰动后被压进 0.3 缩放的双带结构；修复前全域 vy≤−0.7 不可能同时满足
    const origNewGore = GorePiece.newGore.bind(GorePiece);
    const out: Array<InstanceType<typeof GorePiece>> = [];
    const goreSpy = vi.spyOn(GorePiece, 'newGore').mockImplementation(((type, x, y,
      vx?: number, vy?: number, scale?: number, perfect?: boolean) => {
      const g = origNewGore(type, x, y, vx ?? 0, vy ?? 0, scale, perfect);
      if (g) out.push(g);
      return g;
    }) as typeof GorePiece.newGore);
    for (let round = 0; round < 40; round++) {
      const before = out.length;
      const { game } = mkGame();
      kill(new Arrow(500, 500, 2, -1, 12, 1, 183, null, {}), game);
      void game;
      const burstVys = out.slice(before).map((g) => g.vy);
      expect(burstVys.length).toBe(4);
      expect(Math.max(...burstVys)).toBeGreaterThan(-0.61);
      expect(Math.min(...burstVys)).toBeLessThan(-0.59);
      expect(out.slice(before).every((g) => Math.abs(g.vx) <= 0.900001)).toBe(true);
    }
    goreSpy.mockRestore();
  });

  it('hostile 弹不分裂蜂群（owner==Main.myPlayer 门近似）但仍出音/尘', () => {
    const { game, added, dusts } = mkGame();
    const h = new Arrow(700, 700, 0, 0, 12, 1, 183, null, {});
    (h as unknown as { hostile: boolean }).hostile = true;
    kill(h, game);
    expect(added.filter((r) => r.bucket === 'projectiles').length).toBe(0);
    expect(dusts.filter((d) => d.type === 31).length).toBe(20);
  });
});

// ===========================================================================
// ② 爱情药水 2352 → 弹 370（P.cs:78889-78902 + 圈支）
// ===========================================================================
describe('② 爱情药水弹 370 Kill（P.cs:78889-78902）', () => {
  it('圈内玩家/城镇 NPC/敌怪/小动物各得 Lovestruck 30s；圈外/死亡/life 豁免', () => {
    const { game, playerBuffs, enemies, npcs, critters } = mkGame();
    kill(new Arrow(CX - 7, CY - 11, 2, 3, 1, 0, 370, null, {}), game);
    // 玩家 Center≈弹心 <80px；1800t/60 = 30s
    expect(playerBuffs.some(([t, s]) => t === BuffType.Lovestruck && Math.abs(s - 30) < 1e-9))
      .toBe(true);
    // 敌怪侧 = applyBuffTicks max 合并写 lovestruckT 秒
    expect(enemies[0].lovestruckT).toBe(30);                   // 圈内
    expect(enemies[1].lovestruckT ?? 0).toBe(0);               // 400px 圈外
    expect(enemies[2].lovestruckT ?? 0).toBe(0);               // dead 门
    expect(enemies[3].lovestruckT ?? 0).toBe(0);               // life 门
    expect(npcs[0].lovestruckT).toBe(30);                      // 城镇 NPC 桶
    expect(critters[0].lovestruckT).toBe(30);                  // 小动物同为 Main.npc
  });

  it('音 Item4 + 尘13×5 + 心脏 gore331×30（位=Center+向×10、速度向域/scale 域）', () => {
    const goreSpy = vi.spyOn(GorePiece, 'newGore');
    const { game, sfxFiles, dusts } = mkGame();
    // 弹盒 14×14 → 消亡中心 = (CX-7)+7, (CY-11)+7 = (CX, CY)
    kill(new Arrow(CX - 7, CY - 11, 0, 0, 1, 0, 370, null, {}), game);
    expect(sfxFiles.includes('Item_4')).toBe(true);
    expect(dusts.filter((d) => d.type === 13).length).toBe(5);
    const hearts = goreSpy.mock.calls.filter(([id]) => id === 331);
    expect(hearts.length).toBe(30);
    for (const [, gx, gy, gvx, gvy, scale] of hearts) {
      // NewGore(Center + 向×10)：到弹心距离恒 10（弹盒 14×14 → 消亡中心=(CX,CY-4)）
      expect(Math.hypot((gx as number) - CX, (gy as number) - (CY - 4))).toBeCloseTo(10);
      const spd = Math.hypot(gvx as number, (gvy as number) - 1.5);   // 除 UnitY 项
      expect(spd).toBeGreaterThanOrEqual(4 * 0.66 - 1e-9);     // Next(4,9)*0.66
      expect(spd).toBeLessThan(9 * 0.66 * 0.999 + 1e-9);
      expect(scale as number).toBeGreaterThanOrEqual(0.40);    // Next(40,141)*0.01
      expect(scale as number).toBeLessThan(1.41);
    }
    goreSpy.mockRestore();
  });

  it('hostile 弹只出视听不施光环（owner==myPlayer 门近似）', () => {
    const { game, playerBuffs, enemies } = mkGame();
    const h = new Arrow(CX - 7, CY - 11, 0, 0, 1, 0, 370, null, {});
    (h as unknown as { hostile: boolean }).hostile = true;
    kill(h, game);
    expect(playerBuffs.length).toBe(0);
    expect(enemies[0].lovestruckT ?? 0).toBe(0);
  });
});

// ===========================================================================
// ②b 恶臭药水 2353 → 弹 371（P.cs:78903-78918；旧 Game.onProjectileDeath partial
//    版已删——本测防回归双施加残留）
// ===========================================================================
describe('②b 恶臭药水弹 371 Kill（P.cs:78903-78918）', () => {
  it('legacy13=shatter 音 + Item16 + Stinky(120) 30s 玩家/NPC 落账 + 骨尘 gore 435-437×30',
    () => {
      const goreSpy = vi.spyOn(GorePiece, 'newGore');
      const { game, sfxFiles, sfxNames, playerBuffs, enemies, dusts } = mkGame();
      kill(new Arrow(CX - 7, CY - 11, 0, 0, 1, 0, 371, null, {}), game);
      expect(sfxNames.includes('shatter')).toBe(true);         // legacy PlaySound(13)
      expect(sfxFiles.includes('Item_16')).toBe(true);
      expect(playerBuffs.some(([t, s]) => t === BuffType.Stinky && s === 30)).toBe(true);
      expect(enemies[0].stinkyT).toBe(30);
      expect(dusts.filter((d) => d.type === 13).length).toBe(5);
      const bones = goreSpy.mock.calls.filter(([id]) => id >= 435 && id <= 437);
      expect(bones.length).toBe(30);
      for (const [, gx, gy] of bones) {
        // 位置 = Center + (向×0.4)×10 → 到弹心距离恒 4（vector82 *= 0.4f；中心=(CX,CY-4)）
        expect(Math.hypot((gx as number) - CX, (gy as number) - (CY - 4))).toBeCloseTo(4);
      }
      goreSpy.mockRestore();
    });
});

// ===========================================================================
// ③ 微光气球 4986 → 弹 936（P.cs:78919-78962；工单口径差异见文件头注）
// ===========================================================================
describe('③ 微光气球弹 936 Kill（P.cs:78919-78962）', () => {
  it('圈内玩家得 GelBalloonBuff(320) 30s；敌怪/NPC 侧 gelBalloonT 计时（源码同循环）',
    () => {
      const { game, playerBuffs, enemies, npcs, critters } = mkGame();
      kill(new Arrow(CX - 7, CY - 11, 0, 2, 1, 0, 936, null, {}), game); // Kill 单口已无解锁段（B1-X3 后任何消亡均不触发）
      expect(playerBuffs.some(([t, s]) => t === BuffType.GelBalloonBuff && s === 30))
        .toBe(true);
      expect(enemies[0].gelBalloonT).toBe(30);
      expect(enemies[1].gelBalloonT ?? 0).toBe(0);
      expect(npcs[0].gelBalloonT).toBe(30);
      expect(critters[0].gelBalloonT).toBe(30);
    });

  it('音 Item21 + 两档 HSL 微光尘各×20（次枚 scale1.8、返回尘 noGravity 置位、色 A 减半）',
    () => {
      const { game, sfxFiles, dusts } = mkGame();
      kill(new Arrow(CX - 7, CY - 11, 0, 0, 1, 0, 936, null, {}), game);
      expect(sfxFiles.includes('Item_21')).toBe(true);
      expect(dusts.length).toBe(40);                           // 20 拍 × 2 枚
      expect(dusts.every((d) => d.type === 4 && d.alpha === 150)).toBe(true);
      const firsts = dusts.filter((_, i) => i % 2 === 0);
      const seconds = dusts.filter((_, i) => i % 2 === 1);
      expect(firsts.every((d) => d.scale === undefined)).toBe(true);   // 缺省 scale=1
      expect(seconds.every((d) => d.scale === 1.8)).toBe(true);
      // :78933 第二枚 dust.noGravity = true（写回返回对象）；首枚不置
      expect(firsts.every((d) => d.ret.noGravity === false)).toBe(true);
      expect(seconds.every((d) => d.ret.noGravity === true)).toBe(true);
      // 颜色 = hslToRgb(hue∈[0.7,0.9],1,.7/.5) 且 Color.A /= 2
      const c1 = firsts.map((d) => d.color) as Array<{ r: number; g: number; b: number; a: number }>;
      for (const c of [...c1]) {
        expect(c.a).toBeLessThan(255);                         // /=2 后 ≈127
        expect(typeof c.r).toBe('number');
      }
      void sfxFiles;
    });
});

// ===========================================================================
// ③b 巨星解锁触发域（红队 B1-X3 定位修正：killNow → Shimmer() 浸液域）
//   原版：解锁段唯一出处 Shimmer()（P.cs:22564）aiStyle==2 分支 :22676-22697，
//   调用域 Update :17114-17117 `if (shimmerWet) Shimmer();`——浸微光液才跑；
//   timeLeft>5 钳 5 → 置 unlockedSlimeRainbowSpawn + NewNPC 681 于 Center.X+4。
// ===========================================================================
describe('③b 微光气球 936 巨星解锁触发域（B1-X3）', () => {
  /** TileStore 最小桩面：仅 inBounds/idx/liquid/liquidType（shimmerUnlock 只触这四个
   *  面），整格染 centerLt 液体（LIQUID_TYPE +1 编码,TileStore.ts:10）；null=全干 */
  function mkShimGame(centerLt: number | null) {
    const base = mkGame();
    const flags: Record<string, boolean> = {};
    const W = 96, H = 96;
    const liquid = new Uint8Array(W * H);
    const liquidType = new Uint8Array(W * H);
    if (centerLt !== null) { liquid.fill(255); liquidType.fill(centerLt); }
    (base.game as unknown as { world: unknown }).world = {
      flags,
      store: {
        w: W, h: H,
        inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H,
        idx: (x: number, y: number) => y * W + x,
        liquid, liquidType,
      },
    };
    const npcCount = () => base.added.filter((r) => r.bucket === 'npcs').length;
    return { g: base.game, flags, npcCount };
  }

  function mkRising936(g: GameHooks): Arrow {
    const b = new Arrow(CX - 7, CY - 11, 2, -1, 0, 0, 936, null, {});
    (b as unknown as { life: number }).life = 300;             // 满寿命——原版 cap 只降不升
    (b as unknown as { shimmerUnlock: (g: GameHooks) => void }).shimmerUnlock(g);
    return b;
  }

  it('浸微光液上升期触达 → 世界旗置位 + Diva 入镇桶 + 寿命钳 5（延迟爆 ：22680-22682）',
    () => {
      const { g, flags, npcCount } = mkShimGame(LIQUID_TYPE.SHIMMER);
      const b = mkRising936(g);
      expect(flags['unlockedSlimeRainbowSpawn']).toBe(true);
      expect(npcCount()).toBe(1);                              // NewNPC 681（town_slime_diva）
      expect((b as unknown as { life: number }).life).toBe(5); // >5 钳 5，不上调
    });

  it('反例：同位置清水中消亡不触发（liquidType=WATER；Unlock 仅认微光液）', () => {
    const { g, flags, npcCount } = mkShimGame(LIQUID_TYPE.WATER);
    mkRising936(g);
    expect(flags['unlockedSlimeRainbowSpawn']).toBeUndefined();
    expect(npcCount()).toBe(0);
  });

  it('反例：微光液但下落期(vy>=0)不触发（原版 velocity.Y<0 门 :22677）', () => {
    const { g, flags, npcCount } = mkShimGame(LIQUID_TYPE.SHIMMER);
    const b = new Arrow(CX - 7, CY - 11, 2, 3, 0, 0, 936, null, {});   // 下落
    (b as unknown as { life: number }).life = 300;
    (b as unknown as { shimmerUnlock: (g: GameHooks) => void }).shimmerUnlock(g);
    expect(flags['unlockedSlimeRainbowSpawn']).toBeUndefined();
    expect((b as unknown as { life: number }).life).toBe(300);
    expect(npcCount()).toBe(0);
  });

  it('反例：旗已置位后再入液不再生成（vanilla !unlockedSlimeRainbowSpawn 门）', () => {
    const { g, flags, npcCount } = mkShimGame(LIQUID_TYPE.SHIMMER);
    mkRising936(g);
    mkRising936(g);
    expect(npcCount()).toBe(1);
    expect(flags['unlockedSlimeRainbowSpawn']).toBe(true);
  });

  it('Kill 单口不含解锁段：无液体环境上升中消亡（旧行为在此永久置位）旗不动', () => {
    const { game } = mkGame();                                 // store=null 世界桩
    kill(new Arrow(CX - 7, CY - 11, 0, -1, 1, 0, 936, null, {}), game);
    const flags = ((game as unknown as { world: { flags: Record<string, boolean> } }).world.flags);
    expect(flags['unlockedSlimeRainbowSpawn']).toBeUndefined();
    // 且 Kill 特效链（音/dust）与解锁无关——只断言无 NPC 入桶由上面空 store 兜底
  });
});

// ===========================================================================
// ④ 靓丽镜 5577 → 弹 1085（P.cs:72034-72057；既有实现回归 + luck 消耗端验证）
// ===========================================================================
describe('④ 靓丽镜碎裂（P.cs:72034-72057，Game.onProjectileDeath 1085 段）', () => {
  const MX = 800, MY = 400, MW = 18, MH = 18;

  function mkMirror(pcx: number, pcy: number) {
    const sfxFiles: string[] = [];
    const dustTypes: number[] = [];
    const inst = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      onProjectileDeath: (...a: unknown[]) => void;
    };
    inst.playSfxFiles = (files: string[]) => void files.forEach((f) => sfxFiles.push(f));
    inst.spawnDust = (_x: number, _y: number, _w: number, _h: number, type: number) => {
      dustTypes.push(type);
      return { vx: 0, vy: 0 };                                 // velocity -= oldVelocity 写回面
    };
    const player = { x: pcx - 10, y: pcy - 21, w: 20, h: 42, luckState: new LuckState() };
    inst.player = player;
    const goreSpy = vi.spyOn(GorePiece, 'newGore')
      .mockReturnValue(null);
    const fireDeath = (): void =>
      inst.onProjectileDeath(1085, MX, MY, MW, MH, 6, -8, 13, { hostile: false });
    return { sfxFiles, dustTypes, luckState: player.luckState, fireDeath, goreSpy };
  }

  it('150px 内玩家 brokenMirrorBadLuckTime=25200；Item106 音 + 尘330×10 + gore1394-1397 定序',
    () => {
      const m = mkMirror(MX, MY);                              // 玩家盒 [790..810]×[379..421]
      m.fireDeath();                                           // 与外扩盒 [650..968]×[250..568] 相交
      expect(m.luckState.brokenMirrorBadLuckTime).toBe(25200); // 坏运 420s = 7 分钟
      expect(m.sfxFiles.includes('Item_106')).toBe(true);
      expect(m.dustTypes.filter((t) => t === 330).length).toBe(10);
      expect(m.goreSpy.mock.calls.map((c) => c[0])).toEqual([1394, 1395, 1396, 1397]);
      m.goreSpy.mockRestore();
    });

  it('150px 外不相交 → badLuckTime 保持 0（rect 外扩门，非中心距判定）', () => {
    const m = mkMirror(1056, MY);                              // 玩家盒 [1046..1066]×[379..421]
    m.fireDeath();                                             // 镜仍在 (800,400)，外扩右沿 968
    expect(m.luckState.brokenMirrorBadLuckTime).toBe(0);
    m.goreSpy.mockRestore();
  });

  it('luck 消耗端聚合（RecalculateLuck :28694-28696 档）：TimeLeft 存续即坏运态且逐 tick 衰减',
    () => {
      const l = new LuckState();
      l.brokenMirrorBadLuckTime = 25200;
      expect(l.brokenMirrorBadLuck).toBe(true);
      l.update();                                              // UpdateBrokenMirrorLuck dayRate=1
      expect(l.brokenMirrorBadLuckTime).toBe(25199);
    });
});

// ===========================================================================
// ⑤ 恒消耗门（2026-08-30 蓝队 B1-3）：四件弹撞块消亡不回收——原版各弹 Kill 段
//    （P.cs:78889-78962 / :72034-72057）无 Item.NewItem 掉落段，SetDefaults 面
//    （Item.cs:23667/:23681/:40164/:43927）亦无任何回收语义。通用投掷尾
//    dropKey=null 走 THROWN_NO_RECOVERY_VIDS（雪球 949/beenade 先例同源）。
//    撞块几何沿 tests/arrow-tree-pass.test.ts 的实心泥墙模式。
// ===========================================================================
const NO_RECOVERY_PAIRS: ReadonlyArray<readonly [vid: number, projId: number]> = [
  [2352, 370], [2353, 371], [4986, 936], [5577, 1085],
];

/** 通用投掷尾实测透传的 ArrowOpts（Game.thrownCombat 分支:pierce=数据面 penetrate） */
function thrownTailOpts(projId: number): Record<string, unknown> {
  return { pierce: projectileData(projId)?.penetrate ?? 1,
    grav: 0.4, gravDelay: 20, drag: 0.97, maxFall: 32 };
}

describe('⑤ 恒消耗门：撞块消亡不回收（P.cs Kill 无掉落段）', () => {
  function wallWorld(): World {
    const world = new World(64, 32, 42, 'no-recovery');
    const DIRT = TILE_BY_KEY['dirt']!;
    // 两列实心泥墙 (40..41, 10..22)——重力延迟档 20t 内弹必命中首列
    for (let y = 10; y <= 22; y++) {
      world.store.setTile(40, y, DIRT, 0, 0);
      world.store.setTile(41, y, DIRT, 0, 0);
    }
    return world;
  }

  function recoverGame(world: World): { game: GameHooks; drops: string[] } {
    const drops: string[] = [];
    const game = {
      world,
      player: null,
      enemies: () => [], critters: () => [], npcs: () => [],
      spawnDrop: (_x: number, _y: number, key: string) => void drops.push(key),
      damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onProjectileDeath: () => {},
    } as unknown as GameHooks;
    return { game, drops };
  }

  /** 弹从墙左 20px 处水平飞入,逐 tick 推进至消亡（撞块单口,同 arrow-tree-pass 法） */
  function flyUntilDead(game: GameHooks, projId: number, dropKey: string | null): boolean {
    const a = new Arrow(40 * 16 - 20, 16 * 16 + 6, 5, 0, 10, 0, projId, dropKey,
      thrownTailOpts(projId) as never);
    for (let i = 0; i < 60 && !a.dead; i++) a.fixedUpdate(1 / 60, game);
    return a.dead;
  }

  it('清单钉值：949 + 四件,既存偏差手里剑 47 不入档', () => {
    expect([...THROWN_NO_RECOVERY_VIDS].sort((a, b) => a - b))
      .toEqual([949, 2352, 2353, 4986, 5577]);
  });

  it('四件仍由通用投掷分流接管（thrownCombat 非空/combatWeapon 空）——闸门即真实通路', () => {
    for (const v of NO_RECOVERY_PAIRS) {
      const def = { vid: v[0], key: `vi_${v[0]}` };
      expect(thrownCombat(def)).not.toBeNull();
      expect(combatWeapon(def)).toBeNull();
    }
  });

  it('dropKey=null：四件连掷多轮撞块消亡零 spawnDrop（null 短路在 rand 前,确定性）', () => {
    for (const [vid, projId] of NO_RECOVERY_PAIRS) {
      for (let round = 0; round < 12; round++) {
        const world = wallWorld();
        const { game, drops } = recoverGame(world);
        expect(flyUntilDead(game, projId, /* 派发侧映射后 */ null)).toBe(true);
        expect(drops).toEqual([]);                             // 绝不回吐 vi_...
        void vid;
      }
    }
  });

  it('对照（机制在位）：带 dropKey 的既有偏差件 rand<1/3 仍回收一枚原 key', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);   // 必中 1/3 掷
    try {
      const world = wallWorld();
      const { game, drops } = recoverGame(world);
      // 手里剑弹 3（既有偏差族样例）：带 key 撞块 → 回收该 key ×1 且消亡
      expect(flyUntilDead(game, 3, 'vi_47_shuriken')).toBe(true);
      expect(drops).toEqual(['vi_47_shuriken']);
    } finally {
      rnd.mockRestore();
    }
  });
});

// ===========================================================================
// B1-6 零伤投掷出口根治（红队 A-2 移交批,2026-08-31）：通用投掷出口升格为
//   GetWeaponDamage 原式（1457 P.cs:54059-54065 头 `if (damage <= 0) return
//   damage`,经 :43060 ItemCheck_Shoot(sItem, GetWeaponDamage(sItem)) 注入弹伤），
//   penetrate 亦 raw 直读（去 -1→6 药钳；melee :9541/magic :13638 同先例）。
//   受益面=vanilla-itemcombat.json 无 damage 行的消耗投掷件（SetDefaults 无
//   damage 行 → ResetStats 缺省 damage=-1,I.cs:49014）：本文件 B1 波三件
//   2352→370 / 2353→371 / 4986→936 + 三地球仪 4765/4766/5285→868/869/996 +
//   烟雾弹 1168→196（专支消费同 dmgT）+ 绳圈族四件（orphan-weapons-a 已锁）。
//   出膛面走真实 updateUse 分派链（orphan-weapons-a updUseGame 桩先例）；
//   命中面=出口终值直构 Arrow 与敌怪重叠——零结算零飘字（Damage_PVE :12576 头门,
//   hurt 单点不达 ⇒ addDamageNumber 链也不达）。
// ===========================================================================
describe('B1-6 零伤投掷出口根治：damage≤0 直传 + penetrate raw（2352/4986/4765 及对照组）', () => {
  const TILE = 16;

  /** updateUse 可驱动的最小 Game 桩（orphan-weapons-a updUseGame 同款,本文件独立副本） */
  function updUseGame(heldVid: number, stack = 1) {
    const g = Object.create(Game.prototype) as Record<string, any>;
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    const iidV = invIndexOfVanilla(heldVid);
    expect(iidV).toBeGreaterThanOrEqual(0);
    player.inv.add(iidV, stack);
    player.inv.selected = Math.max(0, player.inv.slots.findIndex((s) => s && s.id === iidV));
    g.player = player;
    g.world = new World(200, 200, 30);
    g.camera = {
      screenToWorld: () => [player.cx + 240, player.cy - 60],
      tileUnder: () => [80, 80],
    };
    g.enemies = () => [];
    g.candidatePlayers = undefined;
    g.housingMode = null;
    g.input = { mouseX: 500, mouseY: 300, mouseDown: false, rightDown: false,
      uiBlocking: false, downAction: () => false };
    g.entities = { projectiles: [] as unknown[], add(e: unknown) { this.projectiles.push(e); } };
    g.sfxFiles = [];
    g.synthFallbacks = [];
    g.playSfxFile = (f: string) => { g.sfxFiles.push(f); return true; };
    g.playSfxFiles = () => {};
    g.sfx = { play: (n: string) => { g.synthFallbacks.push(n); }, playWavFile: () => true };
    g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
    g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false },
      timeUiHover: false, weatherUiHover: false };
    g.smartCursor = { showing: false };
    g.annotateMode = false;
    g.prevSwingMouse = false;
    g.mining = null;
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g._prevMouseDown = false;
    g._prevRightDown = false;
    g.spawnParticles = () => {};
    g.useSwing = () => {};
    return { g, player };
  }

  function useBeat(g: Record<string, any>): void {
    g.updateUse(1 / 60);
    g._prevMouseDown = !!g.input.mouseDown;
  }

  /** 经真实分派链发射并取最后出膛的 Arrow（generic/smoke 专支产物皆是 Arrow） */
  function shootGeneric(vid: number): Arrow {
    const { g } = updUseGame(vid, 3);
    g.input.mouseDown = true;
    useBeat(g);
    const projs = (g.entities.projectiles as unknown[]).filter((p) => p instanceof Arrow);
    expect(projs.length).toBeGreaterThanOrEqual(1);
    return projs[projs.length - 1] as Arrow;
  }

  it('数据面：六件 shoot 映射 + 全员无 damage 行（thrownCombat 归 0）+ 弹 json 面值', () => {
    for (const [vid, pid] of [[2352, 370], [2353, 371], [4986, 936],
      [4765, 868], [4766, 869], [5285, 996], [1168, 196]] as const) {
      expect(itemCombat(vid)?.shoot).toBe(pid);
      expect(itemCombat(vid)?.damage ?? 0).toBe(0);            // 提取器无列=原版无 damage 行
      const t = thrownCombat({ vid, key: `vi_${vid}` });
      expect(t && t.damage).toBe(0);                           // ≤0 门同语义侧
    }
    // 三地球仪/药水族弹 penetrate=1；烟雾弹 −1（I/O 面值,B1-3 批已锁 aiStyle）
    for (const pid of [370, 371, 936, 868, 869, 996]) {
      expect(projectileData(pid)?.penetrate).toBe(1);
    }
    expect(projectileData(196)?.penetrate).toBe(-1);
  });

  it('出膛面：2352/4986/4765 出膛 damage===0（不再钳成 1）且 pierce=数据面 1', () => {
    for (const [vid, pid] of [[2352, 370], [4986, 936], [4765, 868]] as const) {
      const p = shootGeneric(vid);
      expect(p.projId).toBe(pid);
      expect(p.damage).toBe(0);
      expect(p.pierce).toBe(1);
    }
  });

  it('出膛面扩展：2353/4766/5285 同族同档；1168 烟雾弹专支 dmgT 同源=0、penetrate−1', () => {
    for (const [vid, pid] of [[2353, 371], [4766, 869], [5285, 996]] as const) {
      const p = shootGeneric(vid);
      expect(p.projId).toBe(pid);
      expect(p.damage).toBe(0);
      expect(p.pierce).toBe(1);
    }
    const smk = shootGeneric(1168);
    expect(smk.projId).toBe(196);
    expect(smk.damage).toBe(0);                                // GetWeaponDamage 原式（曾 1）
    expect(smk.pierce).toBe(-1);
  });

  it('命中面：370/936/868 以出口终值与敌怪重叠——零受击调用、血量原封、零飘字',
    () => {
      for (const pid of [370, 936, 868]) {
        const world = new World(64, 32, 42, 'b16-zero-dmg');
        const numbers: Array<{ x: number; y: number; n: number }> = [];
        const e = Enemy.fromVanilla(1, 20 * TILE, 16 * TILE)!;       // 开阔空中,无实心邻格
        (e as unknown as { lifeMax: number }).lifeMax = 25;
        e.hp = 25;
        const hurtCalls: number[] = [];
        (e as unknown as { hurt: (...a: unknown[]) => boolean }).hurt =
          (...a: unknown[]) => { hurtCalls.push(a[0] as number); return false; };
        const game = {
          world,
          player: null,
          enemies: () => [e], critters: () => [], npcs: () => [],
          spawnDrop: () => null,
          damagePlayer: (): number => 0,
          addDamageNumber: (x: number, y: number, n: number) =>
            void numbers.push({ x, y, n }),
          cutTile: () => {}, onProjectileDeath: () => {},
          playSfx: () => {}, playSfxFile: () => true, spawnDust: () => null,
          showPickupLabel: () => {}, notifyInventoryChanged: () => {},
        } as unknown as GameHooks;
        // 出口终值规格：dmgT=0、pierce=数据面 1、物理档 opts 通用投掷尾同款
        const a = new Arrow(20 * TILE, 16 * TILE, 5, 0, /* dmgT */ 0, 0, pid, null,
          { pierce: projectileData(pid)?.penetrate ?? 1,
            grav: 0.4, gravDelay: 20, drag: 0.97, maxFall: 32 } as never);
        let ticks = 0;
        while (!a.dead && ticks < 30 && hurtCalls.length === 0) {
          a.fixedUpdate(1 / 60, game);
          ticks++;
        }
        expect(ticks).toBeGreaterThan(10);                   // 重叠窗充分展开
        expect(hurtCalls.length).toBe(0);                    // ★零结算：hurt 单点不达
        expect(e.hp).toBe(25);                               // 血量原封
        expect(numbers).toEqual([]);                         // ★零飘字：addDamageNumber 不达
        void world;
      }
    });

  it('对照面：基伤>0 件维持 min1×ranged 链（雪球 949 真弹 dmg≥1,出口钳不得误扩到正伤件）', () => {
    const t949 = thrownCombat({ vid: 949, key: 'vi_949_snowball' });
    expect(t949 && t949.shoot).toBe(166);
    expect((t949?.damage ?? 0)).toBeGreaterThan(0);
    // 出口乘区恒 ≥1 的口径只对 tc.damage>0 成立——用 0 基伤断言反守门不被钳:
    // 正伤链不动由 orphan-weapons-a 投刀对照锁定,此处仅钉雪球映射防回退。
  });
});
