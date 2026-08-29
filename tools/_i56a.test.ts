// IIII54 仪A：ghost 差异普查仪（真值语义修正版）+ 沙漠前快照冻结。
// ★背景（IIIII48·B 移交）：mile8 的 Gh 信息位把「JS st.type==0(空气,无 vanilla sheet)
// 映射到 -1→9999 哨兵」的非活性格全部计入 ghost 差——而 x86 侧 Tile.type 默认 0，
// 结果 Gh ≈ x86 非活性格计数（slot0 实证恒等式：Gh=1110156 == x86 inactive 计数，
// 七链 slot0 全部 ~103万-116万 同型 ⇒ 跨链通用伪影，非内容债）。
// 本仪按「真 ghost」口径重普查：
//   vg = x86 inactive ? .typ 原始字节 : 0
//   jg = JS inactive ? (st.type==0 ? 0 : SHEET[st.type]) : 0   （空气照实映射 0；
//      未注册 sheet 才记 sentinel，单独分桶不再污染差值）
// 同时逐时点导出 TileStore 原始通道快照（snap-<idx>-*.bin），供沙漠隔离 bench 复用。
// 用法：cd game && SW_I56=1 npx vitest run tools/_i56a.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I56 === '1';
const G2 = process.env.SW_I56_G2 ?? '/tmp/iii45-out/x86-remix';
const OUT = process.env.SW_I56_OUT ?? '/tmp/iii56-out';
const SEED = process.env.SW_I56_SEED ?? '1138154190';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;
// SW_I56_SNAP=18,19 → 冻结这些 dump 时点的 store 原始通道；SW_I56_STOPAT=2 → 抓到该 dump 后中止生成省时
const SNAP = new Set((process.env.SW_I56_SNAP ?? '').split(',').filter(Boolean).map(Number));
const STOPAT = process.env.SW_I56_STOPAT !== undefined ? Number(process.env.SW_I56_STOPAT) : undefined;

const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees', tenthanniversary: 'tenthAnniversary',
  celebrationmk10: 'tenthAnniversary', fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I56_FLAGS ?? 'remix').split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const NAME_BY_SHEET = new Map<number, string>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!NAME_BY_SHEET.has(s)) NAME_BY_SHEET.set(s, TILE_DEFS[i]!.key); }
}
NAME_BY_SHEET.set(-2, '(sentinel-unmapped)');
const nmOf = (v: number) => NAME_BY_SHEET.get(v) ?? `#${v}`;

const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1); };
const le8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
const CHAN_FILES = ['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const;
const DUMPNAME = new Map<number, string>();

interface CensusRow {
  idx: number; name: string;
  dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number;
  /** 真 ghost 差总数（不含空气哨兵伪影） */
  realGh: number; jResid: number; xResid: number; unmappedN: number;
  bothInactive: number;
  pairsTop: Array<[string, number]>;
  firstReal: string;
}

function census(idx: number, tag: string, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}): CensusRow {
  const base = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${base}.typ`)) throw new Error(`dump ${idx} 缺 .typ`);
  const miss = CHAN_FILES.filter((c) => !existsSync(`${base}.${c}`));
  if (miss.length) throw new Error(`# ${idx} 缺通道 ${miss.join(',')}`);
  const xt = le16(`${base}.typ`), xa = le8(`${base}.act`), xw = le16(`${base}.wal`), xl = le8(`${base}.liq`),
    xhf = le8(`${base}.half`), xsl = le8(`${base}.slope`), xlt = le8(`${base}.lty`), xia = le8(`${base}.inact`);
  const row: CensusRow = { idx, name: `${tag}`, dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0,
    realGh: 0, jResid: 0, xResid: 0, unmappedN: 0, bothInactive: 0, pairsTop: [], firstReal: '' };
  const pair = new Map<string, [number, number, number]>(); // key -> [count, firstX, firstY]
  let firstI = -1;
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { row.dA++; if (firstI < 0) firstI = i; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { row.dT++; if (firstI < 0) firstI = i; }
    if (xw[i]! !== st.wall[i]!) { row.dW++; if (firstI < 0) firstI = i; }
    if (xl[i]! !== st.liquid[i]!) { row.dL++; if (firstI < 0) firstI = i; }
    if (xhf[i]! !== st.half[i]!) row.dHf++;
    if (xsl[i]! !== st.slope[i]!) row.dSl++;
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) row.dLt++;
    const via = xia[i]! ? 1 : 0, jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) row.dIa++;
    // —— 真 ghost 普查（双方同态 inactive 才有意义）——
    if (!va && !ja) {
      row.bothInactive++;
      const xv = xt[i]!;
      const tRaw = st.type[i]!;
      const jv = tRaw === 0 ? 0 : (SHEET[tRaw] >= 0 ? SHEET[tRaw]! : -2);
      if (tRaw !== 0 && SHEET[tRaw] < 0) row.unmappedN++;
      if (xv === jv) continue;
      row.realGh++;
      if (xv === 0 && jv !== 0) row.jResid++;        // JS 独有残型（x86 空）
      else if (jv === 0 && xv !== 0) row.xResid++;   // x86 独有残型（JS 空/清零）
      if (firstI < 0) firstI = i;
      const k = `Gh v${xv}(${nmOf(xv)}) > j${jv}(${jv === -2 ? `raw${tRaw}` : jv === 0 ? 'empty' : nmOf(jv)})`;
      const e = pair.get(k);
      if (!e) pair.set(k, [1, i % W, (i / W) | 0]); else e[0]++;
    }
  }
  if (firstI >= 0) row.firstReal = `(${firstI % W},${Math.floor(firstI / W)})`;
  row.pairsTop = [...pair.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 10)
    .map(([k, e]) => [`${k}`, e[0]] as [string, number]);
  return row;
}

(RUN ? it : it.skip)('i56a ghost census + snapshots', async () => {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  console.log(`dump names: ${DUMPNAME.size} (${G2})`);
  const ledPath = `${OUT}/gh-ledger.txt`;
  const LED: string[] = [];
  // 与 _mile8 相同的 reseed-hook 检查点采样 + SLOT_END 名表
  const LABEL2DUMP = new Map<string, number>([
    ['SandPatches', 2], ['Tunnels', 3], ['MountainCaves', 4], ['DirtWallBackgrounds', 5],
    ['RocksInDirt', 6], ['DirtInRocks', 7], ['Clay', 8], ['SmallHoles', 9],
    ['DirtLayerCaves', 10], ['RockLayerCaves', 11], ['SurfaceCaves', 12], ['WavyCaves', 13],
    ['IceBiome', 14], ['Grass', 15], ['JunglePass', 16], ['MudCavesToJungleGrass', 17],
    ['DesertBiome', 18], ['GlowingMushroomPatches', 19], ['Marble', 20], ['Granite', 21],
    ['FloatingIslands', 22], ['DirtToMud', 23], ['Silt', 24], ['OresAndShinies', 25],
    ['Webs', 26], ['Underworld', 27], ['CorruptionAndCrimson', 28], ['Lakes', 29],
    ['Slush', 30], ['Dungeon', 31],
    ['MountainCaveOpenings', 32], ['BeachesAndOceanCleanup', 33], ['Gems', 34],
    ['OceanCaves', 36], ['Shimmer', 37], ['DirtWallCleanup', 38], ['Pyramids', 39],
    ['DirtRockWallRunner', 40], ['LivingTrees', 41], ['LivingTreeWalls', 42],
    ['DemonAndCrimsonAltars', 43], ['SurfaceWaterInJungle', 44], ['LihzahrdTemple', 45],
    ['Beehives', 46], ['JungleShrines', 47],
    ['Statues', 57], ['UndergroundHousesAndBuriedChests', 58], ['SurfaceChests', 59],
    ['ChestsInJungleShrines', 60], ['UnderwaterChests', 61], ['SpiderCaves', 62],
    ['UndergroundJungleTrees', 67], ['QuickCleanup', 69], ['GrassPlants', 85],
    ['GlowingMushroomPlants', 86], ['ExposedGemsInIceBiome', 91], ['ExposedGemsUnderground', 92],
  ]);
  const SLOT_END = new Map<number, { d: number; nm: string }>([
    // 与 _mile8.test.ts 同表（SW_MB_1457 口径）；任一名实不符立即 throw
    [0, { d: 0, nm: '原版地形' }], [1, { d: 1, nm: '沙丘' }],
    [2, { d: 13, nm: '洞穴' }], [3, { d: 35, nm: '生物群系' }],
    [5, { d: 37, nm: '引力沙' }], [6, { d: 38, nm: '微光' }], [7, { d: 39, nm: '清理' }],
    [8, { d: 48, nm: '结构' }], [9, { d: 49, nm: '水体沉降' }], [10, { d: 50, nm: '沙上清水' }],
    [11, { d: 51, nm: '绿洲' }], [12, { d: 52, nm: '海滩装饰' }], [13, { d: 53, nm: '半砖平滑' }],
    [14, { d: 54, nm: '瀑布唇缘' }], [15, { d: 55, nm: '薄冰' }], [16, { d: 56, nm: '洞穴墙变体' }],
    [17, { d: 57, nm: '生命水晶' }], [18, { d: 63, nm: '雕像宝箱' }], [19, { d: 64, nm: '宝石洞' }],
    [20, { d: 65, nm: '苔藓' }], [21, { d: 66, nm: '神庙陈设' }], [22, { d: 67, nm: '洞穴墙' }],
    [23, { d: 68, nm: '地下丛林树' }], [24, { d: 69, nm: '浮空岛屋' }], [25, { d: 70, nm: '快清理' }],
    [26, { d: 71, nm: '瓦罐' }], [27, { d: 72, nm: '地狱熔炉' }], [28, { d: 73, nm: '表面' }],
    [29, { d: 74, nm: '地表矿石' }], [30, { d: 75, nm: '倒木水景' }], [31, { d: 76, nm: '地表装饰' }],
    [32, { d: 77, nm: '矿骨堆' }], [33, { d: 78, nm: '出生点' }], [34, { d: 79, nm: '草墙' }],
    [35, { d: 80, nm: '起始镇民' }], [36, { d: 81, nm: '向日葵' }], [37, { d: 82, nm: '栽树' }],
    [38, { d: 83, nm: '炼金草药' }], [39, { d: 84, nm: '染料植物' }], [40, { d: 85, nm: '蛛网蜂巢' }],
    [41, { d: 87, nm: '地表植物' }], [42, { d: 88, nm: '丛林植物P2' }], [43, { d: 89, nm: '藤蔓' }],
    [44, { d: 90, nm: '地表花' }], [45, { d: 91, nm: '地表蘑菇' }], [46, { d: 93, nm: '宝石系统' }],
    [47, { d: 94, nm: '长苔藓' }], [48, { d: 95, nm: '丛林墙' }], [49, { d: 96, nm: '蜂巢幼虫' }],
    [50, { d: 97, nm: '微群系' }], [51, { d: 98, nm: '二次沉降' }], [52, { d: 99, nm: '仙人掌珊瑚' }],
    [53, { d: 100, nm: '瓦片清理' }], [54, { d: 101, nm: '蜥蜴祭坛' }], [55, { d: 102, nm: '水生植物' }],
    [56, { d: 103, nm: '钟乳石宝石树' }], [57, { d: 104, nm: '断线陷阱清理' }], [58, { d: 105, nm: '终清理' }],
  ]);
  const rows: CensusRow[] = [];
  let curStore: Parameters<typeof census>[2] | null = null;
  const seen = new Set<number>();
  let snapDone = new Set<number>();
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const dumpSnapshot = (idx: number, nm: string) => {
    if (SNAP.size === 0 || snapDone.has(idx)) return;
    snapDone.add(idx);
    const s = curStore!;
    writeFileSync(`${OUT}/snap-${idx}-${nm}-{CH}.bin`.replace('{CH}', 'type'), Buffer.from(s.type.buffer, s.type.byteOffset, s.type.byteLength));
    for (const ch of ['flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const) {
      writeFileSync(`${OUT}/snap-${idx}-${nm}-${ch}.bin`, Buffer.from(s[ch].buffer, s[ch].byteOffset, s[ch].byteLength));
    }
    console.log(`  [snapshot frozen] idx=${idx} ${nm} → ${OUT}/snap-${idx}-${nm}-*.bin`);
  };
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_i56a') && !m[1].includes('_mile8')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !seen.has(idx)) {
            seen.add(idx); rows.push(census(idx, lab, curStore));
            dumpSnapshot(idx, lab);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  function labelOf(file: string, line: number): string {
    let src: string[];
    try { src = readFileSync(file, 'utf8').split('\n'); } catch { return `${file}:${line}`; }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  }
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (w, i, pn) => {
        if (!curStore) curStore = w.store as never as typeof curStore;
        const ent = SLOT_END.get(i);
        if (ent === undefined) return;
        if (ent.nm !== pn) throw new Error(`SLOT_END 名实不符 #${i} ${ent.nm}≠${pn}`);
        if (seen.has(ent.d)) return;
        seen.add(ent.d);
        rows.push(census(ent.d, `槽末#${i}·${pn}`, w.store as never));
        dumpSnapshot(ent.d, `槽末${i}${pn}`);
        if (STOPAT !== undefined && ent.d >= STOPAT) {
          // 早停：快照/普查已到手，跳过后续 pass 省时（generateWorld 以异常中止）
          throw new Error('I56_STOP');
        }
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('名实不符') && !msg.includes('I56_STOP')) throw e;
  } finally { RNGp.reseed = oReseed; }
  rows.sort((a, b) => a.idx - b.idx);
  for (const r of rows) {
    const bad = r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa;
    const line =
      `${String(r.idx).padStart(3)} ${r.name.padEnd(26)} A=${r.dA} T=${r.dT} W=${r.dW} L=${r.dL} Hf=${r.dHf} Sl=${r.dSl} Lt=${r.dLt} Ia=${r.dIa}` +
      ` | both-inact=${r.bothInactive} 真Gh=${r.realGh}(js残${r.jResid}/x86残${r.xResid}) unmapped=${r.unmappedN}` +
      ` ${bad ? '✗' + r.firstReal : '✓'}`;
    console.log(line);
    LED.push(line);
    if (r.pairsTop.length) {
      const pl = `     pairs: ${r.pairsTop.map(([k, n]) => `${k}×${n}`).join(' ')}`;
      console.log(pl); LED.push(pl);
    }
  }
  writeFileSync(ledPath, LED.join('\n') + '\n');
  console.log(`ledger → ${ledPath}; done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
