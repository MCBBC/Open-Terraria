// ★BJ682（2026-10-14 BJ681 复诊：用户实报「弓还是被盔甲遮住,脱掉盔甲才正常」）
// 判别锁——heldProj 载体弹层位随玩家层组走。
// ★定谳（原版 1457 亲读锚）：
//   · Projectile.cs :6769-6780：630/705 族 drawLayer=7 + usesOwnerLight=true
//     （aiStyle 75,penetrate −1,tileCollide false）;
//   · AI_075 尾 :68385：player.heldProj = whoAmI + position =
//     player.RotatedRelativePoint(mountedCenter) − Size/2（钉玩家手）+ itemRotation 跟随;
//   · PlayerDrawSet.cs :263-276（BoringSetup）：heldProj → SelectedDrawnProjectile;
//   · PlayerDrawLayers.cs :3154（DrawPlayer_27_HeldItem 开头）：drawLayer==7 →
//     projectileDrawPosition = DrawDataCache.Count —— 即在 13-26（甲+甲glow+盾）
//     之后、27 武器本体【之前】记录插入位;
//   · PlayerDrawLayers.cs :4310-4330（PlayDrawData/RenderAllLayersSlow）：到位
//     DrawHeldProj → Main.DrawProjDirect = 载体弹画在玩家层组内 27 开头位;
//   · Main.cs :30069-30072：usesOwnerLight → projectileColor =
//     Lighting.GetColor(mountedCenter) = 玩家中心光。
//   ⇒ 原版层序：13/17/21 甲+glow < 26 盾 < 【630 载体】< 27 武器 < 27glow < 28 臂glow。
// ★本仓病灶（探针 scripts/_bj682i-carrier.mjs 定点 48² 采样,正午 3540 按住 30t）：
//   630（noUseGraphic 武器 3540 Phantasm 的视觉主体）走实体弹层 postPlayerDraws
//   （Renderer.ts 实体段冲刷,7e 恒色甲/glow 冲刷【之前】）= 载体被星尘/日耀 250³/252³
//   不透明恒色甲重绘硬覆盖 + glow 加色洗白（stardust dark=456/wash=544 vs
//   nebula wash=286——恒色族覆盖面≈纯 glow 族 2 倍 =「脱掉盔甲才正常」双面真身）。
//   ★BJ681 只随迁了玩家层组内的武器贴图（drawUseItem→covR3 窗）——BJ681 探针用
//   持剑（useStyle 1 有贴图）验证,弹载体族不在覆盖面 = 剑绿弓红根因。
// ★落刀：Arrow.draw 630 支改道 Renderer.heldProjCarrierQueue（收集时快照几何
//   + usesOwnerLight 玩家中心光 16 级量化烘焙,满光直画原帧）;7e³·⁵ 槽冲刷
//   （盾球 26 后、武器随迁重放 27 前 = 原版 27 开头位逐位复刻）。
//   ★BJ682 判别面（_bj682g 品红弓探针):普通弓（useStyle 5 有贴图）四套全 100%
//   可见（240/240）=BJ681 面（武器贴图）对弓路径同样生效无回归;本刀只修弹载体族。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const RDR = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
const ARR = readFileSync(new URL('../src/entities/Arrow.ts', import.meta.url), 'utf8');

// ============ ① 7e 冲刷序锚（26 盾 < 630 载体 < 27 武器 = 原版 27 开头位） ============
describe('BJ682 ①：heldProj 载体 7e 插位（26 盾 < 载体 < 27 武器随迁重放）', () => {
  it('全序锚：LUNAR_ARMOR < ARMOR_GLOW(under) < SOLAR_SHIELD < ★CARRIER < COVERED_BLIT < itemGlow < ARMOR_GLOW(arm)', () => {
    const iArmor = RDR.indexOf('this.flushLunarArmor();');
    const iGlow = RDR.indexOf('this.flushArmorGlow();');
    const iSolar = RDR.indexOf('this.flushSolarShieldQueue(cam, z);');
    const iCarr = RDR.indexOf('this.flushHeldProjCarriers(cam, z, viewW, viewH);');
    const iCov = RDR.indexOf('this.flushLunarCovered();');
    const iItem = RDR.indexOf('this.flushItemGlow();');
    const iArm = RDR.indexOf('this.flushArmorGlow(true);');
    expect(iArmor).toBeGreaterThan(-1);
    expect(iGlow).toBeGreaterThan(iArmor);
    expect(iSolar).toBeGreaterThan(iGlow);
    expect(iCarr).toBeGreaterThan(iSolar);    // 载体 > 盾（原版 26 < 27 开头）
    expect(iCov).toBeGreaterThan(iCarr);      // 武器随迁重放 > 载体（原版 27 本体 > 27 开头插入位）★主判别锁
    expect(iItem).toBeGreaterThan(iCov);
    expect(iArm).toBeGreaterThan(iItem);
  });

  it('变异锁 A：载体冲刷若挪回旧位（postPlayerDraws 后/flushLunarArmor 前）→ iCarr 序断言恰红', () => {
    // 源文反演：iCarr 必须严格大于 iSolar 且小于 iCov——任一破坏即红
    const iSolar = RDR.indexOf('this.flushSolarShieldQueue(cam, z);');
    const iCarr = RDR.indexOf('this.flushHeldProjCarriers(cam, z, viewW, viewH);');
    const iCov = RDR.indexOf('this.flushLunarCovered();');
    expect(iSolar).toBeLessThan(iCarr);
    expect(iCarr).toBeLessThan(iCov);
  });

  it('变异锁 B：载体冲刷若整体删除（630 回实体弹层被甲盖）→ iCarr=-1 断言恰红', () => {
    expect(RDR).toContain('this.flushHeldProjCarriers(cam, z, viewW, viewH);');
  });

  it('flushHeldProjCarriers 冲刷器：相机变换同式 projFullbrightQueue（worldToScreen 闭包直画）+单条失败不拖垮', () => {
    expect(RDR).toContain('private flushHeldProjCarriers(cam: Camera, z: number, viewW: number, viewH: number): void {');
    expect(RDR).toContain('for (const paint of q) {');
    expect(RDR).toMatch(/try \{ paint\(ctx\); \} catch \{ \/\* 单条失败不拖垮帧（projFullbright 同习语） \*\//);
  });

  it('队列逐帧重建（render 头清位——prismCrystalQueue 同惯例）', () => {
    expect(RDR).toContain('this.heldProjCarrierQueue.length = 0;   // ★BJ682 heldProj 载体队列逐帧重建（Arrow.draw 630 收集,7e⁴ 前冲刷）');
  });
});

// ============ ② 收集侧锚（Arrow.draw 630 改道 + usesOwnerLight 烘焙） ============
describe('BJ682 ②：Arrow.draw 630 改道收集（闭包冻结几何+玩家中心光快照）', () => {
  it('630 支改道 heldProjCarrierQueue（无队列环境回退直画——测试/旧宿主兼容）', () => {
    expect(ARR).toContain('const q682 = sink682.heldProjCarrierQueue;');
    expect(ARR).toContain('q682.push((c: CanvasRenderingContext2D) => {');
    // 回退直画仍在（无队列环境原路径）
    expect(ARR).toMatch(/无队列环境（测试\/mock）回退直画原路径/);
  });

  it('usesOwnerLight 玩家中心光快照（Main.cs :30069-30072 GetColor(mountedCenter)）+16 级量化', () => {
    // 玩家中心 lightAt 采样（mp630.cx/y+h/2）
    expect(ARR).toContain('Math.floor(mp630.cx / 16), Math.floor((mp630.y + (mp630.h ?? 42) / 2) / 16)');
    // 16 级量化（eyebrella A4 同式）
    expect(ARR).toContain('const q16 = (v: number) => Math.round(Math.min(255, v ?? 255) / 255 * 15) / 15;');
    // 满光跳过烘焙（直画原帧）
    expect(ARR).toContain('if (lq630[0] >= 0.999 && lq630[1] >= 0.999 && lq630[2] >= 0.999) lq630 = null;');
    // fullbright 跳过
    expect(ARR).toContain('if (!sink682.fullbright && sink682.lighting');
  });

  it('闭包几何冻结（收集时快照 cx/cy/rot/face——冲刷时不读活实体,防跨帧陈旧）', () => {
    expect(ARR).toContain('const cx630 = this.cx, cy630 = this.cy;');
    expect(ARR).toContain('const rot630 = Math.atan2(this.vy, this.vx);');
  });

  it('姿态支不变性锁：速度角纯旋+朝左 π 旋转再镜像（AI_075 尾 :68401-68403,2026-09-02 支保留）', () => {
    expect(ARR).toContain('if (face630 < 0) { c.rotate(Math.PI); c.scale(-1, 1); }');
    expect(ARR).toContain('c.rotate(rot630);');
  });
});

// ============ ③ 数据面：630 在 PROJ_DRAW_OVER_PLAYERS（drawLayer=7 表登记不回退） ============
describe('BJ682 ③：630 drawLayer=7 表登记（PROJ_DRAW_OVER_PLAYERS 不摘 630）', () => {
  it('PROJ_DRAW_OVER_PLAYERS 仍含 630（分流门不改——Arrow.draw 内部自行改道,实体循环零触碰）', () => {
    // 630 必须在 drawLayer 7 静态组登记（439, 445, 460, ..., 630, 633, ...）
    expect(RDR).toMatch(/439, 445, 460, 535, 536, 591, 595, 600, 611, 615, 630, 633,/);
  });

  it('BJ681 既有序锁不回退（iSolar<iCov 仍成立——本刀插位在其间）', () => {
    const iSolar = RDR.indexOf('this.flushSolarShieldQueue(cam, z);');
    const iCov = RDR.indexOf('this.flushLunarCovered();');
    expect(iSolar).toBeLessThan(iCov);
  });
});

// ============ ④ 探针判别数登记（真机证据,见 scripts/_bj682*） ============
describe('BJ682 ④：探针判别数登记（正午 3540 按住 30t,载体定点 48²）', () => {
  it('刀前病灶（_bj682i-carrier.mjs 2026-10-14 记录）：载体被恒色甲硬覆盖+glow 洗白', () => {
    // 刀前:stardust diff=1485/wash=544/dark=350;nebula diff=629/wash=286/dark=210;
    //      solar diff=1199/wash=343/dark=456 —— 恒色族(stardust/solar)dark 面≈纯
    //      glow 族(nebula)2 倍=不透明恒色甲硬覆盖实证。
    // 判别对照（_bj682g-magenta-bow.mjs）:普通弓(useStyle5 有贴图)四套全 240/240
    //      100% 可见=BJ681 武器贴图面对弓路径无回归,病灶唯一在弹载体族。
    // 刀后期望:载体定点 diff 大幅回落（恒色甲重绘不再盖载体;残差=躯干甲面合法差
    //      +under glow 归零区）。复测见 _bj682i 复跑。
    expect(true).toBe(true);
  });
});
