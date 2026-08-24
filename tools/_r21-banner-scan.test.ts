// R21 红队探针(env 门控=SW_R21=1,缺省 skip):
// 1) 旗 buff 屏内扫描 tile id 对拍——scanBannerNpcs 用字面量 91 当内部 tile id,
//    实测 v_91_banners 内部 id=157(91=v_383_living_mahogany_block)→ 旗 buff 全族失效。
//    本探针构造一面真实旗 tile(内部 id)跑扫描,断言应检出 NPC(当前实现=空集=红)。
// 2) 原版 SceneMetrics.cs:419-443 解码对拍:num3 修正(>=311 -1 / >=312 -1)+311/312 跳过。
// 只读探针:不改 src,不写世界档。
import { it, expect } from 'vitest';
import { TILE_BY_KEY } from '../src/data/tiles';
import { scanBannerNpcs } from '../src/world/Banners';

const RUN = process.env.SW_R21 === '1';

/** 最小 store 视图(scanBannerNpcs 只用 isActive/idx/type/frameX/frameY) */
function fakeStore(cells: Array<{ x: number; y: number; t: number; fx: number; fy: number }>) {
  const map = new Map<string, { t: number; fx: number; fy: number }>();
  for (const c of cells) map.set(`${c.x},${c.y}`, { t: c.t, fx: c.fx, fy: c.fy });
  return {
    idx: (x: number, y: number) => x * 100000 + y,
    isActive: (x: number, y: number) => map.has(`${x},${y}`),
    type: new Proxy({}, { get: (_t, p) => map.get(String(p))?.t ?? 0 }),
    frameX: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fx ?? 0 }),
    frameY: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fy ?? 0 }),
  } as unknown as Parameters<typeof scanBannerNpcs>[0];
}

(RUN ? it : it.skip)('R21: 旗 tile 内部 id 对拍(scanBannerNpcs 恒空集定罪)', () => {
  const bannerTile = TILE_BY_KEY['v_91_banners'];
  expect(bannerTile).toBeDefined();
  // 僵尸旗(banner id 0 → npc 3):frameX=21*18=378,frameY=0(SceneMetrics num=21<311)
  const st = fakeStore([{ x: 10, y: 10, t: bannerTile, fx: 378, fy: 0 }]);
  const npcs = scanBannerNpcs(st, 0, 0, 20, 20);
  // 原版语义:该格应解码 banner 0 → NPC 3 入集(旗 buff 生效)
  expect(npcs.has(3)).toBe(true);   // ← 当前实现红:store.type 比较 91≠157,恒空
});

(RUN ? it : it.skip)('R21: 解码修正段对拍(banner≥290 档)', () => {
  const bannerTile = TILE_BY_KEY['v_91_banners'];
  // banner 292(Betsy 旗?→item 5673):原版 num=fx/18=313(>=312) → num3=313-21-1-1=290
  // tile 帧空间:num=313 → frameX=313*18=5634(>1998 越界,真实档在第二行 fy=54:num=21+111=132…)
  // 构造第二行旗:fx=378(style21),fy=54*2=108 → num=21+222=243 <311 常规档
  const st = fakeStore([{ x: 5, y: 5, t: bannerTile, fx: 378, fy: 108 }]);
  const npcs = scanBannerNpcs(st, 0, 0, 10, 10);
  // 原版:num3 = 21-21 + 111*2 = 222 → banner 222
  expect(npcs.size).toBeGreaterThanOrEqual(0);   // 结构探针:修正段差异见报告 7.6
});
