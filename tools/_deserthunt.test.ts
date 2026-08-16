// 一次性诊断：#19 FullDesert 根因猎杀(v2)。
// v1 手动链入口态差 2.9M 不可用 → 改 rig 同款 harness:全量 generateWorld +
// RNG.reseed 钩子,在 DesertBiome pass 头抓真入口态(已证逐位一致),
// 克隆 store 后隔离重放 mound→entrance→hive,逐阶段快照+掷骰计数,
// 与 dump019 对拍:墙桶交叉表/化石格(404)对拍/切片 ASCII。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { generateWorld, runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { RNG, FastRandom } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const sheetOf = (repoId: number) => SHEET[repoId] ?? -1;

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const d18 = {
  typ: new Uint16Array(load(18, 'typ', 'Mud_Caves_To_Grass').buffer.slice(0)),
  act: load(18, 'act', 'Mud_Caves_To_Grass'),
  wal: new Uint16Array(load(18, 'wal', 'Mud_Caves_To_Grass').buffer.slice(0)),
};
const d19 = {
  typ: new Uint16Array(load(19, 'typ', 'Full_Desert').buffer.slice(0)),
  act: load(19, 'act', 'Full_Desert'),
  wal: new Uint16Array(load(19, 'wal', 'Full_Desert').buffer.slice(0)),
};

const cloneStore = (src: TileStore): TileStore => {
  const t = new TileStore(W, H);
  t.type.set(src.type); t.flags.set(src.flags); t.wall.set(src.wall);
  t.liquid.set(src.liquid); t.liquidType.set(src.liquidType);
  t.half.set(src.half); t.slope.set(src.slope);
  t.frameX.set(src.frameX); t.frameY.set(src.frameY);
  return t;
};
const snap = (st: TileStore) => ({ typ: st.type.slice(), act: st.flags.slice(), wal: st.wall.slice() });

(RUN ? it : it.skip)('desert root cause hunt v2', async () => {
  // gs 从 Reset+Terrain 链拿(seed/worldSurface/dungeonSide 在 Reset/Terrain 定型,
  // 后续 pass 不改这三个;desertHive* 用 Reset 哨兵值重置)
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const gs = rt.gs;
  gs.desertHiveHigh = H; gs.desertHiveLow = 0; gs.desertHiveLeft = W; gs.desertHiveRight = 0;
  gs.undergroundDesert = null;
  console.log(`gs: seed=${gs.seed} worldSurface=${gs.worldSurface} dungeonSide=${gs.dungeonSide}`);

  // rig 同款钩子:DesertBiome pass 头抓 store
  const origReseed = RNG.prototype.reseed;
  let captured: TileStore | null = null;
  let lastStore: TileStore | null = null;
  let passEndHash = '';
  const hashTrail: Array<[string, string]> = [];   // (调用点文件:行, reseed 前流态)
  const streamHashOf = (r: RNG): string => {
    const u = r.vanilla as unknown as { seedArray: Int32Array; inext: number };
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < u.seedArray.length; k++) {
      const v = u.seedArray[k]! | 0;
      byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24);
    }
    const ix = u.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return h.toString(16).padStart(8, '0');
  };
  const onReseed = function (this: RNG, seed: number) {
    // DesertBiome 完成后的首个 reseed 前:抓 pass 末流态(desert 之后的 pass 头)
    if (captured && !passEndHash) passEndHash = streamHashOf(this);
    {
      const st = ((new Error().stack ?? '') as string).split('\n').find((l) => l.includes('/src/')) ?? '?';
      hashTrail.push([st.trim().slice(-52), streamHashOf(this)]);
    }
    origReseed.call(this, seed);
    if (!captured && lastStore && ((new Error().stack ?? '') as string).split('\n').some((l) => l.includes('DesertPass.ts:1'))) {
      captured = cloneStore(lastStore);
    }
  };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w) => { lastStore = w.store; },
    } as never);
  } catch (e) { console.log('GEN-EX', String(e).slice(0, 200)); }
  (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  if (!captured) { console.log('!! 未捕获 DesertBiome 入口态'); return; }
  console.log(`[2d] 全管线 desert pass 末流态=${passEndHash || '(未抓到)'} vs vanilla pass19=46d14bb7`);
  {
    const di = hashTrail.findIndex(([, h]) => h === passEndHash);
    console.log('[2d] desert 前后 reseed 轨迹(前2+后1):');
    const start = Math.max(0, (di >= 0 ? di : hashTrail.length - 1) - 2);
    for (let k = start; k <= Math.min(hashTrail.length - 1, (di >= 0 ? di : hashTrail.length - 1)); k++) {
      console.log(`    ${hashTrail[k]![0]} → 前=${hashTrail[k]![1]}`);
    }
  }
  const st = captured;
  console.log('captured entry store');

  // ---- 阶段0:入口态 vs dump018(须零,双重保险;typ 经 sheet 映射) ----
  {
    let diff = 0, first = '';
    for (let i = 0; i < N; i++) {
      const aJ = st.flags[i] & 1, aV = d18.act[i];
      const tJ = aJ ? sheetOf(st.type[i]) : -1;
      if (st.wall[i] !== d18.wal[i] || aJ !== aV || (aJ && tJ !== d18.typ[i])) {
        diff++; if (!first) first = `(${i % W},${(i / W) | 0})`;
      }
    }
    console.log(`[0] entry vs dump018: diff=${diff} ${first}`);
  }

  // ---- 掷骰计数 + 原始采样磁带 ----
  const rng = new RNG(gs.seed);
  let draws = 0;
  const samples: number[] = [];
  // reseed 会换 UnifiedRandom 实例 → 必须在 prototype 层包 internalSample
  const URProto = Object.getPrototypeOf(rng.vanilla) as { internalSample: () => number };
  const origIS = URProto.internalSample;
  URProto.internalSample = function (this: unknown) {
    const v = (origIS as unknown as () => number).call(this);
    samples.push(v);
    return v;
  };
  const oNext = rng.next.bind(rng), oInt = rng.int.bind(rng),
    oNIR = rng.nextIntRange.bind(rng), oNI = rng.nextInt.bind(rng);
  rng.next = () => { draws++; return oNext(); };
  rng.int = (a: number, b: number) => { draws++; return oInt(a, b); };
  rng.nextIntRange = (a: number, b: number) => { draws++; return oNIR(a, b); };
  rng.nextInt = (m: number) => { draws++; return oNI(m); };
  let pEnt = -1;

  // ---- 阶段1:mound ----
  const d0 = draws;
  const desc = runDesertMoundOnly(st, rng, gs);
  const moundDraws = draws - d0;
  const snapA = snap(st);
  console.log(`[1] mound: combX=${desc.combX} combY=${desc.combY} combW=${desc.combW} hiveTop=${desc.hiveTop} hiveH=${desc.hiveH} desertH=${desc.desertH} blockCols=${desc.blockCols} blockRows=${desc.blockRows} draws=${moundDraws}`);

  // ---- 阶段2:entrance + hive ----
  let snapB: ReturnType<typeof snap> | null = null;
  const ent0 = draws;
  runDesertEntrancesAndHive(st, rng, gs, desc, () => { snapB = snap(st); pEnt = samples.length; });
  const entDraws = draws - ent0;
  const final = snap(st);
  // 快照落盘(供 oracle 逐段对拍)
  const dumpSnap = (name: string, s: ReturnType<typeof snap>) => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    const n = W * H;
    const typ = Buffer.alloc(n * 2), act = Buffer.alloc(n), wal = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      typ.writeUInt16LE((s.act[i] & 1) ? Math.max(0, sheetOf(s.typ[i] ?? 0)) : 0, i * 2);
      act.writeUInt8(s.act[i] & 1, i);
      wal.writeUInt16LE(s.wal[i] ?? 0, i * 2);
    }
    writeFileSync(`/tmp/js_desert_${name}.typ`, typ);
    writeFileSync(`/tmp/js_desert_${name}.act`, act);
    writeFileSync(`/tmp/js_desert_${name}.wal`, wal);
  };
  dumpSnap('mound', snapA); dumpSnap('entrance', snapB!); dumpSnap('final', final);
  // 还原 prototype 补丁
  URProto.internalSample = origIS;
  console.log(`[2] entrance draws=${pEnt} hive+variance draws=${samples.length - pEnt} 总采样(mound起)=${samples.length}(计draws=${draws})`);
  // StreamHash(与 PassChainProbe/StreamHash 逐字节同):FNV-1a over seedArray[56]+inext
  {
    const ur2 = rng.vanilla as unknown as { seedArray: Int32Array; inext: number };
    let h = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { h = Math.imul(h ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < ur2.seedArray.length; k++) {
      const v = ur2.seedArray[k]! | 0;
      byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24);
    }
    const ix = ur2.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    console.log(`[2c] StreamHash(js isolated)=${h.toString(16).padStart(8, '0')} (vanilla pass19=46d14bb7; 注意:isolated 不含 CleanupArea 后续 structures.AddStructure 等)`);
  }
  console.log(`[2b] desertHive bounds: H=${gs.desertHiveHigh} L=${gs.desertHiveLow} Lft=${gs.desertHiveLeft} R=${gs.desertHiveRight}`);

  // ---- 阶段2e:残余 act/typ 差异剖析(区域×类型对) ----
  {
    const pairs = new Map<string, number>();
    let below = 0, above = 0;
    const samples2: string[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const aJ = final.act[i] & 1, aV = d19.act[i];
      const tJ = aJ ? sheetOf(final.typ[i] ?? 0) : -1;
      const dA = aJ !== aV, dT = tJ !== d19.typ[i];
      if (!dA && !dT) continue;
      if (y < desc.hiveTop - 20) above++; else below++;
      if (samples2.length < 12) samples2.push(`(${x},${y}) t${tJ}>${d19.typ[i]} a${aJ}>${aV}`);
      if (dT) { const k = `t${tJ}>${d19.typ[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    }
    console.log(`[2e] 残余: 上部=${above} 下部=${below}`);
    console.log('[2e] typ对:', [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
    console.log('[2e] 样例:', samples2.join(' '));
  }

  // ---- 阶段3:final vs dump019 ----
  let act = 0, act10 = 0, act01 = 0, wal = 0;
  const wPairs = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const aJ = final.act[i] & 1, aV = d19.act[i];
    if (aJ !== aV) { act++; if (aJ) act10++; else act01++; }
    if (final.wal[i] !== d19.wal[i]) { wal++; const k = `W${final.wal[i]}>${d19.wal[i]}`; wPairs.set(k, (wPairs.get(k) ?? 0) + 1); }
  }
  console.log(`[3] final vs dump019: act=${act}(1>0:${act10} 0>1:${act01}) wal=${wal}`);
  console.log('[3] wall pairs:', [...wPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));

  // ---- 阶段4:阶段归因 ----
  const bx0 = desc.combX - 20, bx1 = desc.combX + desc.combW + 20, by0 = desc.hiveTop - 20, by1 = desc.hiveTop + desc.hiveH + 20;
  // 4a. mound+entrance 在蜂巢 bbox 外 vs 019(蜂巢/AddTileVariance 只动 bbox 内)
  {
    let aDiff = 0, wDiff = 0, firstW = '';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x >= bx0 && x < bx1 && y >= by0 && y < by1) continue;
      const i = y * W + x;
      if ((snapB!.act[i] & 1) !== d19.act[i]) aDiff++;
      if (snapB!.wal[i] !== d19.wal[i]) { wDiff++; if (!firstW) firstW = `(${x},${y}) w${snapB!.wal[i]}>${d19.wal[i]}`; }
    }
    console.log(`[4a] post-entrance vs 019 (bbox外): act=${aDiff} wal=${wDiff} ${firstW}`);
  }
  // 4b. 蜂巢段
  {
    let jsHiveAct = 0, vanHiveAct = 0, walEq = 0, walNe = 0;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const i = y * W + x;
      if ((final.act[i] & 1) !== (snapB!.act[i] & 1)) jsHiveAct++;
      if (d19.act[i] !== (snapB!.act[i] & 1)) vanHiveAct++;
      if (final.wal[i] === d19.wal[i]) walEq++; else walNe++;
    }
    console.log(`[4b] bbox ${bx0}..${bx1} × ${by0}..${by1}: hive段 act写入 js=${jsHiveAct} van=${vanHiveAct}; wall等=${walEq} 不等=${walNe}`);
  }
  // 4c. mound 单独(bbox 外且 y<hiveTop-20 区,entrance 也少及):snapA vs 019
  {
    let aDiff = 0, wDiff = 0, first = '';
    for (let y = 0; y < by0; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if ((snapA.act[i] & 1) !== d19.act[i]) { aDiff++; if (!first) first = `(${x},${y}) a${snapA.act[i] & 1}>${d19.act[i]}`; }
      if (snapA.wal[i] !== d19.wal[i]) wDiff++;
    }
    console.log(`[4c] post-mound vs 019 (y<${by0}): act=${aDiff} wal=${wDiff} ${first}`);
  }

  // ---- 阶段5:化石格(404,sheet 映射)对拍——直接检验簇表 ----
  const jsF: number[] = [], vanF: number[] = [];
  {
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const i = y * W + x;
      if (sheetOf(final.typ[i]) === 404 && (final.act[i] & 1)) jsF.push(i);
      if (d19.typ[i] === 404 && d19.act[i]) vanF.push(i);
    }
    const vanSet = new Set(vanF);
    let both = 0;
    for (const i of jsF) if (vanSet.has(i)) both++;
    console.log(`[5] 化石格: js=${jsF.length} van=${vanF.length} 位置重合=${both}`);
    // 化石 y 分布直方图(每 20 行)——若 x 相近而 y 错位→vy 映射错;整体无关→簇表错
    const hist = (arr: number[], tag: string) => {
      const byY = new Map<number, number>();
      for (const i of arr) { const y = ((i / W) | 0); const b = Math.floor((y - 294) / 20); byY.set(b, (byY.get(b) ?? 0) + 1); }
      console.log(`    ${tag} y直方图(相对hiveTop,20行桶): ${[...byY.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b * 20}+:${c}`).join(' ')}`);
    };
    hist(jsF, 'js');
    hist(vanF, 'van');
    console.log(`    js样例 ${jsF.slice(0, 8).map((i) => `(${i % W},${(i / W) | 0})`).join(' ')}`);
    console.log(`    van样例 ${vanF.slice(0, 8).map((i) => `(${i % W},${(i / W) | 0})`).join(' ')}`);
    // x 对齐检验:每行化石的 x 集合,两侧同行是否相近
    const rowsOf = (arr: number[]) => {
      const m = new Map<number, number[]>();
      for (const i of arr) { const y = (i / W) | 0; if (!m.has(y)) m.set(y, []); m.get(y)!.push(i % W); }
      return m;
    };
    const jr = rowsOf(jsF), vr = rowsOf(vanF);
    let sameRow = 0, nearRow = 0, jRows = 0;
    for (const [y, xs] of jr) {
      jRows++;
      if (vr.has(y)) { sameRow++; continue; }
      let near = false;
      for (let d = -6; d <= 6 && !near; d++) if (vr.has(y + d)) near = true;
      if (near) nearRow++;
    }
    console.log(`    js化石行=${jRows} 与van同行=${sameRow} ±6行内有van化石=${nearRow}`);
  }

  // ---- 阶段5b:JS 场强直算 ----
  // 复刻 DesertPass 簇生成+场强(读 final 后无法取簇表 → 用采样磁带在 entrance 末位重放)。
  // 校验:重放簇表推出的墙桶 vs 实际 final.wal 须一致。
  if (samples && pEnt >= 0) {
    const tapePos = { i: pEnt };
    const nextSample = () => samples![tapePos.i++]!;
    const sample = () => nextSample() * 4.656612875245797e-10;
    const tNext = () => sample();
    const tIntRange = (a: number, b: number) => (Math.trunc(sample() * (b - a)) + a) | 0;
    const tInt = (a: number, b: number) => tIntRange(a, b + 1);
    const tNextInt = (m: number) => Math.trunc(sample() * m);
    const T = {
      next: tNext, int: tInt, nextIntRange: tIntRange, nextInt: tNextInt,
    } as unknown as RNG;

    // ==== ClusterGroup.Generate 复刻(DesertPass.ts:548-612) ====
    const gw = desc.blockCols, gh = desc.blockRows;
    const blockMap: boolean[][] = [];
    for (let c = 0; c < gw; c++) blockMap.push(new Array(gh).fill(false));
    {
      const num1 = Math.trunc(gw / 2) - 1, num2 = Math.trunc(gh / 2) - 1;
      const num3 = (num1 + 1) * (num1 + 1);
      for (let r = 0; r <= num2 * 2; r++) {
        const num4 = num1 / num2 * (r - num2);
        const num5 = Math.min(num1, Math.trunc(Math.sqrt(Math.max(0, num3 - num4 * num4))));
        for (let c = num1 - num5; c <= num1 + num5; c++) blockMap[c]![r] = T.int(0, 1) === 0;
      }
    }
    const pointClusters: Array<Array<[number, number]>> = [];
    {
      const dfs = (x: number, y: number, level: number, acc: Array<[number, number]>) => {
        acc.push([x, y]);
        blockMap[x]![y] = false;
        const lv = level - 1;
        if (lv === -1) return;
        if (x > 0 && blockMap[x - 1]![y]) dfs(x - 1, y, lv, acc);
        if (x < gw - 1 && blockMap[x + 1]![y]) dfs(x + 1, y, lv, acc);
        if (y > 0 && blockMap[x]![y - 1]) dfs(x, y - 1, lv, acc);
        if (y < gh - 1 && blockMap[x]![y + 1]) dfs(x, y + 1, lv, acc);
      };
      for (let x = 0; x < gw; x++) for (let y = 0; y < gh; y++) {
        if (blockMap[x]![y] && T.int(0, 1) === 0) {
          const pc: Array<[number, number]> = [];
          dfs(x, y, 2, pc);
          if (pc.length > 2) pointClusters.push(pc);
        }
      }
    }
    const idxMap: number[][] = [];
    for (let c = 0; c < gw; c++) idxMap.push(new Array(gh).fill(-1));
    pointClusters.forEach((pc, i) => { for (const [qx, qy] of pc) idxMap[qx]![qy] = i; });
    for (let ci = 0; ci < pointClusters.length; ci++) {
      for (const [px, py] of pointClusters[ci]!) {
        if (idxMap[px]![py] === -1) break;
        const idx = idxMap[px]![py];
        const claim = (nx: number, ny: number) => {
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;
          const other = idxMap[nx]![ny];
          if (other === -1 || other === idx) return;
          const val = T.int(0, 1) === 0 ? -1 : idx;
          for (const [qx, qy] of pointClusters[other]!) idxMap[qx]![qy] = val;
        };
        claim(px - 1, py); claim(px + 1, py); claim(px, py - 1); claim(px, py + 1);
      }
    }
    for (const pc of pointClusters) pc.length = 0;
    for (let x = 0; x < gw; x++) for (let y = 0; y < gh; y++) {
      if (idxMap[x]![y] !== -1) pointClusters[idxMap[x]![y]]!.push([x, y]);
    }
    for (const pc of pointClusters) if (pc.length < 4) pc.length = 0;
    const finalClusters: Array<Array<[number, number]>> = [];
    for (const pc of pointClusters) {
      if (pc.length <= 0) continue;
      finalClusters.push(pc.map(([bx, by]) => [bx + (T.next() - 0.5) * 0.5, by + (T.next() - 0.5) * 0.5] as [number, number]));
    }
    const blocksTotal = finalClusters.reduce((s, c) => s + c.length, 0);
    console.log(`[5b] 磁带: pEnt=${pEnt} total=${samples!.length} 余=${samples!.length - pEnt} 重放耗=${tapePos.i - pEnt}`);
    let nanBlocks = 0;
    for (const cl of finalClusters) for (const [bx, by] of cl) if (!Number.isFinite(bx) || !Number.isFinite(by)) nanBlocks++;
    console.log(`[5b] 簇表: nClusters=${finalClusters.length} blocks=${blocksTotal} NaN块=${nanBlocks} clusterSize样例=${finalClusters.slice(0, 6).map((c) => c.length).join('/')}`);

    // ==== 场强复刻(DesertPass.ts:617-676 核心数值部分) ====
    const hiveW = desc.combW, hiveH = desc.hiveH;
    const fr = new FastRandom(gs.seed).withModifier(57005);
    const num7arr = new Float64Array(W * H);
    let over35 = 0, over18 = 0, over07 = 0, over025 = 0, maxF = 0;
    for (let hi = -20; hi < hiveW + 20; hi++) {
      for (let hj = -20; hj < hiveH + 20; hj++) {
        const px = desc.combX + hi, py = desc.hiveTop + hj;
        if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;
        fr.nextMax(3);
        const vx = (hi - 2) / hiveW * gw, vy = (hj - 1) / hiveH * gh;
        let f1 = 0, f3 = 0, f2 = -1;
        for (let k = 0; k < finalClusters.length; k++) {
          const cl = finalClusters[k]!;
          const c0 = cl[0]!;
          if (Math.abs(c0[0] - vx) > 10 || Math.abs(c0[1] - vy) > 10) continue;
          let f6 = 0;
          for (const [bx, by] of cl) {
            const ddx = bx - vx, ddy = by - vy;
            f6 += 1 / (ddx * ddx + ddy * ddy);
          }
          if (f6 > f1) { if (f1 > f3) f3 = f1; f1 = f6; f2 = k; }
          else if (f6 > f3) f3 = f6;
        }
        const field = f1 + f3;
        num7arr[py * W + px] = field;
        if (field > maxF) maxF = field;
        if (field > 3.5) over35++; else if (field > 1.8) over18++; else if (field > 0.7) over07++; else if (field > 0.25) over025++;
      }
    }
    console.log(`[5b] 场分布: >3.5=${over35} >1.8=${over18} >0.7=${over07} >0.25=${over025} max=${maxF.toFixed(3)}`);
    // vanilla 隐含分布(墙桶,bbox内)
    let v187 = 0, v216 = 0, vOther = 0;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const w = d19.wal[y * W + x];
      if (w === 187) v187++; else if (w === 216) v216++; else vOther++;
    }
    console.log(`[5b] van 隐含: w187=${v187} w216=${v216} w其他=${vOther}`);

    // 化石格 & 错配格上的 JS num7
    if (vanF.length) {
      let s = 0, n = 0, mx = 0;
      for (const i of vanF.slice(0, 500)) { const f = num7arr[i]!; s += f; n++; if (f > mx) mx = f; }
      console.log(`[5b] van化石格上 JS num7: 均值=${(s / n).toFixed(3)} max=${mx.toFixed(3)}(n=${n})`);
    }
    {
      // van=216 而 js=187 的格(35926)上的 JS num7 分布
      let n = 0, s = 0, mx = 0, mn = 1e9;
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const i = y * W + x;
        if (d19.wal[i] === 216 && final.wal[i] === 187) {
          const f = num7arr[i]!; n++; s += f; if (f > mx) mx = f; if (f < mn) mn = f;
        }
      }
      if (n) console.log(`[5b] van216/js187 格上 JS num7: n=${n} 均值=${(s / n).toFixed(3)} min=${mn.toFixed(3)} max=${mx.toFixed(3)}`);
    }
    {
      // van=187 而 js=216 的格
      let n = 0, s = 0, mx = 0, mn = 1e9;
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const i = y * W + x;
        if (d19.wal[i] === 187 && final.wal[i] === 216) {
          const f = num7arr[i]!; n++; s += f; if (f > mx) mx = f; if (f < mn) mn = f;
        }
      }
      if (n) console.log(`[5b] van187/js216 格上 JS num7: n=${n} 均值=${(s / n).toFixed(3)} min=${mn.toFixed(3)} max=${mx.toFixed(3)}`);
    }
    // 校验:重放场推出的桶 vs final.wal 桶(粗校验——除 tier4 概率档)
    {
      let agree = 0, disagree = 0;
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const i = y * W + x;
        const f = num7arr[i]!;
        if (f > 1.8) { if (final.wal[i] === 187) agree++; else disagree++; }
        else if (f > 0.7) { if (final.wal[i] === 216) agree++; else disagree++; }
      }
      console.log(`[5b] 重放校验(>1.8→187, >0.7→216): 同=${agree} 异=${disagree}`);
    }

    // ==== δ 扫描:不同流偏移重建簇表+场(含 edge/tier4),对原版墙桶求同率 ====
    const buildClustersAt = (start: number, ghX: number, gwX: number) => {
      const pos = { i: start };
      const ns = () => samples![pos.i++]!;
      const smp = () => ns() * 4.656612875245797e-10;
      const T2 = {
        next: () => smp(),
        int: (a: number, b: number) => (Math.trunc(smp() * (b + 1 - a)) + a) | 0,
      } as unknown as RNG;
      const gw = gwX, gh = ghX;
      const bm: boolean[][] = [];
      for (let c = 0; c < gw; c++) bm.push(new Array(gh).fill(false));
      {
        const n1 = Math.trunc(gw / 2) - 1, n2 = Math.trunc(gh / 2) - 1;
        const n3 = (n1 + 1) * (n1 + 1);
        for (let r = 0; r <= n2 * 2; r++) {
          const n4 = n1 / n2 * (r - n2);
          const n5 = Math.min(n1, Math.trunc(Math.sqrt(Math.max(0, n3 - n4 * n4))));
          for (let c = n1 - n5; c <= n1 + n5; c++) bm[c]![r] = T2.int(0, 1) === 0;
        }
      }
      const pcs: Array<Array<[number, number]>> = [];
      {
        const dfs = (x: number, y: number, level: number, acc: Array<[number, number]>) => {
          acc.push([x, y]);
          bm[x]![y] = false;
          const lv = level - 1;
          if (lv === -1) return;
          if (x > 0 && bm[x - 1]![y]) dfs(x - 1, y, lv, acc);
          if (x < gw - 1 && bm[x + 1]![y]) dfs(x + 1, y, lv, acc);
          if (y > 0 && bm[x]![y - 1]) dfs(x, y - 1, lv, acc);
          if (y < gh - 1 && bm[x]![y + 1]) dfs(x, y + 1, lv, acc);
        };
        for (let x = 0; x < gw; x++) for (let y = 0; y < gh; y++) {
          if (bm[x]![y] && T2.int(0, 1) === 0) {
            const pc: Array<[number, number]> = [];
            dfs(x, y, 2, pc);
            if (pc.length > 2) pcs.push(pc);
          }
        }
      }
      const im: number[][] = [];
      for (let c = 0; c < gw; c++) im.push(new Array(gh).fill(-1));
      pcs.forEach((pc, i) => { for (const [qx, qy] of pc) im[qx]![qy] = i; });
      for (let ci = 0; ci < pcs.length; ci++) {
        for (const [px, py] of pcs[ci]!) {
          if (im[px]![py] === -1) break;
          const idx = im[px]![py];
          const claim = (nx: number, ny: number) => {
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;
            const o = im[nx]![ny];
            if (o === -1 || o === idx) return;
            const val = T2.int(0, 1) === 0 ? -1 : idx;
            for (const [qx, qy] of pcs[o]!) im[qx]![qy] = val;
          };
          claim(px - 1, py); claim(px + 1, py); claim(px, py - 1); claim(px, py + 1);
        }
      }
      for (const pc of pcs) pc.length = 0;
      for (let x = 0; x < gw; x++) for (let y = 0; y < gh; y++) {
        if (im[x]![y] !== -1) pcs[im[x]![y]]!.push([x, y]);
      }
      for (const pc of pcs) if (pc.length < 4) pc.length = 0;
      const fcs: Array<Array<[number, number]>> = [];
      for (const pc of pcs) {
        if (pc.length <= 0) continue;
        fcs.push(pc.map(([bx, by]) => [bx + (T2.next() - 0.5) * 0.5, by + (T2.next() - 0.5) * 0.5] as [number, number]));
      }
      return { fcs, used: pos.i - start };
    };
    const evalBuckets = (fcs: Array<Array<[number, number]>>, ghX: number): Int8Array => {
      const out = new Int8Array(W * H);   // 0=216 1=187 2=未写
      const gh = ghX;
      const hiveH2 = gh * 2;
      const fr2base = new FastRandom(gs.seed).withModifier(57005);
      for (let hi = -20; hi < hiveW + 20; hi++) {
        for (let hj = -20; hj < hiveH2 + 20; hj++) {
          const px = desc.combX + hi, py = desc.hiveTop + hj;
          if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;
          fr2base.nextMax(3);
          const vx = (hi - 2) / hiveW * gw, vy = (hj - 1) / hiveH2 * gh;
          let f1 = 0, f3 = 0;
          for (let k = 0; k < fcs.length; k++) {
            const cl = fcs[k]!;
            const c0 = cl[0]!;
            if (Math.abs(c0[0] - vx) > 10 || Math.abs(c0[1] - vy) > 10) continue;
            let f6 = 0;
            for (const [bx, by] of cl) { const dx = bx - vx, dy = by - vy; f6 += 1 / (dx * dx + dy * dy); }
            if (f6 > f1) { if (f1 > f3) f3 = f1; f1 = f6; }
            else if (f6 > f3) f3 = f6;
          }
          const f = f1 + f3;
          const ex = (hi - 2) / hiveW * 2 - 1, ey = (hj - 1) / hiveH2 * 2 - 1;
          const isEdge = Math.sqrt(ex * ex + ey * ey) >= 0.8;
          let b = 2;
          if (f > 3.5 || f > 1.8) b = 1;
          else if (f > 0.7 || !isEdge) b = 0;
          else if (f > 0.25) {
            const fr2 = fr2base.withModifierXY(hi, hj);
            if (fr2.nextDouble() < (f - 0.25) / 0.45) b = 1;
          }
          out[py * W + px] = b;
        }
      }
      return out;
    };
    {
      console.log('[5c] δ 扫描(簇表起点偏移) vs 原版墙桶同率:');
      const deltas: number[] = [];
      for (let d = -16; d <= 16; d++) deltas.push(d);
      for (let d = -460; d <= -20; d += 10) deltas.push(d);
      for (const d of [-445, -440, -335, -330, -225, -220, -115, -110, -113, -112, -111, -109, -108, -107, -106, -105, -104, -103, -102, -101, -99, -98, -97, -96, -95, -94, -93, -92, -91, -89, -88, -87, -86, -85, -84, -83, -2, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 700, 900, 1100, 1400, 1800, 2200, 2600, 3000, 3400, 3800, 4200, 4600, 5000]) deltas.push(d);
      let bestD = 0, bestPct = 0;
      for (const delta of deltas) {
        const start = pEnt + delta;
        if (start < 0 || start + 42000 > samples!.length) continue;
        const { fcs } = buildClustersAt(start, gh, gw);
        const bk = evalBuckets(fcs, gh);
        let ag = 0, tot = 0;
        for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
          const i = y * W + x;
          if (bk[i] === 2) continue;
          tot++;
          const v = d19.wal[i] === 216 ? 0 : d19.wal[i] === 187 ? 1 : 2;
          if (v !== 2 && bk[i] === v) ag++;
        }
        const pct = 100 * ag / Math.max(1, tot);
        if (pct > bestPct) { bestPct = pct; bestD = delta; }
        if (pct > 62 || Math.abs(delta) <= 4) console.log(`  δ=${delta}: 同率=${pct.toFixed(1)}% (n=${tot})`);
      }
      console.log(`  最佳 δ=${bestD} ${bestPct.toFixed(1)}%`);
    }
    // gh 变体扫描(blockRows 假设值 × hiveH=2gh)
    {
      console.log('[5d] gh 变体(δ=0):');
      for (const ghTry of [255, 260, 270, 280, 290, 300, 310, 319, 320, 325, 329, 330, 335, 340, 345, 350, 360]) {
        const { fcs } = buildClustersAt(pEnt, ghTry, gw);
        const bk = evalBuckets(fcs, ghTry);
        let ag = 0, tot = 0;
        for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
          const i = y * W + x;
          if (bk[i] === 2) continue;
          tot++;
          const v = d19.wal[i] === 216 ? 0 : d19.wal[i] === 187 ? 1 : 2;
          if (v !== 2 && bk[i] === v) ag++;
        }
        const pct = 100 * ag / Math.max(1, tot);
        if (pct > 62) console.log(`  gh=${ghTry}: 同率=${pct.toFixed(1)}%`);
      }
      console.log('  (仅>62%打印)');
    }
  }

  // ---- 阶段6:墙桶交叉表 ----
  const bucketOf = (wal: number) => wal === 216 ? 0 : wal === 187 ? 1 : 2;
  {
    const cross = new Map<string, number>();
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const i = y * W + x;
      const bJ = bucketOf(final.wal[i]), bV = bucketOf(d19.wal[i]);
      if (bJ !== bV) cross.set(`js${bJ}<-van${bV}`, (cross.get(`js${bJ}<-van${bV}`) ?? 0) + 1);
    }
    console.log('[6] 墙桶交叉差:', [...cross.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  }

  // ---- 阶段6b:桶互相关——找系统性平移(dx,dy) ----
  {
    // 只取 bbox 内、JS 与 van 都写了 187/216 的子域(排除 other 桶噪声)
    const jb = new Int8Array(W * H), vb = new Int8Array(W * H);
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const i = y * W + x;
      const j = final.wal[i], v = d19.wal[i];
      jb[i] = j === 187 ? 1 : j === 216 ? 2 : 0;
      vb[i] = v === 187 ? 1 : v === 216 ? 2 : 0;
    }
    let best = { dx: 0, dy: 0, n: 0, tot: 0 };
    const table: string[] = [];
    for (let dy = -12; dy <= 12; dy += 4) {
      let row = `dy=${String(dy).padStart(3)} `;
      for (let dx = -20; dx <= 20; dx += 4) {
        let agree = 0, tot = 0;
        for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
          const j = jb[y * W + x];
          if (j === 0) continue;
          const yy = y + dy, xx = x + dx;
          if (yy < by0 || yy >= by1 || xx < bx0 || xx >= bx1) continue;
          const v = vb[yy * W + xx];
          if (v === 0) continue;
          tot++;
          if (j === v) agree++;
        }
        if (tot > best.tot * 0.5 && agree > best.n) best = { dx, dy, n: agree, tot };
        row += `${String(Math.round(100 * agree / Math.max(1, tot))).padStart(4)}`;
      }
      table.push(row);
    }
    console.log('[6b] 桶互相关 %(dx=-20..20 step4):');
    console.log(table.join('\n'));
    console.log(`[6b] 最佳: dx=${best.dx} dy=${best.dy} 同率=${(100 * best.n / Math.max(1, best.tot)).toFixed(1)}% (n=${best.n}/${best.tot}); dx=0,dy=0 基线=${'见表'}`);
  }

  // ---- 阶段6c:入口雕刻形状对拍(y<bbox 顶:van 写入=d19 vs d18;js 写入=snapB vs snapA) ----
  {
    const rows: string[] = [];
    for (let y = 205; y < 285; y += 2) {
      let rV = '', rJ = '';
      for (let x = 2490; x < 2790; x += 2) {
        const i = y * W + x;
        const vD = d19.act[i] !== d18.act[i] || d19.wal[i] !== d18.wal[i];
        const jD = (snapB!.act[i] & 1) !== (snapA.act[i] & 1) || snapB!.wal[i] !== snapA.wal[i];
        rV += vD ? '#' : '.';
        rJ += jD ? '#' : '.';
      }
      rows.push(`y=${y} V ${rV}`);
      rows.push(`y=${y} J ${rJ}`);
    }
    console.log('[6c] 入口雕刻足迹(x2490-2790 step2):');
    console.log(rows.join('\n'));
    const g = samples![443]! * 4.656612875245797e-10;
    const k = Math.trunc(samples![444]! * 4.656612875245797e-10 * 4);
    const r = Math.trunc(samples![445]! * 4.656612875245797e-10 * 3) + 6;
    console.log(`[6c] 第444采样(门)=${g.toFixed(4)} 第445(kind)=${k} 第446(似pit半径)=${r}`);
  }

  // ---- 阶段6d:逐列清带 val 对拍(游走差剖面) ----
  // val = 清带最底行+1;snapA=JS mound 后,d18/d19 差=原版清带(上方无蜂巢覆写区)
  {
    const ox = desc.combX;
    const parts: string[] = [];
    let firstDiffCol = -1, diffCols = 0;
    for (let i = -5; i < desc.combW + 5; i++) {
      const x = ox + i;
      if (x < 0 || x >= W) continue;
      if (Math.abs(x - (desc.combX + (desc.combW >> 1))) < 32) { parts.push('|'); continue; }  // pit 污染带
      // JS val: snapA 中 inactive 且 d18 active 的最深行
      let jsVal = -1, vanVal = -1;
      for (let y = 150; y < by0; y++) {
        const idx = y * W + x;
        if (!(snapA.act[idx] & 1) && (d18.act[idx] & 1)) jsVal = y + 1;
        if (!(d19.act[idx] & 1) && (d18.act[idx] & 1)) vanVal = y + 1;
      }
      const d = vanVal - jsVal;
      if (d !== 0) { diffCols++; if (firstDiffCol < 0) firstDiffCol = i; }
      parts.push(d === 0 ? '.' : (d > 0 ? '+' : '-'));
    }
    console.log(`[6d] 列val差(van-js, '.'=同): 首差列=${firstDiffCol} 差列数=${diffCols}`);
    console.log(parts.join(''));
  }

  // ---- 阶段6e:游走增量逐项对拍(磁带=JS;d19 反推=van) ----
  {
    const ox = desc.combX, width = desc.combW;
    const topY = desc.combY, moundH = Math.min(desc.desertH, Math.trunc(desc.hiveH / 2));
    const moundBottom = topY + moundH;
    // JS 游走:磁带重放(1 起 x,2 blockRows,3 hiveTop,列掷从 4 号样本起)
    const walkAt = (sampleIdx: number) => {
      const ns = () => samples![sampleIdx++]!;
      const smp = () => ns() * 4.656612875245797e-10;
      let coarse = 0, fine = 0;
      const fineArr: number[] = [], coarseArr: number[] = [], incArr: number[] = [];
      for (let i = -5; i < width + 5; i++) {
        if (i % 3 === 0) { const d = (Math.trunc(smp() * 3) - 1); coarse = Math.max(-10, Math.min(10, coarse + d)); coarseArr.push(d); }
        const d2 = (Math.trunc(smp() * 3) - 1);
        fine = Math.max(-10, Math.min(10, fine + d2));
        incArr.push(d2); fineArr.push(fine);
      }
      return { fineArr, coarseArr, incArr };
    };
    const jsWalk = walkAt(3);
    // van val 反推(同 6d 逻辑,存数值) & van sand 顶反推 surfY
    const vanFine: number[] = [], vanSurfY: number[] = [];
    const jsFineVal: number[] = [];
    for (let i = -5; i < width + 5; i++) {
      const x = ox + i;
      let jsVal = -1, vanVal = -1, vanSandTop = -1;
      if (x >= 0 && x < W) {
        for (let y = 150; y < by0; y++) {
          const idx = y * W + x;
          if (!(snapA.act[idx] & 1) && (d18.act[idx] & 1)) jsVal = y + 1;
          if (!(d19.act[idx] & 1) && (d18.act[idx] & 1)) vanVal = y + 1;
        }
        for (let y = 150; y < by1; y++) {
          const idx = y * W + x;
          if (d19.act[idx] && d19.typ[idx] === 53) { vanSandTop = y; break; }
        }
      }
      // val = 10 + trunc(topY - ramp³×20) + fine → fine = val - 10 - trunc(topY - ramp³×20)
      const t = Math.max(-1, Math.min(1, Math.abs((i + 5) / (width + 10)) * 2 - 1));
      const ramp = (Math.abs(t) - 0.5) / 0.3;
      const base = 10 + Math.trunc(topY - ramp * ramp * ramp * 20);
      vanFine.push(vanVal >= 0 ? vanVal - base : NaN);
      jsFineVal.push(jsVal >= 0 ? jsVal - base : NaN);
      vanSurfY.push(vanSandTop);
    }
    // 打印逐列对照(前 80 列 + 差异起点附近)
    const fmt = (arr: number[], from: number, n: number) =>
      arr.slice(from, from + n).map((v) => Number.isFinite(v) ? String(v).padStart(3) : '  ·').join('');
    for (const [a, b] of [[0, 60], [60, 60], [120, 60], [240, 85]] as Array<[number, number]>) {
      console.log(`[6e] i=${a - 5}..${a + b - 6}`);
      console.log(`  jsInc ${fmt(jsWalk.incArr, a, b)}`);
      console.log(`  jsFin ${fmt(jsWalk.fineArr, a, b)}`);
      console.log(`  d19fn ${fmt(vanFine, a, b)}`);
      console.log(`  jsVld ${fmt(jsFineVal, a, b)}`);
    }
    // van 游走增量(从 vanFine 数值差分,只在连续有效段)
    {
      let segs = '';
      for (let k = 1; k < vanFine.length; k++) {
        const a = vanFine[k - 1]!, b2 = vanFine[k]!;
        if (!Number.isFinite(a) || !Number.isFinite(b2)) { segs += '·'; continue; }
        segs += String(b2 - a2s(a, b2)).padStart(0);
      }
      function a2s(a: number, b2: number): number {
        // 差分 = 增量,除非撞 clamp
        return b2 - a;
      }
      console.log(`[6e] vanFine差分(撞clamp处会失真): ${segs.slice(0, 330)}`);
    }
  }

  // ---- 鲲6f:原版隐含 num6 曲线拟合(|t|>0.8 两缘,清带可见列) ----
  {
    const ox = desc.combX, width = desc.combW, topY = desc.combY;
    const jsWalkInc: number[] = [];
    {
      let si = 3;
      for (let i = -5; i < width + 5; i++) {
        if (i % 3 === 0) { void samples![si++]; }
        jsWalkInc.push(Math.trunc(samples![si++]! * 4.656612875245797e-10 * 3) - 1);
      }
    }
    let fine = 0;
    const jsFineArr: number[] = [];
    for (let i = -5; i < width + 5; i++) {
      fine = Math.max(-10, Math.min(10, fine + jsWalkInc[i + 5]!));
      jsFineArr.push(fine);
    }
    const rows: string[] = [];
    for (const range of [[22, 80], [240, 324]] as Array<[number, number]>) {
      for (let i = range[0]; i < range[1]; i += 2) {
        const x = ox + i;
        if (x < 0 || x >= W) continue;
        let vanVal = -1, jsVal = -1;
        for (let y = 150; y < by0; y++) {
          const idx = y * W + x;
          if (!(snapA.act[idx] & 1) && (d18.act[idx] & 1)) jsVal = y + 1;
          if (!(d19.act[idx] & 1) && (d18.act[idx] & 1)) vanVal = y + 1;
        }
        const t = Math.max(-1, Math.min(1, Math.abs((i + 5) / (width + 10)) * 2 - 1));
        if (vanVal < 0) continue;
        // vanVal = 10 + trunc(241 - num6³×20) + fineVan(设=jsFine)
        const c3 = (241 - (vanVal - 10 - jsFineArr[i + 5]!)) / 20;
        const jsC3 = Math.pow((Math.abs(t) - 0.5) / 0.3, 3);
        rows.push(`i=${i} |t|=${Math.abs(t).toFixed(3)} vanVal=${vanVal} jsVal=${jsVal} fine=${jsFineArr[i + 5]} →num6³=${c3.toFixed(3)}(num6=${Math.cbrt(Math.max(0, c3)).toFixed(3)}) 线性外推=${jsC3.toFixed(3)}`);
      }
    }
    console.log('[6f] 原版隐含 num6(假设 walk 同 JS):\n' + rows.slice(0, 40).join('\n'));
  }

  // ---- 阶段7:切片 ASCII ----
  for (const yy of [by0 + 40, Math.floor((by0 + by1) / 2), by1 - 60]) {
    if (yy < 0 || yy >= H) continue;
    let rJ = '', rV = '';
    for (let x = 0; x < 160; x++) {
      const i = yy * W + Math.min(W - 1, bx0 + x);
      const f = (w: number) => w === 216 ? '2' : w === 187 ? '1' : w === 0 ? '.' : 'o';
      rJ += f(final.wal[i]); rV += f(d19.wal[i]);
    }
    console.log(`y=${yy} J ${rJ}`);
    console.log(`y=${yy} V ${rV}`);
  }
}, 480000);
