// AAAAAA 批·基建①：9293480 管线槽 52 末（蜥蜴祭坛）全通道快照 → wire/帧/宝箱注册表
// 三隐形通道 vs 金标（/tmp/tttt-frw/101_Micro_Biomes.wire + /tmp/tttt-fr/101_Micro_Biomes.{fr,chest.tsv}
// = pass 头快照 = slot52 末态）对拍。SW_A1=cap：捕获；SW_A1=diff：只做三通道 diff（可指定
// SW_A1_DIR 换基座）。
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { generateWorld, __setGenStateForProbe, lastGenState } from '../src/world/gen/WorldGen';
import { restoreGenSolid, snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const MODE = process.env.SW_A1 ?? '';
const DIR = process.env.SW_A1_DIR ?? '/tmp/aaaaaa-929';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

const GOLD_WIRE = '/tmp/tttt-frw/101_Micro_Biomes.wire';
const GOLD_FR = '/tmp/tttt-fr/101_Micro_Biomes.fr';
const GOLD_CHEST = '/tmp/tttt-fr/101_Micro_Biomes.chest.tsv';

(MODE !== '' ? it : it.skip)('aaaa1 slot52 capture / channel diff', async () => {
  mkdirSync(DIR, { recursive: true });
  if (MODE === 'cap') {
    let done = false;
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0 as 0 | 1,
      onWorldPartial: (w, i, name) => {
        if (done || name !== '蜥蜴祭坛') return;
        done = true;
        const st = w.store;
        const save = (n: string, arr: Uint8Array | Uint16Array) =>
          writeFileSync(`${DIR}/${n}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
        save('type.bin', st.type); save('flags.bin', st.flags); save('wall.bin', st.wall);
        save('liquid.bin', st.liquid); save('liquidType.bin', st.liquidType);
        save('half.bin', st.half); save('slope.bin', st.slope);
        save('frameX.bin', st.frameX); save('frameY.bin', st.frameY);
        save('wire.bin', st.wire); save('paint.bin', st.paint);
        writeFileSync(`${DIR}/gs.json`, JSON.stringify(lastGenState()));
        writeFileSync(`${DIR}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
        writeFileSync(`${DIR}/chests.json`, JSON.stringify(w.chests ?? []));
        console.log(`captured slot ${i} (${name}) end → ${DIR}`);
      },
    });
    return;
  }
  // rep 模式：新捕基座 → runMicroBiomesPass → 对拍 dump101（8 通道）。
  // SW_A1_GF=1 → 入口注入金标帧（对照：JS 帧的残差=帧债成分）。
  if (MODE === 'rep') {
    const G2 = '/tmp/sw-slp/g';
    const st = new TileStore(W, H);
    const ld = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
    st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
    st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
    const gs = JSON.parse(readFileSync(`${DIR}/gs.json`, 'utf8')) as GenState;
    restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
    __setGenStateForProbe(gs);
    if (process.env.SW_A1_GF === '1') {
      const b = readFileSync(GOLD_FR);
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const cnt = dv.getUint32(0, true);
      // SW_A1_KEEP="184,61" → 这些族保留 JS 帧（其余注金标）——逐族因果隔离。
      const keep = new Set((process.env.SW_A1_KEEP ?? '').split(',').map(Number).filter(Boolean));
      let inj = 0;
      for (let q = 0; q < cnt; q++) {
        const off = 4 + q * 8;
        const i = dv.getUint32(off, true);
        if (keep.size && keep.has(SHEET[st.type[i]!] ?? -1)) continue;
        st.frameX[i] = dv.getUint16(off + 4, true);
        st.frameY[i] = dv.getUint16(off + 6, true);
        inj++;
      }
      console.log(`  [gf] golden frames injected (${inj}/${cnt}${keep.size ? ` keep-js=${[...keep]}` : ''})`);
    }
    const chests = JSON.parse(readFileSync(`${DIR}/chests.json`, 'utf8'));
    const rng = new RNG(SEED);
    if (process.env.SW_A1_CHAIN === '102') {
      // 链式重放 101→102（微群系→水生植物），对拍 102
      const { runLilypadsPass } = await import('../src/world/gen/vanilla/SurfaceDecorPasses');
      runMicroBiomesPass(st, rng, gs, chests);
      rng.reseed(SEED);
      runLilypadsPass(st, rng, gs);
    } else if (process.env.SW_A1_CHAIN === '103') {
      const { runLilypadsPass } = await import('../src/world/gen/vanilla/SurfaceDecorPasses');
      const { runGemTreesPass } = await import('../src/world/gen/vanilla/GemPasses');
      runMicroBiomesPass(st, rng, gs, chests);
      rng.reseed(SEED);
      runLilypadsPass(st, rng, gs);
      rng.reseed(SEED);
      runGemTreesPass(st, rng, gs);
    } else if (process.env.SW_A1_CHAIN === '105') {
      const { runLilypadsPass } = await import('../src/world/gen/vanilla/SurfaceDecorPasses');
      const { runGemTreesPass } = await import('../src/world/gen/vanilla/GemPasses');
      const { runBrokenTrapCleanupPass } = await import('../src/world/gen/vanilla/BrokenTrapCleanupPass');
      const { runFinalCleanupPass } = await import('../src/world/gen/vanilla/FinalCleanupPass');
      runMicroBiomesPass(st, rng, gs, chests);
      rng.reseed(SEED);
      runLilypadsPass(st, rng, gs);
      rng.reseed(SEED);
      runGemTreesPass(st, rng, gs);
      rng.reseed(SEED);
      runBrokenTrapCleanupPass(st, rng);
      rng.reseed(SEED);
      runFinalCleanupPass(st, gs, rng, { frameSparse: process.env.SW_A1_FS !== '0' });
    } else if (process.env.SW_A1_CHAIN === '104') {
      const { runLilypadsPass } = await import('../src/world/gen/vanilla/SurfaceDecorPasses');
      const { runGemTreesPass } = await import('../src/world/gen/vanilla/GemPasses');
      const { runBrokenTrapCleanupPass } = await import('../src/world/gen/vanilla/BrokenTrapCleanupPass');
      runMicroBiomesPass(st, rng, gs, chests);
      rng.reseed(SEED);
      runLilypadsPass(st, rng, gs);
      rng.reseed(SEED);
      runGemTreesPass(st, rng, gs);
      rng.reseed(SEED);
      runBrokenTrapCleanupPass(st, rng);
    } else if (process.env.SW_A1_CHAIN === '103only') {
      const { runGemTreesPass } = await import('../src/world/gen/vanilla/GemPasses');
      runGemTreesPass(st, rng, gs);
    } else {
      runMicroBiomesPass(st, rng, gs, chests);
    }
    __setGenStateForProbe(null);
    if (process.env.SW_A1_REGION) {
      // 区域转储：x0,y0,x1,y1 → type/sheet/act/slope/wire
      const [x0, y0, x1, y1] = process.env.SW_A1_REGION.split(',').map(Number);
      const lines: string[] = [];
      for (let y = y0; y <= y1; y++) {
        let row = `y=${y}: `;
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          row += (st.flags[i] ? `s${SHEET[st.type[i]]}` : `g${SHEET[st.type[i]]}`) + `/w${st.wire[i] & 0x1f}${st.wire[i] & 32 ? 'A' : ''} `;
        }
        lines.push(row);
      }
      console.log(lines.join('\n'));
    }
    const DUMP = process.env.SW_A1_DUMP ?? '101_Micro_Biomes';
    const rd = (e: string) => new Uint8Array(readFileSync(`${G2}/${DUMP}.${e}`).buffer.slice(0));
    const rd16 = (e: string) => new Uint16Array(readFileSync(`${G2}/${DUMP}.${e}`).buffer.slice(0));
    const c = { t: rd16('typ'), a: rd('act'), w: rd16('wal'), l: rd('liq'), hf: rd('half'), sl: rd('slope'), lt: rd('lty'), ia: rd('inact') };
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, first = '';
    const pair = new Map<string, number>();
    for (let i2 = 0; i2 < N; i2++) {
      const va = c.a[i2]!, ja = st.flags[i2]! & 1;
      if (va !== ja) { dA++; if (!first) first = `A(${i2 % W},${Math.floor(i2 / W)})`; }
      const vt = va ? c.t[i2]! : 0;
      const jt = ja ? (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!]! : 9999) : 0;
      if (vt !== jt) { dT++; if (!first) first = `T(${i2 % W},${Math.floor(i2 / W)}) v${vt} j${jt}`; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
      if (c.w[i2]! !== st.wall[i2]!) dW++;
      if (c.l[i2]! !== st.liquid[i2]!) dL++;
      if (c.hf[i2]! !== st.half[i2]!) dHf++;
      if (c.sl[i2]! !== st.slope[i2]!) dSl++;
      const vl = c.l[i2]! > 0 ? c.lt[i2]! + 1 : 0;
      const jl = st.liquid[i2]! > 0 ? st.liquidType[i2]! : 0;
      if (vl !== jl) dLt++;
      if ((c.ia[i2]! ? 1 : 0) !== ((st.wire[i2]! >>> 5) & 1)) dIa++;
    }
    console.log(`[replay#101] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} ${first || '✓'}`);
    console.log(`  pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
    return;
  }
  // diff 模式：三隐形通道对拍
  const st = new TileStore(W, H);
  {
    const ld = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
    st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
    st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
  }
  // ① wire 对拍
  {
    const gw = new Uint8Array(readFileSync(GOLD_WIRE).buffer.slice(0));
    const cells: string[] = [];
    let n = 0;
    for (let i = 0; i < N; i++) {
      const g = gw[i]! & 0x1f, j = st.wire[i]! & 0x1f;
      if (g !== j) { n++; if (cells.length < 400) cells.push(`(${i % W},${Math.floor(i / W)}) g${g.toString(2)} j${j.toString(2)} sheet=${SHEET[st.type[i]!] ?? -1}`); }
    }
    console.log(`[wire] diff cells = ${n}`);
    if (n) {
      // 聚类：按 40 格桶
      const buckets = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        const g = gw[i]! & 0x1f, j = st.wire[i]! & 0x1f;
        if (g !== j) { const k = `${Math.floor(i % W / 40)},${Math.floor(Math.floor(i / W) / 40)}`; buckets.set(k, (buckets.get(k) ?? 0) + 1); }
      }
      const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
      console.log(`  top buckets: ${top.map(([k, c]) => `${k}×${c}`).join(' ')}`);
      console.log(`  samples: ${cells.slice(0, 12).join(' | ')}`);
      writeFileSync('/tmp/aaaaaa-wire-diff.txt', cells.join('\n') + '\n');
    }
  }
  // ② 帧对拍（金标 .fr 只含 frameImportant 格）
  {
    const b = readFileSync(GOLD_FR);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const cnt = dv.getUint32(0, true);
    let n = 0; const fam = new Map<string, number>(); const samples: string[] = [];
    for (let q = 0; q < cnt; q++) {
      const off = 4 + q * 8;
      const i = dv.getUint32(off, true);
      const fx = dv.getUint16(off + 4, true), fy = dv.getUint16(off + 6, true);
      if (st.frameX[i] !== fx || st.frameY[i] !== fy) {
        n++;
        const sh = SHEET[st.type[i]!] ?? -1;
        const k = `s${sh} fy${fy - st.frameY[i]! === 0 ? '' : ''}`; // 族按 sheet 聚
        const key = `s${sh}`;
        fam.set(key, (fam.get(key) ?? 0) + 1);
        if (samples.length < 25) samples.push(`(${i % W},${Math.floor(i / W)}) s${sh} g(${fx},${fy}) j(${st.frameX[i]},${st.frameY[i]})`);
      }
    }
    console.log(`[frames] diff cells = ${n} / golden framed ${cnt}`);
    const top = [...fam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    if (top.length) console.log(`  families: ${top.map(([k, c]) => `${k}×${c}`).join(' ')}`);
    if (samples.length) console.log(`  samples: ${samples.slice(0, 8).join(' | ')}`);
    // 每族 fx/fy 差模式（g_fx-j_fx, g_fy-j_fy 聚类）
    const modes = new Map<string, number>();
    for (let q = 0; q < cnt; q++) {
      const off = 4 + q * 8;
      const i = dv.getUint32(off, true);
      const fx = dv.getUint16(off + 4, true), fy = dv.getUint16(off + 6, true);
      if (st.frameX[i] !== fx || st.frameY[i] !== fy) {
        const sh = SHEET[st.type[i]] ?? -1;
        const mk = `s${sh} fx${fx - st.frameX[i]!} fy${fy - st.frameY[i]!}`;
        modes.set(mk, (modes.get(mk) ?? 0) + 1);
      }
    }
    console.log(`  modes: ${[...modes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, c]) => `${k}×${c}`).join(' ')}`);
    // 每族坐标样本（定位 writer pass 用）
    const famSamples = new Map<string, string[]>();
    for (let q = 0; q < cnt; q++) {
      const off = 4 + q * 8;
      const i = dv.getUint32(off, true);
      const fx = dv.getUint16(off + 4, true), fy = dv.getUint16(off + 6, true);
      if (st.frameX[i] !== fx || st.frameY[i] !== fy) {
        const sh = SHEET[st.type[i]] ?? -1;
        const arr = famSamples.get(`s${sh}`) ?? [];
        if (arr.length < 6) arr.push(`(${i % W},${Math.floor(i / W)})g${fx},${fy}j${st.frameX[i]},${st.frameY[i]}`);
        famSamples.set(`s${sh}`, arr);
      }
    }
    for (const [k, v] of [...famSamples.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 25))
      console.log(`  ${k}: ${v.join(' ')}`);
  }
  // ③ 宝箱注册表对拍（仅坐标序）
  {
    const gold: Array<[number, number]> = [];
    for (const ln of readFileSync(GOLD_CHEST, 'utf8').trim().split('\n')) {
      const f = ln.split('\t');
      gold.push([Number(f[1]), Number(f[2])]);
    }
    const js = JSON.parse(readFileSync(`${DIR}/chests.json`, 'utf8')) as Array<{ x: number; y: number }>;
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    const gset = new Set(gold.map(([x, y]) => `${x},${y}`));
    const jset = new Set(js.map(key));
    const regOnly = gold.filter(([x, y]) => !jset.has(`${x},${y}`));
    const jsOnly = js.filter(p => !gset.has(key(p)));
    let orderMis = 0;
    const common = Math.min(gold.length, js.length);
    const seq: string[] = [];
    for (let q = 0; q < common; q++) {
      if (`${gold[q][0]},${gold[q][1]}` !== key(js[q])) { orderMis++; if (seq.length < 8) seq.push(`#${q} g(${gold[q]}) j(${js[q].x},${js[q].y})`); }
    }
    console.log(`[chests] gold=${gold.length} js=${js.length} common=${gold.length - regOnly.length} regOnly=${regOnly.length} jsOnly=${jsOnly.length} orderMis=${orderMis}`);
    if (regOnly.length) console.log(`  regOnly: ${regOnly.slice(0, 10).map(p => `(${p})`).join(' ')}`);
    if (jsOnly.length) console.log(`  jsOnly: ${jsOnly.slice(0, 10).map(p => `(${p.x},${p.y})`).join(' ')}`);
    if (seq.length) console.log(`  order: ${seq.join(' | ')}`);
  }
}, 600_000);
