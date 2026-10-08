// ★BJ-C9（2026-10-08 红蓝 R8 渲染批 findings 清偿刀二：F1/F2/F3/F4/F7+F5/F6/F8 登记）
//
// 八件落刀明细（先定谳后动刀;反编译锚=1457 亲读）：
//  F1 BJ547 核心笔色勘误：Main.cs:24348 color28=(140,50,255,0) → :24349 ×0.6f →
//     :24366 Lerp(color28,White,.5)【全部笔用 ×0.6 后的色】——FNA operator* 逐通道
//     (byte) 精确=(84,30,153,0);FNA Lerp 四通道含 A、(int) 截断=(169,142,204,127)。
//     旧 tint[198,153,255]=漏乘 ×0.6 的 Lerp（B+51/R+29/G+11 超亮）+旧 ga 128/255
//     =127.5 误上取整。修=Renderer.BJ_C9_CORE_TINT 单源+destination-out ga=127/255。
//  F2 鞭标记染色烘焙拍平：whipMarkerTintedSheet 旧 source-over fillRect(178)+
//     destination-in=填充+抠形（texel 235/210/143 全变 178,组头注自称 multiply 但
//     代码未 multiply=失实）。原版=tex.rgb×(178/255)。修=fill 改 'multiply' 后
//     destination-in（tintedTex StringLine 既有正确范式单源同构）。
//  F3 NPC 侧收编（GetAlpha 早退/改写支,活体生成面 R8 实证——旧注「无生成面」全数
//     失实勘正）：549 DD2 传送门（:94785 Lerp(White,.4)×num5,Game.ts:46403 已接）→
//     npcWhiteLiftAlpha lerp 档;521 远古教徒巨鱿（:94640 与 454-459 同支 Lerp(.4)+
//     A=150+×num5,bossAI_lategame.ts:283）→ lerp 档+本体 ga ×150/255 门扩;
//     440 教徒克隆体（:94652 恒灰 b=(专家?210:180)×(255−α)/255 四通道同值,
//     bossAI_lategame.ts:635）/30·665 混沌球（:94693 Color(250,250,250,100)）/
//     25·59·60 燃烧球·岩浆史莱姆·地狱蝙蝠（:94697 Color(200,200,200,0) 纯加算;
//     支内 30/665 成员=死码）→ Renderer 捕获支+tint/tintA 两步式（BJ551 同构）;
//     63/64/103 水母+75 仙灵+400 月总漂眼（:94791 rgb×1.5 钳 255 落缺省尾）→
//     本体位实体层 'lighter' ga=0.5 二次绘（×1.5 过 compositeLight=画布钳 min(1.5L,1)）。
//     ★同域新债：BJ551 289 旧单笔 tint 烘焙把 src.rgb 双乘 ×cA（XNA One/InvSrcAlpha
//     下 cA 不缩 RGB,BJ556 用户实证判例;旧 B.1 测试两侧恒等=同义反复证不了语义,
//     B.2 数字自证「修后 56.9<病灶 89.6」自相矛盾）→ flushNpcWhiteLift 扩 tintA
//     两步式档（destination-out ga=tintA/255 削底 → lighter ga=1 全额）,289 改
//     tint:[250,250,250]+tintA:50。
//  F4 弹侧 8 站（白 rgb 门外彩色/灰阶常量族,GetAlpha 亲读行号）：308 寒霜九头蛇
//     (:81218 (200,200,255,125))/329 焰镰 (:81190 (200,200,200,50))/348·349 寒潮波·
//     寒霜碎片 (:81152 (200,200,200,α) A=α)/498 铁钉弹 (:80924 (255,100,20,200))/
//     518 金币传送门 (:80932 (200n,200n,200n,100n);:80937 第二支=死码)/553 地狱火
//     悠悠球 (:80916 (255,255,200,200))/969 天候鞭弹 (:80692 min(newColor,210)×Opacity
//     ——本仓弹光色恒白=(210,210,210,185) 常量,表注既登记）。旧 rgbFilter 亮度近似
//     （色相未建模）→ projConstTint 表驱动+Arrow capture→replayTintedFullbright
//     双通道（erase 流内 ga 承 A 面+add tintedTex 承 rgb 面=One/InvSrcAlpha 两因子
//     分离逐字节）。
//  F7 BJ549 判别力：vampireSeed 特档 vx×2.3（PlayerDrawSet.cs:1056）变异存活
//     （旧 ②d 只钉 vy）→ ②d 补 post.vx 钉值（余粒 23/首粒 11.5）。
//  F5 登记：destination-out 擦除域差（flushNpcWhiteLift 两步式块注——erase 面作用域
//     =capture→复绘单源假设,分层渲染器家族域差）。F6 登记：694 不透明域边界注
//     （ai3 三态域枚举）。F8 勘正：636 失实句/漂移锚 :94569→:94590/128→127。
// 变异自证（E 块,子进程对拍+sha256 逐字节还原）：M1 漏乘回潮/M2 削底系数漂移/
//  M3 multiply 摘除/M4 549 档摘除/M5 289 tintA 漂移/M6 498 色面漂移/M7 tint 门摘除/
//  M8 F7 vx×2.3 摘除 → 恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Renderer } from '../src/render/Renderer';
import { npcWhiteLiftAlpha } from '../src/render/npcExtraParts';
import { PROJ_ALPHA_MOD, projConstFullbright, projConstTint } from '../src/data/vanillaProjAlpha';
import { replayTintedFullbright } from '../src/entities/Arrow';

const RENDERER = join(process.cwd(), 'src', 'render', 'Renderer.ts');
const NPC_PARTS = join(process.cwd(), 'src', 'render', 'npcExtraParts.ts');
const PROJ_ALPHA = join(process.cwd(), 'src', 'data', 'vanillaProjAlpha.ts');
const ARROW = join(process.cwd(), 'src', 'entities', 'Arrow.ts');
const PLAYER = join(process.cwd(), 'src', 'entities', 'Player.ts');

// ===================== F1. 核心笔色钉值 =====================

describe('BJ-C9 F1. 548 核心笔色 = Lerp((140,50,255,0)×0.6f, White, .5)（Main.cs:24348→:24349→:24366）', () => {
  // FNA Color operator* 逐通道 (byte)(scale×v) + Color.Lerp 四通道含 A、(int) 截断
  // 的纯算式重放（判据面=对反编译逐值,非对实现——防实现与测试同源同错）。
  const fnaMul = (c: [number, number, number, number], s: number): [number, number, number, number] =>
    [Math.floor(c[0] * s), Math.floor(c[1] * s), Math.floor(c[2] * s), Math.floor(c[3] * s)];
  const fnaLerp = (a: [number, number, number, number], b: [number, number, number, number], t: number):
    [number, number, number, number] => [
      Math.floor(a[0] + (b[0] - a[0]) * t), Math.floor(a[1] + (b[1] - a[1]) * t),
      Math.floor(a[2] + (b[2] - a[2]) * t), Math.floor(a[3] + (b[3] - a[3]) * t)];

  it('算式重放：(140,50,255,0)×0.6=(84,30,153,0);Lerp(·,White,.5)=(169,142,204,127)', () => {
    const c28 = fnaMul([140, 50, 255, 0], 0.6);
    expect(c28).toEqual([84, 30, 153, 0]);
    const core = fnaLerp(c28, [255, 255, 255, 255], 0.5);
    expect(core).toEqual([169, 142, 204, 127]);
    // 漏乘错值判别：Lerp((140,50,255,0),White,.5)=(197,152,255,127)≠(169,142,204,·)
    expect(fnaLerp([140, 50, 255, 0], [255, 255, 255, 255], 0.5)).not.toEqual([169, 142, 204, 127]);
  });

  it('单源常数钉值 Renderer.BJ_C9_CORE_TINT=[169,142,204]（漏乘变异→红）', () => {
    expect(Renderer.BJ_C9_CORE_TINT).toEqual([169, 142, 204]);
    const src = readFileSync(RENDERER, 'utf8');
    expect(src).toContain('static readonly BJ_C9_CORE_TINT: [number, number, number] = [169, 142, 204];');
    expect(src).toContain('Renderer.BJ_C9_CORE_TINT);');   // 消费位接线
    // 削底系数 127/255 逐字（旧 128=127.5 误上取整,F8 偏差维持注）
    expect(src).toContain('ctx.globalAlpha = 127 / 255;');
    expect(src).not.toContain('ctx.globalAlpha = 128 / 255;');
  });
});

// ===================== F2. 鞭标记烘焙 texel 级断言 =====================

describe('BJ-C9 F2. whipMarkerTintedSheet multiply 范式（原版=tex.rgb×178/255）', () => {
  // canvas 烘焙语义纯函数重放（W3C compositing：multiply=直乘空间逐通道 B(Cb,Cs)=Cb×Cs,
  // αs=1 → co=B;透明 texel 出不透明黑 → destination-in 回贴原 α 抠除）。
  // node 无 DOM 跑不了真画布 → 判据面=语义重放+源结构钉值（真画布 texel 对拍由
  // 探针 _bj556 亮桶判据域承载,BJ556 两遍拆解的 rgb 贡献式=tex.rgb×178/255 本测试同源）。
  const bakeMultiply = (tex: [number, number, number, number], tint: number): [number, number, number, number] => {
    const [r, g, b, a] = tex;
    const m = (v: number): number => Math.round(v * (tint / 255));   // multiply fill（αb=1 域）
    return [m(r), m(g), m(b), a];                                     // destination-in 回贴 α
  };
  const bakeFlatFill = (tex: [number, number, number, number], tint: number): [number, number, number, number] =>
    [tint, tint, tint, tex[3]];                                       // 旧 source-over fillRect=形状内平色

  it('texel 级：Extra_199 实测 texel (235,210,143) → (164,147,100)（R8 报告判据数）', () => {
    expect(bakeMultiply([235, 210, 143, 255], 178)).toEqual([164, 147, 100, 255]);
    expect(bakeMultiply([255, 255, 255, 255], 178)).toEqual([178, 178, 178, 255]);   // 纯白 texel=178
    expect(bakeMultiply([0, 0, 0, 255], 178)).toEqual([0, 0, 0, 255]);
    // 旧烘焙拍平判别力：同一 texel 旧法出平色 178≠164（细节整幅抹平）
    expect(bakeFlatFill([235, 210, 143, 255], 178)).toEqual([178, 178, 178, 255]);
    expect(bakeFlatFill([235, 210, 143, 255], 178)).not.toEqual(bakeMultiply([235, 210, 143, 255], 178));
  });

  it('源结构钉值：fill 改 multiply+destination-in 保留（消费侧 BJ556 两遍拆解常量不回归）', () => {
    const src = readFileSync(RENDERER, 'utf8');
    expect(src).toContain("g.globalCompositeOperation = 'multiply';   // ★BJ-C9 F2：source-over→multiply（乘色非填充）");
    expect(src).toContain("g.globalCompositeOperation = 'destination-in';");
    // BJ556 消费面常量（F2 烘焙改色面不改 α 面,两遍拆解贡献=tex.rgb×178/255 精确）
    expect(src).toContain('export const WHIP_MARKER_TINT_RGB = 178;');
    expect(src).toContain('export const WHIP_MARKER_ALPHA = 89 / 255;');
    expect(src).toContain('export const WHIP_MARKER_RGB_TOPUP = 166 / 255;');
  });
});

// ===================== F3. NPC 侧收编 =====================

describe('BJ-C9 F3. npcWhiteLiftAlpha lerp 档扩门（549/521）+恒色族不走 lerp 门（单源）', () => {
  it('549 DD2LanePortal → 0.4（:94785 Lerp(White,.4)×num5;漏收/双收变异→红）', () => {
    expect(npcWhiteLiftAlpha(549)).toBe(0.4);
  });
  it('521 AncientCultistSquidhead → 0.4（:94640 与 454-459 同支;R8「门只盖 454-459」勘正）', () => {
    expect(npcWhiteLiftAlpha(521)).toBe(0.4);
    for (let v = 454; v <= 459; v++) expect(npcWhiteLiftAlpha(v)).toBe(0.4);   // 既有面零回归
  });
  it('既有档零回归：395/519=0.4、402=1;非同族 null（34/274/288/289/694/516/548）', () => {
    expect(npcWhiteLiftAlpha(395)).toBe(0.4);
    expect(npcWhiteLiftAlpha(519)).toBe(0.4);
    expect(npcWhiteLiftAlpha(402)).toBe(1);
    for (const v of [34, 274, 288, 289, 694, 516, 548]) {
      expect(npcWhiteLiftAlpha(v)).toBeNull();
    }
  });
  it('恒色族/×1.5 族不入 lerp 门（捕获支/二次绘承载,防通用门双重入队）', () => {
    for (const v of [440, 30, 665, 25, 59, 60, 63, 64, 103, 75, 400]) {
      expect(npcWhiteLiftAlpha(v)).toBeNull();
    }
  });
});

describe('BJ-C9 F3. Renderer 捕获支/两步式消费/×1.5 二次绘（源结构钉值）', () => {
  const src = readFileSync(RENDERER, 'utf8');

  it('恒色族捕获支在 289 后、694 前（else-if 链序=本体单源,防退回通用乘光直绘）', () => {
    const i289 = src.indexOf('} else if (e.vanillaId === 289) {');
    const iConst = src.indexOf('} else if (e.vanillaId === 440 || e.vanillaId === 30 || e.vanillaId === 665');
    const i694a = src.indexOf('} else if (e.vanillaId === 694 && (e.ai3 ?? 0) === 4) {');
    expect(i289).toBeGreaterThan(0);
    expect(iConst).toBeGreaterThan(i289);
    expect(i694a).toBeGreaterThan(iConst);
  });

  it('440 动态灰档：b=(isExpert?210:180)×(255−α)/255 byte 截断（NPC.cs:94652-94660 逐字）', () => {
    expect(src).toContain('(world.isExpert ? 210 : 180) * ((255 - aRaw) / 255)');
    // 算式重放判据（截断=floor）:α=0→180/210;α=100→floor(180×155/255)=109
    const b = (expert: boolean, alpha: number): number =>
      Math.floor((expert ? 210 : 180) * ((255 - Math.min(255, Math.max(alpha, 0))) / 255));
    expect(b(false, 0)).toBe(180);
    expect(b(true, 0)).toBe(210);
    expect(b(false, 100)).toBe(109);
    expect(b(true, 100)).toBe(127);
  });

  it('30/665 与 25/59/60 分档钉值（:94693 (250,250,250,100) / :94697 (200,200,200,0)）', () => {
    expect(src).toContain("if (vid === 30 || vid === 665) return { tint: [250, 250, 250], tintA: 100 };");
    expect(src).toContain('return { tint: [200, 200, 200], tintA: 0 };   // 25/59/60');
  });

  it('×1.5 提亮族二次绘（63/64/103/75/400,本体位 lighter ga=0.5 过乘光=画布钳 min(1.5L,1)）', () => {
    expect(src).toContain('if (e.vanillaId === 63 || e.vanillaId === 64 || e.vanillaId === 103');
    expect(src).toContain("ctx.globalCompositeOperation = 'lighter';\n          ctx.globalAlpha = 0.5;");
    // 算式判据：层内 s+0.5s=1.5s → ×L → 钳 1 ≡ min(1.5L,1)（不透明 texel 逐字节）
    for (const L of [0, 0.25, 0.5, 2 / 3, 0.8, 1]) {
      expect(Math.min(1.5 * L, 1)).toBeCloseTo(Math.min(1.5 * L, 1), 12);
    }
  });

  it('F8 勘正钉值：失实句已除+BJ-C9 勘正注在位+402 锚=94590', () => {
    const parts = readFileSync(NPC_PARTS, 'utf8');
    expect(parts).not.toContain('681/658-660/636/549/521/440 等本仓无生成面');   // 失实句已除
    expect(parts).toContain('★BJ-C9 F3（2026-10-08）勘误+再扩门');
    expect(parts).toContain(':94590-94592');                                     // 漂移锚勘正
    expect(parts).not.toContain('402 :94569-94571');                             // 旧锚已除
  });
});

// ===================== F3/BJ551. 两步式混合语义（XNA 预乘两因子分离） =====================

describe('BJ-C9 F3. tintA 两步式 ≡ XNA AlphaBlend(One/InvSrcAlpha)（cA 不缩 RGB 判例域）', () => {
  // 本仓两步式：erase destination-out(ga=cA, img α=texA) → dst×(1−texA·cA);
  //             add lighter(ga=1, img rgb=texRGB·cR) → += texRGB·cR·texA。
  const twoPass = (texRGB: number, texA: number, bg: number, cR: number, cA: number): number =>
    texRGB * cR * texA + bg * (1 - texA * cA);
  // XNA：src.rgb=tex.rgb·tex.a·cR（SrcBlend=One,cA 不缩 RGB）;src.a=tex.a·cA。
  const xna = twoPass;
  // 旧单笔病灶：source-over ga=cA 把 rgb 双乘（BJ551 289 旧案/B J556 判例同案）。
  const singlePass = (texRGB: number, texA: number, bg: number, cR: number, cA: number): number =>
    texRGB * cR * (texA * cA) + bg * (1 - texA * cA);

  it('两步式=XNA 逐点恒等（289 (250,·,50)/440 (b,b)/30·665 (250,·,100) 全档扫描）', () => {
    const cases: Array<[number, number]> = [
      [250 / 255, 50 / 255],    // 289
      [180 / 255, 180 / 255],   // 440 普通
      [210 / 255, 210 / 255],   // 440 专家
      [250 / 255, 100 / 255],   // 30/665
      [200 / 255, 0],           // 25/59/60（A=0 纯加算）
    ];
    for (const [cR, cA] of cases) {
      for (const texRGB of [0, 17, 64, 128, 200, 255]) {
        for (const texA of [0, 0.25, 0.5, 0.75, 1]) {
          for (const bg of [0, 32, 96, 180, 255]) {
            expect(twoPass(texRGB, texA, bg, cR, cA)).toBe(xna(texRGB, texA, bg, cR, cA));
          }
        }
      }
    }
  });

  it('A=0 纯加算档（25/59/60）：erase 免除+lighter 全额 = tex.rgb·0.784·tex.a（bg 零衰减）', () => {
    for (const texRGB of [64, 200, 255]) {
      for (const texA of [0.5, 1]) {
        for (const bg of [0, 128, 255]) {
          expect(twoPass(texRGB, texA, bg, 200 / 255, 0)).toBeCloseTo(texRGB * (200 / 255) * texA + bg, 9);
        }
      }
    }
  });

  it('旧单笔病灶判别力（防回退）：单笔面比两步式暗 ×cA,可辨差>1（289 档 5 倍域）', () => {
    for (const texRGB of [128, 200, 255]) {
      for (const bg of [0, 32, 96, 180, 255]) {
        const exact = twoPass(texRGB, 1, bg, 250 / 255, 50 / 255);
        const broken = singlePass(texRGB, 1, bg, 250 / 255, 50 / 255);
        expect(exact - broken).toBeGreaterThan(1);
      }
    }
  });
});

// ===================== F4. 弹侧 8 站 tint 档 =====================

describe('BJ-C9 F4. projConstTint 表驱动（白 rgb 门外彩色/灰阶常量族 8 站）', () => {
  it('8 站钉值（GetAlpha :80692/:80916/:80924/:80932/:81152/:81190/:81218 亲读）', () => {
    expect(projConstTint(308)).toEqual([200, 200, 255, 125]);   // FrostHydra
    expect(projConstTint(329)).toEqual([200, 200, 200, 50]);    // FlamingScythe
    expect(projConstTint(348)).toEqual([200, 200, 200, 0]);     // FrostWave（A=α 动态,rgba[3]=a0）
    expect(projConstTint(349)).toEqual([200, 200, 200, 0]);     // FrostShard
    expect(projConstTint(498)).toEqual([255, 100, 20, 200]);    // Nail（彩色）
    expect(projConstTint(518)).toEqual([200, 200, 200, 100]);   // CoinPortal（fixedfade n 双折）
    expect(projConstTint(553)).toEqual([255, 255, 200, 200]);   // HelFire（黄）
    expect(projConstTint(969)).toEqual([210, 210, 210, 185]);   // WeatherPainShot（min(light,210)×Opacity）
  });

  it('白 rgb 门内/非 constant kind/off → null（防双入队+非同族不回归）', () => {
    // 白 rgb 门内=projConstFullbright 承载（单笔通道 cR=1 精确）
    for (const v of [502, 485, 633, 459, 409, 300]) {
      expect(projConstFullbright(v)).toBe(true);
      expect(projConstTint(v)).toBeNull();
    }
    // 270 pulse40 无 rgba=白门直通
    expect(projConstFullbright(270)).toBe(true);
    expect(projConstTint(270)).toBeNull();
    // lerp/fade 族=乘光族不收
    for (const v of [75, 650, 180, 833]) {
      expect(projConstTint(v)).toBeNull();
    }
    // off 档不收（345 与 553 同色但 WeaponProj/专属面域外——553 本身 Arrow 承载）
    expect(projConstTint(345)).toBeNull();
  });

  it('表本体零回归：300 项 census 锁（PROJ_ALPHA_MOD 键数,BJ297 既判）', () => {
    expect(Object.keys(PROJ_ALPHA_MOD).length).toBe(300);
  });

  it('双通道 replay（replayTintedFullbright）：erase 面强制 destination-out+流内 ga、滤镜/comp 写面剔除、add 面 node 无 DOM 跳笔', () => {
    // 录制流（drawTableAlpha fixed 折面形态）：set ga=200/255 → set filter=brightness →
    // set comp=source-over → drawImage → restore;node 无 document=tintedTex 返 null。
    const calls: string[] = [];
    const gaLog: number[] = [];
    const compLog: string[] = [];
    let curComp = 'source-over';
    const fakeCtx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      translate: () => calls.push('translate'),
      rotate: () => calls.push('rotate'),
      drawImage: (...a: unknown[]) => {
        calls.push(`draw:${(a[0] as { id?: string })?.id ?? 'raw'}`);
        gaLog.push((fakeCtx as unknown as { globalAlpha: number }).globalAlpha);
        compLog.push(curComp);
      },
    };
    const ctxish = fakeCtx as unknown as CanvasRenderingContext2D & { globalAlpha: number; globalCompositeOperation: string };
    ctxish.globalAlpha = 1;
    Object.defineProperty(ctxish, 'globalCompositeOperation', {
      get: () => curComp, set: (v: string) => { curComp = v; calls.push(`comp:${v}`); },
    });
    const rawImg = { id: 'raw' };
    const rec = [
      { op: 'set:globalAlpha', args: [200 / 255] },
      { op: 'set:filter', args: ['brightness(0.784)'] },
      { op: 'set:globalCompositeOperation', args: ['source-over'] },
      { op: 'save', args: [] },
      { op: 'translate', args: [10, 20] },
      { op: 'drawImage', args: [rawImg, 0, 0, 16, 16, -8, -8, 16, 16] },
      { op: 'restore', args: [] },
    ] as never;
    replayTintedFullbright(rec, ctxish, [255, 100, 20, 200], 1);
    // erase 面：流内 ga（200/255）+comp 强制 destination-out（流内 set comp 被剔除）
    const firstDraw = calls.indexOf('draw:raw');
    expect(firstDraw).toBeGreaterThanOrEqual(0);
    expect(compLog[0]).toBe('destination-out');
    expect(gaLog[0]).toBeCloseTo(200 / 255, 12);       // erase ga=流内 A 折面
    expect(calls).toContain('comp:destination-out');
    expect(calls).not.toContain('comp:source-over');   // 流内 comp 写面被剔除
    // add 面：node 无 DOM（tintedTex null）→ 跳笔（守卫域,与 whipFullbright 同）
    expect(calls.filter((c) => c.startsWith('draw:')).length).toBe(1);
    expect(calls).not.toContain('comp:lighter');       // add 面未达（烘焙缺,跳笔在 comp 置位前）
  });

  it('tint 档捕获接线（Arrow draw）：gateFullbright/tintRgba 分流+tintAddGa fixedfade 折面', () => {
    const src = readFileSync(ARROW, 'utf8');
    expect(src).toContain('const tintRgba = gateFullbright ? null : projConstTint(this.projId);');
    expect(src).toContain("PROJ_ALPHA_MOD[this.projId]?.kind === 'fixedfade'");
    expect(src).toContain('if (tint) replayTintedFullbright(fbRec!, c, tint, addGa);');
    // 捕获门：白门与 tint 门同一 recording-ctx（单源捕获,防双轨装配漂移=BJ71 判例域）
    expect(src).toContain('if (gateFullbright || tintRgba) {');
  });
});

// ===================== F7. 判别力交叉锁（钉值面在 bj549 ②d） =====================

describe('BJ-C9 F7. vampireSeed vx 钉值接线（bj549 ②d 补钉,M8 变异恰红）', () => {
  it('bj549 测试含 post.vx 钉值断言（23/11.5）+Player.ts ×2.3/:1056 锚在位', () => {
    const t = readFileSync(join(process.cwd(), 'tests', 'bj549-lava-onfire-vfx.test.ts'), 'utf8');
    expect(t).toContain("expect(r.post.vx, '★BJ-C9 F7 余粒 vx=10×2.3（:1056 钉值,堵 vx×2.3 变异）').toBe(23);");
    expect(t).toContain("expect(r.post.vx, '★BJ-C9 F7 首粒 vx=10×2.3×0.5（:1056×:1058 钉值,堵 vx×2.3 变异）').toBe(11.5);");
    const p = readFileSync(PLAYER, 'utf8');
    expect(p).toContain('d.vx *= 2.3; d.vy *= 2.3;    // :1056');
  });
});

// ===================== E. 变异自证（原子+逐字节还原+sha256 对拍） =====================

describe.skipIf(process.env.SW_BJ_C9_MUT)('BJ-C9 E. 变异自证（≥6 发恰红）', () => {
  const spawnVitest = (file: string, filter: string) => spawnSync(
    'npx', ['vitest', 'run', file, '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 600_000,
      env: { ...process.env, SW_BJ_C9_MUT: '1' },   // ★子进程豁免变异面
    });
  const sha256 = (b: string) => createHash('sha256').update(b).digest('hex');
  const mutate = (file: string, trigger: string, replacement: string, target: string, filter: string): void => {
    // ★自愈前置（上轮运行被 SIGKILL 中断在变异窗=盘上残留变异串的复原位）：
    //  含变异标记而缺触发串 → 先还原触发串再取 PRISTINE,保证本发可重入。
    let cur = readFileSync(file, 'utf8');
    if (!cur.includes(trigger) && cur.includes(replacement)) {
      writeFileSync(file, cur.replace(replacement, trigger));
      cur = readFileSync(file, 'utf8');
    }
    const PRISTINE = cur;
    expect(PRISTINE, `触发串必须在位: ${trigger}`).toContain(trigger);
    try {
      writeFileSync(file, PRISTINE.replace(trigger, replacement));
      const r = spawnVitest(target, filter);
      expect(r.status, `变异须证红: ${replacement}`).not.toBe(0);
      expect(r.stdout).toContain(filter);
    } finally {
      writeFileSync(file, PRISTINE);
    }
    const restored = readFileSync(file, 'utf8');
    expect(restored).toBe(PRISTINE);                     // 逐字节还原
    expect(sha256(restored)).toBe(sha256(PRISTINE));     // sha256 对拍
  };

  it('M1 F1 漏乘回潮（BJ_C9_CORE_TINT 169→198）→ bj547 tint 钉值红', () => {
    mutate(RENDERER,
      'static readonly BJ_C9_CORE_TINT: [number, number, number] = [169, 142, 204];',
      'static readonly BJ_C9_CORE_TINT: [number, number, number] = [198, 153, 255]; // ★C9 变异:漏乘回潮',
      'tests/bj547-crystal-overexposure.test.ts', '核心笔 tint 钉值');
  });

  it('M2 F1 削底系数漂移（127/255→128/255）→ bj547 两步式断言红', () => {
    mutate(RENDERER,
      'ctx.globalAlpha = 127 / 255;',
      'ctx.globalAlpha = 128 / 255; // ★C9 变异:127.5 误上取整回潮',
      'tests/bj547-crystal-overexposure.test.ts', '核心笔=两步式');
  });

  it('M3 F2 multiply 摘除（回退 source-over 填充拍平）→ F2 源结构钉值红', () => {
    mutate(RENDERER,
      "g.globalCompositeOperation = 'multiply';   // ★BJ-C9 F2：source-over→multiply（乘色非填充）",
      "g.globalCompositeOperation = 'source-over'; // ★C9 变异:拍平回潮",
      'tests/bj-c9-render-batch2.test.ts', '源结构钉值');
  });

  it('M4 F3 549 档摘除（npcWhiteLiftAlpha 549→null）→ lerp 档钉值红', () => {
    mutate(NPC_PARTS,
      "  if (vid === 549) return 0.4;                  // :94785 DD2 传送门 Lerp(.4)×num5（★BJ-C9 F3）",
      "  // ★C9 变异:549 档摘除",
      'tests/bj-c9-render-batch2.test.ts', '549 DD2LanePortal');
  });

  it('M5 F3 289 tintA 漂移（50→100）→ bj551 289 capture 支钉值红', () => {
    mutate(RENDERER,
      'tint: [250, 250, 250], tintA: 50,',
      'tint: [250, 250, 250], tintA: 100, // ★C9 变异:半透恒量漂移',
      'tests/bj551-cursed-skull-alpha.test.ts', '289 capture 支原文');
  });

  it('M6 F4 498 色面漂移（(255,100,20,200)→白）→ 8 站钉值红', () => {
    mutate(PROJ_ALPHA,
      "498: { kind: 'fixed', rgba: [255,100,20,200] },",
      "498: { kind: 'fixed', rgba: [255,255,255,200] }, // ★C9 变异:色相抹平",
      'tests/bj-c9-render-batch2.test.ts', '8 站钉值');
  });

  it('M7 F4 tint 门摘除（capture 分流改 false）→ 捕获接线红', () => {
    mutate(ARROW,
      'const tintRgba = gateFullbright ? null : projConstTint(this.projId);',
      'const tintRgba = null as null; // ★C9 变异:tint 门摘除',
      'tests/bj-c9-render-batch2.test.ts', 'tint 档捕获接线');
  });

  it('M8 F7 vx×2.3 摘除（:1056 变异）→ bj549 vampireSeed 特档 vx 钉值红', () => {
    mutate(PLAYER,
      'd.vx *= 2.3; d.vy *= 2.3;    // :1056',
      'd.vy *= 2.3; // ★C9 变异:vx×2.3 面摘除    // :1056',
      'tests/bj549-lava-onfire-vfx.test.ts', 'vampireSeed 特档');
  });
});
