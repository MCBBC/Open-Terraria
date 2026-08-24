// R21 红队探针(env 门控=SW_R21=1,缺省 skip)——蓝队复核后更新夹具(2026-08-24):
// 1) 旗 tile 内部 id 对拍:scanBannerNpcs 曾用字面量 91 当内部 tile id,
//    实测 v_91_banners 内部 id=157(91=v_383_living_mahogany_block)→ 旗 buff 全族失效。
// 2) SceneMetrics.cs:419-447 解码对拍:num3 修正(num>=311 -1 / >=312 再 -1)
//    + 跳过段 (fx<396&&fy<54)||num==311||num==312。
// ★夹具勘误(蓝队,对拍原文定谳):初版探针以「banner id 0→npc 3、frameX=378」为夹具,
//   与原版编号不符——BannerSystem.NPCtoBanner(3=僵尸)=87(banner id 自 1 起);
//   旗物品 placeStyle = banner+21(Item.cs:19231 `placeStyle = 22 + type - 1615`,
//   1615=banner 1);故僵尸旗真实放置帧 fx=(87+21)*18=1944。而 fx<396&&fy<54
//   (style 0..21)是原版扫描【跳过区】(SceneMetrics.cs:427),该区无敌旗 buff。
// 只读探针:不改 src,不写世界档。
import { it, expect } from 'vitest';
import { TILE_BY_KEY } from '../src/data/tiles';
import { scanBannerNpcs } from '../src/world/Banners';

const RUN = process.env.SW_R21 === '1';

/** 最小 store 视图(scanBannerNpcs 只用 isActive/idx/type/frameX/frameY)。
 *  ★蓝队勘误:初版夹具以 `${x},${y}` 为键、proxy 却按 `String(idx)` 取值
 *  （idx=x*100000+y ≠ "x,y"）→ type/frameX 恒读 0,任何实现都必红。
 *  现按 idx 同键建表。 */
function fakeStore(cells: Array<{ x: number; y: number; t: number; fx: number; fy: number }>) {
  const map = new Map<string, { t: number; fx: number; fy: number }>();
  for (const c of cells) map.set(String(c.x * 100000 + c.y), { t: c.t, fx: c.fx, fy: c.fy });
  return {
    idx: (x: number, y: number) => x * 100000 + y,
    isActive: (x: number, y: number) => map.has(String(x * 100000 + y)),
    type: new Proxy({}, { get: (_t, p) => map.get(String(p))?.t ?? 0 }),
    frameX: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fx ?? 0 }),
    frameY: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fy ?? 0 }),
  } as unknown as Parameters<typeof scanBannerNpcs>[0];
}

(RUN ? it : it.skip)('R21: 旗 tile 内部 id 对拍(scanBannerNpcs 恒空集定罪)', () => {
  const bannerTile = TILE_BY_KEY['v_91_banners'];
  expect(bannerTile).toBeDefined();
  // 僵尸旗(NPCtoBanner(3)=87):真实帧 fx=(87+21)*18=1944,fy=0(SceneMetrics num=108)
  const st = fakeStore([{ x: 10, y: 10, t: bannerTile, fx: 1944, fy: 0 }]);
  const npcs = scanBannerNpcs(st, 0, 0, 20, 20);
  expect(npcs.has(3)).toBe(true);   // ← 修前实现红:type 比较 91≠157,恒空
});

(RUN ? it : it.skip)('R21: 解码修正段对拍(banner≥290 档+311/312 skip)', () => {
  const bannerTile = TILE_BY_KEY['v_91_banners'];
  // 带 2 行修正档:col=91,rows=2 → num=313≥312 → banner=91-21+222-2=290(npc 692)
  const st = fakeStore([
    { x: 5, y: 5, t: bannerTile, fx: 1638, fy: 108 },
    // 跳过区(style21,fx=378<396 且首行)——原版无 buff,不入集
    { x: 6, y: 5, t: bannerTile, fx: 378, fy: 0 },
    // num==311 占位样式(col=89,rows=2)——整格跳过
    { x: 7, y: 5, t: bannerTile, fx: 1602, fy: 108 },
  ]);
  const npcs = scanBannerNpcs(st, 0, 0, 10, 10);
  expect(npcs.has(692)).toBe(true);   // banner 290 → npc 692
  expect(npcs.size).toBe(1);          // 两枚跳过帧不得产出任何 npc
});
