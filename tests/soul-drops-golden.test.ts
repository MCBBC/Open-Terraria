// FX44 魂族双缺陷定谳面（2026-09-15 用户实报：①飞龙 87 不掉飞翔之魂 575 ②魂掉落物理）。
//
// 原版逐字定谳（先定谳后动刀）：
// - 掉落站（Terarria1457 ItemDropDatabase.cs 逐行）：
//   :1004 飞龙 87 = DropBasedOnExpertMode(Common(575,1,5,10), Common(575,1,10,20))
//     —— 普通 5-10 @100%、专家 10-20 @100%（chanceDenominator=1 = 必掉）
//   :1003 飞龙 87 = ItemDropWithConditionRule(4379 风筝, 25, WindyEnoughForKiteDrops)
//   :440  Skeletron Prime 127 = ByCondition(NotExpert, 547 恐惧之魂, 1, 25, 40)
//   :453  The Destroyer 134  = ByCondition(NotExpert, 548 力量之魂, 1, 25, 40)
//   :455-456 The Twins 125/126 = Common(549 视域之魂, 1, 25, 40)（挂 MissingTwin 门链）
//   :696/:697 全局 = ItemDropWithConditionRule(520 光之魂/521 暗影之魂, 5, 1, 1,
//     Conditions.SoulOfLight / SoulOfNight)——1/5 掉率、困难模式+ zone 门
//     （Conditions.cs:825-871 SoulOfWhateverConditionCanDrop :1574）
// - 掉落物理（WorldItem.cs:779-794 MoveInWorld + ItemID.cs:1108）：
//   `if (!shimmered && ItemID.Sets.ItemNoGravity[type])` 分支【不加重力】，速度双向
//   ×0.95 阻尼（|v|<0.1 归零）→ 魂掉落即停在死亡点悬停，永不下坠（NewItem 初速
//   双向 Next(-30,31)×0.1,Item.cs:49746-49756）。集= {520,521,575,549,548,547,
//   3453,3454,3455,3456,3457,3458,3459,3580,3581,4143} 16 项逐字。
//   本仓曾整缺该分流（ItemDrop.fixedUpdate 对全体掉落一律 +g）= 魂按常规件坠地。
import { describe, it, expect } from 'vitest';
import dropData from '../src/data/vanilla-npcdrops.json';
import { resolveDrops, evalCond, type NpcDropCtx } from '../src/drops/NpcDrops';
import { ITEM_NO_GRAVITY_VIDS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { RNG } from '../src/core/rng';

const ENTRIES = (dropData as { entries: Array<{ npcs?: number[]; global?: boolean; rule: any }> }).entries;

/** netID → 注册序规则列表（NpcDrops.ts 同构，测试侧独立重建防索引失配） */
function rulesFor(netId: number): any[] {
  return ENTRIES.filter((e) => !e.global && (e.npcs ?? []).includes(netId)).map((e) => e.rule);
}
function globalRules(): any[] {
  return ENTRIES.filter((e) => e.global).map((e) => e.rule);
}

/** 定向假 RNG：min 档取闭区间下界（掷骰恒中、堆叠取 min）,max 档取上界 */
function fakeRng(mode: 'min' | 'max'): RNG {
  return {
    int: (a: number, b: number) => (mode === 'min' ? a : b),
    next: () => (mode === 'min' ? 0 : 0.99),
  } as unknown as RNG;
}

function mkCtx(type: number, over: Partial<NpcDropCtx> = {}): NpcDropCtx {
  return {
    rng: fakeRng('min'),
    netId: type,
    type,
    isExpert: false,
    isMaster: false,
    hardMode: true,
    crimson: false,
    flags: {},
    x: 1000, y: 3000,
    worldSurfaceTile: 180, rockLayerTile: 300, underworldTileY: 1000,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 100, friendly: false, boss: false, damage: 20, value: 100,
    hp: 400, hpMax: 400, mana: 200, manaMax: 200,
    ...over,
  } as NpcDropCtx;
}

const findDrop = (drops: Array<{ id: number; n: number }>, id: number) =>
  drops.find((d) => d.id === id);

// ============ ① 魂族掉落表（vanilla ItemDropDatabase.cs 逐字对照） ============
describe('魂族掉落表 1:1（ItemDropDatabase.cs）', () => {
  it('飞龙 87：飞翔之魂 575 普通 5-10@100% / 专家 10-20@100%（:1004）+ 风筝 4379 1/25 windy（:1003）', () => {
    const rules = rulesFor(87);
    const soul = rules.find((r) => r.k === 'expert' && r.normal?.item === 575);
    expect(soul, '87 必须注册 DropBasedOnExpertMode(575)').toBeTruthy();
    expect(soul.normal).toMatchObject({ item: 575, denom: 1, min: 5, max: 10 });
    expect(soul.expert).toMatchObject({ item: 575, denom: 1, min: 10, max: 20 });
    const kite = rules.find((r) => r.k === 'cond' && r.item === 4379);
    expect(kite).toMatchObject({ denom: 25, min: 1, max: 1 });
    expect(kite.cond).toMatchObject({ name: 'WindyEnoughForKiteDrops' });
  });

  it('机械三魂：127→547 惧 / 134→548 力 / 125+126→549 视，NotExpert 25-40@100%（:440/:453/:455）', () => {
    expect(rulesFor(127).find((r) => r.item === 547)).toMatchObject({ k: 'cond', denom: 1, min: 25, max: 40 });
    expect(rulesFor(127).find((r) => r.item === 547)!.cond).toMatchObject({ name: 'NotExpert' });
    expect(rulesFor(134).find((r) => r.item === 548)).toMatchObject({ k: 'cond', denom: 1, min: 25, max: 40 });
    // 双子是 MissingTwin 门 → NotExpert 门 → common 549 链
    for (const twin of [125, 126]) {
      const sight = JSON.stringify(rulesFor(twin));
      expect(sight).toContain('"item":549');
      expect(sight).toContain('MissingTwin');
    }
  });

  it('光/暗影之魂 = 全局规则 1/5 ×1（:696/:697），zone 门语义对照 Conditions.cs:825-871', () => {
    const gl = globalRules();
    const light = gl.find((r) => r.item === 520);
    const night = gl.find((r) => r.item === 521);
    expect(light).toMatchObject({ k: 'cond', denom: 5, min: 1, max: 1 });
    expect(light!.cond).toMatchObject({ name: 'SoulOfLight' });
    expect(night).toMatchObject({ k: 'cond', denom: 5, min: 1, max: 1 });
    expect(night!.cond).toMatchObject({ name: 'SoulOfNight' });
    // SoulOfWhateverConditionCanDrop（:1574）+ zone：
    const base = { hardMode: true, lifeMax: 100, friendly: false, boss: false, value: 100, y: 5200, rockLayerTile: 300 };
    // 非困难模式不放行（原版第一道门）
    expect(evalCond('SoulOfLight', [], mkCtx(501, { ...base, hardMode: false, extras: { zoneHallow: true } as any }))).toBe(false);
    // 困难+神圣 zone → 光之魂；腐化/猩红 → 暗影之魂
    expect(evalCond('SoulOfLight', [], mkCtx(501, { ...base, extras: { zoneHallow: true } as any }))).toBe(true);
    expect(evalCond('SoulOfLight', [], mkCtx(501, { ...base, extras: { zoneCorrupt: true } as any }))).toBe(false);
    expect(evalCond('SoulOfNight', [], mkCtx(501, { ...base, extras: { zoneCorrupt: true } as any }))).toBe(true);
    expect(evalCond('SoulOfNight', [], mkCtx(501, { ...base, extras: { zoneCrimson: true } as any }))).toBe(true);
    expect(evalCond('SoulOfNight', [], mkCtx(501, { ...base, extras: { zoneHallow: true } as any }))).toBe(false);
    // 岩层以上不放行（y/16 <= rockLayer）
    expect(evalCond('SoulOfLight', [], mkCtx(501, { ...base, y: 300 * 16, extras: { zoneHallow: true } as any }))).toBe(false);
    // 黑名单：史莱姆 1/噬魂鲨 13-15/墓穴爬虫 121/ Dutchman 535 与 23 诅咒骷髅头
    for (const t of [1, 13, 14, 15, 121, 535]) {
      expect(evalCond('SoulOfLight', [], mkCtx(t, { ...base, extras: { zoneHallow: true } as any }))).toBe(false);
    }
    expect(evalCond('SoulOfNight', [], mkCtx(23, { ...base, extras: { zoneCorrupt: true } as any }))).toBe(false);
    // boss/friendly/value<1 均 false
    expect(evalCond('SoulOfLight', [], mkCtx(501, { ...base, boss: true, extras: { zoneHallow: true } as any }))).toBe(false);
    expect(evalCond('SoulOfLight', [], mkCtx(501, { ...base, value: 0, extras: { zoneHallow: true } as any }))).toBe(false);
  });

  it('resolveDrops E2E：杀飞龙必出 575（20 连杀 0 失手），堆叠 5-10/专家 10-20', () => {
    for (let i = 0; i < 20; i++) {
      const res = resolveDrops(mkCtx(87, { rng: fakeRng('min') }));
      const soul = findDrop(res.drops, 575);
      expect(soul, `第 ${i} 杀必须掉飞翔之魂（denom=1）`).toBeTruthy();
      expect(soul!.n).toBe(5);
      const resE = resolveDrops(mkCtx(87, { isExpert: true, rng: fakeRng('max') }));
      expect(findDrop(resE.drops, 575)!.n).toBe(20);
    }
  });

  it('resolveDrops E2E：机械三魂必出（NotExpert），专家模式不出（袋内发放）', () => {
    const c127 = resolveDrops(mkCtx(127, { boss: true, rng: fakeRng('min') }));
    expect(findDrop(c127.drops, 547)!.n).toBe(25);
    const c134 = resolveDrops(mkCtx(134, { boss: true, rng: fakeRng('min') }));
    expect(findDrop(c134.drops, 548)!.n).toBe(25);
    const c125 = resolveDrops(mkCtx(125, { boss: true, anyNpcOfType: () => false, rng: fakeRng('min') }));
    expect(findDrop(c125.drops, 549)!.n).toBe(25);
    expect(findDrop(resolveDrops(mkCtx(127, { boss: true, isExpert: true })).drops, 547)).toBeUndefined();
  });
});

// ============ ② 魂掉落物理定谳面（ItemNoGravity 悬停） ============
const W = 60, H = 60;

function groundWorld(): World {
  const w = new World(W, H, 7, 'soul-drops-test');
  for (let x = 0; x < W; x++) w.store.setTile(x, 40, 1);
  w.lavaLine = 55;
  return w;
}

function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

/** 装一枚掉落并泵 N tick（玩家放在远处,零干扰） */
function pumpDrop(w: World, vid: number, x: number, y: number, ticks: number) {
  const p = new Player((W - 5) * TILE, 30 * TILE, new Inventory());
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} 必须有注册键`).toBeTruthy();
  const d = new ItemDrop(x, y, ITEM_BY_KEY[key!], 1, 0, 0);
  const h = hooks(w, p);
  for (let i = 0; i < ticks && !d.dead; i++) d.fixedUpdate(1, h);
  return d;
}

describe('魂掉落物理：ItemNoGravity 族悬停不落地（WorldItem.cs:779-794 定谳）', () => {
  it('集与原版 ItemID.cs:1108 逐字全等（16 项）', () => {
    expect([...ITEM_NO_GRAVITY_VIDS].sort((a, b) => a - b)).toEqual(
      [520, 521, 547, 548, 549, 575, 3453, 3454, 3455, 3456, 3457, 3458, 3459, 3580, 3581, 4143].sort((a, b) => a - b),
    );
  });

  it('飞翔之魂 575 中空释放：120t 后 y 零漂移、vy 归零（原版=原地悬停,不坠地）', () => {
    const w = groundWorld();
    const x = 20 * TILE, y0 = 35 * TILE;
    const d = pumpDrop(w, 575, x, y0, 120);
    expect(d.dead).toBe(false);
    expect(Math.abs(d.y - y0), `y 漂移 ${Math.abs(d.y - y0).toFixed(2)}px 应≈0（悬停）`).toBeLessThanOrEqual(0.5);
    expect(d.vy).toBe(0);
  });

  it('暗影之魂 521 / 力量之魂 548 同相；带下坠初速也会被阻尼停住（×0.95 悬停）', () => {
    const w = groundWorld();
    const d1 = pumpDrop(w, 521, 20 * TILE, 35 * TILE, 120);
    expect(Math.abs(d1.y - 35 * TILE)).toBeLessThanOrEqual(0.5);
    const d2 = pumpDrop(w, 548, 20 * TILE, 35 * TILE, 120);
    expect(Math.abs(d2.y - 35 * TILE)).toBeLessThanOrEqual(0.5);
    // 初速 vy=-3（向上掷出）→ 阻尼衰减悬停,不持续上飘也不回落
    const p = new Player((W - 5) * TILE, 30 * TILE, new Inventory());
    const d3 = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[575]!], 1, 0, -3);
    for (let i = 0; i < 120; i++) d3.fixedUpdate(1, hooks(w, p));
    expect(d3.vy).toBe(0);
    expect(d3.y).toBeLessThan(35 * TILE);            // 上飘段留下位移
    expect(35 * TILE - d3.y).toBeLessThanOrEqual(3 * 20);  // 阻尼几何和 ≤ Σ3×0.95ⁿ ≈ 57px
  });

  it('对照组：非 noGravity 件（凝胶 23）仍正常坠地静置（回归门——不许把全体掉落改成漂浮）', () => {
    const w = groundWorld();
    const d = pumpDrop(w, 23, 20 * TILE, 35 * TILE, 240);
    expect(d.dead).toBe(false);
    expect(d.y, '凝胶必须落在 40 行地台上').toBeGreaterThanOrEqual(40 * TILE - 13);
    expect(d.vy).toBe(0);
  });
});

// ============ ③ 共享池死亡归属（checkDead :78846 realLife 门——FX44b） ============
// 原版：飞龙 87 建链时段 realLife=头（NPC.cs:51703/:51727），StrikeNPC 尾
// （:82392-82398）`if (realLife>=0) Main.npc[realLife].checkDead(); else checkDead();`
// ——池空时死亡【唯一归属头】；checkDead 首行（:78846）对段早退=段自身永不结算死亡。
// 用户 F5 日志实锤：末击落在段 979(vid88) → 段先走死亡分支（death 事件+段位钱币）
// → 级联 .dead=true 静默杀头 → 头的 NPCLoot（575@100%）整链零掉落。
describe('realLife 共享池死亡归属：末击在段 hitbox 也必出头掉落（NPC.cs:82392）', () => {
  const TILE2 = 16;

  async function killHarness() {
    const { Enemy } = await import('../src/entities/Enemy');
    const w = new World(120, 120, 7, 'soul-attrib');
    w.groundLevel = 60; w.rockLevel = 90;
    const events: Array<[string, Record<string, unknown>]> = [];
    const worldDrops: string[] = [];
    const hooks = {
      world: w,
      player: {
        cx: 10 * TILE2, cy: 60 * TILE2, x: 10 * TILE2 - 8, y: 60 * TILE2 - 14,
        w: 16, h: 28, dead: false, hp: 400, maxHp: 400, mana: 20, maxMana: 200,
        luck: 0, inv: { slots: [] }, addDPS: () => {},
      },
      playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
      damagePlayer: (): number => 0, spawnParticles: () => {}, spawnBurst: () => {},
      addDamageNumber: () => {},
      spawnDrop: (_x: number, _y: number, key: string, n: number) => {
        worldDrops.push(`${key}#${n}`);
        return null;
      },
      enemies: () => [] as unknown[], critters: () => [] as unknown[], npcs: () => [] as unknown[],
      entities: { add: () => {} },
      onEnemyKilled: () => {},
      recLog: (k: string, d: Record<string, unknown>) => events.push([k, d]),
    } as never;
    const head = Enemy.fromVanilla(87, 60 * TILE2, 30 * TILE2)!;
    const spec = Enemy.wormChainSpec(87, () => 0.5)!;
    const segs = Enemy.spawnWormChain(head, spec.count, spec.segIds, true);
    return { Enemy, hooks, events, worldDrops, head, segs };
  };

  const vidOf = (key: string): number => {
    const m = /^vi_(\d+)_/.exec(key);
    return m ? Number(m[1]) : -1;
  };

  it('共享池转发：打段 hitbox 扣的是头的血池（StrikeNPC :82203-82208 life 镜像）', async () => {
    const { hooks, head, segs } = await killHarness();
    const hp0 = head.hp;
    segs[0].hurt(47, 0, 0, hooks);          // 末击不在头：池仍必须由头承载
    expect(head.hp).toBeLessThan(hp0);
    expect(segs[0].hp).toBe(head.hp);       // 段 life 镜像（life = Main.npc[realLife].life）
    expect(head.dead).toBe(false);
  });

  it('末击落在段：头走标准死亡管线掉 575（@100%）+钱币；段自身零死亡结算（无双重钱币）', async () => {
    const { hooks, events, worldDrops, head, segs } = await killHarness();
    const soulKey = VANILLA_ITEM_KEY_BY_ID[575]!;
    // 末击落在第 9 段（vid 88——与用户日志 t=8378 同款 hitbox）
    const seg88 = segs.find((s) => s.vanillaId === 88)!;
    seg88.hurt(99999, 0, 0, hooks);
    expect(head.dead, '头必须经自身死亡分支死亡（NPCLoot 所在）').toBe(true);
    expect(segs.every((s) => s.dead), '整链随头死（级联）').toBe(true);
    const souls = worldDrops.filter((k) => k.startsWith(soulKey));
    expect(souls, '飞翔之魂必须掉（5-10@100%）').toHaveLength(1);
    const coinVids = worldDrops.map((k) => vidOf(k)).filter((v) => v >= 71 && v <= 74);
    expect(coinVids.length, '钱币只从头管线出一轮').toBeGreaterThan(0);
    // 死亡事件归属头（vid 87），段 88 无 death 事件（checkDead :78846 早退）
    const deaths = events.filter(([k]) => k === 'death').map(([, d]) => d.vid);
    expect(deaths).toContain(87);
    expect(deaths, '段自身不得有死亡事件（原版段不进死亡管线）').not.toContain(88);
  });

  it('对照组：末击在头（直伤）——行为不变（575 一轮+death vid 87）', async () => {
    const { hooks, events, worldDrops, head } = await killHarness();
    const soulKey = VANILLA_ITEM_KEY_BY_ID[575]!;
    head.hurt(99999, 0, 0, hooks);
    expect(head.dead).toBe(true);
    expect(worldDrops.filter((k) => k.startsWith(soulKey))).toHaveLength(1);
    expect(events.filter(([k]) => k === 'death').map(([, d]) => d.vid)).toContain(87);
  });
});
