// W27 批·g#98 离线重放 dissect（§WWW 下批一跳配方执行）
//   入口 = /tmp/vvv-out/replay 十通道（dump 097 Micro_Biomes 末态 = 二次沉降窗入口）
//   相位：A=QW 后 / B=QW+WC 后（跨端唯一合法锚）/ C=全程十轮后。
// 用法：
//   cd game && SW_W27=cap npx vitest run tools/_w27a.test.ts   # 首跑抓参数+真实面板
//   cd game && SW_W27=run npx vitest run tools/_w27a.test.ts   # 对拍
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { World } from '../src/world/World';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runResetAndTerrain, generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const MODE = process.env.SW_W27 ?? '';
const RE = '/tmp/vvv-out/replay';
const OUT = '/tmp/w27-out';
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_W27_SEEDTEXT ?? '9293480';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const le8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

interface Params {
  waterLine: number; dungeonSide: number; worldSurface: number;
  shimmerX: number; shimmerY: number;
}

// ============================ cap 模式 ============================
// ============================ cmp 模式：纯文件两两对拍 ============================
function cmp6(dirJ: string, dirX: string): void {
  const jl = le8(`${dirJ}/K.liq`), jlt = le8(`${dirJ}/K.lty`), ja = le8(`${dirJ}/K.act`),
    jt = le16(`${dirJ}/K.typ`);
  const xl = le8(`${dirX}/K.liq`), xlt = le8(`${dirX}/K.lty`), xa = le8(`${dirX}/K.act`),
    xt = le16(`${dirX}/K.typ`);
  let dl = 0, dy = 0, da = 0, dt = 0;
  let first = -1;
  const cellsByRegion = new Map<string, number>();
  const reg = (i: number): string => `${Math.floor((i % W) / 200)},${Math.floor(((i / W) | 0) / 150)}`;
  for (let i = 0; i < N; i++) {
    if (jl[i] !== xl[i]) {
      dl++; if (first < 0) first = i;
      cellsByRegion.set(reg(i), (cellsByRegion.get(reg(i)) ?? 0) + 1);
    }
    const vj = jl[i] > 0 ? jlt[i] + 1 : 0;
    const vx = xl[i] > 0 ? xlt[i] + 1 : 0;
    if (vj !== vx) { dy++; if (first < 0) first = i; }
    if (ja[i] !== xa[i]) { da++; if (first < 0) first = i; }
    const tjT = ja[i] ? jt[i] : 0;
    const txT = xa[i] ? xt[i] : 0;
    if ((SHEET[jt[i]] < 0 ? 9999 : SHEET[jt[i]]) !== (ja[i] ? txT : 0)) dt++;
    void tjT;
  }
  const tops = [...cellsByRegion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k2, v]) => `${k2}:${v}`).join(' ');
  console.log(`cmp6 ${dirJ.replace(/^.*\//, '')} vs ${dirX.replace(/^.*\//, '')} :: L=${dl} Y=${dy} A=${da} T=${dt}${first >= 0 ? ` first=(${first % W},${(first / W) | 0})` : ''}${tops ? `\n   hotregions ${tops}` : ''}`);
}

(MODE === 'cmp' ? it : it.skip)('W27 file pair compare', async () => {
  void cmp6;
  const spec = process.env.SW_W27_CMP ?? '';
  // SW_W27_CMP="/tmp/w27-out/jit/rel1:/tmp/w27-out/xrel/rel1,..."
  for (const pair of spec.split(',').filter(Boolean)) {
    const [j, x] = pair.split(':');
    cmp6(j, x);
  }
}, 600_000);

(MODE === 'cap' ? it : it.skip)('W27 cap: params + real settle panels', async () => {
  const LS = LiquidSim.prototype as unknown as Record<string, unknown>;
  const orig = LS.applyGenSolidOverrides as (this: LiquidSim, m: Map<number, boolean>) => void;
  let calls = 0;
  LS.applyGenSolidOverrides = function (m: Map<number, boolean>) {
    calls++;
    writeFileSync(`${OUT}/panel-call${calls}.json`, JSON.stringify([...m.entries()]));
    console.log(`[panel] call#${calls} entries=${m.size}`);
    return orig.call(this, m);
  };
  await generateWorld({ width: W, height: H, seedText: SEED, evil: 0 });
  const gs = lastGenState()!;
  const prm: Params = {
    waterLine: (gs as unknown as Params).waterLine,
    dungeonSide: (gs as unknown as { dungeonSide: number }).dungeonSide,
    worldSurface: (gs as unknown as { worldSurface: number }).worldSurface,
    shimmerX: (gs as unknown as Params).shimmerX,
    shimmerY: (gs as unknown as Params).shimmerY,
  };
  writeFileSync(`${OUT}/params.json`, JSON.stringify(prm));
  console.log('params', JSON.stringify(prm));
}, 600_000);

// ============================ run 模式 ============================
function loadParams(): Params {
  return JSON.parse(readFileSync(`${OUT}/params.json`, 'utf8'));
}
/** 面板注入源：real=二次沉降窗实测快照；terrain=本地默认面板 */
function loadPanel(): Map<number, boolean> {
  const src = process.env.SW_W27_PANEL ?? 'real';
  if (src === 'terrain') return snapshotGenSolid();
  // 取最后一次捕获（settle 间可能有翻面——cap 时打印 call# 判别）
  const p2 = `${OUT}/panel-call2.json`;
  const p1 = `${OUT}/panel-call1.json`;
  const f = existsSync(p2) ? p2 : p1;
  return new Map(JSON.parse(readFileSync(f, 'utf8')) as Array<[number, boolean]>);
}

function newSim(world: World, panel: Map<number, boolean>, rng?: RNG): LiquidSim {
  const sim = new LiquidSim(world);
  if (rng) { sim.passRand = (max) => rng.nextInt(max); sim.passRng = rng; }
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
  if (world.genWaterLine > 0) {
    sim.genWaterLine = world.genWaterLine;
    const d = world.genDungeonExempt;
    if (d) sim.dungeonWaterExempt = (x, y, w) =>
      x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1
      && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99));
  }
  sim.applyGenSolidOverrides(panel);
  sim.worldGenTilesIgnoreWater(true);
  return sim;
}

function buildWorld(prm: Params): World {
  const { world } = runResetAndTerrain({ width: W, height: H, seedText: SEED, evil: 0 });
  world.genWaterLine = prm.waterLine;
  if (prm.dungeonSide === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(W * 0.05);
    const mid = Math.floor(W * 0.55);
    world.genDungeonExempt = prm.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(W * 0.45), y0: Math.floor(prm.worldSurface) + 10, y1: (H - 200) - 10 }
      : { x0: mid, x1: W - edge, y0: Math.floor(prm.worldSurface) + 10, y1: (H - 200) - 10 };
  }
  world.shimmerX = prm.shimmerX; world.shimmerY = prm.shimmerY;
  const st = world.store;
  st.type.set(le16(`${RE}/type.bin`));
  st.flags.set(le8(`${RE}/flags.bin`));
  st.frameX.set(le16(`${RE}/frameX.bin`));
  st.frameY.set(le16(`${RE}/frameY.bin`));
  st.wall.set(le16(`${RE}/wall.bin`));
  st.liquid.set(le8(`${RE}/liquid.bin`));
  st.liquidType.set(le8(`${RE}/liquidType.bin`));
  st.half.set(le8(`${RE}/half.bin`));
  st.slope.set(le8(`${RE}/slope.bin`));
  st.wire.set(le8(`${RE}/wire.bin`));
  return world;
}

function fp(st: any, tag: string): string {
  let nl = 0;
  for (let i = 0; i < N; i++) if (st.liquid[i] > 0) nl++;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < N; i++) { h ^= st.liquid[i]; h = (h * 16777619) >>> 0; }
  console.log(`fp[${tag}] wet=${nl} liqHash=${h.toString(16)}`);
  return h.toString(16);
}

interface K3 { act: Uint8Array; liq: Uint8Array; lty: Uint8Array }
const readK = (dir: string): K3 => ({ act: le8(`${dir}/K.act`), liq: le8(`${dir}/K.liq`), lty: le8(`${dir}/K.lty`) });

function cmpK(st: any, k: K3, tag: string, showSamples = false): void {
  let da = 0, dl = 0, dy = 0;
  const pair = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    if (k.act[i] !== (st.flags[i] & 1)) {
      da++;
      if (samples.length < 12) samples.push(`A(${i % W},${(i / W) | 0}) v${k.act[i]} j${st.flags[i] & 1}`);
    }
    if (k.liq[i] !== st.liquid[i]) {
      dl++;
      pair.set(`v${k.liq[i]}>j${st.liquid[i]}`, (pair.get(`v${k.liq[i]}>j${st.liquid[i]}`) ?? 0) + 1);
      if (samples.length < 12) samples.push(`L(${i % W},${(i / W) | 0}) v${k.liq[i]}/vt${k.lty[i]} j${st.liquid[i]}/jt${st.liquidType[i]}`);
    }
    const vl = k.liq[i] > 0 ? k.lty[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) dy++;
  }
  const ps = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, b]) => `${a}×${b}`).join(' ');
  console.log(`cmp[${tag}] A=${da} L=${dl} Y=${dy}${ps ? ` :: ${ps}` : ''}`);
  if (showSamples) for (const s of samples) console.log(`   ${s}`);
}

/** 六通道快照（供对拍 rig 复刻侧）：act/inact/liq/lty(0基)/typ(JS 内部 id)/wal */
function snap6(st: any, base: string): void {
  mkdirSync(base.replace(/\/[^/]*$/, ''), { recursive: true });
  const act = new Uint8Array(N), ia = new Uint8Array(N);
  for (let i = 0; i < N; i++) { act[i] = st.flags[i] & 1; ia[i] = (st.wire[i] >>> 5) & 1; }
  writeFileSync(`${base}.act`, Buffer.from(act.buffer));
  writeFileSync(`${base}.inact`, Buffer.from(ia.buffer));
  writeFileSync(`${base}.liq`, Buffer.from(st.liquid.buffer));
  // lty 通道写 vanilla 0 基口径（与 xdump 一致）：JS +1 基转回
  const lt = new Uint8Array(N);
  for (let i = 0; i < N; i++) lt[i] = st.liquid[i] > 0 ? st.liquidType[i] - 1 : 0;
  writeFileSync(`${base}.lty`, Buffer.from(lt.buffer));
  writeFileSync(`${base}.typ`, Buffer.from(st.type.buffer.slice(0)));
  writeFileSync(`${base}.wal`, Buffer.from(st.wall.buffer));
}

/** 与前日工件（jdump-iter1/liqdump-x 六通道 K.*）对拍：liq/lty(+1)/act/typ(SHEET 映射) */
function compareFiles(st: any, dir: string, tag: string): void {
  const p = `${dir}/K.liq`;
  if (!existsSync(p)) { console.log(`cmpFiles[${tag}] 缺 K.* 跳过`); return; }
  const l = le8(p), lt = le8(`${dir}/K.lty`), a = le8(`${dir}/K.act`), t = le16(`${dir}/K.typ`);
  let dl = 0, dy = 0, da = 0, dt = 0;
  let first = -1;
  for (let i = 0; i < N; i++) {
    if (l[i] !== st.liquid[i]) { dl++; if (first < 0) first = i; }
    const vl = l[i] > 0 ? lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) dy++;
    if (a[i] !== (st.flags[i] & 1)) da++;
    const vt = a[i] ? t[i] : 0;
    const jt = (st.flags[i] & 1) ? SHEET[st.type[i]] : 0;
    if (vt !== jt) dt++;
  }
  console.log(`cmpFiles[${tag}] L=${dl} Y=${dy} A=${da} T=${dt}${first >= 0 ? ` first=(${first % W},${(first / W) | 0})` : ''}`);
}

(MODE === 'run' ? it : it.skip)('W27 replay dissect', async () => {
  const prm = loadParams();
  const panel = loadPanel();
  console.log(`panel src=${process.env.SW_W27_PANEL ?? 'real'} entries=${panel.size}`);

  // —— B 相位：QW+WC ——
  {
    const wd = buildWorld(prm);
    const sim = newSim(wd, panel);
    sim.quickWater();
    sim.waterCheck();
    fp(wd.store, 'B:QW-WC');
    cmpK(wd.store, readK('/tmp/www-out/x-qw-world'), 'B vs x-qw');
    sim.dispose();
  }

  // —— C 相位：全程十轮。★RunPass 每 pass 头重播 UnifiedRandom(_seed)
  //    （WorldGenerator.cs:497 IL 实证）⇒ 二次沉降窗内的掷流从 0 重启，
  //    离线重放构造 RNG(translateSeed(seedText)) 即与生产逐样本同流 ——
  {
    const { RNG: R } = await import('../src/core/rng');
    void R;
    const seedNum = Number(process.env.SW_W27_RNGSEED ?? '9293480');
    console.log(`C-phase rng=${seedNum}${process.env.SW_W27_RNGSEED ? ' (override)' : ' (translateSeed base)'}`);
    const wd = buildWorld(prm);
    const stRef = wd.store;
    const sim = newSim(wd, panel, new RNG(seedNum));
    // —— per-iteration 活动表指纹流（与 rig SW_LIQLOG 同布局）：
    //    每条 14B：x:i16le y:i16le delay:i32le kill:i32le 该格液量:u8 液型:u8(vanilla 0 基)
    const fpLines: string[] = [];
    const rawLines: string[] = [];
    const oUpdate = (sim as unknown as { updateLiquid: () => void }).updateLiquid.bind(sim);
    let jrel = 0;
    // —— A/D 事件流镜像（rig SW_LIQOPS：OpAdd 成功注册后 / OpDel 入口）——
    const opLines: string[] = [];
    const RELLO = Number(process.env.SW_W27_OPSREL_LO ?? '8');
    const RELHI = Number(process.env.SW_W27_OPSREL_HI ?? '9');
    const SIMA = sim as unknown as Record<string, unknown>;
    const ls = (sim as unknown as { liquids: Array<{ x: number; y: number; delay: number; kill: number }>; numLiquid: number; bufCount: number });
    const oAdd = (SIMA.addWater as (x: number, y: number) => void).bind(sim);
    let addSeq = 0;
    (SIMA as { addWater: (x: number, y: number) => void }).addWater = function (x: number, y: number): void {
      const nl0 = ls.numLiquid, b0 = ls.bufCount;
      oAdd(x, y);
      if ((ls.numLiquid !== nl0 || ls.bufCount !== b0)) {
        if (jrel >= RELLO && jrel <= RELHI) {
          addSeq++;
          opLines.push(`A ${addSeq} ${x} ${y}`);
        }
      }
    };
    const oDel = (SIMA.delWater as (l: number) => void).bind(sim);
    let delSeq = 0;
    (SIMA as { delWater: (l: number) => void }).delWater = function (l: number): void {
      if (jrel >= RELLO && jrel <= RELHI) {
        delSeq++;
        opLines.push(`D ${delSeq} ${l}`);
      }
      oDel(l);
    };
    (SIMA as { updateLiquid: () => void }).updateLiquid = function (): void {
      oUpdate();
      jrel++;
      if (jrel >= RELLO && jrel <= RELHI + 1) opLines.push(`---IT-END ${jrel - 1}`);
      const buf = new ArrayBuffer(ls.numLiquid * 14);
      const dv = new DataView(buf);
      let off = 0;
      const nlTotal = ls.numLiquid;
      for (let k = 0; k < nlTotal; k++) {
        const e = ls.liquids[k];
        dv.setInt16(off, e.x, true); off += 2;
        dv.setInt16(off, e.y, true); off += 2;
        dv.setInt32(off, e.delay | 0, true); off += 4;
        dv.setInt32(off, e.kill | 0, true); off += 4;
        const ii = e.y * W + e.x;
        const lq = stRef.liquid[ii];
        const lt = stRef.liquid[ii] > 0 ? stRef.liquidType[ii] - 1 : 0;
        buf[off++] = lq; buf[off++] = lt;
      }
      let h = 2166136261 >>> 0;
      const u8 = new Uint8Array(buf);
      for (let k = 0; k < u8.length; k++) { h ^= u8[k]; h = (h * 16777619) >>> 0; }
      const nb = (sim as unknown as { bufCount: number }).bufCount;
      fpLines.push(`I ${jrel} ${nlTotal} ${nb} ${(h >>> 0).toString(16).padStart(8, '0')}`);
      const rawMax = Number(process.env.SW_W27_RAW ?? '-1');
      if (rawMax >= 0 && jrel <= rawMax) {
        for (let k = 0; k < nlTotal; k++) {
          const e = ls.liquids[k];
          rawLines.push(`E ${jrel} ${k} ${e.x} ${e.y} ${e.delay | 0} ${e.kill | 0} ${stRef.liquid[e.y * W + e.x]}`);
        }
        rawLines.push(`---IT ${jrel} end`);
      }
      if (jrel === 1 && rawMax >= 0) console.log(`settle2 it1 first entries: ${ls.liquids.slice(0, 5).map((q: { x: number; y: number }) => `${q.x},${q.y}`).join(' ')}`);
    };
    sim.quickSettle = true;
    sim.quickWater();
    sim.waterCheck();
    console.log(`settle2 post-WC numLiquid=${sim.numLiquid} buf=${sim.bufCount} (rig head2 n=2455)`);
    // 迭代级快照：rel=相对二次沉降首次 UpdateLiquid（与 rig 复刻侧对齐的口径）
    const wantRounds = process.env.SW_W27_ROUNDS === '1';
    const baseIters = (process.env.SW_W27_ITS ?? '1,2,3,4,5,6,7,8,10,12,15,20,30,45,60');
    const RELSET = new Set(baseIters.split(',').map(Number)
      .concat(wantRounds ? [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => -k) : []));
    const jit = `${OUT}/jit`;
    let rel = 0;
    const snapIfWanted = (): void => {
      rel++;
      if (!RELSET.has(rel)) return;
      const d = `${jit}/rel${rel}`;
      mkdirSync(d, { recursive: true });
      snap6(wd.store, `${d}/K`);
    };
    for (let round = 0; round < 10; round++) {
      const maxIter = (sim.numLiquid + sim.bufferLen) * 5;
      let iter = 0;
      while (sim.numLiquid > 0 && iter < maxIter) { sim.updateLiquid(); snapIfWanted(); iter++; }
      console.log(`round ${round}: iters=${iter} numLiquid=${sim.numLiquid}`);
      sim.waterCheck();
      // 轮尾世界也记档（W${round}）
      if (RELSET.has(-1 - round)) snap6(wd.store, `${OUT}/jround/s2${round + 1}/K`);
    }
    sim.quickSettle = false;
    sim.worldGenTilesIgnoreWater(false);
    const hh = fp(wd.store, 'C:final');
    cmpDump(wd.store, '/tmp/jjj-out/g1457', '098_Settle_Liquids_Again');
    writeFileSync(`${OUT}/j-liqlog27.txt`, fpLines.join('\n') + '\n');
    console.log(`fpstream lines=${fpLines.length} -> j-liqlog27.txt`);
    writeFileSync(`${OUT}/jops.txt`, opLines.join('\n') + '\n');
    console.log(`op lines=${opLines.length} -> jops.txt`);
    if (process.env.SW_W27_RAW !== undefined && Number(process.env.SW_W27_RAW) >= 0) {
      writeFileSync(`${OUT}/jraw.txt`, rawLines.join('\n') + '\n');
      console.log(`raw lines=${rawLines.length} -> jraw.txt`);
    }
    sim.dispose();
    void hh;
    // —— 对照既有 jdump/liqdump 前日工件（若相位吻合即免费获得 X/J iter 态）——
    if (process.env.SW_W27_OLDIT) {
      compareFiles(wd.store, '/tmp/www-out/jdump-iter1', 'old jdump-iter1');
      compareFiles(wd.store, '/tmp/www-out/liqdump-x', 'old liqdump-x');
    }
  }
}, 900_000);

/** x86 金标 dump（vanilla id 空间）对拍 */
function cmpDump(st: any, dir: string, name: string): void {
  const pre = `${dir}/${name}`;
  const t = le16(`${pre}.typ`), a = le8(`${pre}.act`), l = le8(`${pre}.liq`), lt = le8(`${pre}.lty`);
  let da = 0, dt = 0, dl = 0, dy = 0, first = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    if (a[i] !== (st.flags[i] & 1)) { da++; if (first < 0) first = i; }
    const vt = a[i] ? t[i] : 0;
    const jt = (st.flags[i] & 1) ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (vt !== jt) { dt++; pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1); if (first < 0) first = i; }
    if (l[i] !== st.liquid[i]) { dl++; if (first < 0) first = i; }
    const vl = l[i] > 0 ? lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) { dy++; pair.set(`Y${vl}>${jl}`, (pair.get(`Y${vl}>${jl}`) ?? 0) + 1); }
  }
  const ps = [...pair.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k2, v]) => `${k2}×${v}`).join(' ');
  console.log(`cmpDump[${name}] A=${da} T=${dt} L=${dl} Y=${dy}${first >= 0 ? ` first=(${first % W},${(first / W) | 0})` : ''} :: ${ps}`);
}
