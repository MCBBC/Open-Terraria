// TileObjectData 表驱动放置回归（2026-09-01 固化机定案）。
// 用户实报：①3×3 家具"只能点左下第一格作为起点"②"能挂墙不能落地"。
// 根因 = 放置链用左下近似+hasSupport 万物挂墙兜底，未走 vanilla 锚点表。
// 数据面 tools/recon-tileobj.mjs（1457 Terraria.ObjectData 权威）；本测试双闸：
//   A. 提取器金标（manifest == golden + 关键家族字面量钉值）
//   B. CanPlace 语义验证（Origin 对位/all-or-nothing/wall 白名单）
import { describe, it, expect } from 'vitest';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import manifestJson from '../src/data/tile-anchors.json';
import goldenJson from './golden/tile-anchor-authority.json';
import { anchorSpecOf, chooseAnchorFromClick, liquidCellOk, liquidSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import type { AnchorRec } from '../src/world/TileAnchorValidator';

const DIRT = TILE_BY_KEY['dirt']!;
const PLATFORM_TILE = TILE_BY_KEY['platform']!;

function mkStore(w = 40, h = 30): TileStore {
  return new TileStore(w, h);
}
/** 地板行 row；墙数据用 wall 数组直填 */
function layFloor(st: TileStore, x0: number, x1: number, row: number): void {
  for (let x = x0; x <= x1; x++) st.setTile(x, row, DIRT);
}
/** 占位矩形灌液（M-3 液体门测试）；本仓 liquidType 为原版 +1 编码（LIQUID_TYPE 枚举） */
function flood(st: TileStore, x: number, y: number, w: number, h: number,
  type: LIQUID_TYPE, amt = 255): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) st.setLiquid(x + i, y + j, amt, type);
}

describe('A. 提取器金标（防静默漂移）', () => {
  it('运行时 manifest 与金标逐字节一致', () => {
    expect(manifestJson.v).toBe('1457');
    expect(goldenJson).toEqual(manifestJson);
  });

  it('关键家族钉值：固化机=底锚落地不可挂墙；墙族白名单恰为 8 家', () => {
    const s220 = (manifestJson.tiles as Record<string, any>)['220'];
    expect(s220).toMatchObject({
      w: 3, h: 3, ox: 1, oy: 2,
      anchorBottom: { t: ['SolidTile', 'SolidWithTop', 'SolidSide'], cnt: 3, start: 0 },
      wall: false,
    });
    expect(anchorSpecOf(220)?.anchorTop).toBeNull();
    // ★BJ602（2026-10-10）：Style3x3Wall 系 AnchorWall 继承修复（recon-tileobj Width
    //  净化门=仅本块无 CopyFrom 时生效）——TileObjectData.cs:4794 `newTile.AnchorWall
    //  = true`（Style3x3Wall 基样式块）→ CopyFrom 后接 Width 的 241/242/245/246 同承
    //  （:4840-4846/:4853-4856/:4825-4833/:4804-4807）;240/440/334/471 无 Width 调整
    //  沿旧提取（wall=true 不变,TileObjectData.cs:4799-4824）。
    const WALL_IDS = Object.entries(manifestJson.tiles as Record<string, any>)
      .filter(([, r]) => r?.wall === true).map(([k]) => k).sort();
    expect(WALL_IDS).toEqual(['240', '241', '242', '245', '246', '334', '440', '471']);
  });

  it('M-3c 平台族 19/427 家族头缺省继承：1×1 无锚=原版数据形态（TileObjectData.cs:2128-2140/:2147-2149）', () => {
    // 家族头不声明 W/H/Origin/锚 ⇒ 继承 _baseObject 终态（SetupBaseObject :1779-1781
    // Width=1/Height=1/Origin=Point16.Zero + default(AnchorData) 锚全空）——
    // recon-tileobj.mjs 已建模 Initialize 头部 newTile 重装（:2125），不再 unparsed。
    // ★消费面注意：19/427 UsesCustomCanPlace=false（:2134/:2147）→ 原版走 legacy
    // 置放（CustomPlace :5017-5038 不受理），本仓平台亦 legacy —— 记录属完备性。
    const p19 = (manifestJson.tiles as Record<string, any>)['19']!;
    const p427 = (manifestJson.tiles as Record<string, any>)['427']!;
    expect(p19).toMatchObject({
      w: 1, h: 1, ox: 0, oy: 0,
      anchorTop: null, anchorBottom: null, wall: false,
      liq: { water: 'allowed', lava: 'notAllowed' },   // 基档（:1767-1768）+ LavaDeath 耦合（:2135→Calculate :1826-1828）
    });
    expect(p19.liqStyles).toEqual({                    // 黑曜石平台 13/43/47（:2137-2139 addSubTile(13,43,47)）
      '13': { water: 'allowed', lava: 'allowed' },
      '43': { water: 'allowed', lava: 'allowed' },
      '47': { water: 'allowed', lava: 'allowed' },
    });
    expect(p427).toMatchObject({ w: 1, h: 1, liq: { water: 'allowed', lava: 'notAllowed' } });
    expect(p427.liqStyles).toBeUndefined();            // 团队平台无子样式（:2141-2149 裸块）
    expect(anchorSpecOf(19)).not.toBeNull();           // 无 AlternateTile/Tree 位 → 可解析
    expect(anchorSpecOf(19)!.liqStyles).toEqual(p19.liqStyles);
  });
});

describe('B. CanPlace 语义（TileObject.cs 满分制移植）', () => {
  it('固化机：点击底行任意格都能按 Origin(bottom-center) 寻位放置', () => {
    const st = mkStore();
    layFloor(st, 8, 24, 12);                        // 宽敞地台 row12
    const rec = anchorSpecOf(220)!;
    // vanilla Style3x3 Origin=(1,2)：点击格=物件底中格。点 (cx,11) ⇒ 锚 x=cx-1
    for (const cx of [10, 11, 12]) {
      const r = chooseAnchorFromClick(st as never, cx, 11, rec);
      expect(r, `click ${cx}`).not.toBeNull();
      expect(r!.x).toBe(cx - 1); expect(r!.y).toBe(9);
      expect(validateAnchors(st as never, r!.x, r!.y, rec)).toBe(true);
    }
  });

  it('Smart 吸附：左右夹墙仅 3 格地台时，点击首/中/尾格皆可放置', () => {
    const st = mkStore();
    layFloor(st, 10, 12, 12);                       // 仅 3 格地面 (10..12)
    // 左右立实心柱(11 行即占位行高)模拟阻挡
    st.setTile(9, 11, DIRT); st.setTile(9, 9, DIRT);
    st.setTile(13, 11, DIRT); st.setTile(13, 9, DIRT);
    const rec = anchorSpecOf(220)!;
    // 唯一合法锚 = (10,9)；三处点击均应命中该锚
    expect(chooseAnchorFromClick(st as never, 11, 11, rec)).toEqual({ x: 10, y: 9 });   // 中
    expect(chooseAnchorFromClick(st as never, 10, 11, rec)).toEqual({ x: 10, y: 9 });   // 首格
    expect(chooseAnchorFromClick(st as never, 12, 11, rec)).toEqual({ x: 10, y: 9 });   // 尾格
  });

  it('Smart 吸附②：直接点击地面固体块本体 → 幽灵上移吸附坐落其上', () => {
    const st = mkStore();
    layFloor(st, 10, 12, 12);
    st.setTile(9, 11, DIRT); st.setTile(9, 9, DIRT);
    st.setTile(13, 11, DIRT); st.setTile(13, 9, DIRT);
    const rec = anchorSpecOf(220)!;
    // 点击表面固体格 (cx,12) ⇒ 物件应悬坐于 rows 9..11，锚=(10,9)
    for (const cx of [10, 11, 12]) {
      expect(chooseAnchorFromClick(st as never, cx, 12, rec), `surface ${cx}`)
        .toEqual({ x: 10, y: 9 });
    }
  });

  it('固化机：背景墙【不算】支撑——只有墙没有地面时拒绝（挂墙修复）', () => {
    const st = mkStore();
    for (let y = 6; y <= 12; y++) for (let x = 8; x <= 16; x++) st.wall[st.idx(x, y)] = 21;   // 木墙
    const r = chooseAnchorFromClick(st as never, 11, 11, anchorSpecOf(220)!);
    expect(r).toBeNull();                           // 底中格下方无实心 → 满分制拒绝
  });

  it('固化机：落地后跨对象占位校验（validateAnchors 占位格互斥）', () => {
    const st = mkStore();
    layFloor(st, 10, 20, 12);
    st.setTile(13, 11, DIRT);                       // 场中占一格 → 3×3 跨 10..12 不含 13 可放
    const rec = anchorSpecOf(220)!;
    expect(validateAnchors(st as never, 10, 9, rec)).toBe(true);
    expect(validateAnchors(st as never, 11, 9, rec)).toBe(false);   // 覆盖到 13 列
  });

  it('平台可作 SolidWithTop 锚：固化机可放上铺台面', () => {
    const st = mkStore();
    for (let x = 10; x <= 20; x++) st.setTile(x, 12, PLATFORM_TILE);
    const r = chooseAnchorFromClick(st as never, 11, 11, anchorSpecOf(220)!);
    expect(r).not.toBeNull();
  });

  it('吊挂族回归（旗 91 AnchorTop）：平台下方仍可挂,地板下不可竖立', () => {
    const st = mkStore();
    // 主 style 的 AnchorTop = SolidTile|SolidSide|SolidBottom|PlanterBox（vanilla 原文）；
    // 平台悬旗由 alternate(Platform 位)承担——本移植 v1 未提备选锚表，走实心天花板。
    for (let x = 10; x <= 14; x++) st.setTile(x, 10, DIRT);
    const rec91 = anchorSpecOf(91)!;
    expect(rec91.anchorTop!.t).toContain('SolidBottom');
    expect(rec91.anchorTop!.t).not.toContain('SolidWithTop');
    // Origin=(0,0):点击格=锚本身
    expect(validateAnchors(st as never, 11, 11, rec91)).toBe(true);
    for (let x = 10; x <= 14; x++) st.setTile(x, 10, 0 as never);   // setTile(0) 即清格（TileStore 无 clearTile 方法,旧可选调用恒 no-op,已删）
    layFloor(st, 10, 14, 14);                        // 仅地面无天花板
    expect(validateAnchors(st as never, 11, 11, rec91)).toBe(false);
  });

  it('桌台 1×1 族回调不受影响（mug 13 Table 锚在位但旧路径保留）', () => {
    const rec13 = anchorSpecOf(13);
    expect(rec13).not.toBeNull();                    // 路径仍表驱动可用
    expect(rec13!.anchorBottom!.t).toContain('Table');
  });
});

describe('C. 液体放置两维门（M-3 翻正：TileObjectData.LiquidPlace :1853-1907）', () => {
  // 布景：地板 row12（x 6..22）；门用天花板 row8。灌液走 LIQUID_TYPE 枚举
  // （本仓 +1 编码：WATER=1/LAVA=2/HONEY=3/SHIMMER=4——禁止裸写数字）。
  it('翻正代表件（基样式缺省 WaterPlacement=Allowed）：工作台18/箱21/门10 满水可放', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    for (let x = 6; x <= 22; x++) st.setTile(x, 8, DIRT);      // 门顶锚
    const wb = anchorSpecOf(18)!, chest = anchorSpecOf(21)!, door = anchorSpecOf(10)!;
    // 原版缺省（SetupBaseObject TileObjectData.cs:1767-1768）：基样式水里可放——
    // 旧 liqAllow 单维 false 与原版 382/382 反向，本用例翻正
    expect(wb.liq).toEqual({ water: 'allowed', lava: 'notAllowed' });
    flood(st, 10, 11, wb.w, wb.h, LIQUID_TYPE.WATER);
    expect(validateAnchors(st, 10, 11, wb)).toBe(true);
    flood(st, 14, 10, chest.w, chest.h, LIQUID_TYPE.WATER);
    expect(validateAnchors(st, 14, 10, chest)).toBe(true);
    flood(st, 18, 9, door.w, door.h, LIQUID_TYPE.WATER);
    expect(validateAnchors(st, 18, 9, door)).toBe(true);
  });

  it('水禁族（显式 WaterPlacement=NotAllowed）：篝火215/吊灯93 满水拒、半水亦拒', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const campfire = anchorSpecOf(215)!, lamp = anchorSpecOf(93)!;
    expect(campfire.liq.water).toBe('notAllowed');   // TileObjectData.cs:3326
    expect(lamp.liq.water).toBe('notAllowed');       // :2408-2409（style40 水灯为子样式覆写,基样式禁）
    flood(st, 10, 10, campfire.w, campfire.h, LIQUID_TYPE.WATER, 255);
    expect(validateAnchors(st, 10, 10, campfire)).toBe(false);
    flood(st, 16, 9, lamp.w, lamp.h, LIQUID_TYPE.WATER, 120);   // 非满液同样拒（NotAllowed 无满液豁免）
    expect(validateAnchors(st, 16, 9, lamp)).toBe(false);
  });

  it('岩浆维缺省 NotAllowed（SetupBaseObject :1768）：箱21/工作台18 岩浆拒', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const wb = anchorSpecOf(18)!, chest = anchorSpecOf(21)!;
    flood(st, 10, 11, wb.w, wb.h, LIQUID_TYPE.LAVA);
    expect(validateAnchors(st, 10, 11, wb)).toBe(false);
    flood(st, 14, 10, chest.w, chest.h, LIQUID_TYPE.LAVA);
    expect(validateAnchors(st, 14, 10, chest)).toBe(false);
  });

  it('显式 LavaPlacement=Allowed：蜥蜴祭坛237/盆栽熔岩植物613 岩浆可放（:3131/:3213）', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const altar = anchorSpecOf(237)!, potted = anchorSpecOf(613)!;
    expect(altar.liq.lava).toBe('allowed');
    expect(potted.liq.lava).toBe('allowed');
    flood(st, 10, 10, altar.w, altar.h, LIQUID_TYPE.LAVA);
    expect(validateAnchors(st, 10, 10, altar)).toBe(true);
    flood(st, 15, 7, potted.w, potted.h, LIQUID_TYPE.LAVA);
    expect(validateAnchors(st, 15, 7, potted)).toBe(true);
  });

  it('蜜/微光同走 water 维（原版 liquidType 0/2/3 同 case，:1876-1884）', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const wb = anchorSpecOf(18)!;
    flood(st, 10, 11, wb.w, wb.h, LIQUID_TYPE.HONEY);
    expect(validateAnchors(st, 10, 11, wb)).toBe(true);
    flood(st, 14, 11, wb.w, wb.h, LIQUID_TYPE.SHIMMER);
    expect(validateAnchors(st, 14, 11, wb)).toBe(true);
  });

  it('onlyInFull 语义（数据面基样式无值,合成记录验门）：半液拒/满液放/dry 拒', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const base = anchorSpecOf(18)!;
    const rec = { ...base, liq: { water: 'onlyInFull' as const, lava: 'notAllowed' as const } };
    flood(st, 10, 11, rec.w, rec.h, LIQUID_TYPE.WATER, 100);
    expect(validateAnchors(st, 10, 11, rec)).toBe(false);        // 非满液拒（:1879-1881）
    flood(st, 10, 11, rec.w, rec.h, LIQUID_TYPE.WATER, 255);
    expect(validateAnchors(st, 10, 11, rec)).toBe(true);         // 满液放
    for (let x = 10; x < 10 + rec.w; x++) st.setLiquid(x, 11, 0, LIQUID_TYPE.NONE);
    expect(validateAnchors(st, 10, 11, rec)).toBe(false);        // dry 拒（:1886-1904 else 支）
  });
});

describe('D. 子样式液体档（M-3b：newSubTile.* → liqStyles per-style 记录）', () => {
  // 真值 = TileObjectData.cs addSubTile/addSubTileRange（:2016-2096）提交到 SubTiles[style]
  // 槽;CanPlace（TileObject.cs:205-208/:342）逐 style 的 GetTileData(type,style[,alternate])
  // 消费。alternate 维不建模：1457 全表 newAlternate.* 液体赋值 0 行（_tod-substyle-audit
  // 双向发散计数=0）。数据面 = recon-tileobj.mjs liqStyles（只存与基记录发散的样式）。
  const manifestTiles = manifestJson.tiles as Record<string, any>;

  it('数据面钉值：火把4/工作台18/染料227/灯93 的 liqStyles 字面', () => {
    // 火把 4 subStyles 8/11/17：水+岩浆均放（TileObjectData.cs:4610-4613/:4617-4620/:4624-4627）
    expect(manifestTiles['4'].liqStyles).toEqual({
      '8': { water: 'allowed', lava: 'allowed' },
      '11': { water: 'allowed', lava: 'allowed' },
      '17': { water: 'allowed', lava: 'allowed' },
    });
    expect(manifestTiles['4'].liq).toEqual({ water: 'notAllowed', lava: 'notAllowed' });  // StyleTorch :4589-4590
    // 工作台 18 styles 14/43：岩浆放行（:2823-2824 addSubTile(14,43) :2825）
    expect(manifestTiles['18'].liqStyles).toEqual({
      '14': { water: 'allowed', lava: 'allowed' },
      '43': { water: 'allowed', lava: 'allowed' },
    });
    // 染料 227：style5 onlyInFull（:2196-2197）/ style7 水（:2205/:2208）
    expect(manifestTiles['227'].liqStyles).toEqual({
      '5': { water: 'onlyInFull', lava: 'notAllowed' },
      '7': { water: 'allowed', lava: 'notAllowed' },
    });
    // 灯 93：style40 水（:2416-2417）/ styles 23/42 岩浆（:2412-2413/:2414）
    expect(manifestTiles['93'].liqStyles).toEqual({
      '23': { water: 'notAllowed', lava: 'allowed' },
      '40': { water: 'allowed', lava: 'notAllowed' },
      '42': { water: 'notAllowed', lava: 'allowed' },
    });
  });

  it('火把口径对拍（Game.ts 专用分支勿双改）：liqStyles 8/11/17 ≡ isWaterTorchStyle 表', () => {
    // Game.tryPlace 火把分支（Game.ts 火把锚定区）不经 validateAnchors——其
    // WATER_TORCH_STYLES = {8,11,17}（Torch.ts:79,frameY/22=style）须与 liqStyles 一致
    const torch = manifestTiles['4'].liqStyles;
    for (const st of [8, 11, 17]) expect(torch[String(st)]).toEqual({ water: 'allowed', lava: 'allowed' });
    for (const st of [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]) expect(torch[String(st)]).toBeUndefined();
  });

  it('药草 83（FullCopyFrom 82 继承子样式 :4786-4789）：style4/6 水放、style5 岩浆放、style0 全拒', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    // 药草 anchorBottom 含 AlternateTile（:4749）走 anchorSpecOf 豁免回落——门级直取
    // manifest 原始记录验液体档（液体门与锚点门独立,AlternateTile 位 evalCell 不吃）
    const herb = manifestTiles['83'] as never as AnchorRec;  // StyleAlch 基记录水/岩浆全禁（:4750-4752）
    // style4（死亡草种子 vi_310 placeStyle=4）：水放（:4772 addSubTile(4) :4773）
    flood(st, 8, 11, herb.w, herb.h, LIQUID_TYPE.WATER);
    expect(validateAnchors(st, 8, 11, herb, 4)).toBe(true);
    expect(validateAnchors(st, 8, 11, herb, 0)).toBe(false);   // style0（daybloom）基档水禁
    for (let x = 8; x < 8 + herb.w; x++) st.setLiquid(x, 11, 0, LIQUID_TYPE.NONE);
    // style5（火焰花种子 vi_312 placeStyle=5）：岩浆放（:4777-4778 addSubTile(5) :4779）
    flood(st, 8, 11, herb.w, herb.h, LIQUID_TYPE.LAVA);
    expect(validateAnchors(st, 8, 11, herb, 5)).toBe(true);
    expect(validateAnchors(st, 8, 11, herb, 4)).toBe(false);   // style4 岩浆仍禁
    expect(validateAnchors(st, 8, 11, herb, 0)).toBe(false);
    for (let x = 8; x < 8 + herb.w; x++) st.setLiquid(x, 11, 0, LIQUID_TYPE.NONE);
    // style6（雪花莲 vi_2357 placeStyle=6）：水放（:4783 addSubTile(6) :4784）
    flood(st, 8, 11, herb.w, herb.h, LIQUID_TYPE.WATER);
    expect(validateAnchors(st, 8, 11, herb, 6)).toBe(true);
  });

  it('工作台 18（黑曜石变体 style14/43 无在册物品,门级验证）：style14/43 岩浆放、style0 岩浆拒', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const wb = anchorSpecOf(18)!;
    flood(st, 10, 11, wb.w, wb.h, LIQUID_TYPE.LAVA);
    expect(validateAnchors(st, 10, 11, wb, 0)).toBe(false);    // 基档岩浆拒（SetupBaseObject :1768）
    expect(validateAnchors(st, 10, 11, wb, 14)).toBe(true);    // 子样式 14 岩浆放（:2823-2825）
    expect(validateAnchors(st, 10, 11, wb, 43)).toBe(true);
    for (let x = 10; x < 10 + wb.w; x++) st.setLiquid(x, 11, 0, LIQUID_TYPE.NONE);
    expect(validateAnchors(st, 10, 11, wb, 14)).toBe(true);    // dry 同放（allowed 无 onlyIn 語義）
  });

  it('染料 227 style5 满水门槛（onlyInFull :2196）：半水拒/满水放/style7 半水亦放', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const dye = anchorSpecOf(227)!;
    flood(st, 10, 11, dye.w, dye.h, LIQUID_TYPE.WATER, 120);   // 非满液
    expect(validateAnchors(st, 10, 11, dye, 5)).toBe(false);   // style5 onlyInFull 半水拒
    expect(validateAnchors(st, 10, 11, dye, 7)).toBe(true);    // style7 Allowed 半水放
    expect(validateAnchors(st, 10, 11, dye, 0)).toBe(false);   // 基档水禁（StyleDye :2179）
    flood(st, 10, 11, dye.w, dye.h, LIQUID_TYPE.WATER, 255);   // 满液
    expect(validateAnchors(st, 10, 11, dye, 5)).toBe(true);
    for (let x = 10; x < 10 + dye.w; x++) st.setLiquid(x, 11, 0, LIQUID_TYPE.NONE);
    expect(validateAnchors(st, 10, 11, dye, 5)).toBe(false);   // dry 拒（:1886-1904 else 支）
  });

  it('篝火 215 子样式 1/4/9/17/20/25 水放（:3330-3352）：style1 水放、style0/基档水拒', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const cf = anchorSpecOf(215)!;
    flood(st, 10, 10, cf.w, cf.h, LIQUID_TYPE.WATER);
    expect(validateAnchors(st, 10, 10, cf, 0)).toBe(false);    // 基档水禁（:3324-3326）
    for (const style of [1, 4, 9, 17, 20, 25]) {
      expect(validateAnchors(st, 10, 10, cf, style), `style ${style}`).toBe(true);
    }
    expect(validateAnchors(st, 10, 10, cf, 2)).toBe(false);    // 无子样式档回落基记录
  });
});

describe('E. M-3c 消费接线（门 10/11 岩浆门 liqGateDoor + 药草 legacy 岩浆门 liqGateHerb）', () => {
  const manifestTiles = manifestJson.tiles as Record<string, any>;
  /** Game.ts 门分支/药草分支共用的档解析式（与消费侧逐字同构） */
  const liqOf = (sheet: number, style: number) =>
    liquidSpecOf(sheet)!.liqStyles?.[String(style)] ?? liquidSpecOf(sheet)!.liq;

  it('门 10/11 子样式钉值：19/48 黑曜石门水+岩浆均放（:2245-2247/:2289-2291）,基样式岩浆禁（:1768）', () => {
    for (const id of ['10', '11']) {
      expect(manifestTiles[id].liq).toEqual({ water: 'allowed', lava: 'notAllowed' });   // :1767-1768 + LavaDeath 耦合
      expect(manifestTiles[id].liqStyles).toEqual({
        '19': { water: 'allowed', lava: 'allowed' },     // obsidian door vid 1458 placeStyle=19（itemfunc）
        '48': { water: 'allowed', lava: 'allowed' },     // 开门态
      });
    }
  });

  it('liqGateDoor 口径：普通门 style0 岩浆拒/水放；黑曜石 19 岩浆放；未注册 style 回落基档', () => {
    const st = mkStore();
    // 门格液体态（CanPlace TileObject.cs:342 逐格消费——门 1×3 全格,本处以单格代表）
    flood(st, 10, 9, 1, 3, LIQUID_TYPE.LAVA);
    expect(liquidCellOk(st as never, 10, 9, liqOf(10, 0))).toBe(false);    // 普通门基档岩浆拒
    expect(liquidCellOk(st as never, 10, 9, liqOf(10, 5))).toBe(false);    // 未注册 style → 回落基档
    expect(liquidCellOk(st as never, 10, 9, liqOf(10, 19))).toBe(true);    // 黑曜石门岩浆放
    for (let y = 9; y < 12; y++) st.setLiquid(10, y, 0, LIQUID_TYPE.NONE);
    flood(st, 10, 9, 1, 3, LIQUID_TYPE.WATER);
    expect(liquidCellOk(st as never, 10, 9, liqOf(10, 0))).toBe(true);     // 基档水放（满水不变,Scene①回归）
    expect(liquidCellOk(st as never, 10, 9, liqOf(11, 19))).toBe(true);    // 开门态 11 同构
  });

  it('liqGateHerb 口径（legacy 路径岩浆 only,Player.cs:40058/:41809-41824）：style5 岩浆放、其余岩浆拒', () => {
    const st = mkStore();
    flood(st, 10, 11, 1, 1, LIQUID_TYPE.LAVA);
    expect(liquidCellOk(st as never, 10, 11, liqOf(83, 5))).toBe(true);    // 火焰花（:4777-4778）
    expect(liquidCellOk(st as never, 10, 11, liqOf(83, 0))).toBe(false);   // daybloom 基档（:4752）
    expect(liquidCellOk(st as never, 10, 11, liqOf(83, 4))).toBe(false);   // 水叶档只放水（:4772）
    expect(liquidCellOk(st as never, 10, 11, liqOf(82, 3))).toBe(false);   // 死亡草（FullCopyFrom :4786-4788）
  });

  it('liquidSpecOf：豁免面独立——药草 82-84 anchorSpecOf 恒 null（AlternateTile :4749）而液体档可直读', () => {
    for (const id of [82, 83, 84]) {
      expect(anchorSpecOf(id)).toBeNull();
      expect(liquidSpecOf(id)!.liq).toEqual({ water: 'notAllowed', lava: 'notAllowed' });   // StyleAlch（:4750-4752）
      expect(liquidSpecOf(id)!.liqStyles).toEqual(manifestTiles[String(id)].liqStyles);
    }
    expect(liquidSpecOf(314)).toBeNull();      // 无记录 → 消费侧不开门（不臆造缺省）
    expect(liquidSpecOf(19)!.liqStyles).toEqual(manifestTiles['19'].liqStyles);
  });

  it('validateAnchors 与 liquidCellOk 同源（M-3c 门体上移）：两维门逐格判据等价回归', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const wb = anchorSpecOf(18)!;
    flood(st, 10, 11, wb.w, wb.h, LIQUID_TYPE.LAVA);
    expect(validateAnchors(st, 10, 11, wb, 0)).toBe(false);
    expect(liquidCellOk(st as never, 10, 11, wb.liqStyles?.['0'] ?? wb.liq)).toBe(false);
    expect(validateAnchors(st, 10, 11, wb, 14)).toBe(true);
    expect(liquidCellOk(st as never, 10, 11, wb.liqStyles!['14'])).toBe(true);
  });

  // ★终审 B①（2026-09-04）：占位格阻挡判定读裸 active()（=hasTile,含已致动格）——
  //  原版 CanPlace TileObject.cs:357 `tileSafely.active() && …` 非 nactive()：
  //  已致动格=占用,原版拒绝放置进致动格。曾用 isActive=nactive() → 已致动格被当
  //  空位（放行后 setTile 不清 WIRE_ACTUATED=新块继承隐形态,原版无此态）。
  it('★B① 致动域：已致动格=占用拒放（hasTile 非 nactive）；tileCut 豁免照常放行', () => {
    const st = mkStore();
    layFloor(st, 6, 22, 12);
    const torch = anchorSpecOf(4)!;                 // 1×1 火把：占位格=火把格本体
    const stone = TILE_BY_KEY['stone']!;
    const tallgrass = TILE_BY_KEY['tallgrass']!;    // sheet 3 ∈ TILE_CUT_SHEETS（豁免面）
    // 对照：普通活性占位格 → 拒
    st.setTile(10, 11, stone);
    expect(validateAnchors(st, 10, 11, torch)).toBe(false);
    // 核心：已致动 stone（active=1,inActive=1）→ 原版仍拒（active() 裸位）
    st.setActuated(10, 11, true);
    expect(st.hasTile(10, 11)).toBe(true);
    expect(st.isActive(10, 11)).toBe(false);        // nactive=false（若门误用此读则放行）
    expect(validateAnchors(st, 10, 11, torch)).toBe(false);   // 裸 active() → 拒
    // 豁免面：tileCut 格即便已致动仍不阻挡（CanPlace :357 tileCut 支在 active() 门内放行）
    st.setTileSilent(12, 11, tallgrass, 0, 0);
    st.setActuated(12, 11, true);
    expect(validateAnchors(st, 12, 11, torch)).toBe(true);
  });
});
