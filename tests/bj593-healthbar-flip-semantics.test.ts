// ★BJ593（2026-10-09）血条镜像偏转复验——用户澄清 BJ581：「黄蜂本身镜像没问题,
// 我说的是某些情况下血条会出现错误镜像偏转问题」+ 补充线索「荆鞭攻击,怪物有被标记,
// 不是必现」。
//
// 定谳（Terarria1457 亲读,唯一标杆）：
//  · 血条翻转语义:原版 DrawHealthBar（Main.cs:22115-22206）【零朝向消费】——
//    无 direction/spriteDirection/velocity 形参,全部 SpriteEffects.None+rotation 0f,
//    唯一翻转位 = 玩家重力倒置 Y 锚镜像（:22129 `gravDir == -1f && !noFlip` →
//    `num4 = screenHeight - (num4 - screenY)`）,填充恒左锚（num3 = X - 18f·scale,
//    Hb1 rect(0,0,num2-2) 画条框左沿;BJ584 已谳维持）。=> 蜂/蝠/幽灵等两字段分离型
//    （AI direction vs spriteDirection,BJ588 判例）血条哪边都不跟,恒水平恒同向。
//  · 「某些情况下偏转」真身 = 层序病:原版血条 = DrawInterface_14_EntityHealthBars
//    （Main.cs:46574-46983）= SetupDrawInterfaceLayers 接口层（:45473+ 表序亲读:
//    1_1 EmoteBubbles < 1_2 EntityMarkers < 4 Ruler < … < 14 EntityHealthBars <
//    15 Invasion < 16 Map）——在世界渲染+光照+滤镜链【之后】恒最上直绘,永不被
//    世界内容覆盖。本仓旧位 = y 排序实体循环内 per-enemy 立即画 → 后绘内容全盖条:
//    蜂群 y 序重叠相邻体/postPlayerDraws 鞭弧(旧 :6573,荆鞭反复扫过被标靶=
//    用户条件线索)/尘(:6651)/落叶/天气——血条被撕成亮斑/断片/错位,视觉读作
//    「错误镜像偏转」。BJ593 探针（scripts/_bj593-hb-*.mjs）行为实证:异常帧条内
//    断片（fillL/fillR 本体恒正确 = 非镜像非几何病,纯覆盖;弹幕重叠帧断片形貌同
//    弹痕）。BJ553 标记同病已挪全亮域而血条未同批 = 半断链。
//  落刀：实体循环四处 drawHealthBar 调用 → hbPass 收集面 + flushEntityHealthBars
//    全亮域单 pass（drawScreenFilterChain 之后 ≙ 原版 EndCapture 后接口段,
//    标记(1_2)/标尺(4)之后 = 表序,8 飘字之前）;drawHealthBar 屏空间化
//    （worldToScreen + flipY 锚镜像 :22129 原式,gd=1 逐位恒等;PointClamp）。
//  同层登记不落刀:DD2 倒计时(:46866 同层)/镇民"!"(:46855 同层)仍在原位;
//  原版 ShowLife/shimmerTransparency==0 门（:46605）本仓未建模。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Renderer } from '../src/render/Renderer';

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const mainSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8');
const npcids = readFileSync(join(ROOT, '../Terarria1457/Terraria.ID/NPCID.cs'), 'utf8');

// ---------------------------------------------------------------------------
// ① 原版血条翻转语义活体锚（原版语义漂移即爆红）
// ---------------------------------------------------------------------------
describe('BJ593 原版血条翻转语义锚', () => {
  const sig = mainSrc.indexOf('public void DrawHealthBar(float X, float Y, int Health, int MaxHealth, float alpha, float scale = 1f, bool noFlip = false)');
  const body = mainSrc.slice(sig, sig + 4600);

  it('DrawHealthBar 零朝向字段消费（direction/spriteDirection/velocity 全无）', () => {
    expect(sig, 'DrawHealthBar 定义').toBeGreaterThan(0);
    expect(body).not.toMatch(/\bspriteDirection\b/);
    expect(body).not.toMatch(/\bdirection\b/);
    expect(body).not.toMatch(/\bvelocity\b/);
    expect(body).not.toMatch(/\bfacing\b/);
  });

  it('唯一翻转位 = 玩家重力倒置 Y 锚镜像（:22129 原式,非 X 镜像非旋转）', () => {
    expect(body).toMatch(/if \(player\[myPlayer\]\.gravDir == -1f && !noFlip\)/);
    expect(body).toMatch(/num4 = screenPosition\.Y \+ \(float\)screenHeight - num4;/);
    // 全程 SpriteEffects.None + rotation 0f（零 X 翻转零旋转）
    expect((body.match(/SpriteEffects\.None/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(body).not.toMatch(/SpriteEffects\.FlipHorizontally/);
    expect((body.match(/, 0f, new Vector2/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('填充恒左锚：num3 = X - 18f·scale 起笔,Hb1 rect(0,0,num2-2) 画条框左沿', () => {
    expect(body).toMatch(/float num3 = X - 18f \* scale;/);
    expect(body).toMatch(/Rectangle\(0, 0, num2 - 2/);
  });

  it('血条 = 接口层 14,表序在标记(1_2)/标尺(4)之后、Invasion/Map 之前（层序锚）', () => {
    const iMarkers = mainSrc.indexOf('"Vanilla: Entity Markers"');
    const iRuler = mainSrc.indexOf('"Vanilla: Ruler"');
    const iBars = mainSrc.indexOf('"Vanilla: Entity Health Bars"');
    const iInvasion = mainSrc.indexOf('"Vanilla: Invasion Progress Bars"');
    const iMap = mainSrc.indexOf('"Vanilla: Map / Minimap"');
    expect(iMarkers).toBeGreaterThan(0);
    expect(iMarkers < iRuler && iRuler < iBars && iBars < iInvasion && iInvasion < iMap).toBe(true);
    // 层 delegate 直调 DrawInterface_14_EntityHealthBars（血条/!图标/倒计时同层）
    const sig14 = mainSrc.indexOf('private void DrawInterface_14_EntityHealthBars()');
    const seg = mainSrc.slice(sig14, mainSrc.indexOf('private void DrawInterface_7_', sig14));
    expect(seg).toMatch(/DrawHealthBar\(npc\[num2\]\.position\.X \+ \(float\)\(npc\[num2\]\.width \/ 2\)/);
    expect(seg).not.toMatch(/spriteDirection/);   // 层体零朝向消费
  });

  it('原版锚钉值:苔藓黄蜂=176/Hornet=42（两字段分离型代表,BJ581 id 勘误延续）', () => {
    expect(npcids).toContain('public const short MossHornet = 176;');
    expect(npcids).toContain('public const short Hornet = 42;');
  });
});

// ---------------------------------------------------------------------------
// ② 本仓落刀后行为锁（血条与朝向两字段全解耦 + 全亮域单 pass 层序）
// ---------------------------------------------------------------------------
describe('BJ593 本仓血条零朝向消费（两字段分离族逐型安全）', () => {
  const sig = rendererSrc.indexOf('private drawHealthBar(');
  const body = rendererSrc.slice(sig, rendererSrc.indexOf('\n  /**', sig + 10));

  it('drawHealthBar 体零 facing/ffSdir/direction 消费（蜂 176 tilt/FF_VXSDIR 22 型/ghostAI 全族不跟）', () => {
    expect(sig, 'drawHealthBar 定义').toBeGreaterThan(0);
    expect(body).not.toMatch(/\bfacing\b/);
    expect(body).not.toMatch(/\bffSdir\b/);
    expect(body).not.toMatch(/\bspriteDirection\b/);
    expect(body).not.toMatch(/\bdirection\b/);
    expect(body).not.toMatch(/\bscale\(-1/);
    expect(body).not.toMatch(/\bctx\.rotate\(/);   // 血条恒水平（rotation=vx*0.1 只作用于贴图）
  });

  it('填充恒左锚（BJ584 字面延续）+ 36px×比例 + 屏空间 u=scale·zoom 乘尺', () => {
    expect(body).toMatch(/e\.cx - 18 \* scale/);
    expect(body).toMatch(/Math\.floor\(\(36 \* hp\) \/ maxHp\)/);
    expect(body).toMatch(/const u = scale \* cam\.zoom;/);
    expect(body).toMatch(/x \+ fill \* u, y, 2 \* u, 12 \* u/);
  });

  it('flipY 锚镜像 = 原版 :22129 原式（gd=1 恒等;翻转态血条仍锚 npc 底 +10 侧）', () => {
    expect(body).toMatch(/cam\.flipY \? cam\.viewH - sy0 : sy0/);
    expect(body).toMatch(/cam\.worldToScreen\(wx, wy\)/);
  });
});

describe('BJ593 全亮域单 pass（实体循环零血条调用,层序 4<14 同相）', () => {
  it('实体循环内零 drawHealthBar 直调（收集面替代）', () => {
    // 收集面三支 + 镇民支
    expect((rendererSrc.match(/hbPass\.push\(/g) ?? []).length).toBe(4);
    // drawHealthBar 调用全仓唯一 = flushEntityHealthBars 内（★C13-F6 2026-10-11：
    //  玩家血条收编同 pass → NPC 漏斗+玩家漏斗共 2 站,均在 flush 内——「实体循环
    //  零直调,收集面替代」语义不变）
    const calls = [...rendererSrc.matchAll(/this\.drawHealthBar\(/g)].map((m) => m.index ?? 0);
    expect(calls.length, 'drawHealthBar 调用唯一（C13-F6 后=NPC+玩家双漏斗）').toBe(2);
    const flushSig = rendererSrc.indexOf('private flushEntityHealthBars(');
    expect(calls[0]).toBeGreaterThan(flushSig);
    expect(calls[1]).toBeGreaterThan(flushSig);
  });

  it('flush 调用位：drawScreenFilterChain 之后（≙ 原版 EndCapture 后接口段）、8 飘字之前', () => {
    const iFilter = rendererSrc.indexOf('this.drawScreenFilterChain(ctx, cam, player, viewW, viewH, z, world);');
    const iFlush = rendererSrc.indexOf('this.flushEntityHealthBars(hbPass, cam);');
    const iText = rendererSrc.indexOf('// 8. 飘字');
    expect(iFilter).toBeGreaterThan(0);
    expect(iFilter < iFlush && iFlush < iText).toBe(true);
    // BJ553 标记块 + 7a-pre 标尺在 flush 之前（原版表序 1_2 < 4 < 14）
    const iMarker = rendererSrc.indexOf('if (!player.dead && player.minionTargetId >= 0) {');
    const iRuler = rendererSrc.indexOf('7a-pre. 建筑配件标尺');
    expect(iMarker).toBeGreaterThan(0);
    expect(iMarker < iRuler && iRuler < iFlush).toBe(true);
  });

  it('flush 域 = 恒等变换 + PointClamp（BJ553 标记同款主画布域）', () => {
    const sig = rendererSrc.indexOf('private flushEntityHealthBars(');
    const body = rendererSrc.slice(sig, rendererSrc.indexOf('\n  /**', sig + 10));
    expect(body).toMatch(/ctx\.setTransform\(1, 0, 0, 1, 0, 0\)/);
    expect(body).toMatch(/ctx\.imageSmoothingEnabled = false/);
    // ★BJ665c：解构补取 hbAnchor + 第 4 参直传（C13-F5 锚死线接通;逐条目驱动语义不变）
    expect(body).toMatch(/for \(const \{ e, expert, hbAnchor \} of pass\) this\.drawHealthBar\(e, expert, cam, hbAnchor\);/);
  });
});

// ---------------------------------------------------------------------------
// ③ BJ581/BJ584 连续性（贴图镜像面不动,血条面解耦;两刀谳面不被本刀波及）
// ---------------------------------------------------------------------------
describe('BJ593 贴图镜像面连续性（BJ581/BJ584 谳面零波及）', () => {
  it('黄蜂族仍随 vx 镜像+倾斜（tiltOnly5 含 176;SLIME_NO_MIRROR 零交集）', () => {
    expect(rendererSrc).toMatch(
      /const tiltOnly5 = stR === 5 && \(idR === 23 \|\| idR === 42 \|\| idR === 139 \|\| idR === 176 \|\| idR === 205\s*\|\| idR === 210 \|\| idR === 211 \|\| \(idR >= 231 && idR <= 235\)\);/,
    );
    for (const id of [42, 176, 205, 231, 232, 233, 234, 235]) {
      expect(Renderer.SLIME_NO_MIRROR.has(id), `${id} 不入从不镜像表`).toBe(false);
    }
  });

  it('drawEnemy 通用镜像门原样（BJ584/BJ588 门序不动——贴图面与血条面正交）', () => {
    expect(rendererSrc).toMatch(
      /if \(!rotationDriven && !slimeNoMirror && !ffSdirMirror && !owlMirror && !sdirNeg && !ravenMirror && !wormMirror && !snailMirror && !fairyMirror && !revFlipMirror && !eyeMirrorByVx && e\.facing > 0\) ctx\.scale\(-1, 1\);/,
    );
    expect(rendererSrc).toMatch(
      /if \(!rotationDriven && \(owlMirror \|\| sdirNeg \|\| fairyMirror \|\| revFlipMirror\) && e\.facing < 0\) ctx\.scale\(-1, 1\);/,
    );
  });
});
