// BJ504（2026-10-05）GetAlpha 白提亮 40%（NPC.cs:94679-94684,type 395/519 同族——
// BJ503 登记债,渲染域）。
// 原版定谳链（1457 亲读,1458 对拍同号零变更）：
//   · GetAlpha 早退支 :94679-94684：`if (type == 395 || type == 519)
//     { newColor = Color.Lerp(newColor, Color.White, 0.4f); return newColor; }`
//     ——绕过缺省尾（rgb×num/A=num5 全不乘）:tint.rgb=lerp(光照,255,0.4)、
//     tint.A=光照.A。395=MartianSaucerCore（NPCID.cs:11861）、519=SolarGoop
//     （:12109,游戏名 Solar Spore）。两型 SetDefaults alpha=0（519 :15446-15456、
//     395 无 alpha 写点）→ num=1,与缺省面差=纯白提亮项。
//   · 色链：body=GetAlpha(npcColor)（519 case :24637 / 395 case 392-395 :24953;
//     npcColor=Lighting.GetColor 中心格 :23115+debuff 染色 :23170）。519 拖影粉
//     （:24643-24649 直用 Color.Pink）与 395 GlowMask[49]（:24957 固定色）不经
//     GetAlpha=不提亮（本仓 drawSolarGoopGhosts/drawNpcGlow 已同相,不涉本刀）。
//   · 机制定谳：本仓光照=compositeLight 全屏事后乘,白提亮的加性白项不可在层内
//     预乘表达（lerp(L,W,a)=a+(1−a)L 非常数通道向量,duke370 预乘对=通道因子域
//     不覆盖）→ 走【双绘】drawFairyBright 判例（583-585 同形支 Lerp(·,White,0.5)
//     :94662-94665,本仓 Renderer 7d' 光照合成后 α=0.5 复绘同帧=精确等价）。
//     等价式：a·s+(1−a)·(s·L) ≡ s·lerp(L,White,a)（对任意 a 成立,0.4 同式）。
// 落刀：npcExtraParts.npcWhiteLiftAlpha 纯门（0.4 钉值）+ Renderer.drawEnemy 本体
//   位捕获变换入队 + 7d' 段 source-over α=0.4 复绘（本体同枢零漂移,帧头清队列）。
// 断言面：
//   A. 钉值——395/519 → 0.4 恒等;非同族（392-394 部件/516/518 同柱邻型/583-585、
//      681、636 lerp 族他档/370 BJ325 域）→ null 零回归。
//   B. 算式——实数域恒等式逐点精确 + 字节域（XNA Lerp 截断）|repo−vanilla|≤1。
//   C. 接线——收集守卫/队列字段/消费循环/α 消费/帧头清/槽序（7d' 内,先于 7d'''）。
//   D. 变异自证——M1 摘 0.4→0.5=钉值红;M2 反转收集守卫=接线红（逐字节还原+sha256）。
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { npcWhiteLiftAlpha } from '../src/render/npcExtraParts';

const RENDERER = join(process.cwd(), 'src', 'render', 'Renderer.ts');
const PARTS = join(process.cwd(), 'src', 'render', 'npcExtraParts.ts');

// ===================== A. 钉值（:94679 两型同档 0.4） =====================
describe('BJ504 A. 白提亮因子钉值', () => {
  it('395/519 → 0.4（逐字门,值恒等）', () => {
    expect(npcWhiteLiftAlpha(395)).toBe(0.4);   // MartianSaucerCore
    expect(npcWhiteLiftAlpha(519)).toBe(0.4);   // SolarGoop（Solar Spore）
    expect(npcWhiteLiftAlpha(519)).not.toBe(0.5);   // 非 583-585 档
    expect(npcWhiteLiftAlpha(519)).not.toBe(0.25);  // 非 636 档
  });
  it('非同族 → null（同柱邻型/部件/lerp 族他档/BJ325 域零回归）', () => {
    for (const vid of [392, 393, 394,          // 飞碟母碟/炮塔/炮体（缺省尾,无白提亮）
      516, 518, 520,                           // 日耀耀斑/长枪手/邻型
      583, 584, 585,                           // 仙灵 0.5 档（drawFairyBright 域,不在 :94679 门）
      681, 636, 665, 655,                      // 其他 lerp/覆写档
      370, 372, 373]) {                        // BJ325 预乘对域（通道因子,非白提亮）
      expect(npcWhiteLiftAlpha(vid)).toBeNull();
    }
    expect(npcWhiteLiftAlpha(-1)).toBeNull();  // 哨兵（vanillaId 缺省）
  });
});

// ===================== B. 算式（双绘 α=0.4 等价性） =====================
describe('BJ504 B. 双绘等价算式', () => {
  const a = 0.4;
  it('实数域恒等式：a·s+(1−a)·(s·L) ≡ s·lerp(L,White,a)（逐点精确）', () => {
    for (const L of [0, 0.05, 0.1, 0.25, 0.4, 0.5, 0.7, 0.9, 1]) {
      for (const s of [0, 17, 64, 128, 200, 255]) {
        const repo = a * s + (1 - a) * (s * L);            // 复绘面 + 已乘光本体面
        const vanilla = s * (L + (1 - L) * a);             // GetAlpha 白提亮 tint
        expect(Math.abs(repo - vanilla)).toBeLessThanOrEqual(1e-9);
      }
    }
  });
  it('字节域：XNA Lerp 截断界内 |repo−vanilla| ≤ 1（0-255 尺度）', () => {
    // 原版 tint 字节=trunc(L+(255−L)·a)（Color.Lerp→byte 截断,127.5→127 判例）,
    // 终像素=tex·tintByte/255;本仓=0.4·tex+0.6·(tex·L/255)（canvas 混合浮点）。
    const tintByte = (L: number) => Math.trunc(L + (255 - L) * a);
    for (const L of [0, 30, 102, 150, 200, 230, 255]) {
      for (const tex of [0, 51, 128, 200, 255]) {
        const vanilla = (tex * tintByte(L)) / 255;
        const repo = a * tex + (1 - a) * ((tex * L) / 255);
        expect(Math.abs(repo - vanilla)).toBeLessThanOrEqual(1);   // 截断 ≤1 tint 字节
      }
    }
  });
  it('端点钉值：暗处(L=0)→终亮度 0.4·tex（白提亮主面）/全亮(L=255)→恒等无偏差', () => {
    // L=0：tint 字节=trunc(0.4·255)=102=0.4·255 → repo 0.4·tex 精确（夜间 519 提亮主判据）
    expect(Math.trunc(0 + (255 - 0) * 0.4)).toBe(102);
    expect(0.4 * 200 + 0.6 * 0).toBeCloseTo((200 * 102) / 255, 9);
    // L=255：tint=255 → 恒等（提亮在强光下无操作,白天对拍零漂移面）
    expect(Math.trunc(255 + (255 - 255) * 0.4)).toBe(255);
    expect(0.4 * 200 + 0.6 * 200).toBeCloseTo(200, 9);
  });
});

// ===================== C. 接线（收集/消费/槽序,源码锚） =====================
describe('BJ504 C. Renderer 接线', () => {
  const src = readFileSync(RENDERER, 'utf8');
  it('收集守卫在 drawEnemy 本体链尾（守卫原文+捕获字段全量）', () => {
    expect(src).toContain('npcWhiteLiftAlpha(e.vanillaId ?? -1) !== null');
    expect(src).toContain('this.npcWhiteLiftQueue.push({');
    expect(src).toContain('rot: gRot, mirror: gMirror, scale, by: bodyY,');   // 本体捕获零漂移
    expect(src).toContain('tex: `vanilla/NPC_${e.vanillaId}.png`,');
    // 收集位在本体锚（bodyY）与 BJ237 残影源（gRot 判定）之后=同帧值
    expect(src.indexOf('const bodyY = anchorY')).toBeLessThan(
      src.indexOf('npcWhiteLiftAlpha(e.vanillaId ?? -1) !== null'));
  });
  it('消费在 7d\' 段（光照合成后 source-over α=0.4,本体同枢重放;★BJ-C1 F4 方法化 flushNpcWhiteLift 重锚+F1 ga 恒量档）', () => {
    expect(src).toContain('for (const q of this.npcWhiteLiftQueue) {');
    // ★BJ-C1 F1：q.ga 显式档优先（516 恒量复绘）,缺省仍走 lerp 白提亮档
    expect(src).toContain('ctx.globalAlpha = q.ga ?? npcWhiteLiftAlpha(q.vid) ?? 0.4;');
    expect(src).toContain("ctx.globalCompositeOperation = 'source-over';");
    // ★BJ551 重锚（2026-10-07）：imgL→imgT（消费扩 tint 烘焙档——恒色族 289/694
    //  保形染帧;无 tint 项 imgT=imgL 恒等路径,BJ504 α 复绘行为零变）
    expect(src).toContain('ctx.drawImage(imgT, 0, q.sy, q.sw, q.sh, -q.sw / 2, q.by, q.sw, q.sh);');
    // ★BJ-C1 F4：render 内调用位保持（方法化=行为零变）
    expect(src).toContain('this.flushNpcWhiteLift(cam, z, viewW, viewH);');
  });
  it('槽序：先于 7d\'\'\' 四塔消费、晚于 drawFairyBright 判例行（同 7d\' 自发光域）', () => {
    const fairy = src.indexOf('this.drawFairyBright(ent);');
    const consume = src.indexOf('for (const q of this.npcWhiteLiftQueue) {');
    const tower = src.indexOf('for (const q of this.towerGlowQueue) {');
    expect(fairy).toBeGreaterThan(0);
    expect(consume).toBeGreaterThan(fairy);    // 7d' 域内（fairy 分支后）
    expect(consume).toBeLessThan(tower);       // 7d''' 之前
  });
  it('帧头清队列（towerGlowQueue 同惯例,防跨拍滞留）', () => {
    expect(src).toContain('this.npcWhiteLiftQueue.length = 0;');
    const clear = src.indexOf('this.npcWhiteLiftQueue.length = 0;');
    const towerClear = src.indexOf('this.towerGlowQueue.length = 0;');
    expect(clear).toBeGreaterThan(0);
    expect(Math.abs(clear - towerClear)).toBeLessThan(200);   // 同帧头重建组
  });
  it('纯门单源（消费侧 α 亦经 npcWhiteLiftAlpha,无双写 0.4 分叉面）', () => {
    const parts = readFileSync(PARTS, 'utf8');
    expect(parts).toContain('if (vid === 395 || vid === 519) return 0.4;   // :94679 两型同档 0.4');
  });
});

// ===================== D. 变异自证（原子+逐字节还原+sha256 对拍） =====================
describe.skipIf(process.env.SW_BJ504_MUT)('BJ504 D. 变异自证', () => {
  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj504-spore-alpha-boost.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_BJ504_MUT: '1' },   // ★子进程豁免变异面（对变异文件跑 A-C 面）
    });
  const sha256 = (b: string) => createHash('sha256').update(b).digest('hex');

  it('M1 白提亮因子 0.4→0.5（formula 漂移）→ 钉值断言红', () => {
    const FILE = PARTS;
    const PRISTINE = readFileSync(FILE, 'utf8');
    const TRIGGER = 'if (vid === 395 || vid === 519) return 0.4;   // :94679 两型同档 0.4';
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(FILE, PRISTINE.replace(TRIGGER,
        'if (vid === 395 || vid === 519) return 0.5; // ★BJ504 变异:因子漂移'));
      const r = spawnVitest('395/519 → 0.4');
      expect(r.status).not.toBe(0);              // ★变异证红:0.4 恒等钉值
      expect(r.stdout).toContain('395/519 → 0.4');
    } finally {
      writeFileSync(FILE, PRISTINE);
    }
    const restored = readFileSync(FILE, 'utf8');
    expect(restored).toBe(PRISTINE);             // 逐字节还原
    expect(sha256(restored)).toBe(sha256(PRISTINE));   // sha256 对拍
  });

  it('M2 反转收集守卫（395/519 永不入队=特征整缺）→ 接线断言红', () => {
    const FILE = RENDERER;
    const PRISTINE = readFileSync(FILE, 'utf8');
    const TRIGGER = 'npcWhiteLiftAlpha(e.vanillaId ?? -1) !== null';
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(FILE, PRISTINE.replace(TRIGGER,
        'npcWhiteLiftAlpha(e.vanillaId ?? -1) === null // ★BJ504 变异:守卫反转'));
      const r = spawnVitest('收集守卫在 drawEnemy');
      expect(r.status).not.toBe(0);              // ★变异证红:守卫原文钉值
      expect(r.stdout).toContain('收集守卫在 drawEnemy');
    } finally {
      writeFileSync(FILE, PRISTINE);
    }
    const restored = readFileSync(FILE, 'utf8');
    expect(restored).toBe(PRISTINE);             // 逐字节还原
    expect(sha256(restored)).toBe(sha256(PRISTINE));   // sha256 对拍
  });
});
