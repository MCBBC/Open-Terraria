// ★BJ370 旗帜 z 序判谳锁（2026-09-27 用户实报"旗遮家具"定谳批）：
//
// 判谳（反编译唯一基准，全链亲读）——用户断言"原版旗帜画在家具后面"被证伪：
//   ① 击杀旗 tile 91（TileID.Banners=91，TileID.cs:619；任务书 336=LivingFire 误记）：
//     原版 IsTileDrawLayerSolid(91)=tileSolid[91]=false（Main.cs SetTileSets 无赋值行；
//     DrawTileInSolidLayer 覆盖表仅 {11,470,475,78,579}=true，TileID.cs:219-231）
//     → non-solid pass；扫描循环 case 91 注册 MultiTileVine 后 continue（TileDrawing.cs:
//     583-588，本体不走扫描绘制）→ PostDrawTiles(false)（:419-447）→ DrawMultiTileVines
//     （:426→:8997 case 91 1×3 :9032）spriteBatch 直绘。正常链时序（Main.cs DoDraw）：
//     :64240 behindNPC 缓存 → :64241 DoDraw_Tiles_NonSolid〔:64324 DrawTiles(false)=
//     桌 14/椅 15/工作台 18 等 tileSolid=false 家具在此扫描〕→ :64335 DrawTileEntities(false)
//     =【旗在此画】→ :64242 瀑布 → :64256 DoDraw_Tiles_Solid〔:64289 DrawTiles(true)=
//     solid 块/箱 21 在此，遮挡旗帜〕→ :64261-64262 玩家/NPC（遮挡旗帜）。
//     ⟹ 旗压 non-solid 家具 = 原版本相；solid 块压旗 = 原版；玩家压旗 = 原版。
//   ② 入驻旗 HouseBanner（红布+镇民头像，Main.cs:41414-41537）：唯一调用点
//     DrawInterface_7_TownNPCHouseBanners（:46992）= UI 层压一切；几何=天花板下第一格起
//     （:41459 while 爬 solid）、num9=18（平台 10）、TextureAssets.HouseBanner=
//     Images/UI/House_Banner（AssetInitializer.cs:564）Frame(2,2) 单帧 34×42——标准矮房
//     垂进站人行 23px = 原版常态压桌。
//   ③ 本仓同相面：击杀旗走 WindSway 摆层（烘焙摘除 swayBakeSkip + Renderer.drawWindSwayTiles
//     画在 tile 烘焙层之后）→ 旗压 non-solid 家具 ✓；实体层更后 → 玩家压旗 ✓；入驻旗
//     drawHouseBanners 画在实体层前 → 压桌 ✓（几何 by=(cy+1)·16+18 与原版同式）。
//   ④ 本仓登记反相/偏差面（报告备案，非本刀）：旗 91 vs solid 块（原版块压旗，本仓旗压块
//     ——溢出/摆幅像素级，单烘焙层架构债）；入驻旗 vs 玩家/NPC（原版 UI 层旗压角色，本仓
//     刻意让角色从旗前走过=偏差备案）；入驻旗纹理 House_Banner_1(32×40) vs 原版
//     UI/House_Banner 单帧(34×42)——★BJ386（2026-09-28）已收官：纹理换
//     vanilla-ui/UI_House_Banner.png Frame(2,2) 帧 34×42（X 列=房位登记门牌,
//     本仓无 TownManager 房位面 → X 恒 0=读档态同相;Y 行=housingCategory 单源接线）。
// 本测试锁【同相处不回归】：烘焙摘除谓词、摆层序位（源码锚）、入驻旗几何式（源码锚）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { swayBakeSkip } from '../src/render/WindSway';

const ROOT = join(import.meta.dirname, '..');

function lineOf(src: string, needle: string): number {
  const i = src.indexOf(needle);
  expect(i, `源码锚缺失: ${needle}`).toBeGreaterThanOrEqual(0);
  return src.slice(0, i).split('\n').length;
}

describe('BJ370 ①击杀旗 91 归属面（TileID.cs:619 / Main.cs SetTileSets / tiles.ts:278）', () => {
  const id91 = TILE_INTERNAL_BY_SHEET.get(91);
  it('sheet 91 已注册且 solid=false（IsTileDrawLayerSolid 回落面=non-solid pass 同相）', () => {
    expect(id91).toBeDefined();
    expect(TILE_DEFS[id91!].vanilla?.sheet).toBe(91);
    expect(TILE_DEFS[id91!].solid).toBe(false);
  });
});

describe('BJ370 ②烘焙摘除面（旗走 WindSway 摆层，不入静态烘焙）', () => {
  const id91 = TILE_INTERNAL_BY_SHEET.get(91)!;
  it('swayBakeSkip(91) 全 frameX=true（类型级摘除；MULTI_VINE 含 91）', () => {
    for (const fx of [0, 18, 36, 54]) {
      expect(swayBakeSkip(id91, fx), `frameX=${fx}`).toBe(true);
    }
  });
  it('特例分支不误吞（530 fx>=270 / 705 %486>=270 / 227 排除集语义仍在）', () => {
    const id530 = TILE_INTERNAL_BY_SHEET.get(530)!;
    const id705 = TILE_INTERNAL_BY_SHEET.get(705)!;
    expect(swayBakeSkip(id530, 270)).toBe(false);
    expect(swayBakeSkip(id530, 0)).toBe(true);
    expect(swayBakeSkip(id705, 486)).toBe(true);   // %486=0 → 锚格摘除
    expect(swayBakeSkip(id705, 270 + 486)).toBe(false);
  });
});

describe('BJ370 ③渲染序面（Renderer.ts 源码锚：摆层在 tile 烘焙层后、实体层前）', () => {
  const src = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
  it('墙层 < tile 层 < WindSway 摆层 < 实体层（旗压家具 ✓ 同相；玩家压旗 ✓ 同相）', () => {
    const wallLayer = Math.min(
      lineOf(src, "bglStageGrid('wall')"),
      lineOf(src, "drawChunkGrid('wall')"),
    );
    const tileLayer = Math.min(
      lineOf(src, "bglStageGrid('tile')"),
      lineOf(src, "drawChunkGrid('tile')"),
    );
    const swayLayer = lineOf(src, 'drawWindSwayTiles(ctx');
    const entityLayer = lineOf(src, 'heldProjFrameBegin()');
    expect(wallLayer).toBeLessThan(tileLayer);
    expect(tileLayer).toBeLessThan(swayLayer);      // 旗压桌=原版同相（TileDrawing.cs:64335 后于 :64324 的本仓等价）
    expect(swayLayer).toBeLessThan(entityLayer);    // 玩家压旗=原版同相（Main.cs:64262）
  });
  it('入驻旗画在实体层前（压桌面同相；实体面=偏差备案见头注④）', () => {
    const houseBanners = lineOf(src, 'this.drawHouseBanners(entities, world, cam)');
    const entityLayer = lineOf(src, 'heldProjFrameBegin()');
    expect(houseBanners).toBeLessThan(entityLayer);
  });
});

describe('BJ370 ④入驻旗几何面（Main.cs:41459-41505 同式源码锚）', () => {
  it('挂点=home.y-1 向上爬首个实心（:41459 while）；by=旗格顶+18（平台 10，:41476-41484）', () => {
    const housing = readFileSync(join(ROOT, 'src/world/Housing.ts'), 'utf8');
    expect(housing).toContain('let cy = fromY - 1;');
    const renderer = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
    expect(renderer).toContain(
      'const by = (cy + 1) * 16 + (onPlatform ? 10 : 18) + dup * 26;',
    );
  });
});

describe('BJ386 入驻旗纹理帧选面（Main.cs:41487-41505 源码锚）', () => {
  const renderer = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
  it('纹理 = 原版 UI/House_Banner（Frame(2,2) 帧 34×42），非 House_Banner_1 整幅', () => {
    expect(renderer).toContain("vmisc('vanilla-ui/UI_House_Banner.png')");
    expect(renderer).toContain('const frameW = cloth.sw / 2, frameH = cloth.sh / 2;');
    expect(renderer).not.toContain("vmisc('vanilla/House_Banner_1.png')");
  });
  it('Y 行 = housingCategory（:41493-41495 value2.Y += Height*cat；npcHousingCategory 单源）', () => {
    expect(renderer).toContain('const cat = npcHousingCategory(n.vanillaId);');
    expect(renderer).toContain('cat * frameH');
  });
  it('X 列恒 0（房位登记面缺席=读档态同相，备案债挂 Housing.ts「本仓无 TownManager 房位面」）', () => {
    expect(renderer).toContain('const frameX = 0;');
  });
  it('命中矩形随帧走（w=frameW、h=frameH+4）', () => {
    expect(renderer).toContain('return { bx, by, w: frameW, h: frameH + 4, cy };');
  });
});
