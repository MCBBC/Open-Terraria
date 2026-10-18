// 一次性批量原版对账（2026-08-16）：/tmp/sw-num4/van_x86_g（原版服务器逐 pass 四数组 dump，
// seed=9293480 evil=0 4200×1200，已用 passchain_x86.txt 的 FNV 四哈希核验）vs JS generateWorld
// 逐 pass 快照。
// 采集 = 钩 RNG.prototype.reseed：每 pass 头重播点即「上一 pass 末态」。事件分两类：
//   - 槽头重播（stack 帧 func=generateWorld）：比对「上一槽末态」vs dump[该槽末 pass]，
//     槽名由 onWorldPartial 回溯（管线重排鲁棒——槽名→pass 映射而非位置）；
//   - 槽内 ▶标签重播（vanilla/*.ts 内部）：比对 vs dump[该 pass-1]；紧跟槽头的冗余重播跳过。
// 跑法（纯 vitest 无需 server）：SW_PARITY=1 npx vitest run tools/_contentparity.test.ts
// （默认 skip 防拖慢并行会话全量套件——同 _gem-dist-audit 的 SW_AUDIT 门）
// 产物：/tmp/sw-contentparity.json + stdout 摘要表
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

const dumpFiles: { idx: number; base: string; name: string }[] = [];
// ★套件门(2026-09-02)
// ★套件门(2026-09-02):夹具目录缺省不扫
if (RUN) for (const f of readdirSync(VG)) {
  const m = /^(\d{3})_(.+)\.typ$/.exec(f);
  if (m) dumpFiles.push({ idx: +m[1], base: `${VG}/${f.slice(0, -4)}`, name: m[2] });
}
dumpFiles.sort((a, b) => a.idx - b.idx);

const dumpCache = new Map<number, { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array; name: string }>();
function loadDump(idx: number) {
  if (idx < 0 || idx > 105) return undefined;
  let d = dumpCache.get(idx);
  if (d) return d;
  const e = dumpFiles.find((x) => x.idx === idx);
  if (!e) return undefined;
  const typB = readFileSync(`${e.base}.typ`), walB = readFileSync(`${e.base}.wal`);
  d = {
    typ: new Uint16Array(typB.buffer, typB.byteOffset, N),
    act: readFileSync(`${e.base}.act`),
    wal: new Uint16Array(walB.buffer, walB.byteOffset, N),
    liq: readFileSync(`${e.base}.liq`),
    name: e.name,
  };
  if (dumpCache.size > 6) dumpCache.clear();
  dumpCache.set(idx, d);
  return d;
}

// ---- 槽名（passes[] name）→ 该槽最后一个原版 pass 的 dump idx ----
const SLOT2LAST: Record<string, number | null> = {
  '原版地形': 0, '沙丘': 1, '洞穴': 13, '生物群系': 35, '液体': null,
  '引力沙': 37, '微光': 38, '清理': 39, '结构': 48, '水体沉降': 49,
  '沙上清水': 50, '绿洲': 51, '海滩装饰': 52, '半砖平滑': 53, '瀑布唇缘': 54,
  '薄冰': 55, '洞穴墙变体': 56, '生命水晶': 57, '雕像宝箱': 63, '宝石洞': 64,
  '苔藓': 65, '神庙陈设': 66, '洞穴墙': 67, '地下丛林树': 68, '浮空岛屋': 69,
  '快清理': 70, '瓦罐': 71, '地狱熔炉': 72, '表面': 73, '地表矿石': 74,
  '倒木水景': 75, '地表装饰': 76, '矿骨堆': 77, '出生点': 78, '草墙': 79,
  '向日葵': 81, '栽树': 82, '炼金草药': 83, '染料植物': 84, '蛛网蜂巢': 85,
  '地表植物': 87, '丛林植物P2': 88, '藤蔓': 89, '地表花': 90, '地表蘑菇': 91,
  '宝石系统': 93, '长苔藓': 94, '丛林墙': 95, '蜂巢幼虫': 96, '二次沉降': 97, '仙人掌珊瑚': 98,
  '瓦片清理': 99, '蜥蜴祭坛': 100, '微群系': 101, '水生植物': 102,
  '钟乳石宝石树': 103, '断线陷阱清理': 104, '终清理': 105, '多格残片清扫': null,
};
// ---- 槽内 ▶标签 → 该重播开启的原版 pass idx（比对 vs dump[idx-1]）----
const LABEL2VAN: Record<string, { idx: number; note?: string }> = {
  'DunesAndPyramidLocations': { idx: 1 },
  'OceanSand': { idx: 2 }, 'SandPatches': { idx: 3 }, 'Tunnels': { idx: 4 },
  'MountainCaves': { idx: 5 }, 'DirtWallBackgrounds': { idx: 6 }, 'RocksInDirt': { idx: 7 },
  'DirtInRocks': { idx: 8 }, 'Clay': { idx: 9 }, 'SmallHoles': { idx: 10 },
  'DirtLayerCaves': { idx: 11 }, 'RockLayerCaves': { idx: 12 }, 'SurfaceCaves': { idx: 13 },
  'IceBiome': { idx: 15, note: '#14 WavyCaves 常态零消耗(dump013==014 侧验 SAME)' },
  'Grass': { idx: 16 }, 'JunglePass': { idx: 17 }, 'MudCavesToJungleGrass': { idx: 18 },
  'DesertBiome': { idx: 19 }, 'GlowingMushroomPatches': { idx: 20 },
  'Marble': { idx: 21 }, 'Granite': { idx: 22 }, 'FloatingIslands': { idx: 23 },
  'DirtToMud': { idx: 24 }, 'Silt': { idx: 25 }, 'OresAndShinies': { idx: 26 },
  'Webs': { idx: 27 }, 'Underworld': { idx: 28 }, 'CorruptionAndCrimson': { idx: 29 },
  'Lakes': { idx: 30 }, 'Slush': { idx: 31 }, 'Dungeon': { idx: 32 },
  'MountainCaveOpenings': { idx: 33 }, 'BeachesAndOceanCleanup': { idx: 34 }, 'Gems': { idx: 35 },
  'OceanCaves': { idx: 37 }, 'Shimmer': { idx: 38 }, 'DirtWallCleanup': { idx: 39 },
  'Pyramids': { idx: 40 }, 'DirtRockWallRunner': { idx: 41 }, 'LivingTrees': { idx: 42 },
  'LivingTreeWalls': { idx: 43 }, 'DemonAndCrimsonAltars': { idx: 44 },
  'SurfaceWaterInJungle': { idx: 45 }, 'LihzahrdTemple': { idx: 46 }, 'Beehives': { idx: 47 },
  'JungleShrines': { idx: 48 }, 'Statues': { idx: 58 },
  'UndergroundHousesAndBuriedChests': { idx: 59 }, 'SurfaceChests': { idx: 60 },
  'ChestsInJungleShrines': { idx: 61 }, 'UnderwaterChests': { idx: 62 }, 'SpiderCaves': { idx: 63 },
  'UndergroundJungleTrees': { idx: 68 }, 'QuickCleanup': { idx: 70 },
  '地表装饰近似段': { idx: -1, note: '自造段(偏差④):非原版掷骰/放置' },
  'Traps': { idx: 76, note: 'vs dump075:含自造装饰段污染' },
  'GrassPlants': { idx: 86 }, 'GlowingMushroomPlants': { idx: 87 },
};

interface CmpRes {
  label: string; dumpIdx: number; dumpName: string;
  typ: number; act: number; wal: number; liq: number;
  newTyp: number; newAct: number; newWal: number; newLiq: number;
  ghostTyp: number; unknownSheet: number;
  pairs: [string, number][]; newPairs: [string, number][];
  actPairs: [string, number][]; regions: [string, number][];
  samples: string[]; note?: string; frame?: string;
}

const curMask = new Uint8Array(N);
const prevMask = new Uint8Array(N);
let havePrev = false;

function compareStore(st: TileStore, label: string, dumpIdx: number, note?: string, frame?: string): CmpRes | null {
  const d = loadDump(dumpIdx);
  if (!d) return null;
  const jT = st.type, jF = st.flags, jW = st.wall, jL = st.liquid;
  const vT = d.typ, vA = d.act, vW = d.wal, vL = d.liq;
  curMask.fill(0);
  let typ = 0, act = 0, wal = 0, liq = 0, ghost = 0, unk = 0;
  let nTyp = 0, nAct = 0, nWal = 0, nLiq = 0;
  const pairs = new Map<string, number>();
  const newPairs = new Map<string, number>();
  const actPairs = new Map<string, number>();
  const regs = new Int32Array(42 * 12);
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const aJ = jF[i] & 1, aV = vA[i];
    const wJ = jW[i], wV = vW[i];
    const lJ = jL[i], lV = vL[i];
    let tJ = jT[i];
    if (tJ !== 0) { const s = SHEET[tJ]; if (s < 0) { unk++; tJ = 0x7777; } else tJ = s; }
    const tV = vT[i];
    const dT = tJ !== tV, dA = aJ !== aV, dW = wJ !== wV, dL = lJ !== lV;
    if (!(dT || dA || dW || dL)) continue;
    curMask[i] = 1;
    const isNew = !havePrev || !prevMask[i];
    let newKey = '';
    if (dT) {
      typ++; if (aJ === 0 && aV === 0) ghost++;
      const k = `${tJ}>${tV}`; pairs.set(k, (pairs.get(k) ?? 0) + 1);
      if (isNew) { nTyp++; newKey = k; newPairs.set(k, (newPairs.get(k) ?? 0) + 1); }
    }
    if (dA) { act++; const k = `${aJ}>${aV}`; actPairs.set(k, (actPairs.get(k) ?? 0) + 1); if (isNew) nAct++; }
    if (dW) {
      wal++; const k = `W${wJ}>${wV}`; pairs.set(k, (pairs.get(k) ?? 0) + 1);
      if (isNew) { nWal++; newPairs.set(k, (newPairs.get(k) ?? 0) + 1); }
    }
    if (dL) { liq++; if (isNew) nLiq++; }
    if (isNew && samples.length < 10) {
      const x = i % W, y = (i / W) | 0;
      samples.push(`(${x},${y}) t${tJ}>${tV} a${aJ}>${aV} w${wJ}>${wV} l${lJ}>${lV}`);
    }
    const x = i % W, y = (i / W) | 0;
    regs[Math.min(41, (x / 100) | 0) + Math.min(11, (y / 100) | 0) * 42]++;
  }
  const top = (m: Map<string, number>, k: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
  const regTop = [...regs.keys()].filter((r2) => regs[r2] > 0)
    .map((r2) => [r2, regs[r2]] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([r2, c]) => [`x${(r2 % 42) * 100}-${(r2 % 42) * 100 + 99},y${((r2 / 42) | 0) * 100}-${((r2 / 42) | 0) * 100 + 99}`, c] as [string, number]);
  const res: CmpRes = {
    label, dumpIdx, dumpName: d.name,
    typ, act, wal, liq, newTyp: nTyp, newAct: nAct, newWal: nWal, newLiq: nLiq,
    ghostTyp: ghost, unknownSheet: unk,
    pairs: top(pairs, 12), newPairs: top(newPairs, 12), actPairs: top(actPairs, 4),
    regions: regTop, samples, note, frame,
  };
  prevMask.set(curMask);
  havePrev = true;
  return res;
}

(RUN ? it : it.skip)('content-pass parity vs van_x86_g (seed 9293480)', async () => {
  const sameBytes = (a: number, b: number) => {
    const da = loadDump(a), db = loadDump(b);
    if (!da || !db) return 'MISSING';
    for (const p of ['typ', 'act', 'wal', 'liq'] as const) {
      const x = da[p], y = db[p];
      const len = (x as Uint8Array).byteLength;
      if (len !== (y as Uint8Array).byteLength) return `DIFF:${p}`;
      let eq = true;
      for (let i = 0; i < len; i++) if ((x as Uint8Array)[i] !== (y as Uint8Array)[i]) { eq = false; break; }
      if (!eq) return `DIFF:${p}`;
    }
    return 'SAME';
  };
  console.log(`sanity dump013 vs 014 (WavyCaves): ${sameBytes(13, 14)} | dump079 vs 080 (SpawnStarterNPCs): ${sameBytes(79, 80)}`);

  const origReseed = RNG.prototype.reseed;
  const results: CmpRes[] = [];
  const eventLog: { n: number; kind: string; label: string; frame: string }[] = [];
  let store: TileStore | null = null;
  let completedSlot: string | null = null;   // 最近 onWorldPartial 的槽名
  let slotCount = 0;
  let justSawHead = false;                    // 槽头重播标志
  let evN = 0;
  let unknownSlots: string[] = [];
  // 各槽「首个 pass」的内部重播标签——紧跟槽头、状态未变，比对冗余跳过
  const FIRST_LABEL = new Set(['DunesAndPyramidLocations', 'OceanSand', 'IceBiome', 'Shimmer',
    'DirtWallCleanup', 'Pyramids', 'Statues', '地表装饰近似段', 'GrassPlants',
    'UndergroundJungleTrees', 'QuickCleanup']);
  let lastIntLabel = '';

  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    try {
      const stackLine = (new Error().stack ?? '').split('\n')
        .find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      const mFn = /at\s+(?:async\s+)?(\S+)\s+\(/.exec(stackLine);
      const func = mFn ? mFn[1] : '?';
      const frame = stackLine.trim().slice(-76);
      const n = evN++;
      if (func.includes('generateWorld')) {
        // 槽头：比对「上一槽」末态
        eventLog.push({ n, kind: 'HEAD', label: `head(after:${completedSlot ?? '开始'})`, frame });
        justSawHead = true;
        if (store && completedSlot != null) {
          const last = SLOT2LAST[completedSlot];
          if (last === undefined) { unknownSlots.push(completedSlot); }
          else if (last != null) {
            const res = compareStore(store, `SLOT-END:${completedSlot}`, last, undefined, frame);
            if (res) results.push(res);
          }
        }
      } else {
        // 槽内：▶标签（取帧所在文件该行的注释标签——这里用函数名+顺序近似：直接用 LABEL 表按 vanIdx 推进不可靠，
        //   改为从 reseed 注释源码定位：读源文件行注释）
        const mLoc = /\(.*(src\/[^\s?]+):(\d+):\d+\)/.exec(stackLine);
        let label = '?';
        if (mLoc) {
          const rel = mLoc[1].slice(mLoc[1].indexOf('src/'));
          const abs = `${new URL('../', import.meta.url).pathname.replace(/\/+$/, '')}/${rel}`;
          try {
            const src = readFileSync(abs, 'utf8').split('\n');
            const ln = +mLoc[2];
            for (let k = ln; k >= Math.max(0, ln - 2); k--) {
              const cm = /\/\/\s*▶([^\s(（]+)/.exec(src[k - 1] ?? '');
              if (cm) { label = cm[1]; break; }
            }
          } catch { /* 读不到文件就 '?' */ }
        }
        const rec = LABEL2VAN[label];
        eventLog.push({ n, kind: 'INT', label: `${label}${rec ? '#' + rec.idx : ''}`, frame });
        const redundant = (justSawHead && FIRST_LABEL.has(label)) || label === lastIntLabel;
        lastIntLabel = label;
        justSawHead = false;
        if (redundant) return; // 紧跟槽头/同标签连播：状态未变
        if (rec && store && rec.idx > 0) {
          const res = compareStore(store, `${label}`, rec.idx - 1, rec.note, frame);
          if (res) results.push(res);
        }
      }
    } catch (e) {
      console.log('HOOK-EX', String(e).slice(0, 200));
    }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;

  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w, _i, name) => { store = w.store; completedSlot = name; slotCount++; },
    });
    if (store) {
      const res = compareStore(store, 'POST-FINALIZE(终态+finalize+JSEXTRA)', 105);
      if (res) results.push(res);
    }
  } catch (e) {
    console.log('GEN-EX(部分结果保留):', String(e).slice(0, 300));
  } finally {
    (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  }

  const out = {
    meta: { seed: 9293480, evil: 0, w: W, h: H, dumpDir: VG, slots: slotCount, events: evN, compares: results.length, unknownSlots },
    results,
    eventLog,
  };
  try { writeFileSync('/tmp/sw-contentparity.json', JSON.stringify(out)); } catch (e) { console.log('JSON写失败', String(e)); }

  const zero = results.filter((r2) => r2.typ + r2.act + r2.wal + r2.liq === 0);
  const diffs = results.filter((r2) => r2.typ + r2.act + r2.wal + r2.liq > 0)
    .sort((a, b) => (a.dumpIdx - b.dumpIdx));
  console.log('\n==== 全部比对边界（按 dump 序）====');
  for (const d of diffs) {
    console.log(`[${String(d.dumpIdx).padStart(3, '0')}] ${d.dumpName.padEnd(30)} ${d.label.padEnd(26)} typ=${String(d.typ).padStart(7)}(实${String(d.typ - d.ghostTyp).padStart(7)}/ghost${String(d.ghostTyp).padStart(6)}) act=${String(d.act).padStart(7)} wal=${String(d.wal).padStart(7)} liq=${String(d.liq).padStart(6)} | new=${d.newTyp}/${d.newAct}/${d.newWal}/${d.newLiq}`);
  }
  console.log(`\n==== 零差异（${zero.length}/${results.length}）====`);
  console.log(zero.map((r2) => `${String(r2.dumpIdx).padStart(3, '0')}_${r2.dumpName}`).join('  '));
  console.log(`\nslots=${slotCount} events=${evN} compares=${results.length} unknownSlots=${JSON.stringify(unknownSlots)}`);
  console.log('槽序(as-run):');
  const slotSeq = eventLog.filter((e) => e.kind === 'HEAD').map((e) => e.label.replace('head(after:', '').replace(')', ''));
  console.log('  ' + slotSeq.join(' → '));
  console.log('JSON: /tmp/sw-contentparity.json');
}, 480000);
