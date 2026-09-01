// R30/R31 蓝队合并修复回归（近战投掷族 + 召唤鞭视觉面,2026-08-25）
// A 注册表完整性：R30 四族+R31 召唤杖 ~67 件 id↔键双向在册 + 掉落源映射非空
// B 行为面：矛复击窗/链枷尘粒型/鞭拖尾尘/哨兵出生尘爆/悬浮哨兵/落地扫描/链斩 AI_013
// 数据源：red-team-r30.md / red-team-r31.md + Terarria1458 反编译行号（各断言注明）
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { combatWeapon, itemCombat } from '../src/data/vanillaItemCombat';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { vanillaStatOfVid } from '../src/data/vanillaItemStats';
import dropsJson from '../src/data/vanilla-npcdrops.json';
import { Boomerang, SpearProj, FlailProj, YoyoProj } from '../src/entities/WeaponProj';
import { WhipProj } from '../src/entities/WhipProj';
import { MinionProj, pickSentryLandingSpot, SENTRY_SHOOT } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REUSE_DELAY_TICKS, SENTRY_WAND_VIDS } from '../src/core/Game';

const W = 220, H = 130;

interface DustRec { x: number; y: number; w: number; h: number; type: number; scale: number }
function makeHooks() {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 104; y < H; y++) store.setTile(x, y, 1);
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const dusts: DustRec[] = [];
  const sfx: string[] = [];
  const bursts: Array<{ color: string; dir: number }> = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (files: string[]) => sfx.push(files.join(',')),
    showPickupLabel: () => {},
    spawnDust: (x: number, y: number, w: number, h: number, type: number, _sx?: number, _sy?: number, _al?: number, _col?: unknown, scale?: number) => {
      dusts.push({ x, y, w, h, type, scale: scale ?? 1 });
      return { x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
        type, scale: scale ?? 1, alpha: 0, fadeIn: 0, noGravity: false, noLight: false };
    },
    spawnBurst: (_x: number, _y: number, color: string, _n: number, _spd: number, dir: number) => { bursts.push({ color, dir }); },
    entities: { projectiles: [], add: () => {} },
  } as never;
  return { hooks: hooks as GameHooks & { entities: { projectiles: unknown[]; add: (e: unknown, b?: string) => void } }, store, player, enemies, dusts, sfx, bursts };
}

const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number): void => {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
};

// ===================== A. 可获得性大账（红队 P0 定性修正后的真值闸门） =====================

/** R30 四族在册件 → combatWeapon 分流档（vid→kind） */
const R30_KINDS: Array<readonly [number, string]> = [
  // 回旋镖 aiStyle3（R30 §1 总览"不可获得"7 件）
  [55, 'boomerang'], [191, 'boomerang'], [119, 'boomerang'], [1122, 'boomerang'],
  [1324, 'boomerang'], [1918, 'boomerang'], [4764, 'boomerang'],
  // 链枷 aiStyle15 + 链斩 3012→481（ai13 锚定族归 spear 分流,AI_013 专支承接）
  [162, 'flail'], [801, 'flail'], [4272, 'flail'], [5526, 'flail'], [3012, 'spear'],
  // 矛 aiStyle19
  [550, 'spear'], [756, 'spear'], [802, 'spear'], [1200, 'spear'],
];
const R30_YOYOS = [3278, 3285, 3282, 3262, 3284, 3315, 3292, 3291, 3286, 3289, 3290, 3283, 3316, 3287, 3288, 3281, 3280, 3279, 3389];
/** R31 召唤杖（40 件点名族中除已注册 7 件外的 33 件） */
const R31_SENTRY = [1572, 2366, 5119, 3569, 3571, 5463, 3818, 3819, 3820, 3824, 3825, 3826, 3829, 3830, 3831, 3832, 3833, 3834];
const R31_MINION = [1157, 2364, 2365, 2535, 2551, 2584, 2621, 2749, 3249, 3474, 3531, 4269, 4273, 5069, 5114, 5456];
/** yoyo 配套生态配件（acc 槽位） */
const R30_ACCS = [3334, 3366, 5540, 5541, 3309, 3310, 3311, 3312, 3313, 3314];

describe('A. R30/R31 武器注册完整性（id↔键双向+combatWeapon 分流）', () => {
  it('R30 回旋镖/链枷/矛族 id↔键双向在册且分流正确', () => {
    for (const [vid, kind] of R30_KINDS) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vid ${vid} 应有键映射`).toBeTruthy();
      const iid = ITEM_BY_ID_OF(key);
      expect(iid, `key ${key} 应有 def`).toBeGreaterThanOrEqual(0);
      const cw = combatWeapon({ key });
      expect(cw?.kind, `vid ${vid} kind`).toBe(kind);
    }
  });

  it('R30 悠悠球全系 19 把在册且归 yoyo 分流（YOYO_RANGE 表覆盖）', async () => {
    const { YOYO_RANGE } = await import('../src/entities/WeaponProj');
    for (const vid of R30_YOYOS) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `yoyo ${vid}`).toBeTruthy();
      const cw = combatWeapon({ key });
      expect(cw?.kind).toBe('yoyo');
      const proj = (cw as { shoot: number }).shoot;
      expect(YOYO_RANGE[proj], `yoyo ${vid}→proj ${proj} 射程档`).toBeGreaterThan(0);
    }
  });

  it('R31 召唤杖 33 件在册且 sentry/minion 归位正确', () => {
    for (const vid of [...R31_SENTRY, ...R31_MINION]) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `staff ${vid}`).toBeTruthy();
      const cw = combatWeapon({ key });
      expect(cw?.kind, `staff ${vid} kind`).toBe('summon');
      expect((cw as { sentry?: boolean }).sentry, `staff ${vid} sentry`).toBe(R31_SENTRY.includes(vid));
    }
  });

  it('yoyo 配套生态配件 acc 槽位在册（手套/袋/魔法线/配重球）', () => {
    for (const vid of R30_ACCS) {
      expect(vanillaStatOfVid(vid)?.acc, `acc ${vid}`).toBe(1);
    }
  });

  it('原版掉落源映射非空（Enemy.ts:12309 VANILLA_ITEM_KEY_BY_ID 反查全命中）', () => {
    // 红队点名的 11 个掉落产物 id——规则树里必须真实引用且键映射非空
    const targets = [1122, 1324, 2584, 3282, 3285, 3286, 3289, 3290, 3292, 4272, 4764];
    const referenced = new Set<number>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
          if ((k === 'item' || k === 'create' || k === 'id') && typeof v === 'number') {
            if (targets.includes(v)) referenced.add(v);
          } else walk(v);
        }
      }
    };
    walk((dropsJson as { entries: unknown }).entries);
    for (const vid of targets) {
      expect(referenced.has(vid), `drops 引用 ${vid}`).toBe(true);
      expect(VANILLA_ITEM_KEY_BY_ID[vid], `掉落反查 ${vid}`).toBeTruthy();
    }
  });

  it('配方链产物可解析（vanillaRecipes.VID_TO_KEY 全通）', () => {
    for (const vid of [55, 119, 550, 1200, 801, 3278, 3279, 3280, 3281, 3283, 3315,
      2364, 2365, 2366, 2535, 2551, 3474, 3531]) {
      expect(vanillaItemKey(vid), `recipe create ${vid}`).toBeTruthy();
    }
  });

  it('R29 移交件：4058/4381 combat 条目=R29 反编译值;197/4060/266 本就齐备', () => {
    expect(itemCombat(4058)).toMatchObject({ shoot: 1, useAmmo: 40, useTime: 17, shootSpeed: 11, damage: 8 });
    expect(itemCombat(4381)).toMatchObject({ shoot: 1, useAmmo: 40, useTime: 19, shootSpeed: 9, damage: 14, autoReuse: true });
    // ★红队移交单误记勘误：StarCannon=197/SuperStarCannon=4060（ItemID.cs:1940/:9666）
    expect(itemCombat(197)).toMatchObject({ shoot: 955, useAmmo: 75 });
    expect(itemCombat(4060)).toMatchObject({ shoot: 728, useAmmo: 75 });
    expect(itemCombat(266)?.useAmmo).toBe(169);
    // 4058 无 vanilla.json 素材 → 兜底 def 必须存在（items.ts 文件尾注册段）
    expect(VANILLA_ITEM_KEY_BY_ID[4058]).toBe('vi_4058_SkeletonBow');
  });
});

// ===================== B. 行为面 =====================

describe('B-1 矛族复击窗（AI_019 缺省 npc.immune[owner]=10t 全局档,R30 §3.1 P1）', () => {
  /** 带时钟衰减的敌怪 mock：hurt 置 immune[owner]=10t,每 tick 递减（Enemy.hurt
   *  pierce=0 路径 + UpdateDecrementIframes 语义）。返回命中 tick 列表 */
  function hitTrackingEnemy(hooks: ReturnType<typeof makeHooks>, clock: { now: number },
    id: number, box: { x: number; y: number; w: number; h: number }): number[] {
    const hitTicks: number[] = [];
    let lastHurt = -100;
    (hooks.enemies as unknown[]).push({
      id, ...box, dead: false, vx: 0, vy: 0,
      get iframes() { return Math.max(0, 10 - (clock.now - lastHurt)); },
      hurt() { lastHurt = clock.now; hitTicks.push(clock.now); return true; },
    });
    return hitTicks;
  }

  it('Dark Lance 一刺对重叠 >10t 的目标可再中（≥2 跳）', () => {
    const h = makeHooks();
    const clock = { now: 0 };
    const hits = hitTrackingEnemy(h, clock, 1, { x: h.player.cx + 20, y: h.player.cy - 20, w: 260, h: 40 });
    const s = new SpearProj(1, 0, 6, 22, 30, 5, 46);
    for (let i = 0; i < 22 && !s.dead; i++) { s.fixedUpdate(1 / 60, h.hooks); clock.now++; }
    expect(s.dead).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(2);   // 复击窗恢复（9999 私账时代恒 1）
  });

  it('小怪重叠 <10t 时仍恰 1 跳（不引入多跳回归）', () => {
    const h = makeHooks();
    const clock = { now: 0 };
    // 矛尖掠过区（峰值 offset24×spd6=144px 附近）——重叠窗仅 ~2t
    const hits = hitTrackingEnemy(h, clock, 2, { x: h.player.cx + 145, y: h.player.cy - 20, w: 10, h: 40 });
    const s = new SpearProj(1, 0, 6, 22, 30, 5, 46);
    for (let i = 0; i < 22 && !s.dead; i++) { s.fixedUpdate(1 / 60, h.hooks); clock.now++; }
    expect(hits.length).toBe(1);
  });
});

describe('B-4 链枷飞行尘 VanillaDust 化（AI_015_Flails_Dust :45219-45294）', () => {
  it('26 Blue Moon=每 tick d172(scale1.5);35 Sunfury=d6 scale3;948=!wet d6 scale1.2', () => {
    const h26 = makeHooks();
    const f26 = new FlailProj(h26.player.cx, h26.player.cy, 15, 3, 26, () => true, () => ({ x: h26.player.cx + 100, y: h26.player.cy }));
    place(f26, h26.player);
    run(f26, h26.hooks, 12);
    const d172 = h26.dusts.filter((d) => d.type === 172);
    expect(d172.length).toBeGreaterThanOrEqual(10);          // 每 tick 一粒
    expect(d172.every((d) => Math.abs(d.scale - 1.5) < 0.05)).toBe(true);

    const h35 = makeHooks();
    const f35 = new FlailProj(h35.player.cx, h35.player.cy, 15, 3, 35, () => true, () => ({ x: h35.player.cx + 100, y: h35.player.cy }));
    place(f35, h35.player);
    run(f35, h35.hooks, 12);
    const d6big = h35.dusts.filter((d) => d.type === 6 && Math.abs(d.scale - 3) < 0.05);
    expect(d6big.length).toBeGreaterThanOrEqual(10);         // 每 tick 一粒 scale3

    const h948 = makeHooks();
    const f948 = new FlailProj(h948.player.cx, h948.player.cy, 15, 3, 948, () => true, () => ({ x: h948.player.cx + 100, y: h948.player.cy }));
    place(f948, h948.player);
    run(f948, h948.hooks, 12);
    const d6wet = h948.dusts.filter((d) => d.type === 6 && Math.abs(d.scale - 1.2) < 0.05);
    expect(d6wet.length).toBeGreaterThanOrEqual(10);         // !wet 门放行（store 无液体）
  });
});

describe('B-5 Chain Guillotines 3012→481 AI_013 锚定专支（Projectile.cs:24957-25120）', () => {
  it('自由飞出 >525px 转回收 → 近手 <50 Kill（不再走矛包络贴身前刺）', () => {
    const h = makeHooks();
    const s = new SpearProj(1, 0, 10, 999, 59, 6.5, 481);
    let maxDist = 0;
    let sawReturn = false;
    for (let i = 0; i < 600 && !s.dead; i++) {
      s.fixedUpdate(1 / 60, h.hooks);
      maxDist = Math.max(maxDist, s.cx - h.player.cx);
      if (maxDist > 400 && s.vx < 0) sawReturn = true;
    }
    expect(maxDist).toBeGreaterThan(500);   // 出程越过近域（包络模型峰值仅 ~144px@spd6）
    expect(sawReturn).toBe(true);           // 回收相速度朝玩家
    expect(s.dead).toBe(true);              // 近手消亡
    expect(maxDist).toBeLessThan(700);      // 出程门 525px（+子步过冲余量）
  });
});

// B-3 回旋镖出手点：原版出生点=玩家中心（ItemCheck_Shoot :47603 通用尾支），Game.ts
// case 'boomerang' 用 px/py 前移 14px 属发射挂点偏差——修复点在 Game.ts 一行
// （placeAtShootSpawn 收口），实体侧首帧回正会破坏 ballistra-boomerang-anchor/
// blue-r17-1458 两道白盒锚（构造点即弹位假设），按文件边界纪律入落点清单不越界。

describe('D-1 AI_165 逐鞭拖尾尘（WHIP_TRAIL_DUST :48660-49145）', () => {
  function whip(projId: number, itemId: number, h: ReturnType<typeof makeHooks>): WhipProj {
    const owner = (): Player => h.player;
    return new WhipProj(h.player.cx, h.player.cy, 0, projId, itemId, 20, 2, 30, 10,
      () => owner(), () => 0);
  }
  it('848 晨星鞭挥出期撒 d172（env 包络窗内 ≥1 粒）', () => {
    const h = makeHooks();
    const w = whip(848, 4679, h);
    run(w, h.hooks, 120);
    expect(w.dead).toBe(true);
    expect(h.dusts.filter((d) => d.type === 172).length).toBeGreaterThanOrEqual(1);
  });
  it('849 黑收成 t>0.4 段撒 d191;915 万花筒撒 d267（hue 尘型出现）', () => {
    const h = makeHooks();
    const w = whip(849, 4680, h);
    run(w, h.hooks, 200);
    expect(h.dusts.some((d) => d.type === 191)).toBe(true);

    const h2 = makeHooks();
    const w2 = whip(915, 4914, h2);
    run(w2, h2.hooks, 200);
    expect(h2.dusts.some((d) => d.type === 267)).toBe(true);
  });
  it('52 木回旋镖…非鞭弹型零尘消费（表外型号原版本就无尘）', () => {
    const h = makeHooks();
    const w = whip(952, 5074, h);   // 952 骨鞭在表内
    run(w, h.hooks, 60);
    expect(h.dusts.some((d) => d.type === 26)).toBe(true);
    // 表外鞭（841 默认无 per-type 支）：整场零拖尾尘
    const h2 = makeHooks();
    const w2 = whip(841, 4672, h2);
    run(w2, h2.hooks, 120);
    expect(h2.dusts.length).toBe(0);
  });
});

describe('C 哨兵视觉与放置模型（R31 §C）', () => {
  it('SENTRY_SHOOT[643].cd=26（~26t 一轮,旧 50=射速减半）', () => {
    expect(SENTRY_SHOOT[643].cd).toBe(26);
    expect(SENTRY_SHOOT[643].volley).toBe(3);
  });

  it('aiStyle53 出生尘爆+Item46 音（:37951-37990）：308 首帧 80×d185+Item_46', () => {
    const h = makeHooks();
    const m = new MinionProj(h.player.cx, h.player.cy, 308, 30, 2, true, 0, false, () => h.player);
    run(m, h.hooks, 3);
    expect(h.sfx.some((t) => t.includes('Item_46'))).toBe(true);
    expect(h.dusts.filter((d) => d.type === 185).length).toBe(80);
    // 第二 tick 不重播（localAI 一次性门）
    const before = h.dusts.filter((d) => d.type === 185).length;
    run(m, h.hooks, 3);
    expect(h.dusts.filter((d) => d.type === 185).length).toBe(before);
  });

  it('377 蜘蛛皇后 40×d171 / 966 猎犬 30×d219（Center±25/30 盒）', () => {
    const h = makeHooks();
    const m = new MinionProj(h.player.cx, h.player.cy, 377, 30, 2, true, 0, false, () => h.player);
    run(m, h.hooks, 2);
    expect(h.dusts.filter((d) => d.type === 171).length).toBe(40);

    const h2 = makeHooks();
    const m2 = new MinionProj(h2.player.cx, h2.player.cy, 966, 30, 2, true, 0, false, () => h2.player);
    run(m2, h2.hooks, 2);
    expect(h2.dusts.filter((d) => d.type === 219).length).toBe(30);
  });

  it('悬浮哨兵 643 恒悬浮不吃重力;地面哨兵 308 照常下坠落定', () => {
    const h = makeHooks();
    const float = new MinionProj(h.player.cx, h.player.cy, 643, 30, 2, true, 0, false, () => h.player);
    const y0 = float.y;
    run(float, h.hooks, 40);
    expect(float.y).toBe(y0);            // AI_123 velocity=Zero 恒悬浮

    const h2 = makeHooks();
    const ground = new MinionProj(h2.player.cx, h2.player.cy, 308, 30, 2, true, 0, false, () => h2.player);
    run(ground, h2.hooks, 120);
    expect(ground.y).toBeGreaterThan(h2.player.cy);   // 重力落地（y≈104*16-盒高）
    expect(ground.onGround).toBe(true);
  });

  it('pickSentryLandingSpot 1:1（Player.cs:50043-50059）：向下扫三列无实心带+spawnY=i×16−24;悬浮三件免扫描', () => {
    const h = makeHooks();
    // 鼠标格 (60,50)：列 59-61 首个实心行=104 → 落地行 103 → spawnY=103×16−24
    const spot = pickSentryLandingSpot(h.store, 60 * 16 + 8, 50 * 16 + 8, 1572, H);
    expect(spot.x).toBe(60 * 16 + 8);
    expect(spot.y).toBe(103 * 16 - 24);
    // 悬浮件（3571/3569/5463）免扫描直取鼠标格
    const fl = pickSentryLandingSpot(h.store, 60 * 16 + 8, 50 * 16 + 8, 3571, H);
    expect(fl.y).toBe(50 * 16 - 24);
    // 靠墙侧：左邻实心时该行即终止（三列门）
    for (let y = 90; y < 104; y++) h.store.setTile(59, y, 1);
    const spot2 = pickSentryLandingSpot(h.store, 60 * 16 + 8, 85 * 16, 2366, H);
    expect(spot2.y).toBe(89 * 16 - 24);   // 首个三列含实心行=90 → 取 89
  });

  it('OOA 塔召唤音单播化：663 弹幕侧不再播 dd2_defense_tower_spawn（usesound 已真值）', () => {
    const h = makeHooks();
    const m = new MinionProj(h.player.cx, h.player.cy, 663, 30, 2, true, 0, false, () => h.player);
    run(m, h.hooks, 5);
    expect(h.sfx.some((t) => t.includes('dd2_defense_tower_spawn'))).toBe(false);
    // 970 计数器同样不再播 abigail_summon（物品 5114 usesound 单播）
    const h2 = makeHooks();
    const c970 = new MinionProj(h2.player.cx, h2.player.cy, 970, 6, 2, false, 0, false, () => h2.player);
    run(c970, h2.hooks, 5);
    expect(h2.sfx.some((t) => t.includes('abigail_summon'))).toBe(false);
  });

  it('ai62Step 待机尘：375 小鬼 1/7 d6(scale2)、407 暴风雨 1/5 d217(alpha100)', () => {
    const h = makeHooks();
    const imp = new MinionProj(h.player.cx, h.player.cy, 375, 30, 2, false, 0, false, () => h.player);
    run(imp, h.hooks, 140);
    expect(h.dusts.filter((d) => d.type === 6 && Math.abs(d.scale - 2) < 0.05).length).toBeGreaterThanOrEqual(3);

    const h2 = makeHooks();
    const storm = new MinionProj(h2.player.cx, h2.player.cy, 407, 30, 2, false, 0, false, () => h2.player);
    run(storm, h2.hooks, 140);
    expect(h2.dusts.filter((d) => d.type === 217 && Math.abs(d.scale - 2) < 0.05).length).toBeGreaterThanOrEqual(3);
  });
});

// ---- 工具：ITEM_BY_KEY 反查（避免拉入整个 items.ts 的 ITEM_BY_KEY 循环依赖面） ----
function ITEM_BY_ID_OF(key: string): number {
  for (let i = 0; i < ITEM_DEFS.length; i++) if (ITEM_DEFS[i].key === key) return i;
  return -1;
}
/** 链枷出生盒心校正（Game.ts placeAtShootSpawn 同式） */
function place(f: FlailProj, p: Player): void {
  f.x = p.cx - f.w / 2;
  f.y = p.cy - f.h / 2;
}

// YoyoProj 引用保活（注册测试只查分流,实体行为已有 yoyo-bag 38 断言覆盖）
void YoyoProj;

// ===================== 批次5 集成收编（blue-team-batch5,2026-08-25 落点清单 ①-⑧） =====================
const gameSrcOf = (): string =>
  readFileSync(fileURLToPath(new URL('../src/core/Game.ts', import.meta.url)), 'utf8');

describe('批次5 集成收编（落点清单 ①-⑧）', () => {
  // ① 回旋镖出手点收口：原版 ItemCheck_Shoot 通用尾支 pointPosition=玩家中心
  //（1458 Player.cs:47603 + RotatedRelativePoint :4209-4227 无旋转时偏移恒 0）。
  // 断言同步（2026-08-31 注）：Game boomerang 支改为【直构即中】——Boomerang 构造
  // 直取 this.player.cx/cy，不再二次 placeAtShootSpawn 回正（同一落点语义,少一跳
  // 中间盒回正;见 Game.ts boomerang 支注释）。正则同步新形态。
  it('① boomerang 出手点:Game 发射链直构即中(玩家中心)', () => {
    const src = gameSrcOf();
    expect(src).toMatch(/new Boomerang\(this\.player\.cx, this\.player\.cy,/);
    // 断言同步（2026-08-31 注）：magic/shot/grenade 的“同式偏差登记”注释已被后续
    // 批次改写移除,原第二正则失效——该偏差的裁定载体改由 approx-registry 台账
    // 承载（文档面）,此处不再对注释字面做源码断言。
  });

  // ② 链枷多球门放宽(R30 §5.2):原版 AI_015 无同型存在门,唯一约束=channel;
  // 掷出后旧球由 case1/2 再按支转 ai0=6 让位(FlailProj 已 1:1)
  it('② flail 多球门:仅 aiState===0 自旋态挡新球(源断言+实体态确认)', () => {
    const src = gameSrcOf();
    expect(src).toMatch(/instanceof FlailProj && e\.projId === cw\.shoot && e\.aiState === 0\) return/);
    const f = new FlailProj(0, 0, 20, 2, 26, () => false, () => ({ x: 100, y: 0 }));
    expect(f.aiState).toBe(0);   // 出生即自旋态——该相门仍生效
  });

  // ③ 哨兵放置接线(ItemCheck_Shoot :48716-48755 六件专支):落地三件扫描+悬浮三件免扫
  it('③ 哨兵杖六件 SENTRY_WAND_VIDS 全在册 sentry 分流+Game 专支源断言', () => {
    for (const vid of [1572, 2366, 3571, 3569, 5119, 5463]) {
      expect(SENTRY_WAND_VIDS.has(vid), `vid ${vid}`).toBe(true);
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vid ${vid} 键映射`).toBeTruthy();
      expect(combatWeapon({ key })?.kind).toBe('summon');
    }
    const src = gameSrcOf();
    expect(src).toMatch(/pickSentryLandingSpot\(this\.world\.store, mwx, mwy, critVid,/);
    expect(src).toMatch(/spawned\.vx = 0/);
    expect(src).toMatch(/spawned\.vy = critVid === 5463 \? 0 : 15/);   // speedY11(:48731/:48740)
  });

  // ⑤ strongBees(Hive Pack 3333)通道(Player.cs:15457-15459 → beeType/beeDamage/beeKB)
  it('⑤ Hive Pack 3333 → equipStats.strongBees 置位/摘下即灭(行为)', () => {
    const h = makeHooks();
    expect(h.player.equipStats.strongBees).toBe(false);
    const iid3333 = ITEM_BY_ID_OF(VANILLA_ITEM_KEY_BY_ID[3333]);
    expect(iid3333, '3333 应有自动注册 def').toBeGreaterThanOrEqual(0);
    h.player.inv.armor[3] = { id: iid3333, stack: 1 };
    expect(h.player.equipStats.strongBees).toBe(true);
    h.player.inv.armor[3] = null as never;
    expect(h.player.equipStats.strongBees).toBe(false);
  });
  it('⑤ Game 1121 蜂枪分支消费 beeType()/beeDamage()/beeKB() 强蜂三链+计数档(源断言)', () => {
    const src = gameSrcOf();
    expect(src).toMatch(/const strongBee = this\.player\.equipStats\.strongBees && Math\.floor\(Math\.random\(\) \* 2\) === 0/);
    expect(src).toMatch(/strongBee \? 1 \+ Math\.floor\(Math\.random\(\) \* 3\) : Math\.floor\(Math\.random\(\) \* 2\)/);   // 强蜂 dmg+Next(1,4)
    expect(src).toMatch(/strongBee \? 0\.5 \+ kbBase \* 1\.1 : kbBase/);   // beeKB 0.5+KB×1.1
    expect(src).toMatch(/strongBee \? 566 : 181/);                          // beeType()
    expect(src).toMatch(/strongBees && Math\.floor\(Math\.random\(\) \* 3\) === 0\) nBee\+\+/);   // volley 计数档
  });

  // ⑥ 矛伴生弹(AI_019 per-type :46726-46746 行为对拍)
  it('⑥ 756 蘑菇矛→130:localAI[0]∈{0,4..24} 七连掷 131(damage/3,kb0,继承矛速)', () => {
    const h = makeHooks();
    const spawned: Array<{ pid: number; vx: number; vy: number; dmg: number; kb: number }> = [];
    const spear = new SpearProj(1, 0, 5.5, 40, 30, 6.2, 130);
    spear.spawnProj = (x, y, vx, vy, pid, dmg, kb) => {
      void x; void y;
      spawned.push({ pid, vx, vy, dmg, kb });
    };
    run(spear, h.hooks, 30);
    expect(spawned.length).toBe(7);                                          // 七连
    expect(spawned.every((s) => s.pid === 131)).toBe(true);
    expect(spawned.every((s) => s.dmg === Math.trunc(30 / 3))).toBe(true);   // damage/3 整除
    expect(spawned.every((s) => s.kb === 0)).toBe(true);
    expect(spawned[0].vx).toBeCloseTo(5.5, 6);                               // 继承矛 velocity
    expect(spawned.every((s) => s.vy === 0)).toBe(true);
  });
  it('⑥ 4061 风暴矛→730:首拍一次性掷 732(v×4,damage×1.6 截断,kb×0.5)', () => {
    const h = makeHooks();
    const spawned: Array<{ pid: number; vx: number; vy: number; dmg: number; kb: number }> = [];
    const spear = new SpearProj(1, 0, 3.5, 40, 14, 6, 730);
    spear.spawnProj = (_x, _y, vx, vy, pid, dmg, kb) => {
      spawned.push({ pid, vx, vy, dmg, kb });
    };
    run(spear, h.hooks, 12);
    expect(spawned.length).toBe(1);                    // localAI[0]==0 单发门
    expect(spawned[0].pid).toBe(732);
    expect(spawned[0].vx).toBeCloseTo(14, 6);          // v×4 = 3.5×4
    expect(spawned[0].dmg).toBe(Math.trunc(14 * 1.6)); // (int)(damage×1.6)=22
    expect(spawned[0].kb).toBeCloseTo(3, 6);           // kb×0.5
  });

  // ⑦ reuseDelay/channel 列已齐(提取器重跑幂等,全文件除 generatedAt 零 diff);
  // 消费端维持 REUSE_DELAY_TICKS 静态表+r26 对账闸锁步(395KB golden 不入运行时包)
  it('⑦ golden 表 reuseDelay/channel 列与 REUSE_DELAY_TICKS 锁步(抽 434/3870/3541)', () => {
    const golden = JSON.parse(readFileSync(
      fileURLToPath(new URL('../tools/golden/vanilla-shoot-table.json', import.meta.url)), 'utf8',
    )) as { items: Record<string, { reuseDelay?: number; channel?: boolean }> };
    expect(golden.items['434']?.reuseDelay).toBe(REUSE_DELAY_TICKS[434]);
    expect(golden.items['3870']?.reuseDelay).toBe(REUSE_DELAY_TICKS[3870]);
    expect(golden.items['3541']?.reuseDelay).toBe(REUSE_DELAY_TICKS[3541]);
    expect(golden.items['3541']?.channel).toBe(true);
    expect(golden.items['3269']?.channel).toBe(true);
  });
});
