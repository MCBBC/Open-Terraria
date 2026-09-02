// IIIII193：GFB #59 Buried_Chests 掷窗定域仪（logging-only，零主路径改动）。
// 三路取证：
//   A · 逐窗掷账——__swOnRoll 织入（主实例过滤，对齐 x86 SW_MAINROLL），
//       reseed 调用点 ▶ 标签分窗，逐窗 cnt+FNV 与 ~/GoldenChains/golden-gfb-c/pc.txt
//       的 P|(D+1) 行对拍（D=LABEL2DUMP 标签→dump idx，dump N=pass N 末态，
//       pc P|N=pass N 掷数）→ 首个计数/哈希失配窗=流分歧 pass。
//   B · 窗内原始流——目标窗（SW_I193_VALS 逗号表，缺省
//       UndergroundHousesAndBuriedChests）逐 InternalSample 原始值落
//       $OUT/js-win<pass>.txt，与 x86 rig rollwin（---START 58…---END 59）逐行对齐
//       = 首个值分歧掷序号（普适流前缀范式）。
//   C · 窗内 JS 调用栈——同窗逐骰 2 帧 src 栈摘要落 $OUT/js-tag<pass>.txt，
//       与 x86 SW_TAGLOG 同 ln 口径对齐 = 分歧骰的 JS 消费点。
// 用法：cd game && SW_I193=1 npx vitest run tools/_iii193win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I193 === '1';
const G2 = process.env.SW_I193_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const OUT = process.env.SW_I193_OUT ?? '/tmp/iii193-out';
const SEED = process.env.SW_I193_SEED ?? '9293480';
const W = Number(process.env.SW_I193_W ?? 4200), H = Number(process.env.SW_I193_H ?? 1200);
const FLAGS: Record<string, boolean> = {};
for (const f of 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld'.split(',')) FLAGS[f] = true;
// 目标窗标签（dump idx 由 LABEL2DUMP 反查，pass 序 = D+1）
const VALS = new Set((process.env.SW_I193_VALS ?? 'UndergroundHousesAndBuriedChests').split(',').filter(Boolean));
const VALCAP = 900000;

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

/** reseed ▶label → dump idx（_mile8 同表；dump N = pass N 末态 ⇒ pass 序 = D+1） */
const LABEL2DUMP = new Map<string, number>([
  ['SandPatches', 2], ['Tunnels', 3], ['MountainCaves', 4], ['DirtWallBackgrounds', 5],
  ['RocksInDirt', 6], ['DirtInRocks', 7], ['Clay', 8], ['SmallHoles', 9],
  ['DirtLayerCaves', 10], ['RockLayerCaves', 11], ['SurfaceCaves', 12], ['WavyCaves', 13],
  ['IceBiome', 14], ['Grass', 15], ['JunglePass', 16], ['MudCavesToJungleGrass', 17],
  ['DesertBiome', 18], ['GlowingMushroomPatches', 19], ['Marble', 20], ['Granite', 21],
  ['FloatingIslands', 22], ['DirtToMud', 23], ['Silt', 24], ['OresAndShinies', 25],
  ['Webs', 26], ['Underworld', 27], ['CorruptionAndCrimson', 28], ['Lakes', 29],
  ['Slush', 30], ['Dungeon', 31], ['MountainCaveOpenings', 32], ['BeachesAndOceanCleanup', 33],
  ['Gems', 34], ['OceanCaves', 36], ['Shimmer', 37], ['DirtWallCleanup', 38], ['Pyramids', 39],
  ['DirtRockWallRunner', 40], ['LivingTrees', 41], ['LivingTreeWalls', 42],
  ['DemonAndCrimsonAltars', 43], ['SurfaceWaterInJungle', 44], ['LihzahrdTemple', 45],
  ['Beehives', 46], ['JungleShrines', 47],
  ['Statues', 57], ['UndergroundHousesAndBuriedChests', 58], ['SurfaceChests', 59],
  ['ChestsInJungleShrines', 60], ['UnderwaterChests', 61], ['SpiderCaves', 62],
  ['UndergroundJungleTrees', 67], ['QuickCleanup', 69], ['GrassPlants', 85],
  ['GlowingMushroomPlants', 86], ['ExposedGemsInIceBiome', 91], ['ExposedGemsUnderground', 92],
]);

(RUN ? it : it.skip)('IIIII193 Buried Chests roll-window probe', { timeout: 1_200_000 }, async () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pcLines = readFileSync(`${G2}/pc.txt`, 'utf8').split('\n');
  const x86 = new Map<number, { name: string; cnt: number; hash: number }>();
  for (const ln of pcLines) {
    const m = ln.match(/^P\|(\d+)\|([^|]+)\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|R:(\d+):(\d+)$/);
    if (m) { const i = Number(m[1]); if (!x86.has(i)) x86.set(i, { name: m[2]!, cnt: Number(m[3]), hash: Number(m[4])! >>> 0 }); }
  }
  console.log(`[i193] dump names=${DUMPNAME.size} pc lines=${x86.size} G2=${G2}`);

  interface Win { label: string; cnt: number; hash: number; vals?: number[]; tags?: string[]; over: boolean }
  const wins: Win[] = [];
  let cur: Win = { label: '(pre)', cnt: 0, hash: 2166136261 >>> 0, over: false };
  wins.push(cur);
  let mainVan: unknown = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    let lab = '(?)';
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii193')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    cur = { label: lab, cnt: 0, hash: 2166136261 >>> 0, over: false };
    if (VALS.has(lab)) { cur.vals = []; cur.tags = []; }
    wins.push(cur);
    // 主实例=reseed 所在的 RNG 实例（ctx.rng——每个原版 pass 头重播它；
    //  DungeonDualLayout 等自建 UnifiedRandom 副本与 x86 SW_MAINROLL 同位排除）
    mainVan = (this as { vanilla?: unknown })?.vanilla;
    return oReseed.call(this, s);
  };
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v, inst) => {
    if (inst !== mainVan) return;
    cur.cnt++;
    cur.hash = (Math.imul(cur.hash ^ (v >>> 0), 16777619)) >>> 0;
    if (cur.vals) {
      if (cur.vals.length < VALCAP) {
        cur.vals.push(v);
        const st = new Error().stack ?? '';
        const fr: string[] = [];
        for (const line of st.split('\n')) {
          const m = line.match(/(?:\/|[\w./-]*)src\/([\w./-]+\.ts):(\d+):\d+/);
          if (!m) continue;
          if (m[1]!.includes('core/rng') || m[1]!.includes('_iii193')) continue;
          fr.push(`${m[1]!.split('/').pop()}:${m[2]}`);
          if (fr.length >= 2) break;
        }
        cur.tags!.push(fr.join('|'));
      } else cur.over = true;
    }
  };

  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1, seedFlags: FLAGS,
      onWorldPartial: () => { /* 槽边界不参与掷账（窗口=reseed 界） */ },
    });
  } finally {
    RNGp.reseed = oReseed;
    delete (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  }
  console.log(`[i193] gen done ${((Date.now() - t0) / 1000).toFixed(0)}s windows=${wins.length}`);

  // ── A：逐窗掷账 vs pc ──
  console.log('\n=== A · 逐窗掷账对拍（label → dump D → pc P|D+1） ===');
  let firstBad = '';
  for (const w of wins) {
    const D = LABEL2DUMP.get(w.label);
    if (D === undefined) continue;
    const p = x86.get(D + 1);
    if (!p) continue;
    const okC = w.cnt === p.cnt, okH = w.hash === p.hash;
    if (!okC || !okH) {
      const msg = `✗ pass${D + 1} ${p.name}: JS=${w.cnt}:${w.hash} x86=${p.cnt}:${p.hash} Δcnt=${w.cnt - p.cnt}`;
      if (!firstBad) firstBad = msg;
      console.log(msg);
    }
  }
  console.log(`first mismatch: ${firstBad || '(none — all mapped windows aligned)'}`);
  // 全表（简）
  for (const w of wins) {
    const D = LABEL2DUMP.get(w.label);
    const p = D !== undefined ? x86.get(D + 1) : undefined;
    console.log(`  w ${String(D === undefined ? '?' : D + 1).padStart(3)} ${w.label.padEnd(36)} JS=${String(w.cnt).padStart(8)}/${w.hash.toString(16).padStart(8)}${p ? `  x86=${String(p.cnt).padStart(8)}/${p.hash.toString(16).padStart(8)}${w.cnt === p.cnt && w.hash === p.hash ? ' ✓' : ' ✗'}` : ''}`);
  }

  // ── B/C：目标窗原始流 + 栈摘要 ──
  for (const w of wins) {
    if (!w.vals) continue;
    const D = LABEL2DUMP.get(w.label);
    const pass = D !== undefined ? D + 1 : 'x';
    writeFileSync(`${OUT}/js-win${pass}.txt`, w.vals.join('\n'));
    writeFileSync(`${OUT}/js-tag${pass}.txt`, (w.tags ?? []).join('\n'));
    console.log(`[i193] window ${w.label} → js-win${pass}.txt vals=${w.vals.length}${w.over ? ' (CAP OVER)' : ''}`);
  }
  writeFileSync(`${OUT}/js-windows193.json`, JSON.stringify(wins.map((w) => ({ label: w.label, cnt: w.cnt, hash: w.hash }))));
}, 1_200_000);
