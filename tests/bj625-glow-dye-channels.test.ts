// ★BJ625（2026-10-10）glow/染料通道批五件：BJ597 尾批①②（TV 头 271/前管 269）
//   + BJ606-R2 登记债③④（688-690 glow 叠画/哨兵底座染料）+ BJ612 登记债⑤（377/308
//   染料）——五件各锁（op 形/染料闭包消费/资产在库/态机相位）。
//
// 定谳锚（Terarria1457 亲读）：
//  · 件1 TV 头 271：SetPassColors :571-574（headGlowMask=309、headGlowColor=White）；
//    DrawPlayer_Head_GetTVScreen :2516-2539（危险→4/低血→1/邪恶群系→0/湿→2/节庆→5/
//    缺省 3）;叠画 :2359-2387（num19!=0 才画、frameY=miscCounter%20/5、态5 覆写 0+
//    EyeFrameToShow>0→2、Frame(6,4,·,·,-2)=252/6-2=40 宽×224/4=56 高、列距 42）;
//    纸头同构 PlayerDrawHeadLayers.cs:363-377。
//  · 件2 头 269 前管：SetPassColors :561-565（mask=304 色 (200,200,200)）;前管本体
//    Extra_214+glow Glow_308 双画于 FrontShoulder 站（PlayerDrawLayers.cs:104-118
//    复合站/:3798-3810 非复合回退站——pos=头盔锚、sourceRect=bodyFrame、
//    colorArmorHead/headGlowColor、shader=cHead）。
//  · 件3 688-690 glow：Main.cs:32498-32507——Glow_228/229/230 与本体贴图同布局平行
//    表,同矩形（Frame(1,projFrames,0,frame)）同锚同参;color74=Lerp(GetAlpha(light),
//    White,.5) 截 A=127。663/677/691 族逐型核：三族专支（:34075-34096/:34097-34137）
//    只改锚/origin+底座,色走公共尾 :34212 plain 光,无白 lerp、无 glow 层=零缺面。
//  · 件4/件5 伪债翻案：BJ606-R2「底座染料未接」/BJ612「377/308 染料未接线」前提
//    「原版 GetProjectileDesiredShader 对哨兵生效」不成立——Main.cs:22429-22463 只吃
//    minion/projHook/projPet/LightPet+switch{623,1020,1105,818};哨兵 SetDefaults
//    （Projectile.cs:308 :4001-4010/377 :4619-4625/688-690 :7327-7339/663/677/691 等）
//    只有 sentry=true 无 minion=true（全 21 处 minion=true 站点逐一对读无一哨兵;
//    projPet 表全量 90 id 无哨兵）⇒ 哨兵 Shader 恒 0=原版本就不染,直绘=vanilla 同相。
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore
import { PNG } from 'pngjs';
import {
  HEAD_GLOW, ARMOR_GLOW_DEFERRED,
  armorGlowOps, tvScreenState, tvScreenGlowFrame,
  type ArmorGlowCtx,
} from '../src/data/vanillaArmorGlow';
import { auraGlowMaskOf, auraGlowTint, AURA_GLOW_ALPHA } from '../src/data/vanillaProjGlow';
import { getProjDesiredDyeVid } from '../src/data/projDye';
import { projFrameSrcRect, setProjSpriteOverride } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SPRITES = join(ROOT, 'public', 'sprites', 'vanilla');
const RDR_SRC = readFileSync(join(ROOT, 'src', 'render', 'Renderer.ts'), 'utf8');
const MP_SRC = readFileSync(join(ROOT, 'src', 'entities', 'MinionProj.ts'), 'utf8');
const GAME_SRC = readFileSync(join(ROOT, 'src', 'core', 'Game.ts'), 'utf8');

beforeAll(() => {
  // projFrameImg 帧切片画布垫片（BJ606 同式：draw 侧 img 计算消费,吸掉 2d 调用）
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const cv: Record<string, unknown> = { width: 0, height: 0 };
      cv.getContext = () => new Proxy({}, { get: () => () => { /* noop */ }, set: () => true });
      return cv;
    },
  };
});
afterEach(() => {
  for (const v of [688, 689, 690, 308, 377]) setProjSpriteOverride(v, undefined as never);
});

const CTX_BASE: ArmorGlowCtx = {
  head: 0, body: 0, legs: 0,
  female: false,
  undershirt: { r: 160, g: 90, b: 40 },
  rowsBody: 0, rowsLegs: 0,
  sit: null, pet: null,
  mt: 255, miscCounter: 0, mul: 1,
};

// ===================== 件1：头 271 TV 屏态机 glow（Glow_309 6×4 格机） =====================

describe('BJ625 件1：TV 头 271 屏态机（GetTVScreen :2516-2539 + 叠画 :2359-2387）', () => {
  it('态机优先序 1:1（危险→4 > 低血→1 > 邪恶群系→0 > 湿→2 > 节庆→5 > 常态3）', () => {
    const i = (o: Partial<Parameters<typeof tvScreenState>[0]> = {}) =>
      tvScreenState({ anyDanger: false, lowLife: false, evilZone: false, wet: false, festive: false, ...o });
    expect(i({ anyDanger: true, lowLife: true, evilZone: true })).toBe(4);   // 危险压倒一切
    expect(i({ lowLife: true, evilZone: true, wet: true, festive: true })).toBe(1);
    expect(i({ evilZone: true, wet: true, festive: true })).toBe(0);          // 静噪
    expect(i({ wet: true, festive: true })).toBe(2);
    expect(i({ festive: true })).toBe(5);
    expect(i()).toBe(3);
  });

  it('帧位：miscCounter%20/5 行循环;态5 覆写 0+眨眼→2;态0=不画（:2362 门）', () => {
    expect(tvScreenGlowFrame(0, 3, false)).toEqual({ state: 3, frameY: 0 });
    expect(tvScreenGlowFrame(4, 3, false)!.frameY).toBe(0);
    expect(tvScreenGlowFrame(5, 3, false)!.frameY).toBe(1);
    expect(tvScreenGlowFrame(19, 3, false)!.frameY).toBe(3);
    expect(tvScreenGlowFrame(20, 3, false)!.frameY).toBe(0);       // 20t 循环
    expect(tvScreenGlowFrame(39, 3, false)!.frameY).toBe(3);
    expect(tvScreenGlowFrame(7, 5, false)).toEqual({ state: 5, frameY: 0 });   // 态5 覆写
    expect(tvScreenGlowFrame(7, 5, true)).toEqual({ state: 5, frameY: 2 });    // 眨眼行
    expect(tvScreenGlowFrame(7, 0, false)).toBeNull();             // 静噪=不画
  });

  it('表项/资产：HEAD_GLOW[271]={mask:309,tv:true,White}——Glow_309 252×224（列距 42×行 56）在库', () => {
    expect(HEAD_GLOW[271]).toMatchObject({ mask: 309, tv: true, color: { k: 'const', r: 255, g: 255, b: 255, a: 255 } });
    const p = PNG.sync.read(readFileSync(join(SPRITES, 'Glow_309.png')));
    expect(p.width).toBe(252);
    expect(p.height).toBe(224);
  });

  it('op 形：列=态（sx=42×state）、行=帧位（sy=56×frameY）、帧 40×56、同锚 dx=-20/dy=-52', () => {
    const ops = armorGlowOps({ ...CTX_BASE, head: 271, miscCounter: 7, mul: 0.8,
      tv: { state: 4, blink: false } });
    expect(ops).toHaveLength(1);
    const o = ops[0]!;
    expect(o.tex).toBe('vanilla/Glow_309.png');
    expect(o.sx).toBe(42 * 4);            // Frame(6,4,·,·,-2)：列距 252/6=42
    expect(o.sy).toBe(56 * Math.floor(7 / 5));   // 行距 224/4=56,行=misc%20/5
    expect(o.sw).toBe(40); expect(o.sh).toBe(56);
    expect(o.dx).toBe(-20); expect(o.dy).toBe(-52);
    expect(o.blend).toBe('over');         // White A=255 → source-over
    expect(o.tint).toEqual([1, 1, 1]);
    expect(o.alpha).toBeCloseTo(0.8, 6);  // ×mul（stealth 乘区）
  });

  it('静噪（态0）/无 tv 输入 → 零 op（原版 num19!=0 门同形;渲染侧未接线安全）', () => {
    expect(armorGlowOps({ ...CTX_BASE, head: 271, tv: { state: 0, blink: false } })).toEqual([]);
    expect(armorGlowOps({ ...CTX_BASE, head: 271 })).toEqual([]);   // tv 缺省 undefined
    expect(armorGlowOps(CTX_BASE)).toEqual([]);                     // 无甲槽基线
  });

  it('渲染接线锁：Renderer tv 布尔映射（anyDanger/低血/邪恶群系/wetSticky/节庆/眨眼）+ Game 注入', () => {
    expect(RDR_SRC).toContain('tvScreenState({');
    expect(RDR_SRC).toContain('anyDanger: this.anyDangerSnapshot');
    expect(RDR_SRC).toContain('lowLife: p.hp <= p.maxHp / 4');
    expect(RDR_SRC).toContain('evilZone: !!(this.scene?.zoneCorrupt || this.scene?.zoneCrimson || this.scene?.zoneGraveyard)');
    expect(RDR_SRC).toContain('wet: p.wetSticky');
    expect(RDR_SRC).toContain('festive: (this.scene?.townNPCCount ?? 0) >= 3 || !!this.scene?.partyUp || LanternNight.lanternsUp');
    expect(RDR_SRC).toContain('blink: p.eyeFrame > 0');
    expect(RDR_SRC).toContain('anyDangerSnapshot = false');
    expect(GAME_SRC).toContain('this.renderer.anyDangerSnapshot = this.npcAnyDanger();');
  });
});

// ===================== 件2：头 269 前管（Extra_214 + Glow_308） =====================

describe('BJ625 件2：头 269 前管（FrontShoulder 站 :104-118/:3798-3810）', () => {
  it('glow 叠条：HEAD_GLOW[269].frontTube=308（与头罩 304 同锚同色双画）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, head: 269, rowsBody: 3, mul: 1 });
    expect(ops.map((o) => o.tex)).toEqual(['vanilla/Glow_304.png', 'vanilla/Glow_308.png']);
    for (const o of ops) {
      expect(o.sx).toBe(0); expect(o.sy).toBe(3 * 56);
      expect(o.sw).toBe(40); expect(o.sh).toBe(56);
      expect(o.dx).toBe(-20); expect(o.dy).toBe(-52);
      expect(o.tint).toEqual([200 / 255, 200 / 255, 200 / 255]);   // (200,200,200) 同案
      expect(o.alpha).toBe(1); expect(o.blend).toBe('over');
    }
  });

  it('资产在库：Extra_214.png / Glow_308.png 均为 40×1120 平行表（20 行×56）', () => {
    expect(existsSync(join(SPRITES, 'Extra_214.png'))).toBe(true);
    const e214 = PNG.sync.read(readFileSync(join(SPRITES, 'Extra_214.png')));
    const g308 = PNG.sync.read(readFileSync(join(SPRITES, 'Glow_308.png')));
    expect([e214.width, e214.height]).toEqual([40, 1120]);
    expect([g308.width, g308.height]).toEqual([40, 1120]);
  });

  it('渲染接线锁：Renderer 头 269 门 + loadExtraSprite(214) 直载通道 + 坐姿 frameTop', () => {
    expect(RDR_SRC).toContain('if (dollEquip.head === 269) {');
    expect(RDR_SRC).toContain('loadExtraSprite(214)');
    expect(RDR_SRC).toContain('const fTop = sitDraw ? -60 : -52;');
  });

  it('登记表清空（尾批两件均落刀）', () => {
    expect(ARMOR_GLOW_DEFERRED).toEqual([]);
  });
});

// ===================== 件3：688-690 闪电光环哨兵 glow 叠画 =====================

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

function makeGame(): { hooks: GameHooks; player: Player } {
  const W = 200, H = 120;
  const w = new World(W, H, 7, 'bj625-aura');
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const list: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never, player: player as never,
    enemies: () => list as never, npcs: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {}, spawnFriendlyProj: () => undefined,
    entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
  } as never;
  return { hooks, player };
}

/** 688-690 落地+绘制：返回 pushGlowOps 收到的 ops、绘制序列与底座 stub 身份。 */
function drawAura(vid: 688 | 689 | 690, opts: { carried?: boolean; light?: [number, number, number] } = {}): {
  glowOps: Array<Record<string, unknown>>; drawOps: RecOp[]; baseStub: Record<string, unknown>;
} {
  const { hooks, player } = makeGame();
  const m = new MinionProj(50 * 16, 98 * 16 - 8, vid, 30, 0, true, 0, false, () => player);
  for (let i = 0; i < 3 && !m.dead; i++) m.fixedUpdate(1 / 60, hooks);
  if (opts.carried) (m as unknown as { carriedByBackpack: boolean }).carriedByBackpack = true;
  const dims: Record<number, [number, number]> = { 688: [22, 180], 689: [28, 192], 690: [34, 304] };
  const [iw, ih] = dims[vid];
  setProjSpriteOverride(vid, { width: iw, height: ih } as never);
  const baseStub = { width: 28, height: 10, __base: vid };
  const glowOps: Array<Record<string, unknown>> = [];
  const { ctx, ops } = recordingCtx();
  const fakeR = {
    ctx,
    atlas: { ensureVImage: (f: string) => (f.includes('Extra_') ? baseStub : { width: iw, height: ih, __f: f }) },
    lighting: { lightAt: () => opts.light ?? [255, 255, 255] },
    pushGlowOps: (o: Array<Record<string, unknown>>) => { glowOps.push(...o); },
  };
  m.draw(fakeR as never);
  return { glowOps, drawOps: ops, baseStub };
}

describe('BJ625 件3：688-690 glow 叠画（Main.cs:32498-32507 同矩形 A=127）', () => {
  it('分派/色式纯函数：688→228/689→229/690→230/余 null;tint=light/255×.5+.5;alpha=127/255', () => {
    expect(auraGlowMaskOf(688)).toBe(228);
    expect(auraGlowMaskOf(689)).toBe(229);
    expect(auraGlowMaskOf(690)).toBe(230);
    expect(auraGlowMaskOf(677)).toBeNull();
    expect(auraGlowTint([0, 0, 0])).toEqual([0.5, 0.5, 0.5]);            // 暗=半亮自发光
    expect(auraGlowTint([255, 255, 255])).toEqual([1, 1, 1]);
    const t = auraGlowTint([40, 80, 120]);
    expect(t[0]).toBeCloseTo(40 / 255 * 0.5 + 0.5, 9);
    expect(t[1]).toBeCloseTo(80 / 255 * 0.5 + 0.5, 9);
    expect(t[2]).toBeCloseTo(120 / 255 * 0.5 + 0.5, 9);
    expect(AURA_GLOW_ALPHA).toBeCloseTo(127 / 255, 9);
  });

  it('平行表在库：Glow_228/229/230 与 Projectile_688/689/690 逐张同尺寸', () => {
    for (const [glow, proj] of [[228, 688], [229, 689], [230, 690]] as const) {
      const g = PNG.sync.read(readFileSync(join(SPRITES, `Glow_${glow}.png`)));
      const p = PNG.sync.read(readFileSync(join(SPRITES, `Projectile_${proj}.png`)));
      expect([g.width, g.height], `Glow_${glow}≡Projectile_${proj}`).toEqual([p.width, p.height]);
    }
  });

  it('行为锁：draw 推 glow op——tex/sy=frame×fh/dest=(-11,0)/tint 来自 lightAt/alpha=127/255', () => {
    // ★BJ630件1：三笔（本体/glow/底座）同槽迁 itemGlowQueue——glow op 序随迁至
    //  本体后（queue 序=原版笔序 :32503→:32505→:32522）,此处按 tex 定位 glow 笔。
    const { glowOps } = drawAura(688, { light: [40, 80, 120] });
    expect(glowOps.some((o) => o.tex === 'vanilla/Glow_228.png')).toBe(true);
    const o = glowOps.find((x) => x.tex === 'vanilla/Glow_228.png')!;
    expect(o.sy).toBe(0);                          // age 3t → frame 0（floor(3/8)）
    expect(o.sw).toBe(22); expect(o.sh).toBe(30);  // 帧 22×30（180/6）
    expect(o.dx).toBe(-11); expect(o.dy).toBe(0);  // origin=(帧宽/2, 0) 同本体
    expect(o.blend).toBe('over');
    expect(o.tint).toEqual([40 / 255 * 0.5 + 0.5, 80 / 255 * 0.5 + 0.5, 120 / 255 * 0.5 + 0.5]);
    expect(o.alpha).toBeCloseTo(127 / 255, 9);
  });

  it('689/690 分派行为锁：Glow_229/Glow_230 直推（switch :32493-32501）', () => {
    const g = (vid: 689 | 690) =>
      drawAura(vid).glowOps.find((x) => String(x.tex).startsWith('vanilla/Glow_'))!.tex;
    expect(g(689)).toBe('vanilla/Glow_229.png');
    expect(g(690)).toBe('vanilla/Glow_230.png');
  });

  it('携行（ai[2]==1）：glow 照画（:32505 无门）、底座不画（:32514 门）——两者解耦', () => {
    // ★BJ630件1：底座出图面随迁 op 化——携行门改从 glowOps 的 Extra_* op 判
    const carried = drawAura(688, { carried: true });
    expect(carried.glowOps.some((o) => o.tex === 'vanilla/Glow_228.png')).toBe(true);
    expect(carried.glowOps.some((o) => String(o.tex).startsWith('vanilla/Extra_'))).toBe(false);
    const placed = drawAura(688);
    expect(placed.glowOps.some((o) => o.tex === 'vanilla/Extra_86.png')).toBe(true);
  });

  it('渲染面接线锁：Renderer.pushGlowOps 直入 itemGlowQueue + MinionProj 支内调用', () => {
    expect(RDR_SRC).toContain('pushGlowOps(ops');
    expect(RDR_SRC).toContain('this.itemGlowQueue.push({ m, k: this._worldLowK, ops });');
    expect(MP_SRC).toContain('r.pushGlowOps?.(');
    expect(MP_SRC).toContain('auraGlowMaskOf(this.projId)');
    expect(MP_SRC).toContain('auraGlowTint([lt[0], lt[1], lt[2]])');
    expect(MP_SRC).toContain('AURA_GLOW_ALPHA * fade');
  });

  it('663/677/691 逐型核登记（专支无白 lerp/无 glow 层=公共尾 plain 光零缺面）', () => {
    expect(MP_SRC).toContain('★663/677/691 族逐型核');
  });
});

// ===================== 件4：底座染料翻案（原版哨兵 Shader 恒 0） =====================

describe('BJ625 件4：哨兵底座染料=伪债翻案（GetProjectileDesiredShader 对哨兵恒 0）', () => {
  const SENTRY_IDS = [308, 377, 641, 643, 663, 665, 667, 677, 678, 679, 688, 689, 690, 691, 692, 693, 966, 1025] as const;

  it('数据面：哨兵全族 vanilla-projectiles.minion=假（SetDefaults 照录;染=偏离）', () => {
    const j = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'vanilla-projectiles.json'), 'utf8')) as Record<string, { minion?: boolean }>;
    const bad = SENTRY_IDS.filter((id) => j[String(id)]?.minion);
    expect(bad, `哨兵 minion 真值=偏离原版:${bad.join(',')}`).toEqual([]);
  });

  it('通道面：getProjDesiredDyeVid 哨兵全族 → 0（cMinion/cPet 挂满也回 0）', () => {
    const ch = { cMinion: 3592, cPet: 3593, cGrapple: 0, cLight: 0 } as never;
    for (const id of SENTRY_IDS) {
      expect(getProjDesiredDyeVid({ vid: id, minion: false, damage: 30 }, ch),
        `vid ${id} 哨兵染料通道须 0（Main.cs:22429-22463 无哨兵支）`).toBe(0);
    }
  });

  it('绘制面：底座=atlas 直绘原样进 drawImage（不走 dyedProjCanvas 染料闭包）+ 翻案登记在案', () => {
    expect(MP_SRC).toContain('`vanilla/Extra_${this.projId === 689 ? 87 : this.projId === 690 ? 88 : 86}.png`');
    expect(MP_SRC).toContain('★BJ625件4 翻案登记');
    // ★BJ630件1：底座随迁 itemGlowQueue op 面——op tex 直取原片（op 通道无染料闭包
    //  接线位=结构不染,与哨兵 Shader 恒 0 同相）;位姿面 origin=(宽/2,高−2)=(-14,-8)（BJ606 同锁）
    const { glowOps } = drawAura(688);
    const baseOp = glowOps.find((o) => o.tex === 'vanilla/Extra_86.png');
    expect(baseOp, '底座 op 在位（直取原片 tex=结构不染）').toBeDefined();
    expect([baseOp!.dx, baseOp!.dy]).toEqual([-14, -8]);
  });
});

// ===================== 件5：377/308 半宽片（染料翻案+几何现状锁） =====================

describe('BJ625 件5：377/308 两姿宽片（BJ612 染料债随前提翻案）', () => {
  it('翻案登记在案：不接染料闭包（原版 Shader 恒 0）;T0 半宽化处方随前提失效', () => {
    expect(MP_SRC).toContain('★BJ625件5 翻案登记');
    expect(MP_SRC).toContain('半宽切片直用 projSprite 原片');
  });

  it('几何现状锁：draw 矩形=半宽姿切片 (x15,y25,halfW,fh-1)（:34944-34957/:35047）', () => {
    expect(MP_SRC).toContain('const halfW = Math.floor(sheet.width / 2);');
    expect(MP_SRC).toContain('ctx.drawImage(sheet as CanvasImageSource, x15, y25, halfW, fh - 1,');
  });

  it('projFrameSrcRect 竖条全宽切片式照录现状（132×450 → sw=132,与 projFrameImg 自洽）', () => {
    setProjSpriteOverride(377, { width: 132, height: 450 } as never);
    const r0 = projFrameSrcRect(377, 0);
    expect(r0).toEqual({ sx: 0, sy: 0, sw: 132, sh: 50 });
    const r4 = projFrameSrcRect(377, 4);
    expect(r4!.sy).toBe(200);   // 450/9=50,行 4
    setProjSpriteOverride(308, { width: 188, height: 780 } as never);
    const s0 = projFrameSrcRect(308, 0);
    expect(s0).toEqual({ sx: 0, sy: 0, sw: 188, sh: 78 });   // 780/10=78
  });
});
