// ★BJ584（2026-10-09）怪物血条反复镜像调转——判别面三锁。
// 用户实报：Windows 浏览器偶发一种怪物的血条反复镜像调转方向,丛林内和地狱均有复现。
//
// 定谳（Terarria1457 亲读,唯一标杆）：
//  · 血条面本体零镜像面——原版 DrawHealthBar（Main.cs:22115-22206）填充恒左锚
//    （num3 = X - 18f·scale 起笔,填充段 Hb1 rect(0,0,num2-2) 画在条框左沿）,
//    唯一翻转位 = 玩家重力倒置的 Y 向镜像（gravDir==-1,worldCanvas 整幅镜像在本仓
//    由 cam.flipY 承载,血条不读 facing）——「血条随朝向镜像」在原版与【本仓】均
//    不存在（本仓 drawHealthBar 1:1 复刻,行为级净室探针 scripts/_bj584-hb-*.mjs
//    实证:站桩火妖 facing R↔L 翻转 × acc/降级/2D 三管线 480 帧,填充左沿零跳变）。
//  · 真身 = 史莱姆全族【贴图镜像】语义偏差:原版 FindFrame case 组
//    （NPC.cs:71583-71615：1/16/59/71/81/138/147/183/184/204/225/333/334/335/336/
//    535/537/658/659/667/676——AI_001 史莱姆全族）【从不写 spriteDirection】
//    （组内仅 302/304 写;AI_001 方法体 60936-62469 亦零写点）→ 字段恒默认 -1 →
//    DrawNPC 翻面门（Main.cs:23357-23361 `spriteDirection == 1`）永不成立 =
//    原版史莱姆贴图从不镜像。本仓此前走通用 facing>0 镜像 = AI 转身/玩家横越即
//    左右翻;史莱姆贴图左右半 45-52% 不对称（NPC_59/71/1 首帧逐像素对拍）,翻面
//    实照可辨——带血条（受损）的史莱姆反复镜像调转 = 用户实报本体。
//    「丛林内和地狱均有复现」= 弹跳丛林史莱姆 204（丛林域）+ 熔岩史莱姆 59（地狱域）
//    同族双域;行为日志 v_59 钉位期间 dir -1→+1（x=37406 恒定）即每次翻面触发位。
//  · 同域登记不落刀（翻面频次不多于原版/瞬态面,非本案）:地狱蝠族 FindFrame
//    case 60 组 spriteDirection=sign(vx)（本仓=朝玩家 facing,悬停稳态偏恒向）;
//    火妖 FindFrame case 24 `velocity.Y==0` 才写（本仓恒随 facing,击退滞空瞬态）。
// 落刀：Renderer.SLIME_NO_MIRROR 表（= 原版 case 组 − {302,304}）+ drawEnemy 通用
//   镜像门 `!slimeNoMirror` 排除（恒原生朝向 ≙ 原版 spriteDirection 字段默认 -1）。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Renderer } from '../src/render/Renderer';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const npcSrc = existsSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const mainSrc = existsSync(join(ROOT, '../Terarria1457/Terraria/Main.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

/** 原版 FindFrame 史莱姆 case 组活体提取：定位 `case 1:` + `case 16:` + `case 59:`
 *  连排（FindFrame switch 内唯一）,收集连排 case（case 行间仅允许空白）直至断行。 */
function vanillaGroupIds(): number[] {
  const marker = npcSrc.indexOf('case 1:\n\t\tcase 16:\n\t\tcase 59:');
  expect(marker, 'FindFrame 史莱姆 case 组').toBeGreaterThan(0);
  const seg = npcSrc.slice(marker, marker + 1400);
  const ids: number[] = [];
  let last = 0;
  for (const m of seg.matchAll(/case (\d+):/g)) {
    const gap = seg.slice(last, m.index ?? 0);
    if (ids.length > 0 && !/^\s*$/.test(gap)) break;
    ids.push(Number(m[1]));
    last = (m.index ?? 0) + m[0].length;
  }
  return ids;
}

describe.skipIf(EXT_MISSING)('BJ584 史莱姆族原版「从不镜像」语义', () => {
  it('原版 FindFrame case 组内仅 302/304 写 spriteDirection（活体锚）', () => {
    const marker = npcSrc.indexOf('case 1:\n\t\tcase 16:\n\t\tcase 59:');
    const body = npcSrc.slice(marker, npcSrc.indexOf('case 488:', marker));
    // 组体第一条语句 = 302/304 特支写点（唯一 spriteDirection 写面）
    expect(body).toMatch(/if \(type == 302 \|\| type == 304\)\s*\{\s*spriteDirection = direction;/);
    // 组体内除该特支外零 spriteDirection 写点
    const writes = body.match(/spriteDirection\s*=/g) ?? [];
    expect(writes.length, '组体 spriteDirection 写点仅 1 处（302/304 特支）').toBe(1);
  });

  it('AI_001_Slimes 方法体零 spriteDirection 写点（AI 侧不翻面）', () => {
    const sig = npcSrc.indexOf('private void AI_001_Slimes()');
    expect(sig, 'AI_001_Slimes 定义').toBeGreaterThan(0);
    const body = npcSrc.slice(sig, sig + 120000).split('\n\tprivate void')[0];
    expect(body).not.toMatch(/spriteDirection\s*=/);
  });

  it('SLIME_NO_MIRROR ≡ 原版 case 组 − {302,304}（活体金标,原版组变化即爆红）', () => {
    const group = vanillaGroupIds();
    expect(group.length, 'case 组非空').toBeGreaterThan(15);
    const expected = new Set(group.filter((id) => id !== 302 && id !== 304));
    const actual = Renderer.SLIME_NO_MIRROR;
    expect(actual.size).toBe(expected.size);
    for (const id of expected) expect(actual.has(id), `缺 ${id}`).toBe(true);
    for (const id of actual) expect(expected.has(id), `多 ${id}`).toBe(true);
  });

  it('特判写点 302/304 与反翻族/有态族不入表（对照回归）', () => {
    for (const id of [302, 304, 3, 611, 689, 583, 584, 585, 618, 420, 546, 301]) {
      expect(Renderer.SLIME_NO_MIRROR.has(id), `${id} 不入表`).toBe(false);
    }
  });
});

describe.skipIf(EXT_MISSING)('BJ584 drawEnemy 通用镜像门消费', () => {
  it('通用 facing 镜像门带 !slimeNoMirror 排除（单点接线）', () => {
    expect(rendererSrc).toMatch(
      /const slimeNoMirror = Renderer\.SLIME_NO_MIRROR\.has\(idR\);/,
    );
    // ★BJ588：门表新增 !ffSdirMirror 排除（FindFrame case 48..664 死区档 15 型族
    // 收编 = 独立 ffSdir 显示面,与 SLIME_NO_MIRROR「从不镜像」正交——本族是
    // 「随 vx 有态镜像」族）——排除位插入在 !slimeNoMirror 之后,其余门序原样。
    expect(rendererSrc).toMatch(
      /if \(!rotationDriven && !slimeNoMirror && !ffSdirMirror && !owlMirror && !sdirNeg && !ravenMirror && !wormMirror && !snailMirror && !fairyMirror && !revFlipMirror && !eyeMirrorByVx && e\.facing > 0\) ctx\.scale\(-1, 1\);/,
    );
  });

  it('反翻族二门保持原样（回归：owl/sdirNeg/fairy/revFlip 档不被波及）', () => {
    expect(rendererSrc).toMatch(
      /if \(!rotationDriven && \(owlMirror \|\| sdirNeg \|\| fairyMirror \|\| revFlipMirror\) && e\.facing < 0\) ctx\.scale\(-1, 1\);/,
    );
  });
});

describe.skipIf(EXT_MISSING)('BJ584 血条面「不随朝向镜像」原版语义（本案定谳基面）', () => {
  it('drawHealthBar 体零 facing/scale(-1) 消费（血条几何与朝向解耦）', () => {
    const sig = rendererSrc.indexOf('private drawHealthBar(');
    expect(sig, 'drawHealthBar 定义').toBeGreaterThan(0);
    const body = rendererSrc.slice(sig, rendererSrc.indexOf('\n  private ', sig + 10));
    expect(body).not.toMatch(/\bfacing\b/);
    expect(body).not.toMatch(/scale\(-1/);
    // 填充恒左锚（原版 num3 = X - 18f·scale）
    expect(body).toMatch(/e\.cx - 18 \* scale/);
  });

  it('原版 DrawHealthBar 唯一翻转位 = 玩家重力 Y 镜像（活体锚,防原版语义漂移）', () => {
    const sig = mainSrc.indexOf('public void DrawHealthBar(float X, float Y, int Health, int MaxHealth, float alpha, float scale = 1f, bool noFlip = false)');
    expect(sig, 'DrawHealthBar 定义').toBeGreaterThan(0);
    const body = mainSrc.slice(sig, sig + 4600);
    expect(body).not.toMatch(/spriteDirection/);          // 不读朝向
    expect(body).toMatch(/gravDir == -1f && !noFlip/);    // 唯一翻转 = 重力倒置 Y 镜像
    expect(body).toMatch(/Rectangle\(0, 0, num2 - 2/);    // 填充段左锚源矩形
  });
});
