// 一次性：half/slope 通道首分叉猎杀(2026-08-17 U 批)——JS 管线逐 pass half/slope/
// inact 时间线。方法:钩 RNG.reseed(contentparity 同款),每事件快照 half/slope/inact,
// 与上一事件求差 → 哪些 pass 写 half/slope、写在哪、是否"四通道不可见写入"。
// 输出 /tmp/sw-halfslope-timeline.json。SW_PARITY=1 npx vitest run tools/_halfslope.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';

const W = 4200, H = 1200, N = W * H;
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
  '宝石系统': 93, '长苔藓': 94, '丛林墙': 95, '蜂巢幼虫': 96, '仙人掌珊瑚': 98,
  '瓦片清理': 99, '蜥蜴祭坛': 100, '微群系': 101, '水生植物': 102,
  '钟乳石宝石树': 103, '断线陷阱清理': 104, '终清理': 105, '多格残片清扫': null,
};
const LABEL2VAN: Record<string, number> = {
  'DunesAndPyramidLocations': 1, 'OceanSand': 2, 'SandPatches': 3, 'Tunnels': 4,
  'MountainCaves': 5, 'DirtWallBackgrounds': 6, 'RocksInDirt': 7, 'DirtInRocks': 8,
  'Clay': 9, 'SmallHoles': 10, 'DirtLayerCaves': 11, 'RockLayerCaves': 12,
  'SurfaceCaves': 13, 'IceBiome': 15, 'Grass': 16, 'JunglePass': 17,
  'MudCavesToJungleGrass': 18, 'DesertBiome': 19, 'GlowingMushroomPatches': 20,
  'Marble': 21, 'Granite': 22, 'FloatingIslands': 23, 'DirtToMud': 24, 'Silt': 25,
  'OresAndShinies': 26, 'Webs': 27, 'Underworld': 28, 'CorruptionAndCrimson': 29,
  'Lakes': 30, 'Slush': 31, 'Dungeon': 32, 'MountainCaveOpenings': 33,
  'BeachesAndOceanCleanup': 34, 'Gems': 35, 'OceanCaves': 37, 'Shimmer': 38,
  'DirtWallCleanup': 39, 'Pyramids': 40, 'DirtRockWallRunner': 41, 'LivingTrees': 42,
  'LivingTreeWalls': 43, 'DemonAndCrimsonAltars': 44, 'SurfaceWaterInJungle': 45,
  'LihzahrdTemple': 46, 'Beehives': 47, 'JungleShrines': 48, 'Statues': 58,
  'UndergroundHousesAndBuriedChests': 59, 'SurfaceChests': 60,
  'ChestsInJungleShrines': 61, 'UnderwaterChests': 62, 'SpiderCaves': 63,
  'UndergroundJungleTrees': 68, 'QuickCleanup': 70, 'Traps': 76,
  'GrassPlants': 86, 'GlowingMushroomPlants': 87,
};

interface Ev {
  n: number; kind: 'HEAD' | 'INT'; label: string; vanIdx: number | null;
  nzHalf: number; nzSlope: number; nzInact: number;
  dHalf: number; dSlope: number; dInact: number;
  cells: string[]; // 前 12 个变化格样本
}

(RUN ? it : it.skip)('half/slope per-pass timeline', async () => {
  const events: Ev[] = [];
  let store: TileStore | null = null;
  let completedSlot: string | null = null;
  let prevHalf: Uint8Array | null = null;
  let prevSlope: Uint8Array | null = null;
  let prevInact: Uint8Array | null = null;
  let evN = 0;
  let lastLabel = '';

  const origReseed = RNG.prototype.reseed;
  const snap = (kind: 'HEAD' | 'INT', label: string, vanIdx: number | null) => {
    if (!store) return;
    const half = store.half, slope = store.slope, wire = store.wire;
    let nzH = 0, nzS = 0, nzI = 0, dH = 0, dS = 0, dI = 0;
    const cells: string[] = [];
    for (let i = 0; i < N; i++) {
      const hh = half[i], ss = slope[i], ii = (wire[i] & 32) !== 0 ? 1 : 0;
      if (hh) nzH++; if (ss) nzS++; if (ii) nzI++;
      if (prevHalf) {
        const ch = hh !== prevHalf[i] || ss !== prevSlope![i] || ii !== prevInact![i];
        if (ch) {
          if (hh !== prevHalf[i]) dH++;
          if (ss !== prevSlope![i]) dS++;
          if (ii !== prevInact![i]) dI++;
          if (cells.length < 12) {
            const x = i % W, y = (i / W) | 0;
            cells.push(`(${x},${y})h${prevHalf[i]}>${hh}s${prevSlope![i]}>${ss}i${prevInact![i]}>${ii}`);
          }
        }
      }
    }
    events.push({ n: evN, kind, label, vanIdx, nzHalf: nzH, nzSlope: nzS, nzInact: nzI, dHalf: dH, dSlope: dS, dInact: dI, cells });
    if (!prevHalf) { prevHalf = new Uint8Array(N); prevSlope = new Uint8Array(N); prevInact = new Uint8Array(N); }
    prevHalf.set(half); prevSlope!.set(slope);
    for (let i = 0; i < N; i++) prevInact![i] = (wire[i] & 32) !== 0 ? 1 : 0;
  };

  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    try {
      const stackLine = (new Error().stack ?? '').split('\n')
        .find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      const mFn = /at\s+(?:async\s+)?(\S+)\s+\(/.exec(stackLine);
      const func = mFn ? mFn[1] : '?';
      evN++;
      if (func.includes('generateWorld')) {
        snap('HEAD', `head:${completedSlot ?? 'start'}→${'?'}`, null);
        lastLabel = '';
      } else {
        const mLoc = /\(.*(src\/[^\s?]+):(\d+):\d+\)/.exec(stackLine);
        let label = '?';
        if (mLoc) {
          const rel = mLoc[1].slice(mLoc[1].indexOf('src/'));
          try {
            const src = readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/game/${rel}`, 'utf8').split('\n');
            for (let k = +mLoc[2]; k >= Math.max(0, +mLoc[2] - 2); k--) {
              const cm = /\/\/\s*▶([^\s(（]+)/.exec(src[k - 1] ?? '');
              if (cm) { label = cm[1]; break; }
            }
          } catch { /* ignore */ }
        }
        if (label === lastLabel) return;
        lastLabel = label;
        snap('INT', label, LABEL2VAN[label] ?? null);
      }
    } catch (e) { console.log('HOOK-EX', String(e).slice(0, 200)); }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w, _i, name) => { if (!store) store = w.store; completedSlot = name; },
    });
  } catch (e) { console.log('GEN-EX:', String(e).slice(0, 200)); } finally {
    (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  }
  // 终态快照
  snap('INT', 'POST-FINALIZE', 105);
  writeFileSync('/tmp/sw-halfslope-timeline.json', JSON.stringify({ events }));
  // 摘要:只打印有写入的事件
  let prevNz = 0;
  console.log('==== half/slope 写入时间线(Δ>0 的边界) ====');
  for (const e of events) {
    const tot = e.dHalf + e.dSlope + e.dInact;
    if (tot > 0 || e.n === 0) {
      console.log(`#${String(e.n).padStart(3)} ${e.kind} ${e.label.padEnd(30)} van=${String(e.vanIdx).padStart(3)} Δh=${String(e.dHalf).padStart(6)} Δs=${String(e.dSlope).padStart(6)} Δi=${String(e.dInact).padStart(4)} nz(h/s/i)=${e.nzHalf}/${e.nzSlope}/${e.nzInact}`);
      for (const c of e.cells.slice(0, 4)) console.log('     ', c);
    }
    prevNz = e.nzHalf;
  }
}, 480000);
