// §7 爆炸扩展：湿/干/岩浆/蜂蜜/土制炸弹族（item 4824-4827 → proj 903-906，
// 4908/4909 → 910/911）1:1 回归。
//   数据面：vanillaItemCombat EXTRACT_PATCH 补共享 case 段算式
//     `shoot = 903 + (type - 4824)`（Item.cs:39461-39473）/ `910 + (type - 4908)`
//     （:39787-39799）——提取器不解析算式，整族曾缺 shoot = 死路径。
//   行为面：Projectile.Kill :74007-74244 →
//     Kill_DirtAndFluidProjectiles_RunDelegateMethodPushUpForHalfBricks :67221-67239 +
//     Utils.FloodFillTile :2516-2559 + DelegateMethods.SpreadWater/Lava/Honey/Dry/Dirt
//     （:601/:650/:626/:670/:464）。
//   不破坏地形：:75262 ExplodeTiles 判定表不含本族（EXPLODE_RADIUS 无条目）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE_DEFS, T } from '../src/data/tiles';
import { itemCombat, combatWeapon } from '../src/data/vanillaItemCombat';

const W = 60, H = 60;
const CX = 30, CY = 30;

/** 全空世界（无实心），供 flood-fill 自由扩散 */
function emptyStore(): TileStore {
  return new TileStore(W, H);
}
/** 空腔 + 四周围墙（stone），炸点在腔心 */
function walledStore(): TileStore {
  const st = new TileStore(W, H);
  for (let x = 20; x <= 40; x++) for (let y = 20; y <= 40; y++) {
    if (x === 20 || x === 40 || y === 20 || y === 40) st.setTile(x, y, T.STONE);
  }
  return st;
}

describe('数据面：共享 case 段算式 shoot 回填（Item.cs:39461/:39787）', () => {
  it('4824-4827 → proj 903-906 / 4908·4909 → proj 910·911', () => {
    expect(itemCombat(4824)!.shoot).toBe(903);
    expect(itemCombat(4825)!.shoot).toBe(904);
    expect(itemCombat(4826)!.shoot).toBe(905);
    expect(itemCombat(4827)!.shoot).toBe(906);
    expect(itemCombat(4908)!.shoot).toBe(910);
    expect(itemCombat(4909)!.shoot).toBe(911);
  });

  it('consumable+noMelee 门 → combatWeapon 归入 grenade 族（aiStyle 16）', () => {
    for (const vid of [4824, 4825, 4826, 4827, 4908, 4909]) {
      const cw = combatWeapon({ key: `vi_${vid}_x`, vid });
      expect(cw?.kind).toBe('grenade');
      if (cw?.kind === 'grenade') expect(cw.shoot).toBe(vid <= 4827 ? 903 + (vid - 4824) : 910 + (vid - 4908));
    }
  });
});

describe('载荷表：液体/半径 1:1（Kill :74099/:74147/:74195/:74243/:74048）', () => {
  it('903 水 r3 / 904 岩浆 r3 / 905 蜂蜜 r3 / 906 干燥 r3.5 / 910·911 泥土 r4.2', () => {
    expect(Game.BOMB_PAYLOAD[903]).toEqual({ kind: 'water', radius: 3 });
    expect(Game.BOMB_PAYLOAD[904]).toEqual({ kind: 'lava', radius: 3 });
    expect(Game.BOMB_PAYLOAD[905]).toEqual({ kind: 'honey', radius: 3 });
    expect(Game.BOMB_PAYLOAD[906]).toEqual({ kind: 'dry', radius: 3.5 });
    expect(Game.BOMB_PAYLOAD[910]).toEqual({ kind: 'dirt', radius: 4.2 });
    expect(Game.BOMB_PAYLOAD[911]).toEqual({ kind: 'dirt', radius: 4.2 });
  });

  it('本族不在 ExplodeTiles 半径表内 = 不破坏地形（:75262 表外）', () => {
    for (const p of [903, 904, 905, 906, 910, 911]) {
      expect(Game.EXPLODE_RADIUS[p]).toBeUndefined();
    }
  });
});

describe('spreadBombPayload：BFS flood-fill 1:1', () => {
  it('湿弹 903：半径 3 圆盘内空格灌满 255 水（SpreadWater :601 → PlaceLiquid :4524）', () => {
    const st = emptyStore();
    const n = Game.spreadBombPayload(st, { kind: 'water', radius: 3 }, CX, CY);
    let filled = 0;
    for (let x = CX - 4; x <= CX + 4; x++) for (let y = CY - 4; y <= CY + 4; y++) {
      const i = st.idx(x, y);
      const inDisc = Math.hypot(x - CX, y - CY) <= 3;
      if (inDisc) {
        expect(st.liquid[i]).toBe(255);
        expect(st.liquidType[i]).toBe(LIQUID_TYPE.WATER);
        filled++;
      } else {
        expect(st.liquid[i]).toBe(0);
      }
    }
    expect(n).toBe(filled);
  });

  it('岩浆/蜂蜜弹：液体类型各归其位（SpreadLava :650 / SpreadHoney :626）', () => {
    const lava = emptyStore();
    Game.spreadBombPayload(lava, Game.BOMB_PAYLOAD[904], CX, CY);
    expect(lava.liquid[lava.idx(CX, CY)]).toBe(255);
    expect(lava.liquidType[lava.idx(CX, CY)]).toBe(LIQUID_TYPE.LAVA);

    const honey = emptyStore();
    Game.spreadBombPayload(honey, Game.BOMB_PAYLOAD[905], CX, CY);
    expect(honey.liquidType[honey.idx(CX, CY)]).toBe(LIQUID_TYPE.HONEY);
  });

  it('实心格拒绝（PlaceLiquid :4536）且 BFS 不穿墙（FloodFillTile 只经 plot=true 扩散）', () => {
    const st = walledStore();
    const n = Game.spreadBombPayload(st, Game.BOMB_PAYLOAD[903], CX, CY);
    // 腔内 19×19=361 格远超半径盘；盘缘全部落在墙内侧 → 只灌到 r=3 盘
    expect(n).toBeGreaterThan(0);
    // 墙体自身绝不灌液（实心拒绝）
    for (const [wx, wy] of [[20, 30], [30, 20], [40, 30], [30, 40]] as const) {
      expect(st.liquid[st.idx(wx, wy)]).toBe(0);
    }
    // 墙外一格不扩散（BFS 需经成功格连通，墙体 plot=false 断链）
    expect(st.liquid[st.idx(19, 30)]).toBe(0);
    expect(st.liquid[st.idx(41, 30)]).toBe(0);
  });

  it('异类液体不并（:4540 须 liquid==0 || 同类）', () => {
    const st = emptyStore();
    st.setLiquid(CX, CY, 200, LIQUID_TYPE.LAVA);
    const n = Game.spreadBombPayload(st, Game.BOMB_PAYLOAD[903], CX, CY);
    // 弹心是岩浆 → 水弹 plot=false → BFS 从种子即断（painted=0，全图无水）
    expect(n).toBe(0);
    expect(st.liquidType[st.idx(CX, CY)]).toBe(LIQUID_TYPE.LAVA);
  });

  it('干燥弹 906：半径 3.5 盘内液体全清（SpreadDry :670 → EmptyLiquid :4495）', () => {
    const st = walledStore();
    for (let x = 21; x <= 39; x++) for (let y = 21; y <= 39; y++) {
      st.setLiquid(x, y, 255, LIQUID_TYPE.WATER);
    }
    const n = Game.spreadBombPayload(st, Game.BOMB_PAYLOAD[906], CX, CY);
    expect(Math.hypot(0, 0)).toBe(0);
    for (let x = CX - 4; x <= CX + 4; x++) for (let y = CY - 4; y <= CY + 4; y++) {
      const inDisc = Math.hypot(x - CX, y - CY) <= 3.5;
      if (inDisc) expect(st.liquid[st.idx(x, y)]).toBe(0);
      else if (x > 20 && x < 40 && y > 20 && y < 40) expect(st.liquid[st.idx(x, y)]).toBe(255);
    }
    expect(n).toBeGreaterThan(0);
  });

  it('土制弹 910：半径 4.2 盘内空格铺泥土（SpreadTile :474/:464），实心石保留', () => {
    const st = walledStore();
    st.setTile(CX + 2, CY, T.STONE);   // 盘内一块石头
    const n = Game.spreadBombPayload(st, Game.BOMB_PAYLOAD[910], CX, CY);
    for (let x = CX - 5; x <= CX + 5; x++) for (let y = CY - 5; y <= CY + 5; y++) {
      const i = st.idx(x, y);
      const inDisc = Math.hypot(x - CX, y - CY) <= 4.2;
      if ((x === CX + 2 && y === CY)) {
        expect(st.type[i]).toBe(T.STONE);   // 非泥土实心格拒绝 :494
      } else if (inDisc) {
        expect(st.type[i]).toBe(T.DIRT);
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it('土制弹 910：tileCut 可替换格（杂草族 sheet 3）先杀后铺（TryKillingReplaceableTile :59336）', () => {
    const st = emptyStore();
    // sheet 3 = 杂草（TILE_CUT_VANILLA 含 3）→ 落在盘心的杂草被泥土覆盖
    const grass = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 3);
    expect(grass).toBeGreaterThan(0);
    st.setTile(CX, CY, grass);
    Game.spreadBombPayload(st, Game.BOMB_PAYLOAD[910], CX, CY);
    expect(st.type[st.idx(CX, CY)]).toBe(T.DIRT);
  });

  it('弹心半砖上浮一格（:67223-67235）', () => {
    const st = emptyStore();
    st.setTile(CX, CY, T.DIRT);
    st.setHalfBrick(CX, CY, true);
    Game.spreadBombPayload(st, Game.BOMB_PAYLOAD[903], CX, CY);
    // 弹心半砖 → 上移炸点：水灌在 (CX, CY-1)，半砖本体拒绝
    expect(st.liquid[st.idx(CX, CY - 1)]).toBe(255);
    expect(st.liquid[st.idx(CX, CY)]).toBe(0);
    expect(TILE_DEFS[st.get(CX, CY)]?.solid).toBe(true);
  });
});
