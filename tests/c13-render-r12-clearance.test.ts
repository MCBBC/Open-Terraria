// ★C13 玩家/渲染域清偿（红蓝 R12 findings F1-F9,2026-10-11）。
//
// 判别力设计（先定谳再动刀,每锁自带原版锚或行为面）：
//   F1 星旋潜行 A 通道渐隐（MED·判谳级）——原版 PlayerDrawLayers.cs:3602-3604
//     Lerp(One,(0,.12,.16,0),1-s) W=0 → W 因子=s;MultiplyRGBA(Utils.cs:2116-2120)
//     确乘 A。行为锁 = 深档 [7,37,47,7] + A≡R 因子全域扫（旧钉 255 判谳翻案）。
//   F2 幽魂套 socialGhost 整缺（MED）——Player.cs:37326-37328 门 + PlayerDrawSet.cs:
//     1489-1516 消费（皮肤族全 Transparent + 甲 A 钳 gFade）+ Main.cs:19752-19770
//     gFade 呼吸钟。行为锁 = advanceGhostAureole 相位面（60fps 定步字节域 99..151）。
//   F3/F4 教徒 439/440+690 血条排除（MED/LOW）——Main.cs:46710 门 1:1。
//   F5 毁灭者/蠕虫血条锚+α（LOW）——Main.cs:46714-46752 destroyerHB 平滑+α=(B+1)/2;
//     :46902-46911 蠕虫头尾中点。行为锁 = 平滑式/中点式/α 式源码字面。
//   F6 PvP 玩家血条升级（LOW）——Main.cs:46882-46900 贴图版+门（无 hostile）+
//     stealth×Brightness alpha。
//   F7 显示门变异逃逸（LOW）——原版 :46606 life!=lifeMax 门;补满血不画断言。
//   F8 学徒火 body205 抖动 y 反号（LOW）——PlayerDrawLayers.cs:3673
//     RandomInt(-10,1)×0.15=[-1.5,0]（position 位同本体式,origin 反向系误读）。
//   F9 注释病两处（LOW）——solarOutlineStamps k 行注释订正 + Grox ±0.125px 登记。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  heldItemStealthDim, applyStealthToColor,
} from '../src/render/heldItemStealthDim';
import { advanceGhostAureole, resetGhostAureole } from '../src/render/Renderer';

const ROOT = join(__dirname, '..');
const RDR = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const HSD = readFileSync(join(ROOT, 'src/render/heldItemStealthDim.ts'), 'utf8');
const PAPER = readFileSync(join(ROOT, 'src/player/PaperDoll.ts'), 'utf8');
const PLAYER_TS = readFileSync(join(ROOT, 'src/entities/Player.ts'), 'utf8');
const AGLOW = readFileSync(join(ROOT, 'src/data/vanillaArmorGlow.ts'), 'utf8');
const mainSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8');
const playerSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Player.cs'), 'utf8');
const pdsSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria.DataStructures/PlayerDrawSet.cs'), 'utf8');
const pdlSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria.DataStructures/PlayerDrawLayers.cs'), 'utf8');
const utilsSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Utils.cs'), 'utf8');

// ===================== F1 星旋潜行 A 通道（判谳级） =====================

describe('C13-F1 星旋潜行 A 因子 = s（原版锚+行为）', () => {
  it('原版锚:Lerp 目标 W=0（PlayerDrawLayers.cs:3602-3604）+ MultiplyRGBA 乘 A（Utils.cs）', () => {
    const i = pdlSrc.indexOf('if (drawinfo.drawPlayer.setVortex && (flag | flag2))');
    expect(i, 'setVortex 支在位').toBeGreaterThan(0);
    const seg = pdlSrc.slice(i, i + 400);
    expect(seg).toContain('Vector4.Lerp(Vector4.One, new Vector4(0f, 0.12f, 0.16f, 0f), 1f - num3)');
    expect(utilsSrc).toContain(
      'return new Color((byte)((float)(firstColor.R * secondColor.R) / 255f), (byte)((float)(firstColor.G * secondColor.G) / 255f), (byte)((float)(firstColor.B * secondColor.B) / 255f), (byte)((float)(firstColor.A * secondColor.A) / 255f));',
    );
  });

  it('行为:深档 s=0.03 → White×[7,37,47,7]（旧钉 [7,37,47,255] 系 W 因子=1 误读）', () => {
    const d = heldItemStealthDim({
      stealth: 0, shroomiteSet: false, vortexSet: true,
      drawUseStyle: false, drawHoldStyle: true, ranged: false,
    })!;
    expect(d.vortexBytes).toEqual([7, 37, 47, 7]);
    expect(applyStealthToColor([255, 255, 255, 255], d)).toEqual([7, 37, 47, 7]);
  });

  it('行为:A 因子 ≡ R 因子（同式 1-k,17 档全域扫——分叉即两套结构）', () => {
    for (const s of [0, 0.015, 0.03, 0.045, 0.06, 0.08, 0.1, 0.2, 0.33, 0.5, 0.66, 0.75, 0.9, 0.96, 0.99]) {
      const d = heldItemStealthDim({
        stealth: s, shroomiteSet: false, vortexSet: true,
        drawUseStyle: false, drawHoldStyle: true, ranged: false,
      })!;
      const v = d.vortexBytes!;
      expect(v[3], `s=${s}`).toBe(v[0]);
      expect(v[0] + v[3], `s=${s} 恒等档`).toBeGreaterThan(0);
    }
  });

  it('源码锁:vortexBytes 第 4 分量 = truncByte((1-k)*255)（非 255 钉值）', () => {
    expect(HSD).toMatch(
      /vortexBytes = \[truncByte\(\(1 - k\) \* 255\), truncByte\(\(1 - 0\.88 \* k\) \* 255\),\s*\n\s*truncByte\(\(1 - 0\.84 \* k\) \* 255\), truncByte\(\(1 - k\) \* 255\)\];/,
    );
    expect(HSD).not.toMatch(/0\.84 \* k\) \* 255\), 255\]/);
  });
});

// ===================== F2 socialGhost 幽魂套 =====================

describe('C13-F2 socialGhost 幽灵化外观（门+gFade 呼吸钟+皮肤/甲 α 面）', () => {
  it('原版锚:全套门（Player.cs:37326-37328）', () => {
    expect(playerSrc).toContain(
      'if ((drawPlayer.head == 101 || drawPlayer.head == 156) && drawPlayer.body == 66 && drawPlayer.legs == 55)',
    );
    expect(playerSrc).toContain('socialGhost = true;');
  });

  it('原版锚:皮肤族全 Transparent + 甲 A 钳 Main.gFade（PlayerDrawSet.cs:1489-1516）', () => {
    const i = pdsSrc.indexOf('if (drawPlayer.socialGhost)');
    const seg = pdsSrc.slice(i, i + 800);
    expect(seg).toContain('colorEyeWhites = Color.Transparent;');
    expect(seg).toContain('colorHair = Color.Transparent;');
    expect(seg).toContain('colorHead = Color.Transparent;');
    expect(seg).toContain('colorBodySkin = Color.Transparent;');
    expect(seg).toContain('if (colorArmorHead.A > Main.gFade)');
    expect(seg).toContain('if (colorArmorBody.A > Main.gFade)');
    expect(seg).toContain('if (colorArmorLegs.A > Main.gFade)');
  });

  it('原版锚:gFade 呼吸钟 ±0.1/帧,>150 转降/<100 转升（Main.cs:19752-19770）', () => {
    const i = mainSrc.indexOf('private static void DoUpdate_AnimateVisualPlayerAura()');
    const seg = mainSrc.slice(i, i + 560);
    expect(seg).toContain('gFader += 0.1f;');
    expect(seg).toContain('gFade = (byte)gFader;');
    expect(seg).toContain('if (gFade > 150)');
    expect(seg).toContain('gFader -= 0.1f;');
    expect(seg).toContain('if (gFade < 100)');
  });

  it('本仓门:dollEquip visual 槽 101/156+66+55（drawPlayer）', () => {
    expect(RDR).toMatch(
      /const socialGhost = !!accDollEquip\s*\n\s*&& \(accDollEquip\.head === 101 \|\| accDollEquip\.head === 156\)\s*\n\s*&& accDollEquip\.body === 66 && accDollEquip\.legs === 55;/,
    );
  });

  it('本仓消费:皮肤层整支跳画 + 甲 A ×ghostA + 眼睑双站门 + 发叠层 ghostA', () => {
    expect(RDR).toContain('if (stealthClamp >= 1 && !socialGhost) {');
    expect(RDR).toMatch(/if \(!socialGhost\) \{\s*\n\s*const s2 = stF\.skinMul;/);
    expect(RDR).toContain('ctx.globalAlpha = ga2 * stealthClamp * ghostA;');
    expect(RDR).toContain('if (!headFaceDrawn && !socialGhost) this.drawEyelid(');
    expect((RDR.match(/if \(!socialGhost\) this\.drawEyelid\(/g) ?? []).length).toBe(1);
    expect((RDR.match(/drawDollHairOverlays\(p, dollEquip, row, pad, hairCol, (?:true|false), ghostA\)/g) ?? []).length).toBe(2);
    // 甲下皮肤垫整隐（PaperDoll ghostSkin 通道+缓存键）
    expect(PAPER).toContain('ghostSkin?: boolean');
    expect(PAPER).toContain("(opts?.ghostSkin ? '|gh' : '')");
    expect(PAPER).toMatch(/const showSkinUnderLegs = !sit && !LEGS_HIDE_SKIN\.has\(equip\?\.legs \?\? 0\) && !opts\?\.ghostSkin;/);
    expect(PAPER).toMatch(/if \(!HIDES_TOP_SKIN_BODIES\.has\(equip\?\.body \?\? 0\) && !opts\?\.ghostSkin\) \{/);
  });

  it('呼吸钟接线:render() 头步进（拍照分块豁免）+ 消费 = this._gFade / 255', () => {
    expect(RDR).toContain('if (!this._capturePass) this._gFade = advanceGhostAureole(performance.now());');
    expect(RDR).toContain('const ghostA = socialGhost ? this._gFade / 255 : 1;');
  });

  it('行为:gFade 呼吸钟相位面（60fps 定步——字节域 0..151 上升/99.. 下降,原版截断比较）', () => {
    resetGhostAureole();
    const STEP = 1000 / 60;
    let peak = -1;
    let trough = 256;
    let prev = -1;
    let roseOnly = true;
    for (let i = 1; i <= 2600; i++) {
      const fade = advanceGhostAureole(i * STEP);
      expect(fade).toBeGreaterThanOrEqual(0);
      expect(fade).toBeLessThanOrEqual(255);
      if (prev >= 0) {
        if (fade < prev) roseOnly = false;   // 出现下降 = 翻转发生过
      }
      prev = fade;
      if (fade > peak) peak = fade;
      if (roseOnly === false && fade < trough) trough = fade;
    }
    expect(peak, '上升沿顶点 = 151（gFader=151.0 截断>150 翻转）').toBe(151);
    expect(trough, '下降沿谷点 = 99（<100 翻转）').toBe(99);
    expect(roseOnly, '确有方向翻转（非单调）').toBe(false);
    // dt 缩放：2× 帧距一步 = 同位移（均值率不变）
    resetGhostAureole();
    const a = advanceGhostAureole(STEP);
    resetGhostAureole();
    const b = advanceGhostAureole(STEP * 2);
    expect(b).toBeCloseTo(a * 2, 6);
  });
});

// ===================== F3/F4 教徒 439/440+690 血条排除 =====================

describe('C13-F3/F4 血条 439/440(ai0==5 门)+690 无条件排除', () => {
  it('原版锚:Main.cs:46710 门', () => {
    expect(mainSrc).toContain(
      'if ((!expertMode || type != 266) && type != 690 && ((type != 439 && type != 440) || npc[num2].ai[0] != 5f))',
    );
  });

  it('本仓门:drawHealthBar 双站（690 早退 + 439/440 ai0!==5 早退）', () => {
    expect(RDR).toContain('if (e.vanillaId === 690) return;');
    expect(RDR).toContain('if ((e.vanillaId === 439 || e.vanillaId === 440) && e.ai0 !== 5) return;');
  });
});

// ===================== F5 毁灭者/蠕虫血条锚+α =====================

describe('C13-F5 毁灭者 destroyerHB 平滑+α=(B+1)/2;蠕虫头尾中点', () => {
  it('原版锚:毁灭者支（Main.cs:46714-46752——scale 1.5/平滑/α/realLife）', () => {
    expect(mainSrc).toContain('destroyerHB = (destroyerHB * 49f + vector) / 50f;');
    expect(mainSrc).toContain('num6 = (num6 + 1f) / 2f;');
    expect(mainSrc).toContain('destroyerHB = new Vector2(0f, 0f);');
  });

  it('原版锚:蠕虫中点（:46902-46911 DrawInterface_Healthbar_Worm）', () => {
    expect(mainSrc).toContain('Vector2 vector = (head.position + nPC.position) / 2f;');
    expect(mainSrc).toContain('DrawHealthBar(vector.X + (float)(head.width / 2), vector.Y + (float)(head.height / 2), head.life, head.lifeMax,');
  });

  it('本仓:平滑式/重置/α 式/中点式/scale 表', () => {
    expect(RDR).toContain('this._destroyerHB = { x: (this._destroyerHB.x * 49 + best.x) / 50, y: (this._destroyerHB.y * 49 + best.y) / 50 };');
    expect(RDR).toContain('this._destroyerHB = { x: 0, y: 0 };   // :46747-46750 else destroyerHB=(0,0)');
    expect(RDR).toContain('if (vid === 134 || vid === 135 || vid === 136) aQ = (aQ + 1) / 2;');
    expect(RDR).toContain('entry.hbAnchor = { x: (e.x + tail.x) / 2 + e.w / 2, y: (e.y + tail.y) / 2 + e.h / 2 };');
    expect(RDR).toMatch(/134, 135, 136, +\/\/ ★C13-F5 毁灭者/);
  });

  it('本仓:蠕虫头映射族表 = Main.cs:46743-46781 switch 1:1（12 头型）', () => {
    expect(RDR).toMatch(/const HB_WORM_MID_HEADS: ReadonlySet<number> = new Set\(\[\s*\n\s*7, 10, 39, 87, 95, 98, 117, 412, 454, 510, 513, 621,\s*\n\s*\]\);/);
  });
});

// ===================== F6 PvP 玩家血条升级 =====================

describe('C13-F6 玩家血条 = DrawHealthBar 贴图版+原版门+stealth α+全亮域收编', () => {
  it('原版锚:玩家段门（Main.cs:46886——active&&!ghost&&!dead&&!invis&&life!=lifeMax2,无 hostile）', () => {
    expect(mainSrc).toContain(
      'if (k != myPlayer && player[k].active && !player[k].ghost && !player[k].dead && !player[k].invis && player[k].statLife != player[k].statLifeMax2)',
    );
    expect(mainSrc).toContain('player[k].stealth * Lighting.Brightness(');
  });

  it('本仓:flush 内 remotePlayers 直读（stealthA 入参;无 hostile 门）', () => {
    const i = RDR.indexOf('private flushEntityHealthBars(');
    const seg = RDR.slice(i, RDR.indexOf('drawDd2CrystalCountdown', i));
    expect(seg).toContain('for (const rp of this.remotePlayers) {');
    expect(seg).toContain('if (rp.dead || rp.hp <= 0 || rp.hp >= rp.maxHp) continue;');
    expect(seg).toContain('stealthA: rp.stealth');
    expect(seg).not.toContain('rp.hostile');
  });

  it('旧自造 rect 条整组退役（fillRect 渐变+队伍色描边在血条域零残留）', () => {
    expect(RDR).not.toContain("ctx.fillStyle = 'rgba(0,0,0,0.6)';");
    expect(RDR).not.toContain('ctx.fillRect(x - 1, y - 1, 40, 2);');
    expect(RDR).not.toContain('ctx.fillRect(x, y, 38 * fill, 4);');
  });
});

// ===================== F7 显示门（满血不画）判别力 =====================

describe('C13-F7 血条显示门 life!=lifeMax（满血不画断言）', () => {
  it('原版锚:Main.cs:46606 life != lifeMax && ShowLife 门', () => {
    expect(mainSrc).toContain('if (npc[num2].life != npc[num2].lifeMax && npc[num2].ShowLife)');
  });

  it('本仓:drawHealthBar 满血/无血早退（变异逃逸补锁）', () => {
    const i = RDR.indexOf('private drawHealthBar(');
    const seg = RDR.slice(i, RDR.indexOf('/** ★C13-F5 血条入口档', i) > 0 ? RDR.indexOf('/** ★C13-F5 血条入口档', i) : i + 400);
    expect(seg).toContain('if (hp <= 0 || hp >= maxHp) return;');
  });
});

// ===================== F8 学徒火 body205 抖动 y 反号 =====================

describe('C13-F8 学徒火 body205 抖动 y∈[-1.5,0]（position 位,反号翻案）', () => {
  it('原版锚:body205 position 位抖动（PlayerDrawLayers.cs:3673-3683——+num4 直加,origin=bodyVect）', () => {
    const i = pdlSrc.indexOf('if (drawinfo.drawPlayer.body == 205)');
    const seg = pdlSrc.slice(i, i + 900);
    expect(seg).toContain('float num4 = (float)Utils.RandomInt(ref seed, -10, 1) * 0.15f;');
    expect(seg).toContain('new Vector2((float)(drawinfo.drawPlayer.bodyFrame.Width / 2) + num3, (float)(drawinfo.drawPlayer.bodyFrame.Height / 2) + num4)');
    // 对照组:head 211 同构直加（:2413-2418）——「origin 反向」论断不成立于两站
    const h = pdlSrc.indexOf('if (drawinfo.drawPlayer.head == 211)');
    const hseg = pdlSrc.slice(h, h + 1400);
    expect(hseg).toContain('+ drawinfo.drawPlayer.headPosition + drawinfo.headVect + new Vector2(x3, y)');
  });

  it('本仓:JITTER_APPR_BODY y = [-1.5,0]（旧 [0,1.5] 反号翻正+注释订正）', () => {
    expect(AGLOW).toMatch(/const JITTER_APPR_BODY: \[\[number, number\], \[number, number\]\] = \[\[-2, 2\], \[-1\.5, 0\]\];/);
    expect(AGLOW).not.toContain('[[-2, 2], [0, 1.5]]');
    expect(AGLOW).toContain('★C13-F8 翻案');
  });
});

// ===================== F9 注释病两处 =====================

describe('C13-F9 注释病订正（solarOutlineStamps shadow 语义 + Grox ±0.125px 登记）', () => {
  it('solarOutlineStamps k 行:乘子 = 1−shadow = 1−ghostFade（实现 k=1-ghostFade 对,旧歧义注释退役）', () => {
    expect(PLAYER_TS).not.toContain('// shadow=ghostFade 全通道乘');
    expect(PLAYER_TS).toContain('const k = 1 - ghostFade;');
    expect(PLAYER_TS).toContain('★C13-F9 注释订正');
    // 原版锚:GetImmuneAlphaPure num *= 1f - alphaReduction（Player.cs:54834-54846）
    expect(playerSrc).toMatch(/public Color GetImmuneAlphaPure\(Color newColor, float alphaReduction\)\s*\{\s*\n\s*float num = \(float\)\(255 - immuneAlpha\) \/ 255f;\s*\n\s*if \(alphaReduction > 0f\)\s*\n\s*\{\s*\n\s*num \*= 1f - alphaReduction;/);
  });

  it('Grox 抖动 ±0.125px 登记在案（JITTER_125 注释含登记语）', () => {
    expect(AGLOW).toMatch(/const JITTER_125: \[number, number\] = \[-1\.25, 1\.25\];/);
    expect(AGLOW).toContain('★C13-F9 登记');
  });
});
