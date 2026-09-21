// 剑影（挥弧族）渲染染色/光照/渐隐 1:1 闸门（2026-09-19 用户实报「永夜刃白月牙直出、
// 未染色无光效」——旧 layer()/tneLayer() rgb 形参死参整缺,全白贴图直出）。
// 金标 = 反编译逐式亲读（Main.cs:27901 DrawProj_NightsEdge / :28136 DrawProj_TrueNightsEdge
// [1457],1458 同域零漂移 2026-09-19 diff 定谳）：
//   ① 972 五层骨架：深色底(40,20,60)×fv×n3 → 白衍生层×0.15（A×(1−fv) 亮处隐没）→
//      内芯(80,30,160)×fv×n3×0.3 → 主亮(80,40,180)×fv×n3×0.7 → 帧3 白芯 0.3×n3×(1−fv×0.7)
//   ② 渐隐包络 n3 = Remap(t,0,.6,0,1)×Remap(t,.6,1,1,0)（t≥1 归零）
//   ③ 光照因子 fv = 光照色 RMS/√3 → Remap(0.2,1,0,1)；984 变体 K=Remap(0.5+fv×0.5,…)
//   ④ 973 残影 13 层链（基层 A=120、双扇面 num11=1/6|1/3、白衍生调制源=n3）
//   ⑤ blend 语义：XNA 预乘 = tint RGB 乘贴图 + color.A/255 全链 globalAlpha
//      （fake-DOM 2d 记账断言 multiply fill + destination-in + globalAlpha 直传）
// 无 jsdom——blend 断言注入最小 fake DOM（trail-shader.test.ts 同法,动态 import
// 先装 DOM 再装载模块：arcTintScratch 在 import 期捕获）。
import { describe, it, expect } from 'vitest';

// ---- 层表纯函数（无 DOM 依赖,静态 import 安全） ----
import { arcLayerList, tneGhostLayers, remapArc, lightingFromValue, coneHitsRect, conePointFits, SwingArc } from '../src/entities/SwingArc';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

describe('挥弧命中判定（Colliding aiStyle 190 锥 / type 973 距离圆,Utils.cs:1692-1729）', () => {
  const owner = { x: 50 * 16, y: 90 * 16, w: 20, h: 42, cx: 50 * 16 + 10, cy: 90 * 16 + 21, facing: 1, dead: false };
  const mkGame = (list: unknown[]) => ({
    world: new World(200, 200, 30, 'open'), player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, spawnDust: () => null, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks);

  it('conePointFits：锥内点真、锥后假、超角假、超距假（DoesFitInCone 逐式）', () => {
    // 锥 apex(0,0) 朝 +x、长 94、半角 π/4
    expect(conePointFits(50, 0, 0, 0, 94, 0, Math.PI / 4)).toBe(true);
    expect(conePointFits(50, 30, 0, 0, 94, 0, Math.PI / 4)).toBe(true);   // 31° < 45°
    expect(conePointFits(-50, 0, 0, 0, 94, 0, Math.PI / 4)).toBe(false);  // 锥后
    expect(conePointFits(50, 70, 0, 0, 94, 0, Math.PI / 4)).toBe(false);  // 54.5° > 45°
    expect(conePointFits(120, 0, 0, 0, 94, 0, Math.PI / 4)).toBe(false);  // 超距（< 严判）
  });

  it('coneHitsRect：五点采样语义——盒心在锥外但角入锥仍真；ClosestPointInRect(锥尖) 分支', () => {
    // 盒 (80,-60)-(110,-30)：盒心 (95,-45) 角 25.3° 在锥内 → 角点必真
    expect(coneHitsRect(80, -60, 30, 30, 0, 0, 94, 0, Math.PI / 4)).toBe(true);
    // 盒远端 (200,200) 全点出锥
    expect(coneHitsRect(200, 200, 30, 30, 0, 0, 94, 0, Math.PI / 4)).toBe(false);
    // 锥尖延长点落盒内（锥尖深入盒体,ClosestPointInRect=锥尖本身 → 距离 0 入锥）
    expect(coneHitsRect(80, -10, 30, 20, 0, 0, 94, 0, Math.PI / 4)).toBe(true);
  });

  it('挥弧接触命中（用户实报案）：锥内敌受击、锥后敌不受击——不依赖鼠标位置', () => {
    const game0 = new World(200, 200, 30, 'open');
    const arc = new SwingArc(owner, 972, 25, 40, 1, 1);
    const game = mkGame([]);
    // 推到 t=10（rot = π+π×0.4 ≈ 4.398 rad）,锥朝向 num14 = rot+2π/25
    for (let t = 0; t < 10; t++) arc.fixedUpdate(1, game);
    const ang = arc['rot'] + Math.PI * 2 / 25 * 1;
    const hits: number[] = [];
    const mkEnemy = (dx: number, dy: number, id: number, arr: number[]) => ({
      id, x: owner.cx + dx - 15, y: owner.cy + dy - 15, w: 30, h: 30,
      cx: owner.cx + dx, cy: owner.cy + dy, dead: false, hp: 500,
      hurt: (d: number) => { arr.push(d); return true; }, def: { hitSound: ['NPC_Hit_1'] },
    });
    const inCone = mkEnemy(Math.cos(ang) * 60, Math.sin(ang) * 60, 1, hits);
    // 锥后敌放 130px（>94 触距）——70px 处会被起手拖尾锥扫到（挥弧起手朝后上,
    // vanilla 忠实行为）
    const behind = mkEnemy(-130, 0, 2, hits);
    const game2 = mkGame([inCone, behind]);
    // 重置弧到 t=10 态（hitSet 空、t 连跑）
    const arc2 = new SwingArc(owner, 972, 25, 40, 1, 1);
    for (let t = 0; t < 10; t++) arc2.fixedUpdate(1, game2);
    expect(hits.length).toBe(1);                       // 锥内敌恰好一击、锥后零击
    expect(arc2['hitSet'].has(1)).toBe(true);
    expect(arc2['hitSet'].has(2)).toBe(false);
    void game0;
  });

  it('拖尾锥（num15 门）：t≤0.3ai1 时主锥界外 0.9 rad 的后向扇面点仍命中（仅拖尾锥覆盖）', () => {
    const arc = new SwingArc(owner, 972, 25, 40, 1, 1);
    const game = mkGame([]);
    for (let t = 0; t < 4; t++) arc.fixedUpdate(1, game);
    // t=4/25 → num15=1（clamp）：拖尾锥域 [num14−2.356, num14−0.785]。
    // 敌位按【真实锥心 apex】沿角 2.0 rad 放 80px：主锥界外（角 2.0±0.26 < 3.11=主锥下界）、
    // 拖尾锥内（1.54..3.11）——角位从 arc.cx/cy 起算（apex=owner 心 ±1px）
    const num14 = arc['rot'] + Math.PI * 2 / 25;
    const trailing = num14 - Math.PI / 4 - 0.9;
    void trailing;
    const ang2 = 2.0;
    const hits: number[] = [];
    const e = { id: 1, x: arc.cx + Math.cos(ang2) * 80 - 15, y: arc.cy + Math.sin(ang2) * 80 - 15,
      w: 30, h: 30, cx: arc.cx + Math.cos(ang2) * 80, cy: arc.cy + Math.sin(ang2) * 80,
      dead: false, hp: 500, hurt: (d: number) => { hits.push(d); return true; }, def: { hitSound: ['NPC_Hit_1'] } };
    const game2 = mkGame([e]);
    const arc2 = new SwingArc(owner, 972, 25, 40, 1, 1);
    for (let t = 0; t < 4; t++) arc2.fixedUpdate(1, game2);
    expect(hits.length).toBe(1);                       // 拖尾锥生效（主锥界外）
  });

  it('972 尘面 1:1（AI_190 :42783-42797）：尘14 α150 noLight / 尘27 α100 noGravity vel=player.vel×0.2+dir×3', () => {
    const game = mkGame([]) as GameHooks & { spawnDust?: (...a: unknown[]) => unknown };
    const dusts: Array<{ type: number; alpha: number; scale: number; noGravity: boolean; vx: number; vy: number }> = [];
    (game as { spawnDust?: unknown }).spawnDust = (_x: number, _y: number, _w: number, _h: number, type: number,
      sx: number, sy: number, alpha: number, _c: unknown, scale: number, noGravity: boolean) => {
      const d = { type, alpha, scale, noGravity, vx: sx as number, vy: sy as number };
      dusts.push(d);
      return d;
    };
    const arc = new SwingArc(owner, 972, 25, 40, 1, 1);
    for (let t = 0; t < 60; t++) {
      if (arc.dead) break;
      arc.fixedUpdate(1, game);
    }
    const d14 = dusts.filter((d) => d.type === 14);
    const d27 = dusts.filter((d) => d.type === 27);
    expect(d14.length).toBeGreaterThan(0);             // 两型尘都有产出（60 拍统计）
    expect(d27.length).toBeGreaterThan(0);
    for (const d of d14) { expect(d.alpha).toBe(150); expect(d.scale).toBe(1.4); }
    for (const d of d27) {
      expect(d.alpha).toBe(100);
      expect(d.noGravity).toBe(true);
      expect(d.vx).toBeCloseTo(3, 6);                  // player.vx=0 + dir(1)×3
      expect(d.vy).toBe(0);
    }
  });
});

describe('真刃系挥弧剑族分类（combatWeapon aiStyle 190/191 门）', () => {
  it('273/675/368/674/757/1826 = melee（曾落 shot 兜底 = Arrow 白弧直出的根因）', () => {
    const mk = (vid: number) => combatWeapon({ key: `vi_${vid}_x` });
    expect(mk(273)).toMatchObject({ kind: 'melee', shoot: 972, autoReuse: true });   // 永夜刃
    expect(mk(675)).toMatchObject({ kind: 'melee', shoot: 973 });                    // 真永夜刃
    expect(mk(368)).toMatchObject({ kind: 'melee', shoot: 982 });                    // 圣剑
    expect(mk(674)).toMatchObject({ kind: 'melee', shoot: 983 });                    // 真断钢
    expect(mk(757)).toMatchObject({ kind: 'melee', shoot: 985 });                    // 泰拉刃
    expect(mk(1826)).toMatchObject({ kind: 'melee', shoot: 997 });                   // 无头骑士剑
    // 对照组：无 noMelee 的 46/190 由通用 melee 门直收（shoot 随行）
    expect(mk(46)).toMatchObject({ kind: 'melee', shoot: 974 });
    expect(mk(190)).toMatchObject({ kind: 'melee', shoot: 976 });
    // 非本族 melee+noMelee+shoot 件不越权（636 破晓=标枪弹仍 'shot'）
    expect(mk(3543)).toMatchObject({ kind: 'shot', shoot: 636 });
  });
});

const env = (v: number, a: number, b: number): number =>
  remapArc(v, a, b, 0, 1) * remapArc(v, b, 1, 1, 0);   // n3 包络（Remap 双乘式）

describe('光照因子 lightingFromValue（:27908-27910 RMS/√3 → Remap(0.2,1,0,1)）', () => {
  const mkR = (rgb: [number, number, number] | null) =>
    ({ lighting: rgb ? { lightAt: () => rgb } : null });
  it('全亮 (255,255,255)=1、全黑=0、灰 1/3 → (1/3−0.2)/0.8、红 255 → RMS 1/√3', () => {
    expect(lightingFromValue(mkR([255, 255, 255]), 0, 0)).toBeCloseTo(1, 6);
    expect(lightingFromValue(mkR([0, 0, 0]), 0, 0)).toBe(0);
    expect(lightingFromValue(mkR([85, 85, 85]), 0, 0)).toBeCloseTo((1 / 3 - 0.2) / 0.8, 6);
    expect(lightingFromValue(mkR([255, 0, 0]), 0, 0)).toBeCloseTo((Math.sqrt(3) / 3 - 0.2) / 0.8, 6);
  });
  it('lighting 缺席 = 全亮 1（mock/无光照域）', () => {
    expect(lightingFromValue(mkR(null), 0, 0)).toBe(1);
  });
});

describe('972 永夜刃挥弧五层染色（DrawProj_NightsEdge :27901）', () => {
  it('全亮 fv=1 半程 n3=0.5：五层 tints 逐式 = 反编译常量、白衍生层亮处隐没（A×(1−fv)=0）', () => {
    const n3 = env(0.3, 0, 0.6);          // t=0.3 → 0.5（上升段）
    expect(n3).toBeCloseTo(0.5, 6);
    const ls = arcLayerList(972, 0.3, 1, n3);
    expect(ls).toHaveLength(5);           // 4×帧0 + 1×帧3（972 无三层组）
    expect(ls[0].rgb).toEqual([40, 20, 60]);          // 深色底
    expect(ls[0].alpha).toBeCloseTo(1 * 0.5, 6);      // ×fv×n3
    expect(ls[0].scale).toBeCloseTo(0.975, 6);
    expect(ls[0].rotAi).toBeCloseTo(-Math.PI / 4 * 0.7, 6);   // −π/4×(1−num2)
    expect(ls[1].rgb).toEqual([31.875, 31.875, 31.875]);   // White×n3×0.5→×K×0.5 链（A 已归零）
    expect(ls[1].alpha).toBe(0);                      // ★亮处隐没（(1−fromValue) 门）
    expect(ls[2].rgb).toEqual([80, 30, 160]);         // 内芯
    expect(ls[2].alpha).toBeCloseTo(0.15, 6);         // ×0.3
    expect(ls[2].scale).toBeCloseTo(0.8, 6);          // 972 内芯缩 0.8
    expect(ls[3].rgb).toEqual([80, 40, 180]);         // 主亮
    expect(ls[3].alpha).toBeCloseTo(0.35, 6);         // ×0.7
    expect(ls[3].scale).toBeCloseTo(0.975, 6);
    expect(ls[4].frame).toBe(3);
    expect(ls[4].rgb).toEqual([255, 255, 255]);
    expect(ls[4].alpha).toBeCloseTo(0.3 * 0.5 * 0.3, 6);  // 0.3×n3×(1−fv×0.7)
  });

  it('暗处 fv=0：层1/3/4 熄灭、白衍生层 α→0、帧3 白芯反而最亮（(1−fv×0.7)=1）', () => {
    const ls = arcLayerList(972, 0.3, 0, 0.5);
    expect(ls[0].alpha).toBe(0);
    expect(ls[2].alpha).toBe(0);
    expect(ls[3].alpha).toBe(0);
    expect(ls[1].alpha).toBe(0);                      // ×K 链全灭
    expect(ls[4].alpha).toBeCloseTo(0.15, 6);         // 0.3×0.5×1
  });

  it('弱光 fv=0.5：层1 α=0.5n3、白衍生层 R 调制支（972 l2ModR）逐式', () => {
    const n3 = 0.5, K = 0.5;
    const ls = arcLayerList(972, 0.3, 0.5, n3);
    expect(ls[0].alpha).toBeCloseTo(K * n3, 6);
    const w = 255 * n3 * 0.5;                         // White×n3×0.5
    // color4 = color3×K×0.5 → G×=K → R×=(0.25+K×0.75)（:27912-27914,R 调制支）
    expect(ls[1].rgb[0]).toBeCloseTo(w * K * 0.5 * (0.25 + K * 0.75), 4);
    expect(ls[1].rgb[1]).toBeCloseTo(w * K * K * 0.5, 4);
    expect(ls[1].rgb[2]).toBeCloseTo(w * K * 0.5, 4);
    expect(ls[1].alpha).toBeCloseTo((w * (1 - K) * K * 0.5 * 0.15) / 255, 8);
  });

  it('渐隐包络：峰值 t=0.6、t≥1 全层归零（Kill 前 α→0）', () => {
    const peak = env(0.6, 0, 0.6);
    expect(peak).toBeCloseTo(1, 6);
    const ls = arcLayerList(972, 1, 1, 0);
    for (const l of ls) expect(l.alpha).toBe(0);
  });
});

describe('983 真断钢 lerp 色 / 984 泰拉刃光照半混（:28095/:28192）', () => {
  it('983：三色按 n3 Lerp（base (180,50,90)→(180,30,60)）', () => {
    const ls = arcLayerList(983, 0.3, 1, 0.5);
    expect(ls[0].rgb).toEqual([180, 50 + (30 - 50) * 0.5, 90 + (60 - 90) * 0.5]);   // (180,40,75)
    expect(ls[3].rgb).toEqual([255, 240 + (60 - 240) * 0.5, 150 + (170 - 150) * 0.5]); // l4 lerp
    expect(ls[2].rgb).toEqual([255, 255 + (60 - 255) * 0.5, 80 + (190 - 80) * 0.5]);   // l3 lerp
    expect(ls[3].alpha).toBeCloseTo(0.5 * 0.5, 6);                    // ×0.5 主亮
  });

  it('984：K=Remap(0.5+fv×0.5,0.2,1,0,1)——全暗 fv=0 仍 0.375 可见（半混不灭）', () => {
    const ls = arcLayerList(984, 0.3, 0, 0.5);
    expect(ls[0].rgb).toEqual([45, 124, 205]);
    expect(ls[0].alpha).toBeCloseTo(0.375 * 0.5, 6);
    expect(ls[0].scale).toBeCloseTo(0.95, 6);                          // 984 底层 ×0.95
    const full = arcLayerList(984, 0.3, 1, 0.5);
    expect(full[0].alpha).toBeCloseTo(0.5, 6);                         // fv=1 → K=1
  });

  it('982 圣剑：三层组帧3 白芯（0.6/0.5/0.4,无 fv 项）', () => {
    const ls = arcLayerList(982, 0.3, 0, 0.5);   // fv=0：三层组不受光照
    expect(ls).toHaveLength(7);
    expect(ls[4].alpha).toBeCloseTo(0.3, 6);
    expect(ls[5].alpha).toBeCloseTo(0.25, 6);
    expect(ls[5].scale).toBeCloseTo(0.8, 6);
    expect(ls[6].alpha).toBeCloseTo(0.2, 6);
    expect(ls[6].scale).toBeCloseTo(0.6, 6);
  });
});

describe('973 真永夜刃残影 13 层链（DrawProj_TrueNightsEdge :28136）', () => {
  it('基层 A=120 底 ×n3×num8；扇面 num11=1/6|1/3；白衍生调制源=n3（非 fv）', () => {
    const amount = 0.25, num8 = 0.4, fv = 1, n3 = 0.6;
    const ls = tneGhostLayers(amount, num8, fv, n3);
    expect(ls).toHaveLength(13);                        // 基层 + 2×4 扇面 + 4 平位
    // 基层：Lerp((40,20,60),(80,160,50),amount)、alpha=(120/255)×n3×num8
    expect(ls[0].rgb).toEqual([40 + 40 * amount, 20 + 140 * amount, 60 - 10 * amount]);
    expect(ls[0].alpha).toBeCloseTo((120 / 255) * n3 * num8, 8);
    // 扇面层序（num10=−4π/3 先）：白衍生 / (80,30,160)lerp / color2 / 帧3
    expect(ls[1].rotAbs).toBeCloseTo(-Math.PI * 4 / 3, 6);
    // 第二轮扇面 num11=1/3（num10=−2π/3）→ 同型层 α 恰为第一轮 2 倍
    expect(ls[5].alpha).toBeCloseTo(ls[1].alpha * 2, 8);
    expect(ls[6].alpha).toBeCloseTo(ls[2].alpha * 2, 8);
    expect(ls[6].rotAbs).toBeCloseTo(-Math.PI * 2 / 3, 6);
    expect(ls[2].rgb).toEqual([80 + 120 * amount, 30 + 225 * amount, 160 - 160 * amount]);
    expect(ls[2].alpha).toBeCloseTo(fv * num8 * (1 / 6), 8);      // ×fv×num8×num11
    expect(ls[3].rgb).toEqual([80 + 75 * amount, 40 + 215 * amount, 180 - 80 * amount]);
    expect(ls[3].alpha).toBeCloseTo(fv * num8 * (0.05 + 0.35 * fv) * (1 / 6), 8);
    expect(ls[4].frame).toBe(3);
    expect(ls[4].alpha).toBeCloseTo((0.05 + 0.45 * fv) * num8 * (1 / 6), 8);
    // 平位尾组（:28176-28180）：(80,30,160) 支 α=n3×num8（非 fv）
    expect(ls[10].alpha).toBeCloseTo(n3 * num8, 8);
    expect(ls[11].alpha).toBeCloseTo(fv * num8 * (0.05 + 0.35 * n3), 8);
    expect(ls[12].alpha).toBeCloseTo((0.05 + 0.45 * n3) * num8, 8);
  });

  it('远影 num7=1−age/2：age2 → num8=0 全层熄灭（曾 ÷3 除数=三影齐亮）', () => {
    const ls = tneGhostLayers(0.25, 0, 1, 0.6);   // num8 = Opacity×0²×0.85 = 0
    for (const l of ls) expect(l.alpha).toBe(0);
  });
});

// ---- blend 语义（fake-DOM 动态 import：arcTintScratch 在 import 期捕获） ----
interface RecOp { op: string; args: unknown[] }
class RecCtx2d {
  ops: RecOp[] = [];
  canvas: unknown;
  gco = 'source-over';
  alpha = 1;
  fillStyle = '';
  imageSmoothingEnabled = false;
  clearRect(...a: unknown[]): void { this.ops.push({ op: 'clearRect', args: a }); }
  fillRect(...a: unknown[]): void { this.ops.push({ op: 'fillRect:' + this.gco + ':' + this.fillStyle, args: a }); }
  drawImage(...a: unknown[]): void { this.ops.push({ op: 'draw:' + this.gco, args: a }); }
  save(): void { this.ops.push({ op: 'save', args: [] }); }
  restore(): void { this.ops.push({ op: 'restore', args: [] }); }
  translate(...a: unknown[]): void { this.ops.push({ op: 'translate', args: a }); }
  rotate(...a: unknown[]): void { this.ops.push({ op: 'rotate', args: a }); }
  scale(...a: unknown[]): void { this.ops.push({ op: 'scale', args: a }); }
  get globalCompositeOperation(): string { return this.gco; }
  set globalCompositeOperation(v: string) { this.gco = v; }
  get globalAlpha(): number { return this.alpha; }
  set globalAlpha(v: number) { this.ops.push({ op: 'alpha', args: [v] }); this.alpha = v; }
}
function installFakeDom(): RecCtx2d[] {
  const created: RecCtx2d[] = [];
  (globalThis as Record<string, unknown>).document = {
    createElement(_tag: string) {
      const ctx = new RecCtx2d();
      created.push(ctx);
      return { width: 0, height: 0, getContext(k: string) { return k === '2d' ? ctx : null; } };
    },
  };
  return created;
}

describe('blend 语义：XNA 预乘 = tint 乘贴图 + A 链 globalAlpha', () => {
  it('层1 染色进 scratch（multiply rgb(40,20,60) + destination-in 恢复轮廓）、主面 α 直传', async () => {
    const created = installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const fakeImg = { width: 170, height: 680 };
    const layers = mod.arcLayerList(972, 0.3, 0.5, 0.5);
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 100, 200, 0.7, 1, 1.1, layers);
    const log = main.ops.map((o) => o.op);
    // 主面 alpha 直传 = A 链（K=0.5、n3=0.5）：层1 0.25 / 层2 0.0046875（弱可见）/
    // 层3 0.075 / 层4 0.175 / 帧3 0.0975——非染色死参旧态（曾恒白直出）。
    // 序列里偶数位 = 层 α、奇数位 = restore 后的 globalAlpha=1 复位
    const raw = main.ops.filter((o) => o.op === 'alpha').map((o) => o.args[0] as number);
    const alphas = raw.filter((_, i) => i % 2 === 0);
    expect(alphas).toHaveLength(5);
    expect(alphas[0]).toBeCloseTo(0.25, 6);
    expect(alphas[1]).toBeCloseTo(0.0046875, 8);
    expect(alphas[2]).toBeCloseTo(0.075, 6);
    expect(alphas[3]).toBeCloseTo(0.175, 6);
    expect(alphas[4]).toBeCloseTo(0.0975, 6);
    // scratch 烘焙（arcTintScratch = createElement 产出的第一个上下文）：
    // multiply 填充层1 色 + destination-in 用本体帧恢复 alpha 轮廓
    const scratchLog = created[0].ops.map((o) => o.op);
    expect(scratchLog).toContain('fillRect:multiply:rgb(40,20,60)');
    expect(scratchLog).toContain('draw:destination-in');
    // 帧选择走 source rect（帧 0）→ 降级直出路径不存在（tinted 命中）
    expect(log.filter((o) => o.startsWith('draw:source-over')).length).toBeGreaterThanOrEqual(4);
  });

  it('α≤1/255 层剪枝（亮处白衍生层隐没 = 原版 (1−fromValue) 门）', async () => {
    installFakeDom();
    const mod = await import('../src/entities/SwingArc');
    const main = new RecCtx2d();
    const fakeImg = { width: 170, height: 680 };
    // fv=1 全亮：层2 α=0 → 不产生主面 draw（972 五层中只 4 层可见）
    mod.drawArcLayers(main as unknown as CanvasRenderingContext2D,
      fakeImg as unknown as ImageBitmap, 0, 0, 0, 1, 1.1, mod.arcLayerList(972, 0.3, 1, 0.5));
    const raw = main.ops.filter((o) => o.op === 'alpha').map((o) => o.args[0] as number);
    const alphas = raw.filter((_, i) => i % 2 === 0);
    expect(alphas).toHaveLength(4);
    expect(alphas.every((a) => a > 0.004)).toBe(true);
  });
});
