// ★BJ597（2026-10-10）甲位 GlowMask 发光表整缺——BJ595 套装视效普查 D3/N2 收编。
//  定谳锚（Terarria1457 亲读）：
//   · 数据面：glowMask = Item.glowMask【short 字段】（Item.cs:195,-1=None）+ 常量面
//     GlowMaskID.cs（0..383,Count=384）；贴图 Glow_{N}.png = TextureAssets.GlowMask[N]
//     （384 张全在库,本测试逐表断言存在=缺资产即红,禁造占位）。
//   · 甲位发光【不走】Item.glowMask：PlayerDrawSet.cs:459-811 SetPassColors 按
//     head/body/legs 硬编码 switch → head/body/arm/legsGlowMask + GlowColor。
//   · 四叠画站同变换同锚：腿 :1556-1573（坐姿 :1478-1495 同表切片）、身 :1950-1955、
//     头 :2357-2401、臂 :3659-3663——与本体 DrawData 同 sourceRect(bodyFrame)/同
//     position/origin/rotation/effect。
//   · 色式：A=0（月辉 250³/白/骷髅 100³）= XNA 预乘 AlphaBlend 纯加法（xna-alpha0
//     判例）→ 'lighter'；A>0 → source-over ×alpha（翼光 plain 档同习语）。色不取
//     光照（GetImmuneAlphaPure 无 Lighting 项）= 自发光 → 合成后逃逸（BJ509/BJ594
//     判例域）→ Renderer 收集/flush 结构锁（§6）。
//   · 计件死码：num2..num5 被 :515-518 `= 3` 钉满 → 250 恒值;星尘腿 127×4=508
//     byte 截断 252（:802）。
//   · 复合半幅族：usesCompositeTorso（Body.Sets.UsesNewFramingCode body 1..261 全真）
//     → DrawCompositeArmorPiece（PlayerDrawLayers.cs:38-162）同甲贴图下半幅
//     （sourceRect.Y+=224）逐部件叠画;251/259 整幅换专贴图 Glow_364/376（无偏移）。
//  判别力（旧码必红）：§1 表结构/资产锁;§2 三甲位同变换同锚几何;§3 脉冲族+混合语义;
//  §4 复合半幅族;§5 坐姿切片单源;§6 销案面（翼光/星云奥秘 195/尾批登记）+集成位。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HEAD_GLOW, BODY_GLOW, BODY_COMPOSITE_GLOW, LEGS_GLOW, ARMOR_GLOW_DEFERRED,
  armorGlowOps, resolveArmorGlowColor, armorGlowPulse, isFemaleSkin,
  type ArmorGlowCtx,
} from '../src/data/vanillaArmorGlow';
import { wingDrawOf } from '../src/data/vanillaWingVisuals';
import { sittingSlicePlan } from '../src/player/PaperDoll';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDR_SRC = readFileSync(join(HERE, '..', 'src/render/Renderer.ts'), 'utf8');
const SPRITES = join(HERE, '..', 'public/sprites/vanilla');

const CTX_BASE: ArmorGlowCtx = {
  head: 0, body: 0, legs: 0,
  female: false,
  undershirt: { r: 160, g: 90, b: 40 },
  rowsBody: 0, rowsLegs: 0,
  sit: null, pet: null,
  mt: 255, miscCounter: 0, mul: 1,
};

/** 全表 mask 收集（含复合专贴图） */
function allMasks(): number[] {
  const out: number[] = [];
  for (const e of Object.values(HEAD_GLOW)) out.push(e.mask);
  for (const e of Object.values(BODY_GLOW)) { out.push(e.maskM, e.maskF); if (e.armMask) out.push(e.armMask); }
  for (const e of Object.values(LEGS_GLOW)) out.push(e.mask);
  return out;
}

// ================================================================
// §1 表结构锁（SetPassColors 1:1 收编 + 资产在库）
// ================================================================
describe('★BJ597 §1 GlowMask 表结构（PlayerDrawSet.cs:459-811）', () => {
  it('表规模：头 22 / 身条 7 / 复合 7 / 腿 10（亲读逐案清点;★BJ625 尾批 +271→22）', () => {
    expect(Object.keys(HEAD_GLOW).length).toBe(22);
    expect(Object.keys(BODY_GLOW).length).toBe(7);
    expect(Object.keys(BODY_COMPOSITE_GLOW).length).toBe(7);
    expect(Object.keys(LEGS_GLOW).length).toBe(10);
  });

  it('月辉四套锚：星旋 15/13+18/199 · 星云 16+12/14+19+12? · 星尘 184+arm188/185+186/187', () => {
    // 头（:521/:576/:582）
    expect(HEAD_GLOW[169]).toMatchObject({ mask: 15 });
    expect(HEAD_GLOW[170]).toMatchObject({ mask: 16 });
    expect(HEAD_GLOW[189]).toMatchObject({ mask: 184 });
    // 身（男/女拆档 :641-653/:705-719/:689-704）+ 附加臂（12/188）
    expect(BODY_GLOW[175]).toMatchObject({ maskM: 13, maskF: 18 });
    expect(BODY_GLOW[176]).toMatchObject({ maskM: 14, maskF: 19, armMask: 12 });
    expect(BODY_GLOW[190]).toMatchObject({ maskM: 185, maskF: 186, armMask: 188 });
    // 腿（:746-751/:779-789/:800-806）
    expect(LEGS_GLOW[110]).toMatchObject({ mask: 199 });
    expect(LEGS_GLOW[111]).toMatchObject({ mask: 17 });
    expect(LEGS_GLOW[130]).toMatchObject({ mask: 187 });
  });

  it('月辉恒量 250³,0（计件死码 :515-518 钉满 → 62.5×4 恒 250）+ A=0 纯加法', () => {
    for (const id of [169, 170, 189] as const) {
      const c = HEAD_GLOW[id].color;
      expect(c).toMatchObject({ k: 'const', r: 250, g: 250, b: 250, a: 0 });
      expect(resolveArmorGlowColor(c, { mt: 255, miscCounter: 0, undershirt: { r: 0, g: 0, b: 0 } }))
        .toMatchObject({ blend: 'add', alpha: 1, tint: [250 / 255, 250 / 255, 250 / 255] });
    }
    expect(LEGS_GLOW[110]!.color).toMatchObject({ k: 'const', r: 250, g: 250, b: 250, a: 0 });
  });

  it('星尘腿 byte 截断 252（127×(1+3)=508 → (byte)508=252,:802）', () => {
    expect(LEGS_GLOW[130]!.color).toMatchObject({ k: 'const', r: 252, g: 252, b: 252, a: 0 });
  });

  it('杂件代表锚（矿盔灯/驱动力面/翅膀外甲位全家）', () => {
    expect(HEAD_GLOW[216]).toMatchObject({ mask: 256, color: { k: 'const', r: 127, g: 127, b: 127, a: 0 } });  // UltraBright :527
    expect(HEAD_GLOW[210]).toMatchObject({ mask: 242 });                                                       // ValhallaKnight :533
    expect(HEAD_GLOW[214]).toMatchObject({ mask: 245, color: { k: 'arkhalis' } });                             // ArkhalisHat :539
    expect(HEAD_GLOW[240]).toMatchObject({ mask: 273, jitter: 2 });                                            // Grox Helm :544
    expect(HEAD_GLOW[268]).toMatchObject({ mask: 302, color: { k: 'mtPulse' } });                              // Timeless :554
    expect(HEAD_GLOW[269]).toMatchObject({ mask: 304, color: { k: 'const', r: 200, g: 200, b: 200, a: 255 } });// Floret :561
    expect(HEAD_GLOW[270]).toMatchObject({ mask: 305, color: { k: 'const', a: 150 } });                        // Capricorn :566
    expect(HEAD_GLOW[282]).toMatchObject({ mask: 357, color: { k: 'mtPulseA0' } });                            // DeadCells :614
    expect(HEAD_GLOW[284]).toMatchObject({ mask: 365, color: { k: 'chickenBones' } });                         // ChickenBones :621
    expect(HEAD_GLOW[285]).toMatchObject({ mask: 367 });                                                       // UpgradedMining :626
    expect(HEAD_GLOW[291]).toMatchObject({ mask: 375, color: { k: 'const', a: 255 } });                        // Kazzymodus :631
    expect(HEAD_GLOW[292]).toMatchObject({ mask: 378, color: { k: 'luna' } });                                 // Lunas :636
    expect(HEAD_GLOW[109]).toMatchObject({ mask: 208 });                                                       // Jims :604
    expect(HEAD_GLOW[175]).toMatchObject({ mask: 41 });                                                        // Martian :594
    expect(HEAD_GLOW[178]).toMatchObject({ mask: 96 });                                                        // HiTek :609
    expect(HEAD_GLOW[193]).toMatchObject({ mask: 209, color: { k: 'const', a: 127 } });                        // Lokis :599
    expect(HEAD_GLOW[211]).toMatchObject({ mask: 241, jitter: 4 });                                            // Apprentice 独立站 :2410
    expect(BODY_GLOW[194]).toMatchObject({ maskM: 210, maskF: 211, armMask: 211 });                            // Lokis :720
    expect(BODY_GLOW[179]).toMatchObject({ maskM: 42, maskF: 43, armMask: 44 });                               // Martian :732
    expect(BODY_GLOW[208]).toMatchObject({ maskM: 246, maskF: 247, armMask: 248, color: { k: 'arkhalis' } });  // Arkhalis :654
    expect(BODY_GLOW[205]).toMatchObject({ maskM: 240 });                                                      // Apprentice 独立站 :3671
    expect(LEGS_GLOW[134]).toMatchObject({ mask: 212, color: { k: 'const', a: 127 } });                        // Lokis :795
    expect(LEGS_GLOW[157]).toMatchObject({ mask: 249, color: { k: 'arkhalis' } });                             // :752
    expect(LEGS_GLOW[158]).toMatchObject({ mask: 250, color: { k: 'arkhalis' } });                             // :757
    expect(LEGS_GLOW[210]).toMatchObject({ mask: 274, jitter: 2 });                                            // Grox :762
    expect(LEGS_GLOW[222]).toMatchObject({ mask: 303, color: { k: 'mtPulse' } });                              // :767
    expect(LEGS_GLOW[225]).toMatchObject({ mask: 306 });                                                       // :774
    expect(LEGS_GLOW[226]).toMatchObject({ mask: 307 });                                                       // :779
  });

  it('Solar 全家不入表（无 glowMask——恒亮覆写=BJ594 债面,非本刀）', () => {
    expect(HEAD_GLOW[171]).toBeUndefined();
    expect(BODY_GLOW[177]).toBeUndefined();
    expect(BODY_COMPOSITE_GLOW[177]).toBeUndefined();
    expect(LEGS_GLOW[112]).toBeUndefined();
  });

  it('资产在库：全表 mask 的 Glow_{N}.png 均存在（缺=红,禁造占位）', () => {
    const missing = allMasks().filter((m) => !existsSync(join(SPRITES, `Glow_${m}.png`)));
    expect(missing).toEqual([]);
  });

  it('mask 域：全部 ∈ [0,384)（GlowMaskID.Count=384）且专贴图存在', () => {
    for (const m of allMasks()) expect(m).toBeGreaterThanOrEqual(0), expect(m).toBeLessThan(384);
    for (const e of Object.values(BODY_COMPOSITE_GLOW)) {
      if (e.tex) expect(existsSync(join(SPRITES, e.tex.replace('vanilla/', '')))).toBe(true);
    }
  });

  it('尾批两件已落刀（★BJ625）：271 TV 屏态机/269 前管 308 入活性表,登记表清空', () => {
    expect(HEAD_GLOW[271]).toMatchObject({ mask: 309, tv: true, color: { k: 'const', r: 255, g: 255, b: 255, a: 255 } });
    expect(HEAD_GLOW[269]).toMatchObject({ mask: 304, frontTube: 308 });
    expect(ARMOR_GLOW_DEFERRED).toEqual([]);
  });
});

// ================================================================
// §2 三甲位同变换同锚（四叠画站几何 1:1）
// ================================================================
describe('★BJ597 §2 同变换同锚（腿:1556/身:1950/头:2357/臂:3659）', () => {
  it('星旋全套：腿→身→臂→头 op 序 + dest=(-20,-52,40,56) 与 doll 帧同锚', () => {
    const ops = armorGlowOps({ ...CTX_BASE, head: 169, body: 175, legs: 110 });
    expect(ops.map((o) => o.tex)).toEqual([
      'vanilla/Glow_199.png',   // 腿（13_Leggings 层先）
      'vanilla/Glow_13.png',    // 身（17_Torso）
      'vanilla/Glow_15.png',    // 头（21_Head）
    ]);
    for (const o of ops) {
      expect(o.dx).toBe(-20);
      expect(o.dy).toBe(-52);           // -frameH(56)+pad(4) 与 doll 帧绘制同锚
      expect(o.sw).toBe(40); expect(o.sh).toBe(56);
      expect(o.blend).toBe('add');      // 250³,0 → 纯加法
    }
  });

  it('源行=bodyFrame/legFrame 帧行（rowsBody/rowsLegs 双行派生,全表 40×1120 同布局）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, head: 189, body: 190, legs: 130, rowsBody: 7, rowsLegs: 9 });
    const byTex = new Map(ops.map((o) => [o.tex, o]));
    expect(byTex.get('vanilla/Glow_187.png')!.sy).toBe(9 * 56);   // 腿=legFrame 行
    expect(byTex.get('vanilla/Glow_185.png')!.sy).toBe(7 * 56);   // 身=bodyFrame 行
    expect(byTex.get('vanilla/Glow_184.png')!.sy).toBe(7 * 56);   // 头=bodyFrame 行(:2357 源)
    expect(byTex.get('vanilla/Glow_188.png')!.sy).toBe(7 * 56);   // 臂=bodyFrame 行(:3659 源)
  });

  it('Nebula 女→maskF 19 + 臂 12 同色（:707-718 Male 拆档 + :3659 臂站）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, body: 176, female: true });
    expect(ops.map((o) => o.tex)).toEqual(['vanilla/Glow_19.png', 'vanilla/Glow_12.png']);
    expect(ops[0]!.tint).toEqual(ops[1]!.tint);
    expect(isFemaleSkin(5)).toBe(true);
    expect(isFemaleSkin(0)).toBe(false);
  });

  it('无甲槽 → 零 op（-1/Transparent 缺省语义）', () => {
    expect(armorGlowOps(CTX_BASE)).toEqual([]);
  });
});

// ================================================================
// §3 脉冲族 + 混合语义（mouseText/ WrappedLerp / A=0 纯加法）
// ================================================================
describe('★BJ597 §3 色式（:557/:675/:770 mouseText · :164/:183 WrappedLerp）', () => {
  it('mtPulse = (mt/255)² 全通道（DoUpdate_AnimateCursorColors 190↔255 三角波端点）', () => {
    const low = resolveArmorGlowColor({ k: 'mtPulse' }, { mt: 190, miscCounter: 0, undershirt: { r: 0, g: 0, b: 0 } });
    const high = resolveArmorGlowColor({ k: 'mtPulse' }, { mt: 255, miscCounter: 0, undershirt: { r: 0, g: 0, b: 0 } });
    expect(low.tint[0]).toBeCloseTo((190 / 255) ** 2, 6);
    expect(low.alpha).toBeCloseTo((190 / 255) ** 2, 6);
    expect(high.tint[0]).toBeCloseTo(1, 6);
    expect(low.blend).toBe('over');
  });

  it('mtPulseA0 = A=0 纯加法（head 282 :617-619）', () => {
    const r = resolveArmorGlowColor({ k: 'mtPulseA0' }, { mt: 190, miscCounter: 0, undershirt: { r: 0, g: 0, b: 0 } });
    expect(r.blend).toBe('add');
    expect(r.alpha).toBe(1);
    expect(r.tint[0]).toBeCloseTo((190 / 255) ** 2, 6);
  });

  it('WrappedLerp 三角波端点（Utils.cs:305:num=t×2,>1 折返 → 峰 t=.5;chickenBones 0.8..1 / luna 0.85..1）', () => {
    expect(armorGlowPulse(0, 0.8)).toBeCloseTo(0.8, 6);       // t=0 → wrap 0
    expect(armorGlowPulse(25, 0.8)).toBeCloseTo(0.9, 6);      // t=.25 → wrap .5
    expect(armorGlowPulse(50, 0.8)).toBeCloseTo(1.0, 6);      // t=.5 → wrap 1（峰）
    expect(armorGlowPulse(75, 0.8)).toBeCloseTo(0.9, 6);      // t=.75 → wrap .5
    expect(armorGlowPulse(100, 0.8)).toBeCloseTo(0.8, 6);     // t=1 → wrap 0（谷,周期 100t）
    expect(armorGlowPulse(50, 0.85)).toBeCloseTo(1.0, 6);
    expect(armorGlowPulse(25, 0.85)).toBeCloseTo(0.925, 6);   // ★中段锚（峰值锚对 lo 盲——RB15 判别力单腿）
    const luna = resolveArmorGlowColor({ k: 'luna' }, { mt: 255, miscCounter: 50, undershirt: { r: 0, g: 0, b: 0 } });
    expect(luna.blend).toBe('over');
    expect(luna.alpha).toBeCloseTo(100 / 255, 6);             // 峰值 (255³,100)×1
    expect(resolveArmorGlowColor({ k: 'luna' }, { mt: 255, miscCounter: 25, undershirt: { r: 0, g: 0, b: 0 } }).alpha)
      .toBeCloseTo((100 / 255) * 0.925, 6);
    const cb = resolveArmorGlowColor({ k: 'chickenBones' }, { mt: 255, miscCounter: 50, undershirt: { r: 0, g: 0, b: 0 } });
    expect(cb.blend).toBe('add');                             // (255³,0) 纯加法族
    expect(cb.tint[0]).toBeCloseTo(1.0, 6);
  });

  it('arkhalis = underShirtColor×A180（:519-520）', () => {
    const r = resolveArmorGlowColor({ k: 'arkhalis' }, { mt: 255, miscCounter: 0, undershirt: { r: 160, g: 90, b: 40 } });
    expect(r.tint).toEqual([160 / 255, 90 / 255, 40 / 255]);
    expect(r.alpha).toBeCloseTo(180 / 255, 6);
    expect(r.blend).toBe('over');
  });

  it('A>0 恒量走 source-over 且 alpha=a/255（Lokis 127/Floret 255/Capricorn 150 三档）', () => {
    const lokis = resolveArmorGlowColor({ k: 'const', r: 255, g: 255, b: 255, a: 127 }, { mt: 255, miscCounter: 0, undershirt: { r: 0, g: 0, b: 0 } });
    expect(lokis).toMatchObject({ blend: 'over' });
    expect(lokis.alpha).toBeCloseTo(127 / 255, 6);
    const floret = resolveArmorGlowColor({ k: 'const', r: 200, g: 200, b: 200, a: 255 }, { mt: 255, miscCounter: 0, undershirt: { r: 0, g: 0, b: 0 } });
    expect(floret).toMatchObject({ blend: 'over', alpha: 1, tint: [200 / 255, 200 / 255, 200 / 255] });
  });

  it('mul 乘区烘进 alpha（眨眼 bodyAlpha×stealth s\'² :1596/:1638/:1680 平方后）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, head: 169, mul: 0.45 * 0.25 });
    expect(ops[0]!.alpha).toBeCloseTo(0.45 * 0.25, 6);
  });
});

// ================================================================
// §4 复合半幅族（DrawCompositeArmorPiece :38-162）
// ================================================================
describe('★BJ597 §4 复合半幅（sourceRect.Y+=224 同甲下半幅 / 专贴图）', () => {
  it('Timeless 237：5 部件 × Armor_Armor_237 sy+224 × mtPulse 色过 op', () => {
    const ops = armorGlowOps({ ...CTX_BASE, body: 237, mt: 255 });
    expect(ops.length).toBe(5);
    const n = (255 / 255) ** 2;
    for (const o of ops) {
      expect(o.tex).toBe('vanilla/Armor_Armor_237.png');
      expect(o.sy).toBeGreaterThanOrEqual(224);               // 下半幅（glow 半）
      expect(o.sy).toBeLessThan(448);
      expect(o.blend).toBe('over');
      expect(o.tint[0]).toBeCloseTo(n, 6);                    // mtPulse 峰值白
    }
  });

  it('Grox 227：每部件 ×2 抖动拷贝（:668-672+DrawCompositeArmorPiece 227 支——copies=2 flush 双画）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, body: 227 });
    expect(ops.length).toBe(5);                               // 5 部件,逐件 copies=2
    for (const o of ops) { expect(o.copies).toBe(2); expect(o.jx).toEqual([-1.25, 1.25]); }
  });

  it('PalMetal 260 白恒量 + Capricorn 239 (200³,150)', () => {
    const pm = armorGlowOps({ ...CTX_BASE, body: 260 });
    expect(pm.length).toBe(5);
    expect(pm[0]).toMatchObject({ blend: 'over', alpha: 1, tint: [1, 1, 1] });
    const cap = armorGlowOps({ ...CTX_BASE, body: 239 });
    expect(cap[0]).toMatchObject({ blend: 'over', alpha: 150 / 255, tint: [200 / 255, 200 / 255, 200 / 255] });
  });

  it('ChickenBones 251 / Kazzymodus 259 整幅换专贴图（无 +224 偏移,:143-149/:152-158）', () => {
    const cb = armorGlowOps({ ...CTX_BASE, body: 251 });
    expect(cb[0]!.tex).toBe('vanilla/Glow_364.png');
    expect(cb[0]!.sy).toBeLessThan(224);
    expect(cb[0]!.blend).toBe('add');
    const kz = armorGlowOps({ ...CTX_BASE, body: 259 });
    expect(kz[0]!.tex).toBe('vanilla/Glow_376.png');
    expect(kz[0]!.sy).toBeLessThan(224);
    expect(kz[0]!.blend).toBe('over');
  });

  it('躯干跳行（row 5 → 躯干格 x=1）+ bob 行 hgY=−2（复合网格同源 ARM_FRAME/COMPOSITE_BOB_ROWS）', () => {
    const jump = armorGlowOps({ ...CTX_BASE, body: 237, rowsBody: 5 });
    // 跳行躯干格 (1,0) → sy=0+224
    expect(jump.some((o) => o.sy === 224)).toBe(true);
    const bob = armorGlowOps({ ...CTX_BASE, body: 237, rowsBody: 7 });
    for (const o of bob) expect(o.dy).toBe(-54);              // -52 + (-2)
  });
});

// ================================================================
// §5 坐姿切片（DrawSittingLegs :1478-1495 单源复用）
// ================================================================
describe('★BJ597 §5 坐姿 glow 切片（sittingSlicePlan 单源）', () => {
  it('坐姿星旋腿 = 切片 op 序（与腿甲烘焙同表同 rects）+ 帧顶 -60（64 高帧）', () => {
    const slices = sittingSlicePlan(110, false, 0, 0, 0);
    const ops = armorGlowOps({ ...CTX_BASE, legs: 110, sit: { legIndex: 110, seatYOffset: 0, body: 0 } });
    expect(ops.length).toBe(slices.length);
    for (let i = 0; i < ops.length; i++) {
      expect(ops[i]!.sx).toBe(slices[i]!.sx);
      expect(ops[i]!.sy).toBe(slices[i]!.sy);
      expect(ops[i]!.sw).toBe(slices[i]!.sw);
      expect(ops[i]!.sh).toBe(slices[i]!.sh);
      expect(ops[i]!.dx).toBe(-20 + slices[i]!.dx);
      expect(ops[i]!.dy).toBe(-60 + slices[i]!.dy);
    }
  });

  it('坐姿 Grox 腿 274 抖动双拷贝同在（:1483-1491 legsOffset ±1.25px）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, legs: 210, sit: { legIndex: 210, seatYOffset: 0, body: 0 } });
    expect(ops.length).toBeGreaterThan(0);
    for (const o of ops) expect(o.copies).toBe(2);
    const plain = armorGlowOps({ ...CTX_BASE, legs: 110, sit: { legIndex: 110, seatYOffset: 0, body: 0 } });
    for (const o of plain) expect(o.copies).toBeUndefined();
  });

  it('站姿同甲 = 单条整帧 op（非切片）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, legs: 110 });
    expect(ops.length).toBe(1);
    expect(ops[0]!.sh).toBe(56);
  });
});

// ================================================================
// §6 销案面 + 集成位（既有局部实现统一后行为不变）
// ================================================================
describe('★BJ597 §6 销案面（翼光/星云奥秘 195/集成结构）', () => {
  it('翼光表不被本刀触碰：luna 翼 51 mainGlow / 27 翼 Glow_92 plain（vanillaWingVisuals 原值）', () => {
    expect(wingDrawOf(51).mainGlow).toBe('luna');
    expect(wingDrawOf(27).overlay).toMatchObject({ kind: 'plain', file: 'Glow_92.png', alpha: 127 });
    expect(wingDrawOf(32).overlay).toMatchObject({ kind: 'glowAdd', file: 'Glow_183.png', scale: 1.06 });
  });

  it('BJ348b-2 星云奥秘 195 手持 glow 原样（Renderer 源锚）', () => {
    expect(RDR_SRC).toContain("ARCANUM_HOLD_GLOW_TEX = 'vanilla/Glow_195.png'");
  });

  it('Renderer 集成位：收集在甲层画毕 / flush 在翼光后（7e 槽序）/ 去重 WeakSet 逐帧重置', () => {
    expect(RDR_SRC).toContain('armorGlowOps(');
    expect(RDR_SRC.indexOf('this.flushArmorGlow()')).toBeGreaterThan(RDR_SRC.indexOf('this.flushWingGlow(cam, z);'));
    expect(RDR_SRC).toContain('armorGlowCollected = new WeakSet()');
    expect(RDR_SRC).toContain("import { armorGlowOps, tvScreenState, type ArmorGlowOp } from '../data/vanillaArmorGlow'");   // ★BJ625件1 +tvScreenState
  });

  it('坐姿切片单源：PaperDoll 导出 sittingSlicePlan（另立副本=漂移）', () => {
    const pd = readFileSync(join(HERE, '..', 'src/player/PaperDoll.ts'), 'utf8');
    expect(pd).toContain('export function sittingSlicePlan');
    expect(pd).toContain('export const ARM_FRAME');
    expect(pd).toContain('export const COMPOSITE_BOB_ROWS');
  });
});
