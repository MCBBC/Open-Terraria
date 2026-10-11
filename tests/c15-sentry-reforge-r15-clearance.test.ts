// ★C15（2026-10-11）哨兵/重铸域清偿——红蓝 R15 findings F1-F4/F7/F9/F12-F17 逐条锁。
//
// 定谳锚（Terarria1457 反编译亲读,C15 清偿报告同源）：
//  · F1 火爆塔 663/665/667 辉光四向脉动（Main.cs:34426-34445）：Glow_221/222/223
//    与本体同布局平行表（rectangle23 已于 :34077-34082 半宽化）,num434 =
//    cos(localAI[0]/100·2π)+1（:34430,localAI[0] 300t 自由环 :69183/:69235/:69287）,
//    色 = Color(140,100,40,0)×(num434/4+0.5)（A=0 纯加法,不取光照=自发光）×4 份
//    （offset=(k·π/2)·num434 世界系）,锚/origin 同本体 663 支（Bottom/(半宽/2,半高−4)）。
//  · F2 爆炸机关 691/692/693 辉光（Main.cs:34507-34521）：Glow_235/236/237 同矩形,
//    Color(255,255,255,127) 字面（A=127 source-over）,同锚同参（携行态随 :34089
//    反支缺省锚）。
//  · F3 陷阱世界光：AI_138 Lighting.AddLight(Center,0.6,0.5,0.3)（Projectile.cs:70414,
//    无 ai[2] 门=携行也亮）。
//  · F4 T3 场盒搜索档：num=10/num5=4 → setMonkT3 num=14/num5=8（Projectile.cs:69937-
//    69938）——同一 num 驱动 Up(num) 搜索窗（:69952）/height 上钳（:69974）/fallback
//    origin.Y−num−1（:69955-69957）。BJ467⑤ 露天钉值 (ty−11) 系把非 T3 档带进 T3
//    期望=偏差金标,已破钉重产（T3 露天档 448px）。
//  · F7 割草 aiStyle 级排除（Projectile.cs:15407 头支 45/137/92/105/106 + IsAGolfBall
//    + 尾支 1091）——旧 CUT_EXCLUDE「45/92/105/106 族全系 minion 旗」判谳证伪
//    （239/245/1128 friendly 非 minion=实害;511-513/567/568/1007 未实装=销案）。
//  · F9 damage 折叠拆步截断（Hurt :38590 endurance/:38601 日曜/:38612 甲虫逐段 (int),
//    防御步 CalculateDamagePlayersTake 返 double 不截断 Main.cs:65646-65657;实分歧例
//    专家 51 防+耐久+日曜盾=原版 8 vs 旧单次 floor 9）。
//  · F12/F13 vinv 重铸槽点击（ItemSlot.cs:1008-1046 MouseItemSwap 双向互换 /
//    :1053-1057 case1 stack>1 支取 1 件）。
//  · F14 reforgeCost 含词缀 value（Main.cs:42297 (long)reforgeItem.value×stack;
//    Item.cs:612-613 num2²×value (int)）。
//  · F15 占卜球 5644 closeAll 不触 reforgeItem（IngameUIWindows.CloseAll :43017 不触;
//    下一拍强制退出臂 :42282-42288 → dropItemCheck Player.cs:5115-5118）。
//  · F16 shift-click 重铸保护支（ItemSlot.cs:638-643 InReforgeMenu → cursorOverride 9;
//    :793-806 stack≤1 Swap / stack>1∧槽空 取 1）。
//  · F17 classic modal favorited/placeStyle 随行（Item.Clone 全字段）。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore
import { PNG } from 'pngjs';
import {
  FLAMEBURST_GLOW_MASK, TRAP_GLOW_MASK, flameburstGlowRadius, flameburstGlowTintAlpha,
  TRAP_GLOW_ALPHA,
} from '../src/data/vanillaProjGlow';
import { setProjSpriteOverride, projFrameCount } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { EntityManager } from '../src/entities/Entity';
import { planAlternateClick } from '../src/ui/SlotActions';
import { GDL, bindScaleStatsWorld, scaleStatsWorldOf } from '../src/stats/ScaleStats';
import { BuffType } from '../src/stats/Buffs';
import { prefixValueMul } from '../src/data/vanillaPrefixes';
import { ITEM_DEFS } from '../src/data/items';
// @ts-ignore
import itemvalue from '../src/data/vanilla-itemvalue.json';
import type { GameHooks } from '../src/entities/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SPRITES = join(ROOT, 'public', 'sprites', 'vanilla');
const MP_SRC = readFileSync(join(ROOT, 'src', 'entities', 'MinionProj.ts'), 'utf8');
const ENTITY_SRC = readFileSync(join(ROOT, 'src', 'entities', 'Entity.ts'), 'utf8');
const UI_SRC = readFileSync(join(ROOT, 'src', 'ui', 'UI.ts'), 'utf8');
const PLAYER_SRC = readFileSync(join(ROOT, 'src', 'entities', 'Player.ts'), 'utf8');
const GAME_SRC = readFileSync(join(ROOT, 'src', 'core', 'Game.ts'), 'utf8');

type RecOp = { m: string; a: unknown[] };
function recordingCtx(): { ctx: unknown; ops: RecOp[] } {
  const ops: RecOp[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k) {
      if (k === 'canvas') return undefined;
      if (k === 'getTransform') return () => ({ __m: 1 });
      return (...a: unknown[]) => { ops.push({ m: String(k), a }); };
    },
    set(_t, k, v) { ops.push({ m: `set:${String(k)}`, a: [v] }); return true; },
  });
  return { ctx, ops };
}

let UI: { prototype: object };
let Game: { prototype: object };

beforeAll(async () => {
  // node env 垫片（bj625 同式 canvas 垫 + closeAll 面需 window/CustomEvent/Node/document）
  const g = globalThis as Record<string, unknown>;
  if (!g.document) {
    g.document = {
      createElement: () => {
        const cv: Record<string, unknown> = { width: 0, height: 0 };
        cv.getContext = () => new Proxy({}, { get: () => () => { /* noop */ }, set: () => true });
        return cv;
      },
      querySelector: () => null,
    };
  }
  if (!g.window) {
    g.window = { dispatchEvent: () => true, removeEventListener: () => {}, addEventListener: () => {} };
    g.CustomEvent = class { type: string; detail: unknown; constructor(t: string, o?: { detail?: unknown }) { this.type = t; this.detail = o?.detail; } };
    g.Node = class {};
  }
  ({ UI } = await import('../src/ui/UI') as { UI: { prototype: object } });
  ({ Game } = await import('../src/core/Game') as { Game: { prototype: object } });
}, 120000);

// ---------------------------------------------------------------- 夹具 ----

function makeGame(): { hooks: GameHooks; player: Player } {
  const w = new World(200, 130, 7, 'c15-clearance');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 130; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => [],
    npcs: () => [],
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
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    spawnFriendlyProj: () => undefined,
    entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
  } as unknown as GameHooks;
  return { hooks, player };
}

const setMonk = (p: Player, t3: boolean, t2: boolean): void => {
  (p as unknown as { setMonkT3?: boolean; setMonkT2?: boolean }).setMonkT3 = t3;
  (p as unknown as { setMonkT2?: boolean }).setMonkT2 = t2;
};

function tickUntil(m: MinionProj, hooks: GameHooks, done: () => boolean, max = 90): void {
  for (let i = 0; i < max && !done(); i++) m.fixedUpdate(1 / 60, hooks);
}
const sideOf = (m: MinionProj): number => (m as unknown as { auraSide: number }).auraSide;

function drawSentry(vid: number, dims: [number, number],
  opts: { carried?: boolean; ticks?: number; pulse?: number } = {}): {
  glowOps: Array<Record<string, unknown>>; drawOps: RecOp[];
} {
  const { hooks, player } = makeGame();
  const m = new MinionProj(50 * 16, 98 * 16 - 8, vid, 30, 0, true, 0, false, () => player);
  for (let i = 0; i < (opts.ticks ?? 0) && !m.dead; i++) m.fixedUpdate(1 / 60, hooks);
  if (opts.carried) (m as unknown as { carriedByBackpack: boolean }).carriedByBackpack = true;
  if (opts.pulse !== undefined) (m as unknown as { sPulseT: number }).sPulseT = opts.pulse;
  setProjSpriteOverride(vid, { width: dims[0], height: dims[1] } as never);
  const glowOps: Array<Record<string, unknown>> = [];
  const { ctx, ops } = recordingCtx();
  const fakeR = {
    ctx,
    atlas: { ensureVImage: (f: string) => ({ width: dims[0], height: dims[1], __f: f }) },
    lighting: { lightAt: () => [255, 255, 255] },
    pushGlowOps: (o: Array<Record<string, unknown>>) => { glowOps.push(...o); },
  };
  (m as unknown as { draw(r: unknown): void }).draw(fakeR);
  return { glowOps, drawOps: ops };
}

// ===================== F1：火爆塔 663/665/667 辉光四向脉动 =====================

describe('C15-F1：火爆塔辉光（Main.cs:34426-34445,Glow_221/222/223 四向脉动）', () => {
  it('纯函数：分派表 663→221/665→222/667→223;num434=cos+1;alpha=num434/4+0.5 ∈ [.5,1]', () => {
    expect(FLAMEBURST_GLOW_MASK[663]).toBe(221);
    expect(FLAMEBURST_GLOW_MASK[665]).toBe(222);
    expect(FLAMEBURST_GLOW_MASK[667]).toBe(223);
    expect(FLAMEBURST_GLOW_MASK[677]).toBeUndefined();   // 弩车不在表（勿扩）
    expect(flameburstGlowRadius(0)).toBeCloseTo(2, 9);   // cos0+1
    expect(flameburstGlowRadius(150)).toBeCloseTo(0, 9); // cos(3π)+1
    expect(flameburstGlowRadius(25)).toBeCloseTo(1, 9);  // cos(π/2)+1
    expect(flameburstGlowRadius(50)).toBeCloseTo(0, 9);  // cos(π)+1
    const t0 = flameburstGlowTintAlpha(0);
    expect(t0.tint[0]).toBeCloseTo(140 / 255, 9);
    expect(t0.tint[1]).toBeCloseTo(100 / 255, 9);
    expect(t0.tint[2]).toBeCloseTo(40 / 255, 9);
    expect(t0.alpha).toBeCloseTo(1, 9);                  // 2/4+0.5
    expect(flameburstGlowTintAlpha(150).alpha).toBeCloseTo(0.5, 9);
    for (let t = 0; t < 300; t += 7) {
      const a = flameburstGlowTintAlpha(t).alpha;
      expect(a).toBeGreaterThanOrEqual(0.5);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('平行表在库：Glow_221/222/223 与 Projectile_663/665/667 逐张同尺寸', () => {
    for (const [glow, proj] of [[221, 663], [222, 665], [223, 667]] as const) {
      const gp = join(SPRITES, `Glow_${glow}.png`);
      const pp = join(SPRITES, `Projectile_${proj}.png`);
      expect(existsSync(gp), `Glow_${glow} 在库`).toBe(true);
      expect(existsSync(pp), `Projectile_${proj} 在库`).toBe(true);
      const g = PNG.sync.read(readFileSync(gp));
      const p = PNG.sync.read(readFileSync(pp));
      expect([g.width, g.height], `Glow_${glow}≡Projectile_${proj}`).toEqual([p.width, p.height]);
    }
  });

  it('行为锁：draw 推 4 笔 add 辉光——tex/sy=frame×fh/sw=半宽/dy=−(fh−4)/tint 字面色', () => {
    const { glowOps } = drawSentry(663, [74, 462], { pulse: 0 });
    const ops = glowOps.filter((o) => o.tex === 'vanilla/Glow_221.png');
    expect(ops, '四向 4 笔（num435=0..3）').toHaveLength(4);
    const fh = 462 / projFrameCount(663);   // projFrames[663]=7 → 66
    expect(fh).toBe(66);
    for (const o of ops) {
      expect(o.sx).toBe(0);                          // 非携行取左半
      expect(o.sy).toBe(0);                          // 待机 frame 0
      expect(o.sw).toBe(37);                         // halfW（rectangle23 半宽化同矩形）
      expect(o.sh).toBe(fh);
      expect(o.dx).toBe(-18.5);                      // origin=(半宽/2, fh−4) X
      expect(o.dy).toBe(-(fh - 4));
      expect(o.blend).toBe('add');                   // A=0 纯加法（XNA α=0 习语）
      expect(o.tint).toEqual([140 / 255, 100 / 255, 40 / 255]);   // 字面色,不取光照
      expect(o.alpha).toBeCloseTo(1, 9);             // pulse=0 → num434=2 → 2/4+0.5
    }
  });

  it('相位锁：sPulseT=150 → alpha=0.5（脉动谷）——localAI[0] 驱动面', () => {
    const { glowOps } = drawSentry(663, [74, 462], { pulse: 150 });
    const o = glowOps.find((x) => x.tex === 'vanilla/Glow_221.png')!;
    expect(o.alpha).toBeCloseTo(0.5, 9);
  });

  it('AI 驱动锁：每拍 ++ 且 300t 归零（Projectile.cs:69183 自由环）', () => {
    const { hooks, player } = makeGame();
    const m = new MinionProj(50 * 16, 98 * 16 - 8, 663, 30, 0, true, 0, false, () => player);
    m.fixedUpdate(1 / 60, hooks);
    expect((m as unknown as { sPulseT: number }).sPulseT).toBe(1);
    for (let i = 0; i < 299; i++) m.fixedUpdate(1 / 60, hooks);
    expect((m as unknown as { sPulseT: number }).sPulseT).toBe(0);   // 300 拍归零
  });

  it('判谳订正登记锁：MinionProj 663/677/691 逐型核注已翻正（R15-F1/F2 落刀面）', () => {
    expect(MP_SRC).toContain('判谳订正');
    expect(MP_SRC).toContain('FLAMEBURST_GLOW_MASK');
    expect(MP_SRC).toContain('TRAP_GLOW_MASK');
    expect(MP_SRC).toContain('flameburstGlowRadius');
  });
});

// ===================== F2：爆炸机关 691/692/693 辉光 =====================

describe('C15-F2：爆炸机关辉光（Main.cs:34507-34521,Glow_235/236/237 白 A=127）', () => {
  it('纯函数：分派表 691→235/692→236/693→237;alpha=127/255', () => {
    expect(TRAP_GLOW_MASK[691]).toBe(235);
    expect(TRAP_GLOW_MASK[692]).toBe(236);
    expect(TRAP_GLOW_MASK[693]).toBe(237);
    expect(TRAP_GLOW_MASK[688]).toBeUndefined();
    expect(TRAP_GLOW_ALPHA).toBeCloseTo(127 / 255, 9);
  });

  it('平行表在库：Glow_235/236/237 与 Projectile_691/692/693 逐张同尺寸', () => {
    for (const [glow, proj] of [[235, 691], [236, 692], [237, 693]] as const) {
      const g = PNG.sync.read(readFileSync(join(SPRITES, `Glow_${glow}.png`)));
      const p = PNG.sync.read(readFileSync(join(SPRITES, `Projectile_${proj}.png`)));
      expect([g.width, g.height], `Glow_${glow}≡Projectile_${proj}`).toEqual([p.width, p.height]);
    }
  });

  it('行为锁：draw 推 1 笔 over 白 A=127 辉光——同矩形/同锚（dy=−(fh−4)）;携行随缺省锚', () => {
    const placed = drawSentry(691, [26, 56]);
    const o = placed.glowOps.find((x) => x.tex === 'vanilla/Glow_235.png');
    expect(o, '辉光 op 在').toBeTruthy();
    const fh = 56 / projFrameCount(691);   // projFrames[691]=4 → 14
    expect(fh).toBe(14);
    expect(o!.sy).toBe(0);                    // age 0 → frame 0
    expect(o!.sw).toBe(26); expect(o!.sh).toBe(fh);   // 全帧宽（691 支无半宽化）
    expect(o!.dx).toBe(-13);
    expect(o!.dy).toBe(-(fh - 4));            // 非携行=Bottom 锚（:34092-34096）
    expect(o!.blend).toBe('over');            // A=127 source-over（非 A=0 加法）
    expect(o!.tint).toEqual([1, 1, 1]);
    expect(o!.alpha).toBeCloseTo(127 / 255, 9);
    const carried = drawSentry(691, [26, 56], { carried: true });
    const oc = carried.glowOps.find((x) => x.tex === 'vanilla/Glow_235.png')!;
    expect(oc.dy).toBe(-fh / 2);              // 携行=B 支缺省盒心锚（:34089 反支）
  });
});

// ===================== F3：陷阱世界光（AI_138 :70414） =====================

describe('C15-F3：691-693 陷阱世界光（Lighting.AddLight 0.6/0.5/0.3,携行也亮）', () => {
  it('lightRGB getter：691/692/693 → [0.6,0.5,0.3]（Game 实体光 projectiles 桶消费）;677 null', () => {
    const { hooks, player } = makeGame();
    for (const vid of [691, 692, 693]) {
      const m = new MinionProj(50 * 16, 98 * 16 - 8, vid, 16, 0, true, 0, false, () => player);
      expect((m as unknown as { lightRGB: [number, number, number] | null }).lightRGB).toEqual([0.6, 0.5, 0.3]);
    }
    const b = new MinionProj(50 * 16, 98 * 16 - 8, 677, 16, 0, true, 0, false, () => player);
    expect((b as unknown as { lightRGB: [number, number, number] | null }).lightRGB).toBeNull();
  });
});

// ===================== F4：AI_137 T3 场盒搜索档联动 =====================

describe('C15-F4：T3 场盒 num/num5 联动三站（Up 搜索窗/上钳/fallback）', () => {
  const place = (hooks: GameHooks, player: Player): MinionProj =>
    new MinionProj(392, 1584, 688, 30, 0, true, 0, false, () => player);

  it('天花板在 Up(14) 窗内 Up(10) 窗外（groundY−13）：T3 找到 416 vs 非 T3 fallback 320', () => {
    const { hooks, player } = makeGame();
    for (let x = 0; x < 200; x++) (hooks.world as unknown as { store: World['store'] }).store.setTile(x, 87, 1);
    const mNo = place(hooks, player);
    tickUntil(mNo, hooks, () => sideOf(mNo) > 0);
    expect(sideOf(mNo)).toBe(320);             // 非 T3：Up(10) 失→fallback 99−11=88 → 192→钳 160→×2

    const { hooks: h2, player: p2 } = makeGame();
    for (let x = 0; x < 200; x++) (h2.world as unknown as { store: World['store'] }).store.setTile(x, 87, 1);
    setMonk(p2, true, true);
    const mT3 = place(h2, p2);
    tickUntil(mT3, h2, () => sideOf(mT3) > 0);
    // T3：Up(14) 命中 87 → side=(100−87)×16=208 → 钳 [128,224] 取 208 → ×2=416
    // 旧硬编码（Up(10)+T3 钳）：fallback 88 → 192 → 钳 192 → ×2=384（偏差面）
    expect(sideOf(mT3)).toBe(416);             // ★主判别（旧 384 必红）
  });

  it('露天：T3 fallback origin.Y−14−1 → 钳 224 → 448（原版 448px 露天档;旧 384 偏差钉已破）', () => {
    const { hooks, player } = makeGame();
    setMonk(player, true, true);
    const m = place(hooks, player);
    tickUntil(m, hooks, () => sideOf(m) > 0);
    expect(sideOf(m)).toBe(448);               // ★主判别（bj467⑤ 重产钉同源双锁）
  });

  it('低天花板（净空 64px）回归：T3 钳升 128→256（天花板在两档窗内,搜索命中分支不变）', () => {
    const { hooks, player } = makeGame();
    for (let x = 0; x < 200; x++) (hooks.world as unknown as { store: World['store'] }).store.setTile(x, 96, 1);
    setMonk(player, true, true);
    const m = place(hooks, player);
    tickUntil(m, hooks, () => sideOf(m) > 0);
    expect(sideOf(m)).toBe(256);               // bj467⑤ 5a 回归锚
  });

  it('num5 下钳联动：T3 深净空钳升 128（净空 16px 嵌地支,钳 [num5×16, num×16] 恒式）', () => {
    // 塔嵌在 100-101 双层实心内（ty=101）：Down 命中 101=groundY、Up 命中 100=ceil
    // → side=16 → T3 钳 num5×16=128 → ×2=256（非 T3 档 64→128）
    const { hooks, player } = makeGame();
    setMonk(player, true, true);
    const m = new MinionProj(392, 101 * 16 + 8, 688, 30, 0, true, 0, false, () => player);
    tickUntil(m, hooks, () => sideOf(m) > 0);
    expect(sideOf(m)).toBe(256);
  });
});

// ===================== F9：damage 折叠拆步截断 =====================

function expertPlayerAtDefense(defense: number): Player {
  const w = new World(100, 100, 7, 'c15-f9');
  w.difficulty = 1;   // expert
  bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
  const p = new Player(60 * 16, 60 * 16, new Inventory());
  Object.defineProperty(p, 'defense', { value: defense });
  return p;
}
const withEq = (p: Player, over: Record<string, unknown>): void => {
  const eq = { ...(p as unknown as { equipStats: Record<string, unknown> }).equipStats, ...over };
  Object.defineProperty(p, 'equipStats', { value: eq, configurable: true });
};
const vanillaChain = (A: number, e: number, solar: boolean, beetleOrbs: number): number => {
  // 独立转录 Player.Hurt 折叠链（Main.cs:65646 → :38590 → :38601 → :38612 → :38661）
  let num2 = Math.max(1, A);
  num2 = Math.floor(num2 * (1 - e));
  if (solar) num2 = Math.floor(num2 * 0.8);
  if (beetleOrbs > 0) num2 = Math.floor(num2 * (1 - 0.15 * beetleOrbs));
  return Math.max(1, num2);
};

describe('C15-F9：damage 折叠拆步截断（:38590/:38601/:38612 逐段 (int)）', () => {
  it('双开档（专家 51 防+耐久+日曜套+日曜盾）：入伤 53 → 原版 8（旧单次 floor 9）', () => {
    const p = expertPlayerAtDefense(51);
    p.buffs.apply(BuffType.Endurance, 300);
    withEq(p, { enduranceEq: 0.12, solarSet: true });
    (p as unknown as { solarShields: number }).solarShields = 1;
    expect(p.damage(53, 980, 980)).toBe(8);    // ★主判别（旧 9 必红）
    expect((p as unknown as { solarShields: number }).solarShields).toBe(0);   // 盾消耗
  });

  it('独立链对拍：同档 120 档入伤逐一 ≙ vanillaChain（防御步不截断+三步各 (int)+尾下限）', () => {
    for (let dmg = 1; dmg <= 120; dmg++) {
      const p = expertPlayerAtDefense(51);
      p.buffs.apply(BuffType.Endurance, 300);
      withEq(p, { enduranceEq: 0.12, solarSet: true });
      (p as unknown as { solarShields: number }).solarShields = 1;
      expect(p.damage(dmg, 980, 980)).toBe(vanillaChain(dmg - 51 * 0.75, 0.22, true, 0));
    }
  });

  it('甲虫步：消耗前 orbs 计价（orbs=1 → 0.85 乘区）+步内掉球（1→0）', () => {
    const w = new World(100, 100, 7, 'c15-f9b');
    w.difficulty = 0;
    bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
    const p = new Player(60 * 16, 60 * 16, new Inventory());
    Object.defineProperty(p, 'defense', { value: 0 });
    p.buffs.apply(BuffType.Endurance, 300);
    withEq(p, { beetleDef: true });
    (p as unknown as { beetleOrbs: number }).beetleOrbs = 1;
    // A=100 → endurance 步 floor(90)=90 → 甲虫步 floor(90×0.85)=76（消耗前 orbs）
    expect(p.damage(100, 980, 980)).toBe(76);
    expect((p as unknown as { beetleOrbs: number }).beetleOrbs).toBe(0);
  });

  it('damagePreview 与实扣同口径（无日曜盾消耗档）：preview(100)=damage(100)=76', () => {
    const w = new World(100, 100, 7, 'c15-f9c');
    w.difficulty = 0;
    bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
    const p = new Player(60 * 16, 60 * 16, new Inventory());
    Object.defineProperty(p, 'defense', { value: 0 });
    p.buffs.apply(BuffType.Endurance, 300);
    withEq(p, { beetleDef: true });
    (p as unknown as { beetleOrbs: number }).beetleOrbs = 1;
    expect(p.damagePreview(100)).toBe(76);
    expect(p.damage(100, 980, 980)).toBe(76);
  });

  it('拆步源码锁：damage() 单次连乘 floor（旧式）已退役', () => {
    expect(PLAYER_SRC).not.toContain('Math.floor((dmg - this.defense * defF) * (1 - endurance) * solarMul)');
    expect(PLAYER_SRC).toContain(':38590 (int)');
    expect(PLAYER_SRC).toContain(':38601 (int)');
    expect(PLAYER_SRC).toContain(':38612 (int)');
  });
});

// ===================== F7：割草 aiStyle 级排除（CanCutTiles :15407） =====================

describe('C15-F7：割草 aiStyle 级排除（45/92/105/106+147+1091）——R15-UNVERIFIED #3 定谳', () => {
  /** 最小弹实体桩（EntityManager.update 割面收口消费面） */
  const stubProj = (vid: number, x: number, y: number): unknown => ({
    id: vid + 1000, projId: vid, x, y, w: 8, h: 8, cx: x + 4, cy: y + 4,
    dead: false, minion: false, npcProj: false, reflected: false, noVanillaCut: false,
    fixedUpdate: () => {},
  });
  const cutFixture = (): { em: EntityManager; cut: ReturnType<typeof vi.fn>; hooks: GameHooks } => {
    const em = new EntityManager();
    const cut = vi.fn();
    const hooks = {
      player: { equipStats: {} },
      world: { store: { inBounds: () => false } },
      cutTile: cut,
      enemies: () => [], npcs: () => [], critters: () => [],
    } as unknown as GameHooks;
    return { em, cut, hooks };
  };

  it('239/245 雨滴（aiStyle 45）不割——nimbus 杆雨不再割草（实害面落）', () => {
    for (const vid of [239, 245]) {
      const { em, cut, hooks } = cutFixture();
      (em as unknown as { projectiles: unknown[] }).projectiles.push(stubProj(vid, 800, 800));
      em.update(1 / 60, hooks);
      expect(cut, `vid ${vid} aiStyle 45 → vanilla CanCutTiles false（:15407 头支）`).not.toHaveBeenCalled();
    }
  });

  it('1128 孢子云（aiStyle 92）/715 高尔夫（IsAGolfBall）/1091 风暴闪电（尾支）不割', () => {
    for (const vid of [1128, 715, 1091]) {
      const { em, cut, hooks } = cutFixture();
      (em as unknown as { projectiles: unknown[] }).projectiles.push(stubProj(vid, 800, 800));
      em.update(1 / 60, hooks);
      expect(cut, `vid ${vid} → vanilla 零割`).not.toHaveBeenCalled();
    }
  });

  it('对照面：普通 friendly 弹（vid 1 aiStyle 1）照割=门非全关（夹具达面自证）', () => {
    const { em, cut, hooks } = cutFixture();
    (em as unknown as { projectiles: unknown[] }).projectiles.push(stubProj(1, 800, 800));
    em.update(1 / 60, hooks);
    expect(cut).toHaveBeenCalled();
  });

  it('数据面锁：排除集 wiring（旧「全系 minion」判谳证伪登记,aiStyle 直判 :15407 原式）', () => {
    expect(ENTITY_SRC).toContain('CUT_EXCLUDE_AISTYLES');
    expect(ENTITY_SRC).toContain('CUT_EXCLUDE_VIDS_TAIL');
    expect(ENTITY_SRC).toContain('projectileData(vid)?.aiStyle ?? -1');
  });
});

// ===================== F12/F13/F15/F16/F17：重铸域 =====================

type UIStub = Record<string, unknown>;

function makeUI(g: unknown, extra: Record<string, unknown> = {}): UIStub {
  const ui = Object.create(UI.prototype) as UIStub;
  ui.game = g;
  ui.refreshAll = vi.fn();
  ui.toast = vi.fn();
  ui.heldStack = null;
  ui.openChest = null;
  ui.reforgeItem = null;
  ui.reforgeEl = null;
  ui.reforgeSlotEl = null;
  ui.vinvReforgeOpen = false;
  ui.vinvReforgeForcedReturn = false;
  ui.chatMonitor = null;
  ui.root = { innerHTML: '' };
  ui.detachGame = vi.fn();
  ui.closeNpcDialog = vi.fn();
  ui.refreshHousingBtn = vi.fn();
  ui.teardownInventoryPanel = vi.fn();
  ui.clothesPanel = null;
  ui.achWrapEl = null;
  ui.housingOpen = false;
  ui.vinvSlots = new Map();
  ui.optionsUnsubs = [];
  ui.buffBlocks = new Map();
  ui.petBuffBlocks = new Map();
  ui.mountBuffBlocks = new Map();
  ui.nebulaBuffBlocks = new Map();
  Object.assign(ui, extra);
  return ui;
}

function makeGameStub(o: { canReforge?: boolean } = {}): Record<string, unknown> {
  return {
    canReforge: vi.fn(() => o.canReforge ?? true),
    sfx: { play: vi.fn() },
    npcShopOpen: false,
    dialogNpc: null,
    player: { cx: 10, cy: 20, inv: { add: vi.fn(() => 0), slots: [] as unknown[] } },
    cb: { onInventoryChanged: vi.fn() },
    spawnDrop: vi.fn(),
  };
}

describe('C15-F12/F13：vinv 重铸槽点击（MouseItemSwap 双向 + 取 1 件）', () => {
  it('F12 主判别：持物点已占槽=双向互换（旧槽物回光标,零吞件）——旧覆写必红', () => {
    const g = makeGameStub();
    const ui = makeUI(g, {
      heldStack: { id: 100, stack: 1, prefix: 3 },
      reforgeItem: { id: 200, stack: 1, prefix: 5 },
    });
    (ui.vinvReforgeSlotClick as () => void)();
    expect(ui.reforgeItem).toEqual({ id: 100, stack: 1, prefix: 3 });   // 光标物入槽
    expect(ui.heldStack).toEqual({ id: 200, stack: 1, prefix: 5 });     // 旧槽物回光标（旧=null 必红）
  });

  it('F13 主判别：持 stack=5 放空槽 → 槽内 stack=1、光标余 4（旧整组克隆必红）', () => {
    const g = makeGameStub();
    const ui = makeUI(g, { heldStack: { id: 100, stack: 5, prefix: 2 }, reforgeItem: null });
    (ui.vinvReforgeSlotClick as () => void)();
    expect(ui.reforgeItem).toEqual({ id: 100, stack: 1, prefix: 2 });
    expect((ui.heldStack as { stack: number }).stack).toBe(4);
  });

  it('取回臂：空手点槽 → 整件回光标+槽清', () => {
    const g = makeGameStub();
    const ui = makeUI(g, { heldStack: null, reforgeItem: { id: 300, stack: 2, prefix: 7 } });
    (ui.vinvReforgeSlotClick as () => void)();
    expect(ui.heldStack).toEqual({ id: 300, stack: 2, prefix: 7 });
    expect(ui.reforgeItem).toBeNull();
  });
});

describe('C15-F15：占卜球 5644 closeAll 不触 reforgeItem + 下一拍强制退出臂', () => {
  it('在-game 路径：closeAll 保留 reforgeItem+置旗（旧直清必红）;下一拍 tickStackSplitMain 归还', () => {
    const g = makeGameStub();
    const ui = makeUI(g, {
      game: g,
      reforgeItem: { id: 400, stack: 1, prefix: 9 },
      heldStack: { id: 500, stack: 1 },
    });
    (ui.closeAll as () => void)();
    expect(ui.reforgeItem).toEqual({ id: 400, stack: 1, prefix: 9 });   // 原版 CloseAll 不触
    expect(ui.vinvReforgeForcedReturn).toBe(true);
    expect(ui.heldStack).toBeNull();
    // 下一拍强制退出臂（:42282-42288 位次）
    (ui.tickStackSplitMain as () => void)();
    expect((g.player as { inv: { add: ReturnType<typeof vi.fn> } }).inv.add)
      .toHaveBeenCalledWith(400, 1, 9, undefined, false, false, false);   // returnReforgeItem 回包
    expect(ui.reforgeItem).toBeNull();
    expect(ui.vinvReforgeForcedReturn).toBe(false);
  });

  it('菜单路径（game=null）：closeAll 直清 reforgeItem（ClearPlayerTempInfo TurnToAir 同相,登记维持）', () => {
    const ui = makeUI(makeGameStub(), { game: null, reforgeItem: { id: 400, stack: 1, prefix: 9 } });
    (ui.closeAll as () => void)();
    expect(ui.reforgeItem).toBeNull();
    expect(ui.vinvReforgeForcedReturn).toBe(false);
  });

  it('F17 走远关面板：classic 重铸 overlay 开+对话失 → tickStackSplitMain 臂 closeReforge 归还', () => {
    const g = makeGameStub();   // dialogNpc=null=走远
    const ui = makeUI(g, {
      reforgeEl: { remove: vi.fn() },
      reforgeItem: { id: 600, stack: 1, prefix: 1 },
    });
    (ui.tickStackSplitMain as () => void)();
    expect(ui.reforgeItem).toBeNull();                    // closeReforge → returnReforgeItem
    expect((g.player as { inv: { add: ReturnType<typeof vi.fn> } }).inv.add).toHaveBeenCalled();
    expect(ui.reforgeEl).toBeNull();
  });

  it('会话保持不误关：dialogNpc 在 → 面板不动', () => {
    const g = makeGameStub();
    g.dialogNpc = { npcKey: 'goblin_tinkerer' };
    const ui = makeUI(g, { reforgeEl: { remove: vi.fn() }, reforgeItem: { id: 600, stack: 1 } });
    (ui.tickStackSplitMain as () => void)();
    expect(ui.reforgeItem).toEqual({ id: 600, stack: 1 });
    expect(ui.reforgeEl).not.toBeNull();
  });
});

describe('C15-F16：shift-click 重铸保护支（ItemSlot.cs:638-643/:793-806）', () => {
  it('路由：InReforgeMenu+context0+可词缀 → toChest(9)（不落 quick-trash）;非可词缀落快弃链同相', () => {
    // opts=vanilla 缺省 Options.DisableLeftShiftTrashCan=false 语义档（本仓 QUICK_TRASH
    // DEFAULTS disableLeftShiftTrashCan:true → 快弃臂在缺省设置下本就闭,与本案无关）
    const opts = { disableLeftShiftTrashCan: false, disableQuickTrash: false };
    const env = {
      context: 0, itemAir: false, favorited: false, isCoin: false, shopOpen: false,
      chestOpen: false, chestCanTake: false, canTakeToInventory: false,
      controlDown: false, shiftDown: true, opts,
      reforgeMenuOpen: true, itemCanHavePrefixes: true,
    };
    expect(planAlternateClick(env)).toEqual({ kind: 'toChest', cursorOverride: 9 });
    expect(planAlternateClick({ ...env, itemCanHavePrefixes: false }))
      .toEqual({ kind: 'trash', cursorOverride: 6 });   // 原版落出序=非可词缀仍快弃（:643 落出→:659）
    expect(planAlternateClick({ ...env, reforgeMenuOpen: false }))
      .toEqual({ kind: 'trash', cursorOverride: 6 });
  });

  it('消费臂：stack≤1 → Utils.Swap 双向（重铸槽旧物回原格）;stack>1+槽空 → 取 1 件', () => {
    const g = makeGameStub();
    const slots: unknown[] = [{ id: 100, stack: 1, prefix: 3 }, { id: 101, stack: 5, prefix: 0 }];
    (g.player as { inv: { slots: unknown[] } }).inv.slots = slots;
    const ui = makeUI(g, {
      vinvReforgeOpen: true,
      reforgeItem: { id: 200, stack: 1, prefix: 5 },
    });
    const ok = (ui.altMoveClick as (i: number, w: string, s: boolean, c: boolean, p: boolean) => boolean)(0, 'inv', true, false, true);   // panelOpen=true → slotContext 0（vinv 重铸在开包内）
    expect(ok).toBe(true);
    expect(ui.reforgeItem).toEqual({ id: 100, stack: 1, prefix: 3 });   // 点击物入槽
    expect(slots[0]).toEqual({ id: 200, stack: 1, prefix: 5 });         // 旧重铸物回格（Swap）
    // stack>1 + 槽空（先取走）
    (ui as { reforgeItem: unknown }).reforgeItem = null;
    (ui.altMoveClick as (i: number, w: string, s: boolean, c: boolean, p: boolean) => boolean)(1, 'inv', true, false, true);
    expect(ui.reforgeItem).toEqual({ id: 101, stack: 1, prefix: 0 });
    expect((slots[1] as { stack: number }).stack).toBe(4);
  });
});

describe('C15-F14：reforgeCost 含词缀 value（Main.cs:42297 × Item.cs:612-613）', () => {
  /** reforgeCost 只读 player.equipStats.discount/dialogHappiness——原型桩直调 */
  const costOf = (id: number, prefix?: number, stack = 1): number => {
    const inst = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    inst.player = { equipStats: { discount: false } };
    inst.dialogHappiness = undefined;
    return (inst.reforgeCost as (i: { id: number; stack: number; prefix?: number }) => number)
      .call(inst, { id, stack, prefix });
  };

  it('带词缀费用 = 基值×prefixValueMul² (int)（:612/:613 独立转录）;白板零漂移;平价必红', () => {
    // id 149：ITEM_DEFS[149].vid=149（方案 A 双域统一）、vanilla-itemvalue 1500 铜
    const def = ITEM_DEFS[149];
    const vid = def.vid ?? -1;
    const vals = itemvalue as Record<string, number>;
    const base = (vid >= 0 ? vals[String(vid)] : undefined) ?? def.value ?? 0;
    expect(base).toBe(1500);
    // 独立转录 Item.Prefix value 烘焙（:612 num2²、:597 (int)——f32=Math.fround）
    const m = prefixValueMul(38);                                    // Legendary 档乘区
    const sq = Math.fround(Math.fround(m) * Math.fround(m));         // :612
    const baked = Math.trunc(Math.fround(Math.fround(base) * sq));   // :597
    // Main.cs:42297 → 折扣(无) → 幸福价×1 → ÷3 floor → 下限 1
    const expected = Math.max(1, Math.floor(baked / 3));
    const plain = costOf(149);
    const prefixed = costOf(149, 38);
    expect(plain).toBe(Math.max(1, Math.floor(base / 3)));   // 白板=旧链零漂移
    expect(prefixed).toBe(expected);                          // ★烘焙链 1:1
    expect(prefixed).not.toBe(plain);                         // ★主判别（旧平价必红）
  });

  it('stack 因子：×stack（reforgeItem 恒 stack=1=F13 联动面,整组不膨胀费用）', () => {
    expect(costOf(149, undefined, 2)).toBe(Math.max(1, Math.floor(1500 * 2 / 3)));
  });

  it('源码锁：reforgeCost 读 item.prefix + prefixValueMul 乘区（基表维持 vanilla-itemvalue 不跨表）', () => {
    expect(GAME_SRC).toContain('const pfx = item.prefix ?? 0;');
    expect(GAME_SRC).toContain('prefixValueMul(pfx)');
    expect(GAME_SRC).toContain('vanilla-itemvalue.json');
  });
});

describe('C15-F17：classic modal favorited/placeStyle 随行（Item.Clone 全字段）', () => {
  it('源码锁：classic 放置字面量含 placeStyle/favorited 位（回包端 returnReforgeItem 全随行）', () => {
    expect(UI_SRC).toContain('placeStyle: (this.heldStack as { placeStyle?: number }).placeStyle');
    expect(UI_SRC).toContain('favorited: (this.heldStack as { favorited?: boolean }).favorited');
  });
});
