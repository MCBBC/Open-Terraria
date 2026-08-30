// housing 旗重叠双根因行为锁(2026-08-30 小批):
//   A. findBannerAnchorY:平台楼板=房界候选(不穿层到下层)
//      ——此前 Renderer 用 isSolid 直扫穿透 loft 楼板,两层旗同绘
//   B. validateSavedHome:floodRoom 站位点必须落在房间 tiles 集内(幽灵 home 过滤)
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { findBannerAnchorY, validateSavedHome, lastRoomCheckFail, queryRoom } from '../src/world/Housing';

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
