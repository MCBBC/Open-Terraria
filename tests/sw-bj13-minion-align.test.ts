// ★SW-BJ13 2026-09-07 用户实报（F3 截图）：黏土蓓蕾法杖 6161 召唤物 1118 F3 盒
//  14×22 在左上、精灵画在盒右下、走一步陷一步（原版正常地面行走）。
//  根因定谳：MinionProj.draw 旧通用路把帧左上锚在【盒左上】（num143/144 缺省通路
//  语义），但原版本族不走该通路——Main.cs:34788-34800 专用支：
//    anchor = proj.Center + (0, gfxOffY − num467)（num467 = 2 缺省 / 5=1093·1112
//    :34794 / 9=1118 :34798）、origin = (整图宽/2, 帧高/2 + num151)（num151=1 仅
//    1022 num151++ :30079、−4 仅 1036 :30091;423 的 num152=−5 :30161 本支不消费）。
//  展开：帧心横居盒心、帧底 = 盒底 + 4px（步行族全支一致——「脚微陷」原版刻意）。
//  旧错锚偏差（ours − vanilla）：1118 (+12,+22)（帧 38×48/盒 14×22）、1093/1112
//  (+10,+14)、393-395 (+16,+8)、1022 (+11,+10)、423 (0,+4)、1036 (+3,0)。
//  修复 = draw 专绘支（盒心系锚）+ 34788 家族 SetDefaults 真盒补注册（393-395
//  20×30 :4758-4759 / 423 28×28 :4964-4965 / 1036 18×10 :9770-9771）。
//  手法 = minion-orientation T9 同款记录型 ctx + setProjSpriteOverride 真尺寸假贴图
//  （帧几何 = 实机 Projectile_*.png 尺寸 × projFrames 表，帧高全整除无 round 漂移）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MinionProj } from '../src/entities/MinionProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINION_TS = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');
const WEAPON_TS = readFileSync(join(ROOT, 'src/entities/WeaponProj.ts'), 'utf8');

const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; damage: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  hits: number[];
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 10000, damage: 10,
    hurt: (_d, _kx, _ky) => true, hits: [],
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const projectiles: unknown[] = [];
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
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { projectiles.push(e); },
    projectiles,
  };
  return { hooks, player, projectiles };
}

// ---- 假贴图（真机尺寸：public/sprites/vanilla/Projectile_*.png × projFrames 表）----
const fakeTex = (w: number, h: number): HTMLImageElement =>
  ({ width: w, height: h }) as unknown as HTMLImageElement;
class FakeCanvas {
  width = 0; height = 0;
  getContext() {
    return { drawImage() {}, imageSmoothingEnabled: false };
  }
}
(globalThis as { document?: unknown }).document = {
  createElement: (): FakeCanvas => new FakeCanvas(),
};

// ---- 记录型 ctx：捕获 translate/scale/rotate/drawImage/globalAlpha ----
interface Rec { tex: unknown; args: number[] }
function recordingCtx() {
  const draws: Rec[] = [];
  const translates: number[][] = [];
  const rots: number[] = [];
  const scales: number[][] = [];
  const alphas: number[] = [];
  const ctx = {
    save() {}, restore() {},
    translate(x: number, y: number) { translates.push([x, y]); },
    rotate(a: number) { rots.push(a); },
    scale(x: number, y: number) { scales.push([x, y]); },
    set imageSmoothingEnabled(_: boolean) {},
    set globalAlpha(v: number) { alphas.push(v); },
    set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    fillRect() {}, strokeRect() {},
    drawImage(tex: unknown, ...rest: number[]) { draws.push({ tex, args: rest }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, draws, translates, rots, scales, alphas };
}

/** 贴图尺寸表（实机 PNG 尺寸——帧高全整除：960/20=48、1120/28=40、630/15=42、
 *  704/16=44、56/4=14、128/4=32）与原版 34788 支折算常量（num467/num151） */
const FAMILY: Record<number, { tw: number; th: number; fr: number; n467: number; n151: number; bw: number; bh: number }> = {
  393: { tw: 52, th: 630, fr: 15, n467: 2, n151: 0, bw: 20, bh: 30 },
  394: { tw: 52, th: 630, fr: 15, n467: 2, n151: 0, bw: 20, bh: 30 },
  395: { tw: 52, th: 630, fr: 15, n467: 2, n151: 0, bw: 20, bh: 30 },
  423: { tw: 38, th: 128, fr: 4, n467: 2, n151: 0, bw: 28, bh: 28 },
  1022: { tw: 42, th: 704, fr: 16, n467: 2, n151: 1, bw: 20, bh: 30 },
  1036: { tw: 24, th: 56, fr: 4, n467: 2, n151: -4, bw: 18, bh: 10 },
  1093: { tw: 34, th: 1120, fr: 28, n467: 5, n151: 0, bw: 14, bh: 22 },
  1112: { tw: 34, th: 1120, fr: 28, n467: 5, n151: 0, bw: 14, bh: 22 },
  1118: { tw: 38, th: 960, fr: 20, n467: 9, n151: 0, bw: 14, bh: 22 },
};

function mkOnGround(projId: number, hooks: GameHooks, player: Player): MinionProj {
  // 盒底落在地面行 100 顶（y=1600）——盒尺寸随 SetDefaults 真值
  const m = new MinionProj(player.cx, 100 * 16 - FAMILY[projId].bh, projId, 10, 2,
    false, 0, false, () => player);
  (m as { alphaFade: number }).alphaFade = 0;   // 淡入通道不影响几何断言
  return m;
}

describe('SW-BJ13 黏土蓓蕾 1118 盒-精灵对齐（Main.cs:34788-34800 专绘支）', () => {
  it('SetDefaults 真盒锁 14×22（Projectile.cs:10453-10454）', () => {
    const { hooks, player } = makeHooks();
    for (const id of [1118, 1093, 1112]) {
      const m = new MinionProj(player.cx, player.cy, id, 10, 2, false, 0, false, () => player);
      expect(`${m.w}x${m.h}`, `proj ${id} 盒`).toBe('14x22');
    }
    void hooks;
  });

  it('锚=帧心@盒心上方 9px：translate=[cx,cy−9]、origin=(19,24) ⇒ 精灵左上=盒左上+(−12,−22)', () => {
    setProjSpriteOverride(1118, fakeTex(38, 960));
    const { player } = makeHooks();
    const m = mkOnGround(1118, makeHooks().hooks, player);
    m.x = player.cx - 7; m.y = 100 * 16 - 22;      // 盒左上对齐整数坐标便于核对
    const rec = recordingCtx();
    m.draw({ ctx: rec.ctx } as never);
    expect(rec.translates).toEqual([[m.cx, m.cy - 9]]);        // :34798 num467=9
    expect(rec.draws).toHaveLength(1);
    expect(rec.draws[0].args).toEqual([-19, -24]);             // origin=(38/2, 48/2+0)
    // 精灵矩形 vs 盒矩形（F3 语义）：左上 = 盒左上 + (−12,−22)（=旧错锚的反向量）
    const stl = { x: m.cx - 19, y: m.cy - 9 - 24 };
    expect(stl.x - m.x).toBe(-12);
    expect(stl.y - m.y).toBe(-22);
    // 帧底 = 盒底 + 4px（原版「脚微陷」恒量）
    expect(stl.y + 48 - (m.y + m.h)).toBe(4);
  });

  it('行走/站立两态同锚：palFrame 0 与 7-9（帧机走行带）绘制矩形恒等', () => {
    setProjSpriteOverride(1118, fakeTex(38, 960));
    const { player } = makeHooks();
    const m = mkOnGround(1118, makeHooks().hooks, player);
    m.x = player.cx - 7; m.y = 100 * 16 - 22;
    const base = recordingCtx();
    (m as { palFrame: number }).palFrame = 0;                  // 站立帧（:51848 静立档）
    m.draw({ ctx: base.ctx } as never);
    for (const f of [7, 8, 9]) {                               // 走行带（:51854-51866 7..13）
      const rec = recordingCtx();
      (m as { palFrame: number }).palFrame = f;
      m.draw({ ctx: rec.ctx } as never);
      expect(rec.translates, `帧 ${f} translate`).toEqual(base.translates);
      expect(rec.draws[0].args, `帧 ${f} origin`).toEqual(base.draws[0].args);
    }
  });

  it('AI 实走两态：无敌站 0 帧；近敌出走行带（palFrame≥7）且对齐关系不变', () => {
    setProjSpriteOverride(1118, fakeTex(38, 960));
    const idle = makeHooks();
    const m0 = mkOnGround(1118, idle.hooks, idle.player);
    const seen0 = new Set<number>();
    for (let k = 0; k < 60; k++) {
      m0.fixedUpdate(1 / 60, idle.hooks);
      seen0.add((m0 as { palFrame: number }).palFrame);
    }
    expect(seen0.has(0), `站立场帧集 ${[...seen0].join(',')}`).toBe(true);
    // 近敌 → 走行带（帧 7-13 出现过）
    const near = makeHooks([mkEnemy(1, 60 * 16 + 300, 100 * 16 - 12)]);
    const m1 = mkOnGround(1118, near.hooks, near.player);
    const seen1 = new Set<number>();
    for (let k = 0; k < 240; k++) {
      m1.fixedUpdate(1 / 60, near.hooks);
      seen1.add((m1 as { palFrame: number }).palFrame);
    }
    expect(Math.max(...seen1), `走行帧集 ${[...seen1].join(',')}`).toBeGreaterThanOrEqual(7);
    // 两态绘制矩形同锚（帧无关）
    const rec = recordingCtx();
    (m1 as { palFrame: number }).palFrame = 7;
    m1.draw({ ctx: rec.ctx } as never);
    expect(rec.translates).toEqual([[m1.cx, m1.cy - 9]]);
    expect(rec.draws[0].args).toEqual([-19, -24]);
    expect((m1.cx - 19) - m1.x).toBe(-12);
    expect((m1.cy - 33) - m1.y).toBe(-22);
  });

  it('翻转对称：facing=−1 → scale(−1,1) 一次、draw args 不变（帧心镜像不位移）', () => {
    setProjSpriteOverride(1118, fakeTex(38, 960));
    const { player } = makeHooks();
    const m = mkOnGround(1118, makeHooks().hooks, player);
    m.facing = -1;
    const rec = recordingCtx();
    m.draw({ ctx: rec.ctx } as never);
    expect(rec.scales).toEqual([[-1, 1]]);
    expect(rec.draws[0].args).toEqual([-19, -24]);
  });

  it('出场淡入通道：alphaFade=120 → globalAlpha=135/255（:39509-39515 α−15）', () => {
    setProjSpriteOverride(1118, fakeTex(38, 960));
    const { player } = makeHooks();
    const m = mkOnGround(1118, makeHooks().hooks, player);
    (m as { alphaFade: number }).alphaFade = 120;
    const rec = recordingCtx();
    m.draw({ ctx: rec.ctx } as never);
    expect(rec.alphas).toEqual([135 / 255]);
  });
});

describe('SW-BJ13 同族扫：34788 专绘支九型（MinionProj 实体域）盒-精灵对齐', () => {
  for (const [idStr, g] of Object.entries(FAMILY)) {
    const id = Number(idStr);
    it(`proj ${id}：盒 ${g.bw}×${g.bh}、translate=[cx,cy−${g.n467}]、origin=(${g.tw}/2,${g.th / g.fr}/2${g.n151 >= 0 ? '+' + g.n151 : g.n151})`, () => {
      setProjSpriteOverride(id, fakeTex(g.tw, g.th));
      const { hooks, player } = makeHooks();
      const m = new MinionProj(player.cx, 100 * 16 - g.bh, id, 10, 2, false, 0, false, () => player);
      expect([m.w, m.h], `proj ${id} SetDefaults 真盒`).toEqual([g.bw, g.bh]);
      (m as { alphaFade: number }).alphaFade = 0;
      m.x = player.cx - g.bw / 2; m.y = 100 * 16 - g.bh;
      const rec = recordingCtx();
      m.draw({ ctx: rec.ctx } as never);
      const fh = g.th / g.fr;
      expect(rec.translates, `proj ${id} anchor`).toEqual([[m.cx, m.cy - g.n467]]);
      expect(rec.draws).toHaveLength(1);
      expect(rec.draws[0].args, `proj ${id} origin`).toEqual([-g.tw / 2, -(fh / 2 + g.n151)]);
      // 精灵左上 = 盒左上 + (−(tw−bw)/2, −(n467+fh/2+n151−bh/2))
      const sx = m.cx - g.tw / 2, sy = m.cy - g.n467 - fh / 2 - g.n151;
      expect(sx - m.x).toBeCloseTo(-(g.tw - g.bw) / 2, 6);
      expect(sy - m.y).toBeCloseTo(-(g.n467 + fh / 2 + g.n151 - g.bh / 2), 6);
    });
  }

  it('步行族帧底恒 = 盒底 + 4px（1118/1093/1112/393-395/1022/1036;423 悬浮型除外）', () => {
    for (const [idStr, g] of Object.entries(FAMILY)) {
      if (idStr === '423') continue;
      const id = Number(idStr);
      const fh = g.th / g.fr;
      // 帧底相对盒心 = 帧顶(−(n467+fh/2+n151)) + fh;盒底 = +bh/2
      const bottom = fh / 2 - g.n467 - g.n151;
      expect(bottom - g.bh / 2, `proj ${id} 帧底−盒底`).toBe(4);
    }
  });
});

describe('SW-BJ13 结构锁（防静默回退）', () => {
  it('draw 专绘支在通用 num143/144 路之前且带 return（34788 家族不再吃通用锚）', () => {
    expect(MINION_TS).toContain('const CENTER_ANCHOR_34788 = new Set([393, 394, 395, 423, 1022, 1036, 1093, 1112, 1118])');
    expect(MINION_TS).toContain('if (CENTER_ANCHOR_34788.has(this.projId) && img) {');
    expect(MINION_TS).toContain('ctx.translate(this.cx, this.cy - num467);');
    expect(MINION_TS).toContain('ctx.drawImage(img, -img.width / 2, -(img.height / 2 + num151));');
    // 支内早退必须先于通用偏移消费点
    expect(MINION_TS.indexOf('if (CENTER_ANCHOR_34788.has(this.projId) && img) {'))
      .toBeLessThan(MINION_TS.indexOf('const off3 = img'));
  });

  it('num467/num151 分档字面（:34794/:34798/:30079/:30091 折算）', () => {
    expect(MINION_TS).toContain('const num467 = this.projId === 1118 ? 9');
    expect(MINION_TS).toContain(': this.projId === 1093 || this.projId === 1112 ? 5 : 2;');
    expect(MINION_TS).toContain('const num151 = this.projId === 1022 ? 1 : this.projId === 1036 ? -4 : 0;');
  });

  it('SetDefaults 真盒补注册 393-395/423/1036（构造器 + minionTrueBox 单源同步）', () => {
    expect(MINION_TS).toContain("else if (projId === 393 || projId === 394 || projId === 395) { this.w = 20; this.h = 30; }");
    expect(MINION_TS).toContain('else if (projId === 423) { this.w = 28; this.h = 28; }');
    expect(MINION_TS).toContain('else if (projId === 1036) { this.w = 18; this.h = 10; }');
    expect(MINION_TS).toContain('case 393: case 394: case 395: return { w: 20, h: 30 };');
    expect(MINION_TS).toContain('case 423: return { w: 28, h: 28 };');
    expect(MINION_TS).toContain('case 1036: return { w: 18, h: 10 };');
  });

  it('WeaponProj 静态表 1022/1036/423 退役注记（表值系 :30077 switch 真值,本支原版只吃 num151）', () => {
    expect(WEAPON_TS).toContain('★SW-BJ13 2026-09-07：1022/1036 项退役');
    expect(WEAPON_TS).not.toMatch(/^\s*1022: \[1, 0\]/m);
    expect(WEAPON_TS).not.toMatch(/^\s*1036: \[-4, 0\]/m);
    expect(WEAPON_TS).not.toMatch(/423: \[0, -5\]/);
  });
});
