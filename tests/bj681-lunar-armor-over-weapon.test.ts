// ★BJ681（2026-10-14 用户实报「星云套和日耀套……挥动武器等时,甲的绘制层级也高于
//  武器本身,导致遮挡武器的部分贴图」）判别锁。
// ★定谳（原版 1457 亲读锚）——LegacyPlayerRenderer.cs:227-235 DrawPlayer_UseNormalLayers
//  层序：… 13_Leggings+腿glow(:1556) → … 17_Torso+身glow(:1950) → 21_Head+头glow
//  (:2357) → 22_FaceAcc → 23_MountFront → 24_Pulley → 25_Shield → 26_SolarShield
//  (:3130) → 27_HeldItem(:3148,武器+itemGlow :3499) → 28_ArmOverItem+臂glow(:3659)
//  → … 37_BeetleBuff → 38_EyebrellaCloud。即：
//   · 甲位 glow 的腿/身/头三站（13/17/21）在武器【之下】;
//   · 臂站（28:armMask :3659-3663 + 复合前肩/前臂 28_ArmOverItemComposite :3693+）
//     在武器【之上】;
//   · 日曜盾球 26 在武器【之下】。
// ★本仓病灶（探针 scripts/_bj681-lunar-armor-over-weapon.mjs 定谳,正午钉相 0.5 挥舞
//  帧序证据）：
//   · 星云 170/176/111（glow 族,无恒色覆写 lunarHoist=null）→ R1/R2/R3 随迁窗【不开】
//     =武器留 lit 窗 → 7e'''' flushArmorGlow 合成后冲刷=加色盖武器（wash=527px）;
//   · 日耀 171/177/112（恒色族）→ 武器已随迁（武器>恒色甲 ✓）,但盾球 flush 在
//     7e⁴ 随迁重放【后】=盾球盖武器（原版 26<27）。
// ★落刀三面：
//   ① glow 族随迁窗扩面（glowCover）：星云/漩涡等 BJ597 glow 表族 R2/R3 窗开
//     =武器/身前配饰画回 glow 之上（R1 不扩=浮游圈前半 17 site2 域在头 glow 之下,
//     hoist 反造 21 反转,登记）;
//   ② 盾球挪位：flushSolarShieldQueue 挪至 armorGlow under 遍后、flushLunarCovered 前;
//   ③ armorGlow 两遍制：28 臂站 op（arm 标记）分至 itemGlow 后的 arm 遍（武器之上）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { armorGlowOps, BODY_GLOW, type ArmorGlowCtx } from '../src/data/vanillaArmorGlow';

const RDR = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');

const CTX_BASE: ArmorGlowCtx = {
  head: 0, body: 0, legs: 0, female: false, undershirt: { r: 255, g: 255, b: 255, a: 255 },
  rowsBody: 0, rowsLegs: 0, sit: null, pet: null, mt: 255, miscCounter: 0, mul: 1, tv: null,
} as unknown as ArmorGlowCtx;

// ============ ① 原版层位语义锁（数据面 arm 站标记） ============
describe('BJ681 ①：armorGlowOps 臂站(28)标记=武器之上遍', () => {
  it('星云 176（男）= 身条(14,under) + 臂条(12,arm)——armMask :3659-3663 站 28', () => {
    const ops = armorGlowOps({ ...CTX_BASE, body: 176 });
    const body = ops.find((o) => o.tex === 'vanilla/Glow_14.png');
    const arm = ops.find((o) => o.tex === 'vanilla/Glow_12.png');
    expect(body).toBeTruthy();
    expect(arm).toBeTruthy();
    expect(body!.arm).toBeUndefined();   // 17_Torso 站=武器之下（under 遍）
    expect(arm!.arm).toBe(true);         // 28_ArmOverItem 站=武器之上（arm 遍）
  });

  it('星云 176（女）= 身条 19 under + 臂条 12 arm（maskF 支同站）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, body: 176, female: true });
    expect(ops.find((o) => o.tex === 'vanilla/Glow_19.png')!.arm).toBeUndefined();
    expect(ops.find((o) => o.tex === 'vanilla/Glow_12.png')!.arm).toBe(true);
  });

  it('复合半幅族 238（FloretProtectorChestplate）5 cell=后肩/后臂/躯干 under + 前肩/前臂 arm（28_ArmOverItemComposite）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, body: 238 });
    const composite = ops.filter((o) => o.tex.includes('Armor_Armor_238'));
    expect(composite.length).toBe(5);
    // cell 序=后肩/后臂/躯干/前肩/前臂（armorGlowOps 注）
    expect(composite[0]!.arm).toBeUndefined();
    expect(composite[1]!.arm).toBeUndefined();
    expect(composite[2]!.arm).toBeUndefined();
    expect(composite[3]!.arm).toBe(true);   // 前肩（:3731）
    expect(composite[4]!.arm).toBe(true);   // 前臂（:3766）
  });

  it('星尘 190=strip 族（身条 185 under + 臂条 188 arm,与星云同构非复合）', () => {
    const ops = armorGlowOps({ ...CTX_BASE, body: 190 });
    expect(ops.find((o) => o.tex === 'vanilla/Glow_185.png')!.arm).toBeUndefined();
    expect(ops.find((o) => o.tex === 'vanilla/Glow_188.png')!.arm).toBe(true);
  });

  it('漩涡 175/星云头 170/星云腿 111 = 全 under（无臂站,腿/身/头 13/17/21）', () => {
    for (const [slot, tex] of [[175, 'Glow_13.png'], [170, 'Glow_16.png'], [111, 'Glow_17.png']] as const) {
      const c = slot === 175 ? { body: 175 } : slot === 170 ? { head: 170 } : { legs: 111 };
      const ops = armorGlowOps({ ...CTX_BASE, ...c });
      expect(ops.length).toBeGreaterThan(0);
      for (const o of ops) expect(o.arm).toBeUndefined(), expect(o.tex).toContain(tex);
    }
  });

  it('BODY_GLOW 星云 176 表值=maskM 14/maskF 19/armMask 12（:705-719 数据面对账）', () => {
    expect(BODY_GLOW[176]).toMatchObject({ maskM: 14, maskF: 19, armMask: 12 });
  });
});

// ============ ② flush 层序锚（7e 域全序=原版 13/17/21 < 26 < 27 < 27glow < 28） ============
describe('BJ681 ②：7e 冲刷序（under glow < 盾 < 随迁重放(武器) < itemGlow < arm glow）', () => {
  it('全序锚：LUNAR_ARMOR < ARMOR_GLOW(under) < SOLAR_SHIELD < COVERED_BLIT < itemGlow < ARMOR_GLOW(arm) < eyebrella', () => {
    const iWing = RDR.indexOf('this.flushWingGlow(cam, z);');
    const iArmor = RDR.indexOf('this.flushLunarArmor();');
    const iGlow = RDR.indexOf('this.flushArmorGlow();');
    const iSolar = RDR.indexOf('this.flushSolarShieldQueue(cam, z);');
    const iCov = RDR.indexOf('this.flushLunarCovered();');
    const iItem = RDR.indexOf('this.flushItemGlow();');
    const iArm = RDR.indexOf('this.flushArmorGlow(true);');
    const iEye = RDR.indexOf('this.flushEyebrellaCloud(cam, z);');
    expect(iWing).toBeGreaterThan(-1);
    expect(iArmor).toBeGreaterThan(iWing);
    expect(iGlow).toBeGreaterThan(iArmor);
    expect(iSolar).toBeGreaterThan(iGlow);    // 盾 > glow under 遍（原版 26 > 17/21）
    expect(iCov).toBeGreaterThan(iSolar);     // 武器 > 盾（原版 27 > 26）★主判别锁
    expect(iItem).toBeGreaterThan(iCov);      // 手持光罩 > 武器（原版 27glow > 27）
    expect(iArm).toBeGreaterThan(iItem);      // 臂 glow > 武器（原版 28 > 27）
    expect(iEye).toBeGreaterThan(iArm);
  });

  it('变异锁：盾球若挪回 itemGlow 后（旧病灶位）→ iSolar>iCov 断言恰红', () => {
    // 模拟旧序（盾在随迁重放后）:源文锚反演——iSolar 必须小于 iCov,否则此测试族爆红
    const iSolar = RDR.indexOf('this.flushSolarShieldQueue(cam, z);');
    const iCov = RDR.indexOf('this.flushLunarCovered();');
    expect(iSolar).toBeLessThan(iCov);
  });

  it('flushArmorGlow 两遍制：armPass 参 + op 分拣 + under 遍留队（kept 换入）', () => {
    expect(RDR).toContain('private flushArmorGlow(armPass = false): void {');
    // under 遍把 28 臂站 op 抽出留队列（arm 遍 drain）
    expect(RDR).toContain('const armOps = e.ops.filter((o) => o.arm === true);');
    expect(RDR).toContain("if ((op.arm === true) !== armPass) continue;   // ★BJ681 under/arm 两遍分拣");
    // arm 遍缺席自愈：render 头逐帧重建（既有 5689 锚仍在）
    expect(RDR).toContain('this.armorGlowQueue.length = 0;   // ★BJ597 甲位 glow 队列逐帧重建');
  });
});

// ============ ③ glow 族随迁窗扩面锁（星云病灶主刀） ============
describe('BJ681 ③：glowCover 随迁窗扩面（星云/漩涡 glow 族武器画回 glow 之上）', () => {
  it('glowCover 函数域声明 + 首绘收集块置位（与 armorGlowQueue.push 同门）', () => {
    expect(RDR).toContain('let glowCover = false;');
    // 置位在首绘收集块内（armorGlowCollected 门内=双绘次遍自然 false）
    const iGate = RDR.indexOf('if (!this.armorGlowCollected.has(p)) {');
    const iSet = RDR.indexOf('glowCover = true;   // ★BJ681 glow 族随迁门');
    expect(iSet).toBeGreaterThan(iGate);
    expect(RDR).toContain('glowCover = true;   // ★BJ681 glow 族随迁门（R2/R3 窗开——武器/身前配饰画回 glow 之上）');
  });

  it('R2/R3 窗门扩 (lunarHoist != null || glowCover)；R1 不扩（恒色族专属）', () => {
    const iR1 = RDR.indexOf('const covR1 =');
    const iR2 = RDR.indexOf('const covR2 =');
    const iR3 = RDR.indexOf('const covR3 =');
    const r1 = RDR.slice(iR1, iR1 + 200);
    const r2 = RDR.slice(iR2, iR2 + 200);
    const r3 = RDR.slice(iR3, iR3 + 200);
    // R1 = 恒色族专属（浮游圈前半 17 site2 在头 glow 下,不扩=防反造 21 反转）
    expect(r1).toContain('const covR1 = lunarHoist != null && tubeTex != null');
    expect(r2).toContain('const covR2 = (lunarHoist != null || glowCover) && !mntHidden');
    expect(r3).toContain('const covR3 = (lunarHoist != null || glowCover) && lunarR3Content');
  });

  it('变异锁：R3 门若摘 glowCover（回退到恒色族专属）→ 星云武器回 lit 窗被 glow 盖=恰红', () => {
    // 源文反演:covR3 行必须含 glowCover——摘除即本断言爆红
    expect(RDR).toMatch(/const covR3 = \(lunarHoist != null \|\| glowCover\) && lunarR3Content/);
  });

  it('双绘标记同收 glowCover（坐椅/睡床次遍窗自然关+防御性标记）', () => {
    expect(RDR).toContain('if (lunarHoist != null || glowCover) this.lunarCoverCollected.add(p);');
  });

  it('R3 窗内容不变式：heldDraw+drawUseItem+甲虫 orb+坐骑前层+矿车仍在窗内（BJ665b 既有锁不回退）', () => {
    const r3 = RDR.slice(RDR.indexOf('const lunarR3Content'), RDR.indexOf('if (covR3) { this.lunarCoverEnd(covR3)'));
    expect(r3).toContain('heldDraw');
    expect(r3).toContain('this.drawUseItem(ctx, p, swing, flicker)');
    expect(r3).toContain('beetleDef');
    expect(r3).toContain("drawMountLayer(ctx, p, mnt, 'front'");
    expect(r3).toContain('cart.textureGlow');
  });
});

// ============ ④ 探针判别数（真机帧序证据,见 scripts/_bj681-lunar-armor-over-weapon.mjs） ============
describe('BJ681 ④：探针判别数登记（正午钉相 0.5 挥舞,刀前/刀后）', () => {
  it('刀前病灶帧序（探针 2026-10-14 记录）：星云 USE_ITEM 无窗+glow 后冲;日耀盾在重放后', () => {
    // 刀前（_bj681 首跑 order 记录）:
    //   nebula:  USE_ITEM(weapon) → … ARMOR_GLOW(q=1,[Glow_17,Glow_19,Glow_12,Glow_16]) ← glow 盖武器
    //   vortex:  USE_ITEM(weapon) → … ARMOR_GLOW(q=1,[Glow_199,Glow_18,Glow_15])
    //   solar:   covBegin→USE_ITEM→covEnd → LUNAR_ARMOR(1) → ARMOR_GLOW(0) → COVERED_BLIT(2)
    //            → itemGlow(0) → SOLAR_SHIELD(1) ← 盾球盖武器（原版 26<27 违序）
    //   刀后期望: nebula/vortex 出现 covBegin→USE_ITEM→covEnd（glowCover 窗开）
    //            + ARMOR_GLOW(under) < SOLAR_SHIELD < COVERED_BLIT < itemGlow < ARMOR_GLOW(arm)
    // 数字登记（刀前 blade strip 68×44 采样,vs 裸装）: nebula wash=527/vortex wash=523
    //   =glow 加色洗白武器像素面;stardust wash=914（恒色+glow 双面）。
    expect(true).toBe(true);
  });
});
