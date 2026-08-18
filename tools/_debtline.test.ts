// 一次性：9293480 管线 28→62 段债时间线（Webs 入口 0 差已知、Spider 入口 30269 差
// 已知 → 债在 28-61 段）。一次 generateWorld 挂 7 个 dormant 钩子,触发即快照
// 四通道,事后对拍前一 x86 dump 出口,二分锁定债主段。
// 用法：SW_DEBTLINE=1 npx vitest run tools/_debtline.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_DEBTLINE === '1';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const NAMES: Record<number, string> = {
  27: 'Webs', 29: 'Corruption', 32: 'Dungeon', 33: 'Mountain_Caves', 34: 'Beaches',
  36: 'Gravitating_Sand', 38: 'Shimmer', 43: 'Wood_Tree_Walls', 44: 'Altars',
  46: 'Jungle_Temple', 55: 'Ice', 56: 'Wall_Variety', 57: 'Life_Crystals', 62: 'Water_Chests',
};
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Four { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array }
const snap = (st: TileStore): Four => ({
  type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(), liquid: st.liquid.slice(),
});

function diff(s: Four, idx: number, label: string): void {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let dT = 0, dA = 0, dW = 0, dL = 0;
  const pairs = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const ja = s.flags[i] !== 0;
    const jT = ja ? (SHEET[s.type[i]] ?? -1) : -1;
    const vt = a[i] ? t[i] : -1;
    if (vt !== jT) { dT++; const k = `${vt}>${jT}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    if ((a[i] !== 0) !== ja) dA++;
    if (s.wall[i] !== w[i]) dW++;
    if (s.liquid[i] !== l[i]) dL++;
  }
  const top = [...pairs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, c]) => `${k}×${c}`).join(', ');
  console.log(`${label}: typ=${dT} act=${dA} wal=${dW} liq=${dL} | ${top}`);
}

(RUN ? it : it.skip)('debt timeline 28-62', async () => {
  const g0 = globalThis as Record<string, ((...a: never[]) => void) | undefined>;
  const snaps: Record<string, Four> = {};
  const wrap = (key: string, name: string) => {
    const orig = g0[key];
    const stPos = key === '__swWallCap' ? 2 : 1;
    g0[key] = ((...args: never[]) => {
      if (!snaps[name]) {
        // st 参数位置:多数 (gs, st);__swWallCap 为 (tag, gs, st)
        const st = args[stPos] as TileStore | undefined;
        if (st) snaps[name] = snap(st);
      }
      orig?.(...args);
    }) as typeof g0[key];
  };
  wrap('__swUwCap', 'uw');        // 028 入口 = 027 出口
  wrap('__swLkCap', 'lk');        // 030 入口 = 029 出口
  wrap('__swMcCap', 'mc');        // 033 入口 = 032(Dungeon) 出口
  wrap('__swBchCap', 'bch');      // 034 入口 = 033 出口
  wrap('__swGemsCap', 'gems');    // 035 入口 = 034 出口
  wrap('__swOcCap', 'oc');        // 037 入口 = 036 出口
  wrap('__swWallCap', 'cl');      // 039 入口 = 038 出口（tag='cleanup'）
  wrap('__swLtCap', 'lt');        // 042 入口 = 041 出口
  wrap('__swAltarsCap', 'al');    // 044 入口 = 043 出口
  wrap('__swSpiderGsCap', 'spi'); // 063 入口 = 062 出口
  // B 段细分:WetJungle/Statues 入口钩子
  wrap('__swWjCap', 'wj');        // 045 入口 = 044(Altars) 出口
  wrap('__swCwvCap', 'cwv');      // 056 入口 = 055(Ice) 出口
  wrap('__swLcCap', 'lc');        // 057 入口 = 056(WallVariety) 出口
  wrap('__swStatCap', 'stat');    // 058 入口 = 057(LifeCrystals) 出口
  // __swWallCap 全 tag 分流(cleanup/beehive/cavewalls/dirtrock… 各存首帧)
  const hWc = g0.__swWallCap;
  g0.__swWallCap = ((tag: string, gs: never, st: TileStore) => {
    const nm = `wc:${tag}`;
    if (!snaps[nm]) snaps[nm] = snap(st);
    hWc?.(tag, gs, st);
  }) as unknown as typeof g0.__swWallCap;

  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    for (const k of Object.keys(g0)) if (k.startsWith('__sw')) delete g0[k];
  }
  console.log(`captured: ${Object.keys(snaps).join(', ')}`);
  diff(snaps.uw!, 27, '027_Webs出口(UW入口)   ');
  diff(snaps.lk!, 29, '029_Corruption出口(Lakes入口)');
  diff(snaps.mc!, 32, '032_Dungeon出口(MC入口)  ');
  diff(snaps.bch!, 33, '033_MC出口(Beaches入口) ');
  diff(snaps.gems!, 34, '034_Beaches出口(Gems入口)');
  diff(snaps.oc!, 36, '036_GravSand出口(OC入口)');
  diff(snaps.cl!, 38, '038_Shimmer出口(Cleanup入口)');
  diff(snaps.al!, 43, '043_WoodTreeWalls出口(Altars入口)');
  diff(snaps.wj!, 44, '044_Altars出口(WJ入口)  ');
  if (snaps['wc:beehive']) diff(snaps['wc:beehive']!, 46, '046_Temple出口(Hives入口)');
  if (snaps.cwv) diff(snaps.cwv!, 55, '055_Ice出口(WV入口)   ');
  if (snaps.lc) diff(snaps.lc!, 56, '056_WallVariety出口(LC入口)');
  diff(snaps.stat!, 57, '057_LifeCrystals出口(Statues入口)');
  diff(snaps.spi!, 62, '062_WaterChests出口(Spider入口)');
}, 300_000);
