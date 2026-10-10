// ★BJ604 杂债清偿三件（2026-10-10）：件1 沙堡桶 4460 弹药消耗 / 件2 3476 主层暗化
// RGB 双乘 ×0.4→×0.5 / 件3 flushArmorGlow 忽略 op.tint（两旋钮合成分解）。
// 判别锁 = 逐件独立（变异每件≥1 发→恰红,还原后 sha256 对拍）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GAME_ROOT = join(import.meta.dirname, '..');

// ===================== 件1：沙堡桶 4460 弹药消耗（BJ602 登记⑤,放置域） =====================
// 原版锚（Terarria1457 亲读）：FlexibleTileWand.cs:48 `SandCastleBucket =
// CreateSingleTileWand(169, 552, 0,1,2,3).WithoutAmmoIcon()` ——【无
// WithoutAmmoConsumption】（:52-98 其余 single 族全带）= ConsumesAmmoItem:true。
// TryGetPlacementOption（:176-197）扫 _options[169] ⇒ 背包无沙块 canUse=false（门）；
// PlaceIt_ConsumeFlexibleWandMaterial（Player.cs:40492-40501）每拍扣沙块 1；
// 杖本体 consumable=false（Item.cs:37686-37697）永不扣。
import { flexibleWandOf, tryGetPlacementOption } from '../src/world/FlexibleTileWands';

describe('BJ604件1 沙堡桶 4460 弹药消耗（FlexibleTileWand.cs:48 唯一无 WithoutAmmoConsumption 的 single 族）', () => {
  it('WandDef：consumesAmmo=true + 弹药桶=沙块 169（其余 single 族保持零消耗对照）', () => {
    const w = flexibleWandOf(4460);
    expect(w).not.toBeNull();
    expect(w!.consumesAmmo).toBe(true);
    expect(w!.showsAmmoIcon).toBe(false);          // WithoutAmmoIcon 独立旗
    expect(w!.buckets).toEqual([[169, [[552, 0], [552, 1], [552, 2], [552, 3]]]]);

    // 对照组：无 WithoutAmmoConsumption 仅此一件——4609 侏儒/275 珊瑚仍零消耗
    expect(flexibleWandOf(4609)!.consumesAmmo).toBe(false);
    expect(flexibleWandOf(275)!.consumesAmmo).toBe(false);
    // multi 族（碎块三件）恒 true 不受影响
    expect(flexibleWandOf(5324)!.consumesAmmo).toBe(true);
  });

  it('放置门：无沙块 → null（canUse=false）；有沙块 → ammoVid=169 + style 循环', () => {
    const w = flexibleWandOf(4460)!;
    expect(tryGetPlacementOption(w, [], 0)).toBeNull();
    expect(tryGetPlacementOption(w, [{ vid: 552, favorited: false }], 0)).toBeNull();  // 552 是 tile 非弹药
    const hit = tryGetPlacementOption(w, [{ vid: 169, favorited: false }], 0)!;
    expect(hit).toEqual({ tileSheet: 552, style: 0, ammoVid: 169 });
    expect(tryGetPlacementOption(w, [{ vid: 169, favorited: false }], 3)!.style).toBe(3);
    expect(tryGetPlacementOption(w, [{ vid: 169, favorited: false }], 4)!.style).toBe(0);  // cycleOffset 模 4
    // 收集侧消费面（Game.ts 链尾分流）：consumesAmmo && ammoVid>0 → wandAmmoVid=169
    const game = readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');
    expect(game).toContain('if (wand.consumesAmmo && opt.ammoVid > 0) wandAmmoVid = opt.ammoVid;');
    expect(game).toContain('if (wandAmmoVid > 0) {');
  });
});

// ===================== 件2：3476 主层暗化 RGB 双乘（BJ599 新债①,渲染域） =====================
// 原版锚（PlayerDrawLayers.cs:3344/:3370 亲读）：GetAlpha(itemColor).MultiplyRGBA(
// new Color(Vector4(0.5,0.5,0.5,0.8))) —— XNA 预乘 AlphaBlend 下 RGB 面=×0.5、
// A 面=×0.8（A 因子只衰减混合权重）。canvas globalAlpha 在预乘空间【同时缩放
// 色彩与 α】（W3C source-over: co=cs+cb·(1−αs)）⇒ 烘焙×0.5+globalAlpha 0.8
// =合成 RGB×0.4 双乘。修=烘焙 ×0.625（0.5/0.8 补偿）。
// ★原处方证伪（BJ594 习语独立判语）：「A×0.8 烘进 tex+globalAlpha→1」与旧态
// 代数恒等（×0.4 不变）——合成代数选型=烘焙补偿+globalAlpha 保留。
describe('BJ604件2 3476 主层暗化 RGB 面分离锁（×0.625×0.8=×0.5,A 面 ×0.8）', () => {
  const rs = () => readFileSync(join(GAME_ROOT, 'src/render/Renderer.ts'), 'utf8');

  it('烘焙因子 ×0.625 补偿（arcanumDimTex 3476 双站 + halfDimTex BJ603 3779 同根）', () => {
    const src = rs();
    expect(src.match(/id\.data\[i(?: \+ \d)?\] = \(id\.data\[i(?: \+ \d)?\] \* 0\.625\) \| 0;/g)?.length).toBe(6);
    expect(src.match(/id\.data\[i(?: \+ \d)?\] = \(id\.data\[i(?: \+ \d)?\] \* 0\.5\) \| 0;/g)?.length ?? 0).toBe(0);
  });

  it('RGB/A 两面独立判别（W3C source-over 预乘算子式对拍）——判别旧 ×0.4 双乘态', () => {
    const src = rs();
    const bake = Number(src.match(/id\.data\[i\] = \(id\.data\[i\] \* (0\.\d+)\) \| 0;/)![1]);
    const ga = Number(src.match(/ctx\.globalAlpha = (0\.8);/)![1]);
    // RGB 面（预乘 cs 随 globalAlpha 同缩放）：bake×ga 必须=原版 0.5 —— 旧态 0.5×0.8=0.4 恰红
    expect(Math.abs(bake * ga - 0.5)).toBeLessThan(1e-9);
    // A 面：globalAlpha 只承载 α 衰减=×0.8（bake 不触 A 面——源锁见 BJ348b oracle）
    expect(ga).toBe(0.8);
    // 原处方证伪锚：A×0.8 烘进 tex + globalAlpha→1 与旧态恒等=禁止该形态回归
    expect(src).not.toContain('id.data[i + 3] = (id.data[i + 3] * 0.8) | 0;');
    expect(src.match(/ctx\.globalAlpha = 0\.8;/g)?.length).toBe(3);   // 3476 静持+挥舞+3779 本体
  });
});

// ===================== 件3：flushArmorGlow 忽略 op.tint（BJ601 观察⑦,BJ597 域） =====================
// 定谳（原版亲读）：PlayerDrawSet.cs:806-811 尾拍 GetImmuneAlphaPure=Color.Multiply
// 【整色四通道乘】× mul ⇒ 终色 c=(R,G,B,A)·mul,XNA 预乘 AlphaBlend=(One,InvSrcAlpha)
// 下 RGB 面因子 r_f=R/255·mul 与 dst 衰减 α_f=A/255·mul 两因子独立。旧 alpha-only
// flush 把 α_f 当 r_f（R≠A 全族偏差）。canvas 两旋钮精确分解：
// bake=min(1,r_f_unit/α_f_unit)（draw#1 source-over×alpha）+boost=max(0,r_f−α_f)·mul
// （draw#2 'lighter'×1 补差）——min+max 恰=r_f,byte 域无截断。
import { armorGlowOps, armorGlowBakeBoost } from '../src/data/vanillaArmorGlow';
import type { ArmorGlowCtx } from '../src/data/vanillaArmorGlow';

const ctxOf = (over: Partial<ArmorGlowCtx>): ArmorGlowCtx => ({
  head: 0, body: 0, legs: 0, female: false,
  undershirt: { r: 255, g: 239, b: 213 },
  rowsBody: 0, rowsLegs: 0, sit: null, pet: null,
  mt: 255, miscCounter: 0, mul: 1,
  ...over,
});

describe('BJ604件3 甲位 glow 合成分解（armorGlowBakeBoost 逐案 1:1）', () => {
  it('Lokis 193 (255,255,255,127)：bake 免（R>A 补偿比 >1 截断免烘）,boost=(1−127/255)·mul', () => {
    const bb = armorGlowBakeBoost({ tint: [1, 1, 1], alpha: 127 / 255, blend: 'over' }, 1);
    expect(bb.bake).toBeUndefined();
    expect(bb.boost).toEqual([1 - 127 / 255, 1 - 127 / 255, 1 - 127 / 255]);
  });
  it('Grox 240 (230,230,230,60)：boost=(230−60)/255·mul——旧态 ×0.235 应 ×0.902', () => {
    const bb = armorGlowBakeBoost({ tint: [230 / 255, 230 / 255, 230 / 255], alpha: 60 / 255, blend: 'over' }, 0.5);
    expect(bb.bake).toBeUndefined();
    for (const c of bb.boost!) expect(c).toBeCloseTo((170 / 255) * 0.5, 15);
  });
  it('Floret 269 (200,200,200,255)：R<A 单 bake=r/α 免 boost——两拍和恰=r_f', () => {
    const bb = armorGlowBakeBoost({ tint: [200 / 255, 200 / 255, 200 / 255], alpha: 1, blend: 'over' }, 1);
    expect(bb.bake).toEqual([200 / 255, 200 / 255, 200 / 255]);
    expect(bb.boost).toBeUndefined();
  });
  it('arkhalis 214（内衣色逐通道）：亮内衣 (>180) 走 boost,暗内衣走单 bake', () => {
    // 亮内衣 (255,239,213)：三通道全 >180 → bake 免,boost=max(0,u−180)/255·mul
    const bbBright = armorGlowBakeBoost(
      { tint: [255 / 255, 239 / 255, 213 / 255], alpha: 180 / 255, blend: 'over' }, 1);
    expect(bbBright.bake).toBeUndefined();
    const wantBright = [(255 - 180) / 255, (239 - 180) / 255, (213 - 180) / 255];
    bbBright.boost!.forEach((c, i) => expect(c).toBeCloseTo(wantBright[i], 15));
    // 暗内衣 (100,50,20)：单 bake=u/180（无截断）,boost 免
    const bbDark = armorGlowBakeBoost(
      { tint: [100 / 255, 50 / 255, 20 / 255], alpha: 180 / 255, blend: 'over' }, 1);
    const wantDark = [100 / 180, 50 / 180, 20 / 180];
    bbDark.bake!.forEach((c, i) => expect(c).toBeCloseTo(wantDark[i], 15));
    expect(bbDark.boost).toBeUndefined();
  });
  it('luna 292 (255p,100p)：bake 免（比 2.55 截断）,boost=p·(1−100/255)·mul——旧态 ×0.392p 应 ×p', () => {
    const p = 0.85;   // armorGlowPulse(0, 0.85)
    const bb = armorGlowBakeBoost(
      { tint: [p, p, p], alpha: (100 / 255) * p, blend: 'over' }, 1);
    expect(bb.bake).toBeUndefined();
    for (const c of bb.boost!) expect(c).toBeCloseTo(p * (1 - 100 / 255), 15);
  });
  it('add 族（A=0）：bake=tint 全额走 lighter×alpha——127/100 灰不再 ×1 过亮,脉冲进 bake', () => {
    // Valhalla 210 (127,127,127,0)：旧态 lighter×mul 过亮 2×,现 bake=127/255
    expect(armorGlowBakeBoost({ tint: [127 / 255, 127 / 255, 127 / 255], alpha: 1, blend: 'add' }, 1))
      .toEqual({ bake: [127 / 255, 127 / 255, 127 / 255] });
    // mtPulseA0 282：n=(mt/255)² 脉冲烘进 bake（旧态恒 ×mul 无脉冲）
    const n = (191 / 255) ** 2;
    expect(armorGlowBakeBoost({ tint: [n, n, n], alpha: 1, blend: 'add' }, 1))
      .toEqual({ bake: [n, n, n] });
  });
  it('R==A 档零回归（mtPulse (n,n,n,n)）：bake/boost 双省=旧 alpha-only 路径逐位', () => {
    const n = (191 / 255) ** 2;
    expect(armorGlowBakeBoost({ tint: [n, n, n], alpha: n, blend: 'over' }, 1))
      .toEqual({});
  });
  it('armorGlowOps 全链接线：Lokis 头 op 带 boost、Floret 头 op 带 bake、mtPulse 双免', () => {
    const loki = armorGlowOps(ctxOf({ head: 193, mul: 1 }));
    expect(loki.length).toBe(1);
    expect(loki[0].blend).toBe('over');
    expect(loki[0].alpha).toBe(127 / 255);
    expect(loki[0].boost).toEqual([1 - 127 / 255, 1 - 127 / 255, 1 - 127 / 255]);
    expect(loki[0].bake).toBeUndefined();

    const floret = armorGlowOps(ctxOf({ head: 269 }));
    expect(floret[0].bake).toEqual([200 / 255, 200 / 255, 200 / 255]);
    expect(floret[0].boost).toBeUndefined();

    const mt = armorGlowOps(ctxOf({ head: 268, mt: 191 }));
    expect(mt[0].bake).toBeUndefined();
    expect(mt[0].boost).toBeUndefined();
    expect(mt[0].alpha).toBeCloseTo((191 / 255) ** 2, 12);
  });
  it('flush 消费面（Renderer.ts 两冲刷站）：armor 站 passes 分解 + item 站 over 分解', () => {
    const src = readFileSync(join(GAME_ROOT, 'src/render/Renderer.ts'), 'utf8');
    // flushArmorGlow：两拍 pass 表 + 补差拍接线 + 逐拍现烘（单槽 scratch 防覆写）
    expect(src).toContain("op.blend === 'add'\n          ? [{ comp: 'lighter', g: Math.max(0, Math.min(1, op.alpha)), tint: op.bake ?? null }]");
    expect(src).toContain("...(op.boost ? [{ comp: 'lighter' as const, g: 1, tint: op.boost }] : []),");
    expect(src).toContain('for (const pass of passes)');
    expect(src).not.toContain('const passSrcs');   // 单槽 scratch 禁并行预持（覆写 hazard）
    // flushItemGlow：over 支两旋钮分解（white63 ×0.138→×0.749 / staffWhite127 ×0.498→×1）
    expect(src).toContain('Math.min(1, op.tint[0] / gClamped)');
    expect(src).toContain("ctx.globalCompositeOperation = 'lighter';\n            ctx.globalAlpha = 1;");
  });
});
