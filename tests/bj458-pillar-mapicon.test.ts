// BJ458（2026-10-03）四柱小地图图标「只画头部一小块」定谳+落刀锁：
// 原版机制锚（Main.DrawMap → DrawNPCMapIcons/2/3，Main.cs:56537/56471/56757）：
//   · 一切 GetBossHeadTextureIndex()!=-1 的 NPC（NPC.cs:7584；表 NPCID.cs:4867
//     NPCID.Sets.BossHeadTextures：517 日曜柱→27 / 422 星旋柱→28 / 507 星云柱→29 /
//     493 星尘柱→30）在小地图/全屏地图/覆盖式地图一律画【整个】TextureAssets
//     .NpcHeadBoss[idx] 贴图（BossNPCHeadRenderer=OutlinedTextureRenderer(NpcHeadBoss),
//     Main.cs:11020-11021 → DrawWithOutlines origin=target.Size()/2 中心锚,
//     OutlinedTextureRenderer.cs:26-40）——【恒整贴图,无源矩形裁剪】。
//   · 烘焙描边=贴图+8px 画布上黑外圈 8 向环(|i|+|j|==4)+白内圈 4 向环(|k|+|l|==2)
//     （AnOutlinedDrawRenderTargetContent.HandleUseRequest;borderColor 缺省 White,
//     boss 域从不调 UseColor）。
//   · 四柱正确形态=完整王冠头图标 26×30（非整柱身体——原版地图像素管线
//     MapHelper.cs/WorldMap.cs 全文零 NPC 引用,NPC 身体从不往地图盖章）。
// 本仓病灶：Renderer.drawMapHeads boss 循环旧调 drawHead 缺省 sw=24/sh=22 源矩形
//   （玩家头带尺寸）——26×30 的柱头贴图被裁掉下 8 行+右 2 列=「一小块头部悬空」；
//   全三样式同链同病；boss 血条路径（BossBars drawBigProgressBar 全贴图）无此病。
// 落刀：新增 Renderer.drawBossMapIcon（整贴图中心锚+黑/白环烘焙剪影按 idx+img 身份
//   缓存,环几何与原版逐位同构）替换 drawHead 缺省裁剪调用。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOSS_HEAD_INDEX } from '../src/data/vanillaNpcs';

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const npcidSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria.ID/NPCID.cs'), 'utf8');

/** PNG IHDR 尺寸（字节 16-24 大端宽高；3787-skyfracture 同款零依赖直读） */
function pngSize(rel: string): { w: number; h: number } {
  const buf = readFileSync(new URL(rel, import.meta.url));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('BJ458 ①原版锚：BossHeadTextures 四柱表（NPCID.cs:4867 反编译直读）', () => {
  it('反编译源含 517→27/422→28/507→29/493→30（与 BOSS_HEAD_INDEX 消费值一致）', () => {
    const m = npcidSrc.match(/BossHeadTextures = Factory\.CreateIntSet\([^)]*\)/);
    expect(m, 'NPCID.cs BossHeadTextures 表行').toBeTruthy();
    const t = m![0];
    for (const [id, idx] of [[517, 27], [422, 28], [507, 29], [493, 30]] as const) {
      expect(t).toContain(`${id}, ${idx}`);
      expect(BOSS_HEAD_INDEX[id]).toBe(idx);
    }
  });
});

describe('BJ458 ②贴图真值：四柱头图标实尺 26×30（IHDR 直读,非 24×22）', () => {
  it('NPC_Head_Boss_27..30 = 26×30——24×22 缺省源矩形必然裁掉下 8 行+右 2 列', () => {
    for (const idx of [27, 28, 29, 30]) {
      const s = pngSize(`../public/sprites/vanilla/NPC_Head_Boss_${idx}.png`);
      expect([s.w, s.h], `Boss_${idx}`).toEqual([26, 30]);
      expect([s.w, s.h]).not.toEqual([24, 22]);
    }
  });
  it('boss 头贴图族尺寸不均(24×30..50×48)——任何写死源矩形都不可能 1:1', () => {
    // 抽锚两端:日月神教教主头(2)=24×30 与 月总(39)=50×48;判别面=尺寸互异
    const a = pngSize('../public/sprites/vanilla/NPC_Head_Boss_2.png');
    const b = pngSize('../public/sprites/vanilla/NPC_Head_Boss_39.png');
    expect([a.w, a.h]).toEqual([24, 30]);
    expect([b.w, b.h]).toEqual([50, 48]);
    expect([a.w, a.h]).not.toEqual([b.w, b.h]);
  });
});

describe('BJ458 ③结构锁：boss 循环走整贴图 drawBossMapIcon（天然尺寸+烘焙环缓存）', () => {
  it('boss 头绘制=drawBossMapIcon(img 天然 width/height)——缺省 24×22 裁剪调用已退役', () => {
    // 旧病灶指纹:drawHead(...NPC_Head_Boss...) 不传 sw/sh(吃 24×22 缺省)
    expect(rendererSrc).not.toMatch(
      /drawHead\(\s*this\.atlas\.ensureVImage\(`vanilla\/NPC_Head_Boss_\$\{idx\}\.png`\)/,
    );
    // 新刀:调用点取整贴图天然尺寸并走 drawBossMapIcon
    //（★BJ459:调用面追加第 10 参 flip——GetBossHeadSpriteEffects 接线,
    //  整贴图天然尺寸判别面不变）
    expect(rendererSrc).toMatch(
      // ★BJ459 后块内含悬停名命中+flip 两语句——guard 到调用改块内懒匹配(判别面:
      // bimg 实尺 guard + drawBossMapIcon 调用形态)
      /if \(bimg && bimg\.width > 0 && bimg\.height > 0\) \{[\s\S]*?this\.drawBossMapIcon\(ctx, headScale, mapX, mapY, e\.cx, e\.cy, rot, idx, bimg, flip\);/,
    );
    // 整贴图判别面:sw/sh 源=贴图天然宽高(任何写死 24×22 回潮即红)
    expect(rendererSrc).toMatch(
      /const sw = \(img as ImageBitmap \| HTMLImageElement\)\.width;\s*const sh = \(img as ImageBitmap \| HTMLImageElement\)\.height;/,
    );
  });
  it('drawBossMapIcon=黑外圈 8 向环+白内圈 4 向环+本体中心锚(环偏移与原版逐位同构)', () => {
    // 环几何锁:外圈 ±4 轴向+±2 对角(|i|+|j|==4);内圈 ±2 轴向(|k|+|l|==2)
    expect(rendererSrc).toMatch(
      /\[\[-4, 0\], \[-2, -2\], \[0, -4\], \[2, -2\], \[4, 0\], \[2, 2\], \[0, 4\], \[-2, 2\]\]/,
    );
    expect(rendererSrc).toMatch(/\[\[-2, 0\], \[0, -2\], \[2, 0\], \[0, 2\]\]/);
    // 本体绘制:中心锚(-sw/2,-sh/2)+整贴图(无源矩形四参裁剪形态)
    expect(rendererSrc).toMatch(/ctx\.drawImage\(img, -sw \/ 2, -sh \/ 2, sw, sh\);/);
  });
  it('烘焙剪影按 idx+img 身份缓存(原版逐贴图烘焙目标缓存同构)——黑/白双色齐备', () => {
    expect(rendererSrc).toMatch(/bossHeadSilCache = new Map<number, \{ img: CanvasImageSource; b: HTMLCanvasElement; w: HTMLCanvasElement \}>/);
    expect(rendererSrc).toMatch(/if \(hit && hit\.img === img\) return hit;/);
    expect(rendererSrc).toMatch(/b: bake\('#000000'\), w: bake\('#ffffff'\)/);
  });
  it('小地图/全屏图/覆盖式三样式共用 drawMapHeads(一处修三面不回归)', () => {
    const calls = rendererSrc.match(/this\.drawMapHeads\(ctx/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});
