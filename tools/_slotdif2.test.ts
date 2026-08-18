// 一次性诊断 v2（slot≤12 洞穴形状基线差异清剿）：JS 管线【内部 pass 边界】四通道
// 对拍 /tmp/sw-num4/van_x86_g。对拍位点=各内部 rng.reseed(▶label) 处（state=上一
// 原版 pass 末态）+ JS 槽末回调——标签→dump 槽映射按 1456 注册序手工登记。
// 用法：cd game && SW_SD2=1 npx vitest run tools/_slotdif2.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_SD2 === '1';
const VG = process.env.SW_SD_VG ?? '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** JS 槽末 → dump idx（1456 注册序手工对齐） */
const SLOT_END = new Map<number, number>([
  [0, 0], [1, 1], [2, 13], [3, 35], [5, 37], [6, 38], [7, 39], [8, 48],
  [9, 49], [10, 50], [11, 51], [12, 52], [13, 53],
]);
/** reseed ▶label → 该时点 state 对应的 dump idx（= 上一原版 pass 的 dump） */
const LABEL2DUMP = new Map<string, number>([
  ['SandPatches', 2], ['Tunnels', 3], ['MountainCaves', 4], ['DirtWallBackgrounds', 5],
  ['RocksInDirt', 6], ['DirtInRocks', 7], ['Clay', 8], ['SmallHoles', 9],
  ['DirtLayerCaves', 10], ['RockLayerCaves', 11], ['SurfaceCaves', 12],
  ['Grass', 15], ['JunglePass', 16], ['MudCavesToJungleGrass', 17], ['DesertBiome', 18],
  ['GlowingMushroomPatches', 19], ['Marble', 20], ['Granite', 21], ['FloatingIslands', 22],
  ['DirtToMud', 23], ['Silt', 24], ['OresAndShinies', 25], ['Webs', 26],
  ['Underworld', 27], ['CorruptionAndCrimson', 28], ['Lakes', 29], ['Slush', 30],
  ['Dungeon', 31], ['MountainCaveOpenings', 32], ['BeachesAndOceanCleanup', 33],
  ['Gems', 34], ['OceanCaves', 36], ['Shimmer', 37], ['DirtWallCleanup', 38],
  ['Pyramids', 39], ['DirtRockWallRunner', 40], ['LivingTrees', 41], ['LivingTreeWalls', 42],
  ['DemonAndCrimsonAltars', 43], ['SurfaceWaterInJungle', 44], ['LihzahrdTemple', 45],
  ['Beehives', 46], ['JungleShrines', 47],
]);
/** dump idx → 名（启动时扫 VG 目录回填） */
const DUMPNAME = new Map<number, string>();

interface Row { tag: string; idx: number; dTyp: number; dAct: number; dWal: number; dLiq: number; first: string; pairs: Array<[string, number]> }

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) {
    try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; }
    srcCache.set(file, src);
  }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l].match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('internal-boundary 4-channel diff vs van_x86_g', async () => {
  // dump 名表
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(VG)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  console.log(`van dumps: ${DUMPNAME.size} slots`);

  const rows: Row[] = [];
  let vanNameOf = (idx: number) => DUMPNAME.get(idx) ?? `#${idx}`;
  let le16 = (p: string): Uint16Array => {
    const b = readFileSync(p);
    return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  };
  const cmp = (tag: string, idx: number, st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array }): Row => {
    const row: Row = { tag, idx, dTyp: 0, dAct: 0, dWal: 0, dLiq: 0, first: '', pairs: [] };
    const pre = `${VG}/${String(idx).padStart(3, '0')}_${vanNameOf(idx)}`;
    if (!existsSync(`${pre}.typ`)) { row.first = '(no dump)'; return row; }
    const vT = le16(`${pre}.typ`), vA = readFileSync(`${pre}.act`), vW = le16(`${pre}.wal`), vL = readFileSync(`${pre}.liq`);
    const pair = new Map<string, number>();
    let firstI = -1;
    for (let i = 0; i < N; i++) {
      const va = vA[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { row.dAct++; if (firstI < 0) firstI = i; }
      const vt = va ? vT[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) {
        row.dTyp++;
        if (firstI < 0) firstI = i;
        const k = `${vt}>${jt}`;
        pair.set(k, (pair.get(k) ?? 0) + 1);
      }
      if (vW[i]! !== st.wall[i]!) { row.dWal++; if (firstI < 0) firstI = i; }
      if (vL[i]! !== st.liquid[i]!) { row.dLiq++; if (firstI < 0) firstI = i; }
    }
    if (firstI >= 0) row.first = `(${firstI % W},${Math.floor(firstI / W)})`;
    row.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => [k, c] as [string, number]);
    return row;
  };
  const report = (r: Row) => {
    const bad = r.dTyp || r.dAct || r.dWal || r.dLiq;
    console.log(`${String(r.idx).padStart(3)} ${r.tag.padEnd(26)} ${vanNameOf(r.idx).padEnd(26)} T=${String(r.dTyp).padStart(7)} A=${String(r.dAct).padStart(7)} W=${String(r.dWal).padStart(6)} L=${String(r.dLiq).padStart(6)} ${bad ? '✗ ' + r.first + ' ' + r.pairs.slice(0, 4).map(([k, c]) => `${k}×${c}`).join(' ') : '✓'}`);
  };

  // 钩：reseed 位点对拍（state=上一 pass 末态）——仅收 ▶label 命中表的位点
  let curStore: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array } | null = null;
  let active = true;
  const seen = new Set<number>();
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore && active) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_slotdif')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !seen.has(idx)) {
            seen.add(idx);
            rows.push(cmp(lab, idx, curStore!));
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };

  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w, i) => {
        if (!curStore) curStore = w.store as never as typeof curStore;
        const idx = SLOT_END.get(i);
        if (idx === undefined || seen.has(idx)) return;
        seen.add(idx);
        rows.push(cmp(`槽末#${i}`, idx, w.store as never as typeof curStore));
        if (i >= 13) active = false;   // 053 Smooth_World 后停收
      },
    });
  } finally { RNGp.reseed = oReseed; }
  rows.sort((a, b) => a.idx - b.idx);
  for (const r of rows) report(r);
  const firstBad = rows.find((r) => r.dTyp || r.dAct || r.dWal || r.dLiq);
  console.log(`\n首差边界: ${firstBad ? `${String(firstBad.idx).padStart(3)} ${vanNameOf(firstBad.idx)} @${firstBad.tag} ${firstBad.first} ${firstBad.pairs.slice(0, 4).map(([k, c]) => `${k}×${c}`).join(' ')}` : '无（000→053 全绿）'}`);
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  writeFileSync('/tmp/slotdif2.json', JSON.stringify(rows));
}, 900_000);
