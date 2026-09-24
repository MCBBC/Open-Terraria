// ★BJ325（2026-09-24,BJ312 债清偿）：NPC.GetAlpha type==370 蓝通道增亮整支接线。
// 原版锚（1457 亲读）：
//   GetAlpha(NPC.cs:94549-94559 头):num=(255−alpha)/255,num2/3/4=newColor.rgb×num,
//   num5=newColor.A−alpha;尾 :94826 return new Color(num2,num3,num4,num5)。
//   d370 支 :94684-94691:`if (type == 370 && ai[0] != -1f && ai[0] < 9f)
//   { num9 = MathHelper.Lerp(num, 1f, 0.25f); if (num9 > 1f) num9 = 1f;
//     num4 = (int)(newColor.B * num9); }` ——B 通道因子 num9>R/G 的 num。
//   α 域=AI_069_DukeFishron(NPC.cs:49498-49516):SolidCollision ? +15 : −15,钳[0,150]
//   （:49517+ ai0==-1 支同钳）→ 门活期 α∈[0,150]。
// 本仓 GetAlpha 等价面=灰度单系数 num 进 globalAlpha（光照 compositeLight 事后乘）,
// per-channel 无载体 → duke370PremulPair 预乘烘焙对（dustPremulBake 精确判例,
// tests/dust-premultiplied-blend 数值验证）：cRGB=(num,num,num9)、cA=num,
// 'destination-out'+​'lighter' 两步 = XNA AlphaBlend 逐字节精确。
// 消费面（Main.cs case 370 GetAlpha 调用点）：本体 :24800 / 基座拖影 :24738 /
//   基座爆发 :24792 接线;叠层爆发 :24849 经 GetAlpha 但 value81=Yellow×k(B=0)
//   → num9×0=0 数学恒等零观感（登记不接线）;叠层拖影/本体原文不经 GetAlpha。
// 判别面：G1 门表（372/373/ai0 端点/α 端点）G2 因子逐值 G3 预乘对字节=XNA 式
//   G4 面字节表（本体/拖影 decay/爆发 q16）G5 兜底（node 无 canvas → null 回退）
//   G6 源码锚（Renderer 本体两路+npcExtraParts 两环接线锁）。
// 变异锚 = duke370GetAlphaBoost 的 num9 公式（Lerp 0.25 臂）——改回 num → G2/G3/G4 红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { duke370GetAlphaBoost, duke370PremulPair } from '../src/render/npcExtraParts';
import { dustPremulBake } from '../src/fx/VanillaDust';

const GAME = process.cwd();   // vitest 工作目录 = game/

function mkDuke(ai0: number, spawnAlpha: number, vid = 370): Enemy {
  const e = Enemy.fromVanilla(vid, 20 * TILE, 52 * TILE)!;
  e.ai0 = ai0;
  e.spawnAlpha = spawnAlpha;
  return e;
}

describe('BJ325 GetAlpha d370 蓝通道增亮（NPC.cs:94684-94691）', () => {
  it('G1 门表：372/373 无支/ai0==-1·>=9 门外/α=0·255 端点 null,门内活', () => {
    expect(duke370GetAlphaBoost(mkDuke(2, 150, 372))).toBeNull();   // type==370 门逐字
    expect(duke370GetAlphaBoost(mkDuke(2, 150, 373))).toBeNull();
    expect(duke370GetAlphaBoost(mkDuke(-1, 150))).toBeNull();       // ai[0] != -1f
    expect(duke370GetAlphaBoost(mkDuke(9, 150))).toBeNull();        // ai[0] < 9f（9 不含）
    expect(duke370GetAlphaBoost(mkDuke(12, 150))).toBeNull();
    expect(duke370GetAlphaBoost(mkDuke(2, 0))).toBeNull();          // α=0 → num=1 → num9=1 恒等
    expect(duke370GetAlphaBoost(mkDuke(2, 255))).toBeNull();        // α=255 → 不可见
    expect(duke370GetAlphaBoost(mkDuke(2, 150))).not.toBeNull();    // 门内活
    expect(duke370GetAlphaBoost(mkDuke(4, 150))).not.toBeNull();    // ai0=4 变身窗仍活
    expect(duke370GetAlphaBoost(mkDuke(8, 150))).not.toBeNull();    // ai0=8 末态仍活
  });

  it('G2 因子逐值：num=(255−α)/255,num9=Lerp(num,1,0.25) 钳 1（α=150/75/15）', () => {
    const b150 = duke370GetAlphaBoost(mkDuke(2, 150))!;
    expect(b150.num).toBeCloseTo(105 / 255, 12);
    expect(b150.num9).toBeCloseTo(105 / 255 + (1 - 105 / 255) * 0.25, 12);   // 0.558823…
    expect(b150.num9).toBeGreaterThan(b150.num);
    const b75 = duke370GetAlphaBoost(mkDuke(2, 75))!;
    expect(b75.num).toBeCloseTo(180 / 255, 12);
    expect(b75.num9).toBeCloseTo(180 / 255 + (1 - 180 / 255) * 0.25, 12);    // 0.779411…
    const b15 = duke370GetAlphaBoost(mkDuke(2, 15))!;
    expect(b15.num).toBeCloseTo(240 / 255, 12);
    expect(b15.num9).toBeCloseTo(240 / 255 + (1 - 240 / 255) * 0.25, 12);
    expect(b15.num9).toBeLessThanOrEqual(1);
  });

  it('G3 预乘对字节=XNA AlphaBlend 式：add=texP×cRGB（B=num9）、erase.A=texA×cA', () => {
    // 合成 2×1 直色纹理：px0 不透明白底蓝亮 (100,60,200,255) / px1 半透 (200,100,50,128)
    const tex = new Uint8ClampedArray([100, 60, 200, 255, 200, 100, 50, 128]);
    const b = duke370GetAlphaBoost(mkDuke(2, 150))!;
    const mR = Math.round(255 * b.num), mB = Math.round(255 * b.num9), mA = Math.round(255 * b.num);
    expect([mR, mB, mA]).toEqual([105, 143, 105]);   // num9×255=142.5→143
    const { add, erase } = dustPremulBake(tex, mR, mR, mB, mA);
    // dustPremulBake 存面=【直色】回存（头注:rgb=aR×255/m、A=m=max(e,aR,aG,aB)）,
    // 浏览器 putImageData 后 'lighter' 合成时 premult=stored×A/255 还原 texP×cRGB。
    // px0: aR=41.18/aG=24.71/aB=112.16/e=105 → m=112.16: 存 (94,56,255,112)
    expect([add[0], add[1], add[2], add[3]]).toEqual([94, 56, 255, 112]);
    // 合成时 premult：94×112/255=41.3、56×112/255=24.6、255×112/255=112 —— 逐字节
    //   ≈ XNA out(dst=0 支)= texP×(mR,mR,mB) = (41.18,24.71,112.16),8bit 同精度
    expect(add[0] * add[3] / 255).toBeCloseTo(100 * mR / 255, 0);
    expect(add[1] * add[3] / 255).toBeCloseTo(60 * mR / 255, 0);
    expect(add[2] * add[3] / 255).toBeCloseTo(200 * mB / 255, 0);   // ★B 走 num9
    // add.A = max(e, premult rgb)（dustPremulBake α 过冲备案类:px0 亮蓝 112>105 过冲）
    expect(add[3]).toBe(112);
    // px1 半透：mR=mA → 直色 rgb 回环=tex 原值（B 除外,mB/mA=1.362 → 50×1.362=68）
    expect([add[4], add[5], add[6], add[7]]).toEqual([200, 100, 68, 53]);
    expect(erase[3]).toBe(105);      // e = 255×105/255 = 105
    expect(erase[7]).toBe(53);       // 128×105/255 = 52.7
    expect(erase[0]).toBe(0);        // erase 面只读 alpha,rgb 置 0
  });

  it('G4 面字节表：本体 decay=1 / 拖影 decay=9/15 / 爆发 q16（α=75 档）', () => {
    const b = duke370GetAlphaBoost(mkDuke(2, 75))!;   // num=180/255≈0.70588,num9≈0.77941
    const mBody = [Math.round(255 * b.num), Math.round(255 * b.num), Math.round(255 * b.num9), Math.round(255 * b.num)];
    expect(mBody).toEqual([180, 180, 199, 180]);      // 198.75→199
    // 拖影 i=1,num335=10 → decay=9/15=0.6：mR=round(180×0.6)=108,mB=round(198.75×0.6)=119
    const mTrail = [Math.round(255 * b.num * 0.6), Math.round(255 * b.num9 * 0.6)];
    expect(mTrail).toEqual([108, 119]);
    // 爆发 decay=0.5 → 原始 (90,99) → q16 (&~15) → (80,96)（amp 连续摆动的缓存界桩）
    const q16 = (v: number) => v & ~15;
    expect([q16(Math.round(255 * b.num * 0.5)), q16(Math.round(255 * b.num9 * 0.5))]).toEqual([80, 96]);
  });

  it('G5 兜底：node 无 DOM → duke370PremulPair 恒 null,调用方回退 source-over 直绘', () => {
    expect(duke370PremulPair({} as CanvasImageSource, { sx: 0, sy: 0, sw: 4, sh: 4 },
      105, 105, 143, 105, 't')).toBeNull();
  });

  it('G6 源码锚：本体两路+npcExtraParts 两环按门接线（防接线静默脱落）', () => {
    const renderer = readFileSync(resolve(GAME, 'src/render/Renderer.ts'), 'utf8');
    expect(renderer).toContain("duke370PremulPair(r.img, { sx: r.sx, sy: r.sy, sw: r.sw, sh: r.sh }");
    expect(renderer).toContain("'duke370body'");
    expect(renderer).toContain("'duke370tintbody'");
    expect(renderer).toContain('const boost370 = duke370GetAlphaBoost(e);');
    const parts = readFileSync(resolve(GAME, 'src/render/npcExtraParts.ts'), 'utf8');
    expect(parts).toContain("'duke370trail'");
    expect(parts).toContain("'duke370burst'");
    expect(parts).toContain("const boost = duke370GetAlphaBoost(e);");
  });
});
