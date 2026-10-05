// housing 旗重叠双根因行为锁(2026-08-30 小批):
//   A. findBannerAnchorY:平台楼板=房界候选(不穿层到下层)
//      ——此前 Renderer 用 isSolid 直扫穿透 loft 楼板,两层旗同绘
//   B. validateSavedHome:floodRoom 站位点必须落在房间 tiles 集内(幽灵 home 过滤)
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { findBannerAnchorY, houseBannerLightRow, validateSavedHome, lastRoomCheckFail, queryRoom, dedupeHomes } from '../src/world/Housing';

const S = TILE_BY_KEY['stone'];
const PLAT = (() => { for (const d of TILE_DEFS) if (d?.vanilla?.sheet === 19) return TILE_DEFS.indexOf(d); return -1; })();
const DOOR = TILE_BY_KEY['door_closed'];
import { WALL_HOUSE } from '../src/world/Housing';
const WALL_ID = [...WALL_HOUSE][0];

function buildLoft(): { st: TileStore; lowerHomeX: number; upperHomeX: number; platRow: number } {
  const st = new TileStore(80, 80);
  const put = (x: number, y: number, t = S) => { const i = st.idx(x, y); st.type[i] = t; st.flags[i] = 1; };
  // 两层 loft:下层 [20..30]×[40..48],上层 [20..30]×[32..39];楼板=平台行 P=39
  const P = 39;
  for (let x = 19; x <= 31; x++) {
    put(x, P, PLAT);                 // 楼板(平台)
    put(x, 49);                      // 下层地板
    if (x === 19 || x === 31) { for (let y = 33; y <= 49; y++) put(x, y); }   // 两层共用侧墙
    if (x === 25 || x === 26) put(x, 49 + 1);
    for (let yy = 34; yy <= 48; yy++) { const wi = st.idx(x, yy); if (!st.flags[wi] && yy !== P) st.wall[wi] = [...WALL_HOUSE][0]; }
  }
  // 上层顶盖(solid 行 32)
  for (let x = 19; x <= 31; x++) put(x, 32);
  // 门(下层左墙 20 列开洞):跳过——queryRoom 需门才『ok』,validateSavedHome 走 queryRoom;
  // 放一个门在侧墙 19 列 46..48
  for (let dy = 0; dy < 3; dy++) put(19, 46 + dy, DOOR);
  return { st, lowerHomeX: 24, upperHomeX: 28, platRow: P };
}

import { walkPrediction } from '../src/entities/TownNPC';
describe('walkPrediction 平台放行(2026-08-31 卡死定谳)', () => {
  it('平台桥面前不再判为深坑', () => {
    const st = new TileStore(60, 60);
    const SOLID = TILE_BY_KEY['stone'], PLAT = (() => { for (const d of TILE_DEFS) if (d?.vanilla?.sheet === 19) return TILE_DEFS.indexOf(d); return -1; })();
    // 地板行 20 全实心;20..24 行中段换成平台(悬空桥)
    for (let x = 10; x <= 30; x++) { const i = st.idx(x, 20); st.type[i] = SOLID; st.flags[i] = 1;
      const j = st.idx(x, 22); st.type[j] = PLAT; st.flags[j] = 1; }
    const r = walkPrediction(st, 15, 15, false, 1, 16, 19, 42);
    expect(r.avoidFalling).toBe(false);
  });
});

describe('housing 旗重叠双根因', () => {
  it('A·findBannerAnchorY:下层 home 的旗锚=平台行(不穿层进上层)', () => {
    const { st, lowerHomeX, platRow } = buildLoft();
    const cy = findBannerAnchorY(st, lowerHomeX, 47);   // 下层站格上一行起扫
    expect(cy).toBe(platRow);                            // 停在平台行,绝不上穿到 32 行区
  });
  it('A·实心天花板场景照常命中(平台族外不受影响)', () => {
    const { st, upperHomeX } = buildLoft();
    const cy = findBannerAnchorY(st, upperHomeX, 37);   // 上层扫描应命中 32 行实心顶
    expect(cy).toBe(32);
  });
  it('B·validateSavedHome:房内 true / 屋外虚空 false(floodRoom 站位含 tiles 集)', () => {
    const st = new TileStore(60, 60);
    for (let x = 14; x <= 25; x++) { const i = st.idx(x, 24); st.type[i] = S; st.flags[i] = 1;
      const j = st.idx(x, 16); st.type[j] = S; st.flags[j] = 1; }
    for (let y = 16; y <= 24; y++) { const i = st.idx(13, y); st.type[i] = S; st.flags[i] = 1;
      const kk = st.idx(26, y); st.type[kk] = S; st.flags[kk] = 1; }
    // 空气格背景墙(原版 CheckRoom:无房墙背景=hole)
    for (let y = 17; y <= 23; y++) for (let x = 14; x <= 25; x++) {
      const i = st.idx(x, y); if (!st.flags[i]) st.wall[i] = WALL_ID;
    }
    const homeX2 = 19;
    // 房内合法站位(行 23)
    expect(validateSavedHome(st, homeX2, 23)).toBe(true);
    expect(validateSavedHome(st, 45, 45)).toBe(false);
    expect(validateSavedHome(st, 12, 14)).toBe(false);
  });
});

function put2(st: TileStore, x: number, y: number, idxId: number) {
  if (idxId <= 0) return;
  const i = st.idx(x, y);
  st.type[i] = idxId; st.flags[i] = 1;
}

// ================= 增量批(2026-08-30 报告§3/§6):dedupeHomes 共室双认领清理 =================
// 封闭石室×2 构造:边界一圈 stone,内部空气背铺房墙(dedupe 走 queryRoom ignoreNeeds,
// 只关心围合+tiles 归属,不查家具)。每室含边界壳 ≥60 格才算合格房。
function buildBoxes(): TileStore {
  const st = new TileStore(100, 100);
  const carveWall = (x1: number, y1: number, x2: number, y2: number) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const border = y === y1 || y === y2 || x === x1 || x === x2;
      const i = st.idx(x, y);
      if (border) { st.type[i] = S; st.flags[i] = 1; }
      else { st.type[i] = 0; st.flags[i] = 0; st.wall[i] = WALL_ID; }   // 空气须背靠房墙
    }
  };
  // 室 A 内域 [21..33]×[21..31]=13×11=143 格;室 B 同规格,与 A 相互隔绝
  carveWall(20, 20, 34, 32);
  carveWall(45, 20, 59, 32);
  return st;
}

describe('dedupeHomes 共室双认领清理', () => {
  it('① 两 NPC home 同处一间房 → 只留距房间中心更近者,另一进 dropped(调用方置 null)', () => {
    const st = buildBoxes();
    // 交换立场:boxA 独立小世界语义也成立——同盒两点,m 比 ad 更近包围盒中心 (27,26)
    const m = { key: 'merchant', x: 26, y: 25 };
    const ad = { key: 'arms_dealer', x: 32, y: 30 };
    const r = dedupeHomes(st, [ad, m]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].key).toBe('arms_dealer');     // d² 41 > m 的 2 → 后者让位
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]).toBe(m);                        // 引用原样保序(kept∪dropped=输入)
    // 与两 home 各自泛洪的房间指纹无关:双方 validateSavedHome 均真(即真正的「双认领」,
    // 非 ghost 差异所致)
    expect(validateSavedHome(st, 26, 25)).toBe(true);
    expect(validateSavedHome(st, 32, 30)).toBe(true);
  });

  it('② 不同房间两 NPC → 双双保留(dropped 空)', () => {
    const st = buildBoxes();
    const a = { key: 'guide', x: 26, y: 31 };     // boxA
    const b = { key: 'nurse', x: 52, y: 31 };     // boxB
    const r = dedupeHomes(st, [a, b]);
    expect(r.dropped).toHaveLength(0);
    expect(r.kept.map((k) => k.key).sort()).toEqual(['guide', 'nurse']);
  });

  it('③ 幽灵 home(房间外)→ validateSavedHome=false 且不影响他人去重结果', () => {
    const st = buildBoxes();
    const g = { key: 'angler', x: 80, y: 80 };    // 无墙旷野:floodRoom hole 失败
    expect(validateSavedHome(st, 80, 80)).toBe(false);
    const base = dedupeHomes(st, [
      { key: 'merchant', x: 26, y: 25 },
      { key: 'arms_dealer', x: 32, y: 30 },
    ]);
    const withGhost = dedupeHomes(st, [
      { key: 'merchant', x: 26, y: 25 },
      { key: 'arms_dealer', x: 32, y: 30 },
      g,
    ]);
    // 幽灵被原样保留(kept 引用不变),不参与分组也不改变同室对的裁决
    expect(withGhost.kept.some((k) => k === g)).toBe(true);
    expect(withGhost.dropped.map((d) => d.key)).toEqual(base.dropped.map((d) => d.key));
    expect(withGhost.kept).toHaveLength(base.kept.length + 1);
  });

  it('④ 城镇 NPC + 城镇宠物同室合法共住(vanilla CanNPCsLiveWithEachOther 异类别)不被误杀', () => {
    const st = buildBoxes();
    const owner = { key: 'merchant', npcId: 17, x: 52, y: 24 };
    const pet = { key: 'town_cat', npcId: 637, x: 56, y: 28 };   // cat0 vs cat1
    const r = dedupeHomes(st, [owner, pet]);
    expect(r.dropped).toHaveLength(0);
    expect(r.kept.map((k) => k.key).sort()).toEqual(['merchant', 'town_cat']);
  });
});

// ================= ★2026-10-05 白背景定谳批:旗布光照取样行锁 =================
// 原版 DrawNPCHousesInWorld(Main.cs:41467-41469):自 homeTileY-1 向上 while 找到
// 实心天花板行后 **num3++** 才调 Lighting.GetColor(homeTileX, num3)——取色行 =
// 实心行【下一行空气】(旗布附着行),不是实心行本身。曾取样实心行 → 染色偏暗一档;
// 且染色门带 sum>0 半门 → 纯黑时跳过染色(旗布全黑中反常全亮=「夜间白背景」
// 家族风险面;本体=acc-shim multiply 旧路径实心色块盖旗,09-24/09-25 B2b+普查已修)。
describe('旗布光照取样行(Main.cs:41467-41469 num3++ 语义)', () => {
  it('实心锚行 258 → 取色行 = 259(天花板下第一行空气,非实心行)', () => {
    expect(houseBannerLightRow(258)).toBe(259);
  });
  it('与 findBannerAnchorY 复合:锚行+1 恒为取色行(平台锚同式)', () => {
    const st = new TileStore(80, 80);
    const put = (x: number, y: number, t = TILE_BY_KEY['stone']) => {
      const i = st.idx(x, y); st.type[i] = t; st.flags[i] = 1;
    };
    // 石顶 32 / 木墙 30 列;home 站格 37
    for (let x = 25; x <= 35; x++) put(x, 32);
    for (let y = 33; y <= 38; y++) { put(24, y); put(36, y); }
    const anchor = findBannerAnchorY(st, 30, 37);
    expect(anchor).toBe(32);
    expect(houseBannerLightRow(anchor!)).toBe(33);   // 空气行(原版 num3)
  });
});
