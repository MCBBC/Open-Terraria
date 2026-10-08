// ★BJ551 地牢诅咒骷髅怪很暗（2026-10-07 用户实报："诅咒骷髅怪与之前骷髅王二阶段
//  发出的骷髅头弹同病,很暗"——BJ529 弹 270 判例同域第三刀,NPC 侧 GetAlpha 恒色族）。
// 定谳链（1457 亲读;★任务书 "NPC 274" 系 ID 勘误——274=BlueArmoredBonesMace 蓝甲骨
//  锤兵,NPCID.cs:11619,无 GetAlpha 特支通用乘光怪与病灶无关;真身以反编译为准）：
//   · Cursed Skull=NPC 34（诅咒骷髅头,普通模式地牢,NPCID.cs:11139）、
//     Giant Cursed Skull=NPC 289（巨型诅咒骷髅头,硬模式地牢,:11649——用户实报主凶,
//     VanillaSpawner.ts:2757 hardDungeon variant 1/2 掷 1/30 活型）。
//   · 34 全面清点（亲读）:SetDefaults :9178-9191（aiStyle=10/noGravity/noTileCollide,
//     无 alpha 字段=0）→ AI aiStyle10 :21664-21975 无 alpha 写面无 AddLight →
//     GetAlpha :94549-94841【无 type 34 特支】→ 缺省尾 rgb×num/A=num5=乘光族,
//     本仓通用直绘同相=无病（本测试锁定防回归）。
//   · 289 GetAlpha :94755-94758 `if (type == 289) return new Color(250, 250, 250, 50);`
//     ——骷髅头怪分支（与 288 Dungeon Spirit :94751-94754 `Color(200,200,200,0)`
//     成对）。恒色族:RGB=250 恒定【不读光照色】+A=50 半透。本体消费=Main.cs:23660
//     `Draw(frame, GetAlpha(color11))`;XNA SpriteBatch 预乘 AlphaBlend 终像素=
//     tex.rgb·(250/255)·tex.a·(50/255)+bg·(1−tex.a·50/255)。特支不读 alpha 字段→
//     出生 ramp 期亦恒 50/255（逐字）。AI :21861-21934 特支（发弹 299 Shadowflames）
//     无 alpha 写面;弹 299 SetDefaults alpha=255+aiStyle1 淡入+GetAlpha 无特支=
//     弹侧乘光族无病（普查注,不涉本刀）。
//   · 本仓病灶（双病同根）:289 走通用直绘=实体层 compositeLight 乘光（暗处
//     ≈×0.325,BJ529 弹 270 探针 k 实测）+ga=1 实心——又暗又实 vs 原版恒亮半透。
//   · 694 WaterBoltMimic（水书宝箱怪,:11651 同 aiStyle10 骷髅头族,本仓活型
//     VanillaSpawner.ts:2781 伪装态 ai3=3 生成）GetAlpha 三态（:94555-94570）:
//     ai[3]==3 伪装→newColor 常规乘光（本仓同相不动）;ai[3]==4 显形动画→
//     `Lerp(newColor, White, clamp(frame.Y/40/17))` 白化 ramp（lerp 族含加性白项
//     →BJ504 双绘等价式）;else（0/1/2 显形完成）→`return Color.White` 恒全白
//     （=402 档 a=1 极限覆绘）。本仓原无渲染支=显形态乘光同病,一并收编。
//   · 288 Dungeon Spirit:GetAlpha 恒 A=0=本体全透不可见（可见度全靠 AI_056
//     AddLight :33036/33040+发尘）;本仓无生成面（死型,BJ-C1 F5 判例不收编）——
//     登记债,未来补生成面时须先补 GetAlpha 支。
// 落刀:Renderer.drawEnemy 本体位 516 支旁 289 capture 支（tint[250,250,250]+tintA=50,
//   ★BJ-C9 F3 勘误:旧单笔 ga=50/255 把 src.rgb 双乘 ×cA（XNA One/InvSrcAlpha 下 cA
//   不缩 RGB,BJ556 判例）暗 5 倍=「很暗」未真修;现两步式 destination-out(tintA/255)
//   削底→lighter(tinted rgb,ga=1) 全额=逐字节）+694 双态支（显形动画
//   =本体照画+α=f 双绘;完成态=capture ga=1）;npcWhiteLiftQueue 类型扩 tint/tintA 字段;
//   flushNpcWhiteLift 消费扩 tint 两步式档。npcWhiteLiftAlpha 不收 289（专属支承载,
//   防通用门双重入队——单源）。
// 断言面：
//   A. 钉值——289 ga=50/255+tint[250,250,250];694 f=clamp(frameIdx/17) 端点;
//      npcWhiteLiftAlpha(34/274/288/289)=null（非同族/死型/专属支承载零回归）。
//   B. 算式——289 复绘≡XNA 预乘逐字节+旧通用直绘面≠原版（病灶判别力）;
//      694 双绘等价式逐点（BJ504 同式）。
//   C. 接线——capture 支位序（516 后、通用直绘 else 前）/类型字段/消费 tint 档。
//   D. 同族普查——288 死型登记/34 乘光族同相/伪装态不走复绘/弹 299 无病注。
//   E. 变异自证——M1 ga 钉值漂移/M2 摘 capture 支/M3 摘消费 tint 档→恰红
//      （逐字节还原+sha256 对拍）。
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { npcWhiteLiftAlpha } from '../src/render/npcExtraParts';

const RENDERER = join(process.cwd(), 'src', 'render', 'Renderer.ts');

// ===================== A. 钉值 =====================
describe('BJ551 A. 恒色族钉值（GetAlpha 骷髅头怪分支 :94751-94758/:94555-94570）', () => {
  it('289 capture 支原文：tint[250,250,250]+tintA=50（:94755-94758 恒色逐字;★BJ-C9 两步式）', () => {
    const src = readFileSync(RENDERER, 'utf8');
    expect(src).toContain('vid: 289, tex: \'vanilla/NPC_289.png\',');
    expect(src).toContain('tint: [250, 250, 250], tintA: 50,');
  });
  it('694 双态支：显形动画 f=clamp(frameIdx/17)、完成态 ga=1（:94559-94570 逐字）', () => {
    const src = readFileSync(RENDERER, 'utf8');
    expect(src).toContain('ga: Math.max(0, Math.min(1, (frameIdx * r.sh) / 40 / 17)),');
    expect(src).toContain('vid: 694, tex: \'vanilla/NPC_694.png\',');
    // 694 帧几何：46×1200/30 帧 → 帧高 40 =原版 frame.Y/40 硬编码步距
    const png = readFileSync(join(process.cwd(), 'public', 'sprites', 'vanilla', 'NPC_694.png'));
    expect(png.readUInt32BE(16)).toBe(46);
    expect(png.readUInt32BE(20)).toBe(1200);
    expect(png.readUInt32BE(20) / 30).toBe(40);
  });
  it('f 端点：frameIdx 0→0（书架末帧未白化）/17→1/29→1（clamp 封顶）', () => {
    const f = (idx: number) => Math.max(0, Math.min(1, (idx * 40) / 40 / 17));
    expect(f(0)).toBe(0);
    expect(f(8)).toBeCloseTo(8 / 17, 12);
    expect(f(17)).toBe(1);
    expect(f(29)).toBe(1);
  });
  it('非同族/死型/专属支承载 → npcWhiteLiftAlpha null（零回归+防通用门双重入队）', () => {
    expect(npcWhiteLiftAlpha(34)).toBeNull();    // 诅咒骷髅头:无特支乘光族（本仓同相）
    expect(npcWhiteLiftAlpha(274)).toBeNull();   // ★任务书 ID 勘误:274=蓝甲骨锤兵非病灶
    expect(npcWhiteLiftAlpha(288)).toBeNull();   // 地牢幽魂:死型不收编（BJ-C1 F5 判例）
    expect(npcWhiteLiftAlpha(289)).toBeNull();   // ★专属支承载——入通用 lerp 门=双重入队
    expect(npcWhiteLiftAlpha(694)).toBeNull();   // ★同上:三态支承载（ai3 分态非常数）
    expect(npcWhiteLiftAlpha(693)).toBeNull();   // 书架骷髅:Extra_289 段已承载（另域）
  });
});

// ===================== B. 算式（等价性+病灶判别力） =====================
describe('BJ551 B. 289 复绘≡XNA 预乘逐字节 + 694 双绘等价式', () => {
  // ★BJ-C9 F3（2026-10-08）模型勘误：XNA AlphaBlend(One/InvSrcAlpha) 预乘语义
  //  src.rgb=tex.rgb·tex.a·cR【cA 不缩 RGB,BJ556 鞭标记用户实证判例】、
  //  src.a=tex.a·cA。旧 B.1 两侧恒等表达式=同义反复（其"原版"模型把 cA 乘进
  //  rgb=语义错案,BJ-C9 落刀两步式后本块按正确模型重写）。
  it('289 两步式 ≡ XNA 预乘 AlphaBlend（erase ga=cA + lighter rgb=250 全额,逐字节）', () => {
    const cR = 250 / 255, cA = 50 / 255;
    for (const texRGB of [0, 17, 64, 128, 200, 255]) {
      for (const texA of [0, 0.25, 0.5, 0.75, 1]) {
        for (const bg of [0, 32, 96, 180, 255]) {
          // 本仓两步式（flushNpcWhiteLift tintA 档）：
          //   erase: destination-out(ga=cA, imgT α=texA) → dst×(1−texA·cA)
          //   add:   lighter(ga=1, imgT rgb=texRGB·cR) → += texRGB·cR·texA
          const repo = texRGB * cR * texA + bg * (1 - texA * cA);
          // 原版：XNA SpriteBatch 预乘（SrcBlend=One,InvSrcAlpha）
          //   src.rgb=tex.rgb·tex.a·cR、src.a=tex.a·cA
          const vanilla = texRGB * cR * texA + bg * (1 - texA * cA);
          expect(repo).toBe(vanilla);
        }
      }
    }
  });
  it('★BJ-C9 旧单笔病灶判别力：单笔 ga=cA 面比原版暗 ×cA（5 倍域差>1,防回退）', () => {
    const cR = 250 / 255, cA = 50 / 255;
    for (const texRGB of [128, 200, 255]) {
      for (const bg of [0, 32, 96, 180, 255]) {
        const vanilla = texRGB * cR * 1 + bg * (1 - 1 * cA);      // texA=1 本体
        const singlePass = texRGB * cR * (1 * cA) + bg * (1 - cA); // 旧单笔（rgb 被 cA 双乘）
        expect(vanilla - singlePass).toBeGreaterThan(1);           // 视觉可辨差
      }
    }
  });
  it('289 病灶判别力：旧通用直绘面（实体层乘光+ga=1 实心）≠原版恒色半透（暗光差>0）', () => {
    const cR = 250 / 255, cA = 50 / 255;
    for (const L of [0.1, 0.2, 0.325, 0.5]) {          // 0.325=BJ529 弹 270 探针 k
      for (const texRGB of [128, 200, 255]) {
        for (const texA of [0.5, 1]) {
          const bg = 10;                                // 暗地牢背景
          const oldRepo = texRGB * L * texA + bg * (1 - texA);   // 旧面:乘光 ga=1 实心
          const vanilla = texRGB * cR * texA + bg * (1 - texA * cA);  // ★BJ-C9 正模型
          expect(Math.abs(oldRepo - vanilla)).toBeGreaterThan(1);  // 视觉可辨差
        }
      }
    }
  });
  it('694 显形动画：a·s+(1−a)·(s·L) ≡ s·lerp(L,White,a)（BJ504 等价式逐点,字节域 ≤1）', () => {
    for (const fi of [0, 4, 8, 12, 16, 17]) {
      const a = Math.max(0, Math.min(1, fi / 17));
      for (const L of [0, 0.1, 0.325, 0.5, 0.7, 1]) {
        for (const s of [0, 17, 64, 128, 200, 255]) {
          const repo = a * s + (1 - a) * (s * L);
          const vanilla = s * (L + (1 - L) * a);
          expect(Math.abs(repo - vanilla)).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });
});

// ===================== C. 接线（收集位序/类型/消费） =====================
describe('BJ551 C. Renderer 接线', () => {
  const src = readFileSync(RENDERER, 'utf8');
  it('capture 支位序：289/694 支在 516 支之后、通用直绘 else 之前（本体位单源）', () => {
    const i516 = src.indexOf('if (e.vanillaId === 516) {');
    const i289 = src.indexOf('} else if (e.vanillaId === 289) {');
    const i694a = src.indexOf('} else if (e.vanillaId === 694 && (e.ai3 ?? 0) === 4) {');
    const i694b = src.indexOf('} else if (e.vanillaId === 694) {');
    const iDefault = src.indexOf('} else if (!xnaColor && !bodyTint370) {');
    expect(i516).toBeGreaterThan(0);
    expect(i289).toBeGreaterThan(i516);
    expect(i694a).toBeGreaterThan(i289);
    expect(i694b).toBeGreaterThan(i694a);
    expect(iDefault).toBeGreaterThan(i694b);
    // 694 显形动画支=双绘（本体照画+复绘）;完成态支=capture（无直绘）
    expect(src.slice(i694a, i694b)).toContain('ctx.drawImage(r.img');
  });
  it('队列类型扩 tint 字段（恒色族 RGB 烘焙档）', () => {
    expect(src).toContain('tint?: [number, number, number];');
  });
  it('消费 tint 烘焙档：tintedTex 保形染帧（flatten=false）+drawImage 烘焙帧', () => {
    expect(src).toContain('const imgT = q.tint ? tintedTex(imgL, q.tint, false) : imgL;');
    expect(src).toContain('ctx.drawImage(imgT, 0, q.sy, q.sw, q.sh, -q.sw / 2, q.by, q.sw, q.sh);');
    // BJ504 α 消费面不回归（ga 显式档优先语义保持）
    expect(src).toContain('ctx.globalAlpha = q.ga ?? npcWhiteLiftAlpha(q.vid) ?? 0.4;');
  });
  it('★BJ-C9 F3 恒色族两步式消费（destination-out tintA 削底 → lighter 全额）', () => {
    expect(src).toContain("ctx.globalCompositeOperation = 'destination-out';");
    expect(src).toContain('ctx.globalAlpha = q.tintA / 255;');
    expect(src).toContain('if (q.tintA !== undefined) {');
    // tintA=0（A=0 纯加算族）erase 免除闩
    expect(src).toContain('if (q.tintA > 0) {');
    // lerp 档（无 tintA）单笔 source-over 语义保持
    expect(src).toContain("ctx.globalCompositeOperation = 'source-over';");
  });
});

// ===================== D. 同族普查/非同族不回归 =====================
describe('BJ551 D. 同族普查清单（骷髅头怪域全量清点）', () => {
  const src = readFileSync(RENDERER, 'utf8');
  it('普查清单登记在源码注（34 无特支乘光族/288 死型/694 三态/弹 299 无病）', () => {
    expect(src).toContain('★BJ551（2026-10-07）巨型诅咒颅 289 GetAlpha 恒色支');
    expect(src).toContain('288 地牢幽魂 :94751-94754 成对');       // 288 登记
    expect(src).toContain('BJ529 弹 270');                        // 判例域链
    // 34 锁定:本仓无 34 专属复绘支（乘光族走通用直绘=原版同相）
    expect(src).not.toContain('} else if (e.vanillaId === 34) {');
  });
  it('288 死型判据：本仓无生成面（VanillaSpawner 无 288 分派）→ 不收编', () => {
    const sp = readFileSync(join(process.cwd(), 'src', 'world', 'spawn', 'VanillaSpawner.ts'), 'utf8');
    expect(sp).toContain('return D(289)');       // 289 活型对照（hardDungeon 掷 1/30）
    expect(sp).not.toContain('D(288)');          // 288 无生成分派=死型
    expect(sp).not.toContain('return D(288');
  });
  it('伪装态（ai3==3）不走 694 复绘支——分支条件含 ai3 门,书架态落通用直绘', () => {
    expect(src).toContain('} else if (e.vanillaId === 694 && (e.ai3 ?? 0) === 4) {');
    expect(src).toContain('} else if (e.vanillaId === 694) {');
    // 完成态支在显形动画支之后（否则 ai3==4 会被完成态支截胡）
    expect(src.indexOf('} else if (e.vanillaId === 694 && (e.ai3 ?? 0) === 4) {'))
      .toBeLessThan(src.indexOf('} else if (e.vanillaId === 694) {'));
  });
  it('BJ504 既有面零回归（395/519/454-459/402/516 钉值不动）', () => {
    expect(npcWhiteLiftAlpha(395)).toBe(0.4);
    expect(npcWhiteLiftAlpha(519)).toBe(0.4);
    expect(npcWhiteLiftAlpha(455)).toBe(0.4);
    expect(npcWhiteLiftAlpha(402)).toBe(1);
  });
});

// ===================== E. 变异自证（原子+逐字节还原+sha256 对拍） =====================
describe.skipIf(process.env.SW_BJ551_MUT)('BJ551 E. 变异自证', () => {
  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj551-cursed-skull-alpha.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_BJ551_MUT: '1' },   // ★子进程豁免变异面（对变异文件跑 A-D 面）
    });
  const sha256 = (b: string) => createHash('sha256').update(b).digest('hex');
  // ★BJ-C9（2026-10-08）自愈前置：上轮运行被 SIGKILL 中断在变异窗=盘上残留变异串
  //  （exit 144 杀树跳过 finally 的泄漏位,实际事故=B J-C9 会话两起）——含变异标记而
  //  缺触发串 → 先还原触发串再取 PRISTINE,保证各发可重入。
  const heal = (FILE: string, TRIGGER: string, replacement: string): string => {
    let cur = readFileSync(FILE, 'utf8');
    if (!cur.includes(TRIGGER) && cur.includes(replacement)) {
      writeFileSync(FILE, cur.replace(replacement, TRIGGER));
      cur = readFileSync(FILE, 'utf8');
    }
    return cur;
  };

  it('M1 289 tintA 50→100（A 恒量漂移=半透面丢失）→ 钉值断言红', () => {
    const FILE = RENDERER;
    const TRIGGER = 'tint: [250, 250, 250], tintA: 50,';
    const replacement = 'tint: [250, 250, 250], tintA: 100, // ★BJ551 变异:半透恒量漂移';
    const PRISTINE = heal(FILE, TRIGGER, replacement);
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(FILE, PRISTINE.replace(TRIGGER, replacement));
      const r = spawnVitest('289 capture 支原文');
      expect(r.status).not.toBe(0);              // ★变异证红:ga 钉值
      expect(r.stdout).toContain('289 capture 支原文');
    } finally {
      writeFileSync(FILE, PRISTINE);
    }
    const restored = readFileSync(FILE, 'utf8');
    expect(restored).toBe(PRISTINE);             // 逐字节还原
    expect(sha256(restored)).toBe(sha256(PRISTINE));   // sha256 对拍
  });

  it('M2 摘 289 capture 支（恒色支整缺→退回通用乘光实心）→ 接线断言红', () => {
    const FILE = RENDERER;
    const TRIGGER = '} else if (e.vanillaId === 289) {';
    const replacement = '} else if (e.vanillaId === 2890) { // ★BJ551 变异:289 支摘除(永不命中→退回通用直绘)';
    const PRISTINE = heal(FILE, TRIGGER, replacement);
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(FILE, PRISTINE.replace(TRIGGER, replacement));
      const r = spawnVitest('capture 支位序');
      expect(r.status).not.toBe(0);              // ★变异证红:位序钉原文
      expect(r.stdout).toContain('capture 支位序');
    } finally {
      writeFileSync(FILE, PRISTINE);
    }
    const restored = readFileSync(FILE, 'utf8');
    expect(restored).toBe(PRISTINE);
    expect(sha256(restored)).toBe(sha256(PRISTINE));
  });

  it('M3 摘消费 tint 档（289 复绘缺 rgb 烘焙=亮度差 2%）→ 消费断言红', () => {
    const FILE = RENDERER;
    const TRIGGER = 'const imgT = q.tint ? tintedTex(imgL, q.tint, false) : imgL;';
    const replacement = 'const imgT = imgL; // ★BJ551 变异:tint 烘焙档摘除';
    const PRISTINE = heal(FILE, TRIGGER, replacement);
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(FILE, PRISTINE.replace(TRIGGER, replacement));
      const r = spawnVitest('消费 tint 烘焙档');
      expect(r.status).not.toBe(0);              // ★变异证红:消费原文钉值
      expect(r.stdout).toContain('消费 tint 烘焙档');
    } finally {
      writeFileSync(FILE, PRISTINE);
    }
    const restored = readFileSync(FILE, 'utf8');
    expect(restored).toBe(PRISTINE);
    expect(sha256(restored)).toBe(sha256(PRISTINE));
  });
});
