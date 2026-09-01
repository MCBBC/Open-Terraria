// 灯泡再生插桩漏斗(定位分支断层,跑完即删)
import { describe, it } from 'vitest';
const SAVE = '/tmp/chain-save-stage3.json';
import { readFileSync } from 'node:fs';
import { loadSaveData } from '../src/save/SaveFile';
import { WorldEvolution } from '../src/world/evolution/WorldEvolution';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

describe('bulb regrow funnel', () => {
  it('diag', async () => {
    const data = JSON.parse(readFileSync(SAVE, 'utf8'));
    const world = loadSaveData(data as never).world;
    const st = world.store;
    const BULB = TILE_BY_KEY['v_238_plantera_s_bulb'];
    const yTop = Math.floor(world.groundLevel || 330);
    const hasBulb = () => {
      for (let y = yTop; y < st.h - 200; y++) for (let x = 2; x < st.w - 2; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === BULB) return true;
      }
      return false;
    };
    // 挖掉首灯泡
    outer: for (let y = yTop; y < st.h - 200; y++) for (let x = 2; x < st.w - 2; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === BULB) {
        for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(x + dx, y + dy, 0);
        break outer;
      }
    }
    const proto = WorldEvolution.prototype as unknown as Record<string, (...a: never[]) => unknown>;
    const funnel = { up: 0, ov: 0, und: 0, s60: 0, gg: 0, pairFlat: 0, placed: 0 };
    const dist = new Map<number, number>();
    const origUnd = proto.undergroundTile;
    proto.undergroundTile = function (this: unknown, ...a: unknown[]) {
      funnel.und++;
      const i = a[0] as number, j = a[1] as number;
      const self = this as unknown as { typeAt: (x: number, y: number) => number };
      // ★正域内联(与模块 sheetOf 同式):TILE_DEFS[id]?.vanilla?.sheet
      const t = self.typeAt(i, j);
      const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
      if (sheet === 60) funnel.s60++;
      if (funnel.und % 97 === 0) dist.set(sheet, (dist.get(sheet) ?? 0) + 1);   // 1/97 抽样分布
      return (origUnd as (...a: unknown[]) => unknown).apply(this, a as never);
    };
    const origGG = proto.grassGrowth;
    proto.grassGrowth = function (this: unknown, ...a: unknown[]) {
      funnel.gg++;
      return (origGG as (...a: unknown[]) => unknown).apply(this, a as never);
    };
    // 更细:直接包 grassGrowth 不够,包 fitJunglePairFlat
    const origPair = proto.fitJunglePairFlat;
    proto.fitJunglePairFlat = function (this: unknown, i: number, j: number) {
      funnel.pairFlat++;
      const self = this as unknown as { typeAt: (x: number, y: number) => number; solidTile: (x: number, y: number) => boolean };
      const r = (origPair as (...a: unknown[]) => boolean).call(this, i, j) as boolean;
      const st2 = (this as unknown as { host: { store: import('../src/world/TileStore').TileStore } }).host.store;
      const iA = st2.idx(i, j), iB = st2.idx(i + 1, j);
      const why = !self.solidTile(i, j)
        ? (st2.half[iA] ? 'me-half' : st2.slope[iA] !== 0 ? `me-slope${st2.slope[iA]}` : `me-solid=${st2.flags[iA] ? TILE_DEFS[st2.type[iA]]?.solid : 'inactive'}`)
        : !self.solidTile(i + 1, j)
          ? (st2.half[iB] ? 'east-half' : st2.slope[iB] !== 0 ? `east-slope${st2.slope[iB]}` : `east-type${st2.type[iB]}`)
          : 'ok';
      console.log('[pairFlat]', JSON.stringify({ i, j, r, why, me: TILE_DEFS[st2.type[iA]]?.key, east: TILE_DEFS[st2.type[iB]]?.key }));
      return r;
    };
    void world;
    const evo = new WorldEvolution({
      store: st,
      worldSurface: world.groundLevel,
      rockLevel: world.rockLevel,
      dungeonX: world.dungeonX,
      difficulty: world.difficulty ?? 0,
      flags: world.flags,
      crimson: !!world.crimson,
      isDay: true,
      raining: false,
      maxRaining: 0,
      windSpeedCurrent: 0,
      playerTile: () => ({ x: 1640, y: 300 }),
    });
    // ★纯观察:不碰 Math.random(替换它会坍缩采样坐标=此前全部假阴性根源)
    for (let t = 0; t < 8000; t++) {
      evo.update();
      if (hasBulb()) { funnel.placed++; break; }
    }
    // 直接全图扫:地下带内 sheet60 丛林草总量(与采样命中对照)
    let grassTotal = 0, grassInBand = 0;
    for (let y = 10; y < st.h - 10; y++) for (let x = 10; x < st.w - 10; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const d = TILE_DEFS[st.type[i]];
      if (d?.vanilla?.sheet !== 60) continue;
      grassTotal++;
      if (y >= yTop && y < st.h - 200) grassInBand++;
    }
    console.log('funnel:', JSON.stringify(funnel), 'bulb:', hasBulb(), 'grassInBand:', grassInBand);
  }, 480000);
});
