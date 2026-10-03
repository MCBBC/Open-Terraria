// BJ459（2026-10-03）boss 地图头悬停名 + 491 飞翔荷兰人 boss 头翻转（BJ458 同域两微债）
// 原版机制锚（亲读 1457 反编译）：
//   ①悬停名（小地图 DrawNPCMapIcons2 Main.cs:57043-57058 / 全屏 DrawNPCMapIcons
//     :57121-57127 双路同构）：boss 头绘制锚 num9/num10 ± 贴图实尺×headScale 一半
//     =命中矩形（num11..14），鼠标落入 → mouseTextString = GivenOrTypeName
//     （NPC.cs:6767 = HasGivenName ? _givenName : TypeName；boss 无 given 名 →
//     TypeName）。Main.cs 中 `mouseTextString = npc[i].GivenOrTypeName;` 恰 2 处
//     （城镇面=FullName 两处，boss 面=GivenOrTypeName 两处，BJ1 已接城镇面）。
//   ②翻转（NPC.GetBossHeadSpriteEffects NPC.cs:7661-7669）：全族唯一例——仅
//     type==491(飞翔荷兰人) && spriteDirection==1 → SpriteEffects.FlipHorizontally，
//     其余恒 None。消费=DrawNPCHeadBoss → BossNPCHeadRenderer.DrawWithOutlines
//     （effects 传入，黑环/白环/本体三处 draw 全带同一 effects；Main.cs:57420-57463）。
// 本仓载体：491 的 spriteDirection=e.facing（AI 逐 t 末写 −sign(vx)，bossAI_dd2.ts
//   :685 ←原版 AI_93 :39340 同构），与船体 drawDutchman `e.facing === 1` 同源。
// 落刀：vanillaNpcs.bossHeadSpriteEffects/bossHeadHoverHit 两纯函数（1:1）+
//   Renderer.drawMapHeads boss 循环接线 + drawBossMapIcon 第 10 参 flip（canvas
//   内层 scale(-1,1)=XNA 顶点序 flip→scale→rotate→translate 同构，剪影缓存键
//   idx+img 不含 flip 维=零缓存冲突）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOSS_HEAD_INDEX, bossHeadSpriteEffects, bossHeadHoverHit } from '../src/data/vanillaNpcs';

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const npcSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8');
const mainSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8');
const npcidSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria.ID/NPCID.cs'), 'utf8');

/** PNG IHDR 尺寸（字节 16-24 大端宽高；bj458 同款零依赖直读） */
function pngSize(rel: string): { w: number; h: number } {
  const buf = readFileSync(new URL(rel, import.meta.url));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** GetBossHeadSpriteEffects 函数体（NPC.cs 定义唯一,按签名行切到收尾花括号） */
function getBossHeadSpriteEffectsBody(): string {
  const sig = npcSrc.indexOf('public SpriteEffects GetBossHeadSpriteEffects()');
  expect(sig, 'NPC.cs GetBossHeadSpriteEffects 定义行').toBeGreaterThan(0);
  const body = npcSrc.slice(sig, npcSrc.indexOf('}', npcSrc.indexOf('spriteDirection == 1', sig)));
  return body;
}

describe('BJ459 ①原版锚：GetBossHeadSpriteEffects 全族唯一例=491（NPC.cs:7661 反编译直读）', () => {
  it('函数体含且仅含 num==491 && spriteDirection==1 → FlipHorizontally 一例', () => {
    const body = getBossHeadSpriteEffectsBody();
    expect(body).toContain('SpriteEffects result = SpriteEffects.None;');
    expect(body).toContain('int num = type;');
    expect(body).toContain('if (num == 491 && spriteDirection == 1)');
    expect(body).toContain('result = SpriteEffects.FlipHorizontally;');
    // 唯一例判别面：函数体内 if 恰 1 个（任何"再补一例"的手改即红）
    expect(body.match(/if \(/g)?.length).toBe(1);
  });
  it('BossHeadTextures 表 491→26（NPCID.cs:4867）且本仓 BOSS_HEAD_INDEX 消费值一致', () => {
    expect(npcidSrc).toContain('134, 25, 491, 26, 517, 27');
    expect(BOSS_HEAD_INDEX[491]).toBe(26);
  });
  it('GivenOrTypeName=HasGivenName?_givenName:TypeName（NPC.cs:6767）;boss 悬停文本两路同源恰 2 处', () => {
    const def = npcSrc.indexOf('public string GivenOrTypeName');
    expect(def).toBeGreaterThan(0);
    const body = npcSrc.slice(def, def + 320);   // 属性体全长 <300 字符
    expect(body).toContain('if (!HasGivenName)');
    expect(body).toContain('return TypeName;');
    expect(body).toContain('return _givenName;');
    // 小地图 DrawNPCMapIcons2 :57058 + 全屏 DrawNPCMapIcons :57127
    expect(mainSrc.match(/mouseTextString = npc\[i\]\.GivenOrTypeName;/g)?.length).toBe(2);
  });
  it('悬停命中矩形=贴图实尺×headScale 中心±半径（Main.cs 双路 NpcHeadBoss num11..14 形态）', () => {
    // DrawNPCMapIcons2 小路径：num11=num9−Width/2×headScale … num14=num12+Height×headScale
    expect(mainSrc).toMatch(
      /num11 = num9 - \(float\)\(TextureAssets\.NpcHeadBoss\[bossHeadTextureIndex\]\.Width\(\) \/ 2\) \* headScale;/,
    );
    expect(mainSrc).toMatch(
      /num13 = num11 \+ \(float\)TextureAssets\.NpcHeadBoss\[bossHeadTextureIndex\]\.Width\(\) \* headScale;/,
    );
  });
});

describe('BJ459 ②悬停命中行为：bossHeadHoverHit（491/四柱/EoC 各一,真尺×headScale）', () => {
  // 真尺（IHDR 直读）：荷兰人 26=30×28 / 四柱 27=26×30 / EoC 0=26×28
  const cases: Array<[string, number, number, number]> = [
    ['491 荷兰人(idx26)', 30, 28, 26],
    ['四柱日曜(517→idx27)', 26, 30, 27],
    ['EoC(4→idx0)', 26, 28, 0],
  ];
  for (const [name, w, h, idx] of cases) {
    it(`${name}：贴图实尺 ${w}×${h}——中心/内沿命中,越界未中,headScale 进出矩形同步缩放`, () => {
      expect(pngSize(`../public/sprites/vanilla/NPC_Head_Boss_${idx}.png`)).toEqual({ w, h });
      const hs = 1.1;
      const cx = 500, cy = 300;
      // 中心命中
      expect(bossHeadHoverHit({ x: cx, y: cy }, cx, cy, w, h, hs)).toBe(true);
      // 内沿（右/下边界含端点——原版 >=/<= 双闭区间）
      expect(bossHeadHoverHit({ x: cx + (w / 2) * hs, y: cy + (h / 2) * hs }, cx, cy, w, h, hs)).toBe(true);
      // 越界 1px 未中（四向）
      expect(bossHeadHoverHit({ x: cx + (w / 2) * hs + 1, y: cy }, cx, cy, w, h, hs)).toBe(false);
      expect(bossHeadHoverHit({ x: cx - (w / 2) * hs - 1, y: cy }, cx, cy, w, h, hs)).toBe(false);
      expect(bossHeadHoverHit({ x: cx, y: cy + (h / 2) * hs + 1 }, cx, cy, w, h, hs)).toBe(false);
      expect(bossHeadHoverHit({ x: cx, y: cy - (h / 2) * hs - 1 }, cx, cy, w, h, hs)).toBe(false);
      // headScale 减半 → 矩形同步缩半（原版 num11..14 同乘 headScale）:全档内沿同点在半档必未中
      expect(bossHeadHoverHit({ x: cx + (w / 2) * hs, y: cy }, cx, cy, w, h, hs / 2)).toBe(false);
      // 尺寸判别面（BJ458 同族病灶指纹）:同一点真尺矩形命中、24×22 写死矩形未中
      const probe = { x: cx + 12.5 * hs, y: cy + 11.5 * hs };
      expect(bossHeadHoverHit(probe, cx, cy, w, h, hs)).toBe(true);
      expect(bossHeadHoverHit(probe, cx, cy, 24, 22, hs)).toBe(false);
    });
  }
  it('mouse=null → 恒未中（覆盖式路径不喂 mouse,城镇面 BJ1 两路喂点同构）', () => {
    expect(bossHeadHoverHit(null, 0, 0, 30, 28, 1.1)).toBe(false);
  });
  it('结构锁：命中才落 mapNpcHeadHoverName=Lang.npcName(vid)（GivenOrTypeName 等价）', () => {
    expect(rendererSrc).toMatch(
      /if \(bossHeadHoverHit\(mouse, mapX\(e\.cx\), mapY\(e\.cy\), bimg\.width, bimg\.height, headScale\)\) \{\s*this\.mapNpcHeadHoverName = Lang\.npcName\(vid\) \?\? '';/,
    );
    // boss 块在城镇块后（同槽单值,原版同循环 boss 块靠后同序）
    const townPos = rendererSrc.indexOf('this.mapNpcHeadHoverName = n.givenName');
    const bossPos = rendererSrc.indexOf('this.mapNpcHeadHoverName = Lang.npcName(vid)');
    expect(townPos).toBeGreaterThan(0);
    expect(bossPos).toBeGreaterThan(townPos);
  });
});

describe('BJ459 ③翻转位：bossHeadSpriteEffects（491&&sd==1 唯一翻,余恒 None）', () => {
  it('491：spriteDirection==1 → 翻;-1/0 → 不翻', () => {
    expect(bossHeadSpriteEffects(491, 1)).toBe(true);
    expect(bossHeadSpriteEffects(491, -1)).toBe(false);
    expect(bossHeadSpriteEffects(491, 0)).toBe(false);
  });
  it('其余 boss（EoC/世吞/守卫/世纪花/四柱族）双向恒 None（唯一例判别面）', () => {
    for (const vid of [4, 13, 50, 134, 222, 245, 246, 249, 262, 266, 325, 327, 344, 345, 346, 35, 68, 370, 396, 422, 439, 440, 493, 507, 517, 549, 551, 564, 565, 576, 577, 636, 657, 668]) {
      expect(bossHeadSpriteEffects(vid, 1), `vid=${vid} sd=1`).toBe(false);
      expect(bossHeadSpriteEffects(vid, -1), `vid=${vid} sd=-1`).toBe(false);
    }
  });
  it('结构锁：drawBossMapIcon 消费 flip 参（内层 scale(-1,1) 在环/本体 draw 之前）', () => {
    // 签名:第 10 参 flip 缺省 false
    expect(rendererSrc).toMatch(
      /wx: number, wy: number, rot: number, idx: number, img: CanvasImageSource,\s*flip = false,/,
    );
    const fn = rendererSrc.slice(
      rendererSrc.indexOf('private drawBossMapIcon('),
      rendererSrc.indexOf('bossHeadSilCache = new Map'),
    );
    // XNA 顶点序 flip→scale→rotate→translate:flip 在 headScale scale 后、全部 drawImage 前
    const scaleFlip = fn.indexOf('if (flip) ctx.scale(-1, 1);');
    const headScalePos = fn.indexOf('ctx.scale(headScale, headScale);');
    const firstDraw = fn.indexOf('ctx.drawImage(sil.b');
    expect(scaleFlip).toBeGreaterThan(headScalePos);
    expect(scaleFlip).toBeLessThan(firstDraw);
    // flip 在黑/白环与本体同一变换坐标系内（原版三处 draw 全带同一 effects）
    expect(fn.match(/ctx\.drawImage\(/g)?.length).toBe(3);
  });
  it('头体同源锁：491 载体=facing(AI 末写 −sign(vx) :685)且船体 drawDutchman 同消费', () => {
    const ai = readFileSync(join(ROOT, 'src/entities/bossAI_dd2.ts'), 'utf8');
    // AI 写值=原版 AI_93 spriteDirection=−Math.Sign(velocity.X)（NPC.cs:39340）同构
    expect(ai).toMatch(/e\.facing = e\.vx === 0 \? e\.facing : -sign\(e\.vx\);/);
    // 船体翻面（Renderer.drawDutchman）与头翻转同载体——头体恒同相
    expect(rendererSrc).toMatch(/const flip = e\.facing === 1;/);
  });
});

describe('BJ459 ④与 BJ458 描边/缓存零冲突', () => {
  it('剪影缓存键=idx+img 身份,不含 flip 维（翻转经 ctx 变换施加,不改烘焙面）', () => {
    expect(rendererSrc).toMatch(
      /bossHeadSilCache = new Map<number, \{ img: CanvasImageSource; b: HTMLCanvasElement; w: HTMLCanvasElement \}>/,
    );
    expect(rendererSrc).toMatch(/private bossHeadSilPair\(idx: number, img: CanvasImageSource, sw: number, sh: number\)/);
    expect(rendererSrc).toMatch(/if \(hit && hit\.img === img\) return hit;/);
    // 命中判定只看 img 身份（flip 参不存在于 bake 任何路径）
    const silFn = rendererSrc.slice(
      rendererSrc.indexOf('private bossHeadSilPair('),
      rendererSrc.indexOf('private bossHeadSilPair(') + 1200,
    );
    expect(silFn).not.toContain('flip');
  });
  it('BJ458 环几何/整贴图调用形态原样保留（回归不破）', () => {
    expect(rendererSrc).toMatch(
      /\[\[-4, 0\], \[-2, -2\], \[0, -4\], \[2, -2\], \[4, 0\], \[2, 2\], \[0, 4\], \[-2, 2\]\]/,
    );
    expect(rendererSrc).toMatch(
      /if \(bimg && bimg\.width > 0 && bimg\.height > 0\) \{\s*\/\/ ★BJ459/s,
    );
    expect(rendererSrc).toMatch(/this\.drawBossMapIcon\(ctx, headScale, mapX, mapY, e\.cx, e\.cy, rot, idx, bimg, flip\);/);
    // 双刀接线在 boss 循环内同块共存（悬停名先落、翻转后画=原版命中在 Draw 前独立算）
    const block = rendererSrc.slice(
      rendererSrc.indexOf('const bimg = this.atlas.ensureVImage(`vanilla/NPC_Head_Boss_${idx}.png`)'),
      rendererSrc.indexOf('this.drawBossMapIcon(ctx, headScale, mapX, mapY, e.cx, e.cy, rot, idx, bimg, flip);'),
    );
    expect(block).toContain('bossHeadHoverHit(mouse,');
    expect(block).toContain('bossHeadSpriteEffects(vid, e.facing)');
  });
});
