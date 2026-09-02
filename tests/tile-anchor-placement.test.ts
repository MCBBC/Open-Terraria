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
import { anchorSpecOf, chooseAnchorFromClick, validateAnchors } from '../src/world/TileAnchorValidator';

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

  it('关键家族钉值：固化机=底锚落地不可挂墙；墙族白名单恰为 4 家', () => {
    const s220 = (manifestJson.tiles as Record<string, any>)['220'];
    expect(s220).toMatchObject({
      w: 3, h: 3, ox: 1, oy: 2,
      anchorBottom: { t: ['SolidTile', 'SolidWithTop', 'SolidSide'], cnt: 3, start: 0 },
      wall: false,
    });
    expect(anchorSpecOf(220)?.anchorTop).toBeNull();
    const WALL_IDS = Object.entries(manifestJson.tiles as Record<string, any>)
      .filter(([, r]) => r?.wall === true).map(([k]) => k).sort();
    expect(WALL_IDS).toEqual(['240', '334', '440', '471']);
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
