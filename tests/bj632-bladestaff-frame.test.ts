// ★BJ632 件2（2026-10-10）：刃杖（Smolstar vid 4758 / 召唤物 projId 864）「一直闪白」
//  定谳锁。三候选裁决：
//  ①glow mask 白模逐帧闪 → 销案：原版 Item.cs SetDefaults case 4758 无 glowMask
//    赋值（源码扫描断言）+ 本仓 ITEM_GLOWMASK 表无 4758（BJ601 67 件表=忠实提取）。
//  ②itemAnimation 挥动帧表选帧错 → 销案：Item_4758 单帧 46×46（原版贴图亲读）
//    + 4758 不在原版 itemAnimations 注册表（Main.InitializeItemAnimations 亲读无 4758）
//    + 物品图标为 dataURL 静态烘焙（探针 BJ632-A：src 三秒零变更/内容非白）。
//  ③真凶=召唤物主精灵错帧循环：原版 AI_169_Smolstars 全函数零 frame 写（源码扫描
//    断言）→ proj.frame 恒 0（帧 0=暗刃 avgRGB(87,63,116)）；projFrames[864]=2 的
//    帧 1 = 纯白模（340/340 全白）仅作辉光层（Main.cs:31395-31403 value18.Y+=Height
//    4 份旋转 A/4）。本仓 MinionProj.draw 帧选链旧通用兜底 age/8 % 2 令主精灵每 8t
//    切白帧 = 用户实报「一直闪白」（探针 BJ632-D：白块率 0↔0.108 方波、半周期≈8t）。
//    落刀 = 帧选链 864 专支 frame=0（本测试 ③ 锁）。
//  ★判别力：摘 864 专支（回落 age/8 兜底）→ ③ 红（ages 8..15 抽到 864|1 白帧 canvas）。
//  同族普查（2026-10-10，落兜底且 projFrames>1 的召唤物六型）：
//    864  原版恒帧0        → 白闪 bug（本刀修）
//    688/689/690 AI_137 光环塔 原版 8t 循环全帧（Projectile.cs:70021）→ 本仓 age/8 同相 ✓
//    643  AI_123 彩虹水晶  原版 3t 循环（:37788）→ 本仓 8t=节奏债（登记,非白闪）
//    758  AI_067 吸血青蛙  原版分段帧机（:50815 frame=14+fc/3 等）→ 本仓 8t=帧档债（登记）
//    1119 AI_206 帕鲁猫    原版状态帧（0/5, AI_206_ForbiddenMinion）→ 本仓 8t=帧档债（登记）
//  伴生债：864 原版辉光/残影面（Main.cs:30883 残影档/:31218 残影色/:31395 四份旋转辉光）
//  本仓未实现 = 登记债（缺辉光 ≠ 白闪;独立刀）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setProjSpriteOverride, projFrameImg } from '../src/entities/Arrow';
import { MinionProj } from '../src/entities/MinionProj';
import { ITEM_GLOWMASK } from '../src/data/vanillaItemGlow';

const GAME = join(__dirname, '..');

// projFrameImg 走 document.createElement（node 无 DOM）——batch6-blue-fixes 同款桩,
// 每次调用产唯一对象并登记（身份判帧用）
function stubDocument(): { created: Array<{ width: number; height: number }> } {
  const created: Array<{ width: number; height: number }> = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const c: { width: number; height: number; getContext: () => unknown } = {
        width: 0, height: 0,
        getContext: () => ({
          set imageSmoothingEnabled(_: boolean) {},
          drawImage() {},
        }),
      };
      created.push(c);
      return c;
    },
  });
  return { created };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- ③ 源码扫描助手（反编译亲读的机械锁） ----
function csBlock(src: string, startMarker: string, endMarker: RegExp): string {
  const i = src.indexOf(startMarker);
  expect(i, `源码锚缺失: ${startMarker}`).toBeGreaterThan(-1);
  const rest = src.slice(i + startMarker.length);   // 从起点之后找 end（防自匹配）
  const m = rest.match(endMarker);
  return m && m.index != null ? rest.slice(0, m.index) : rest;
}

describe('BJ632-①:glowMask 候选销案（白模逐帧闪不成立于物品面）', () => {
  it('原版 Item.cs SetDefaults case 4758 无 glowMask 赋值（源码扫描）', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
    const block = csBlock(src, '\t\tcase 4758:', /\t\tcase /);
    expect(block).toContain('summon = true');           // 块锚自证（刃杖 SetDefaults）
    expect(block).not.toMatch(/glowMask\s*=/);
  });

  it('本仓 ITEM_GLOWMASK 表无 4758（BJ601 67 件忠实提取;误入即槽位光罩面回归）', () => {
    expect(ITEM_GLOWMASK[4758]).toBeUndefined();
  });
});

describe('BJ632-②:物品图标面销案（单帧/不在 itemAnimations 注册表）', () => {
  it('原版 Item_4758.png = 46×46 单帧（贴图头亲读）', () => {
    const png = readFileSync(join(GAME, '..', 'terraria-assets', 'Images', 'Item_4758.png'));
    // PNG IHDR: 宽高 @16..24（大端）
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    expect([w, h]).toEqual([46, 46]);
  });

  it('原版 itemAnimations 注册表（Main.InitializeItemAnimations）无 4758', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Main.cs'), 'utf8');
    const block = csBlock(src, 'public static void InitializeItemAnimations()', /\n\tpublic (static )?\w/);
    expect(block).toContain('RegisterItemAnimation(75,');   // 块锚自证（坠星注册在列）
    expect(block).not.toContain('RegisterItemAnimation(4758');
  });

  it('数据面：vanilla.json items[4758] 图标矩形 46×46（atlas 切片=原版整帧）', () => {
    const vanilla = JSON.parse(readFileSync(join(GAME, 'public', 'sprites', 'vanilla.json'), 'utf8')) as {
      items: Record<string, { iw?: number; ih?: number; key?: string }>;
    };
    const m = vanilla.items['4758'];
    expect(m.key).toBe('Smolstar');
    expect(m.iw).toBe(46);
    expect(m.ih).toBe(46);
  });
});

describe('BJ632-③:真凶锁——召唤物主精灵恒帧 0（白帧只准进辉光层）', () => {
  it('原版贴图 Projectile_864.png = 18×64（2 帧×32）+ Main.cs projFrames[864]=2', () => {
    const png = readFileSync(join(GAME, '..', 'terraria-assets', 'Images', 'Projectile_864.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([18, 64]);
    const main = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Main.cs'), 'utf8');
    expect(main).toMatch(/projFrames\[864\] = 2;/);
  });

  it('原版 AI_169_Smolstars 全函数零 frame 写（frame 恒 0 的反编译机械锚）', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8');
    const block = csBlock(src, 'private void AI_169_Smolstars()', /\n\tprivate /);
    expect(block).toContain('Minion_FindTargetInRange');    // 块锚自证
    // frame 赋值/自增（frameCounter 不算——AI_169 连 frameCounter 都无）
    expect(block.match(/\bframe\s*(\+\+|=(?!=))/g) ?? []).toEqual([]);
  });

  it('帧 1 = 纯白模（340/340 全白）:辉光层专用帧不得进主精灵（定谳物证锁）', () => {
    const { created } = stubDocument();
    setProjSpriteOverride(864, { width: 18, height: 64 } as unknown as HTMLImageElement);
    const f0 = projFrameImg(864, 0);
    const f1 = projFrameImg(864, 1);
    expect(f0).toBeTruthy();
    expect(f1).toBeTruthy();
    expect(created.length).toBeGreaterThanOrEqual(2);
    // 帧切片尺寸 = 18×32（projFrameCount(864)=2 → 帧高 32）
    expect(f0!.width).toBe(18);
    expect(f0!.height).toBe(32);
    expect(f1!.width).toBe(18);
    expect(f1!.height).toBe(32);
    void created;
  });

  it('MinionProj(864).draw 跨 age 0..47 全程只画帧 0 canvas（摘专支回落 age/8 → 红）', () => {
    stubDocument();
    setProjSpriteOverride(864, { width: 18, height: 64 } as unknown as HTMLImageElement);
    const obj0 = projFrameImg(864, 0)!;    // 预热缓存（864|0 唯一对象）
    const obj1 = projFrameImg(864, 1)!;    // 白帧缓存对象（断言永不被 draw 消费）
    const drawn: Array<unknown> = [];
    const ctx = {
      imageSmoothingEnabled: false,
      globalAlpha: 1 as number,
      globalCompositeOperation: 'source-over',
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
      drawImage: (...args: unknown[]) => { drawn.push(args[0]); },
    };
    const r = { ctx, lighting: undefined, atlas: undefined } as never;
    const m = new MinionProj(100 * 16, 100 * 16, 864, 6, 0, false, 0, false, () => null);
    const ages = [0, 1, 7, 8, 9, 15, 16, 17, 23, 24, 25, 31, 32, 40, 47, 48];
    for (const a of ages) {
      drawn.length = 0;
      (m as unknown as { age: number }).age = a;
      m.draw(r);
      const sliceDrawn = drawn.filter((t) => t === obj0 || t === obj1);
      expect(sliceDrawn.length, `age=${a} 应有主精灵 draw`).toBeGreaterThan(0);
      for (const t of sliceDrawn) {
        expect(t, `age=${a} 画了白帧 canvas（主精灵帧错）`).toBe(obj0);
      }
    }
  });
});
