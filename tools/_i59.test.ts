// IIII57 仪：desert 段隔离 bench（_i56b 复刻）+ 双端事件级取证。
// 新增（vs i56b）：①rng 值列（n|v|<raw32>|sig…）；②__swD59v 深度事件流
//   （AV 锚点前/后、placeTight/checkStalactite/updateStalagtiteStyle/kill 级联逐谓词）
//   → /tmp/iii59-out/js-events.jsonl；③方差段入口 TileStore 快照（可选 SW_I59_DUMP=1）。
// 用法：cd game && SW_I59=1 npx vitest run tools/_i59.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runDesertPass } from '../src/world/gen/vanilla/DesertPass';

it.skipIf(process.env.SW_I59 !== '1')('i59 desert bench deep-trace', () => {
  const G2 = '/tmp/iii45-out/x86-remix';
  const OUT = '/tmp/iii59-out';
  const W = 4200, H = 1200, N = W * H;
  const SEED = 1138154190;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  const NAME_BY_SHEET = new Map<number, string>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') { SHEET[i] = s; if (!NAME_BY_SHEET.has(s)) NAME_BY_SHEET.set(s, TILE_DEFS[i]!.key); }
  }
  const rd16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1); };
  const rd8 = (p: string) => new Uint8Array(readFileSync(p));
  const mk = (name: string, u16: boolean) => {
    const f = `/tmp/iii56-out/snap-18-DesertBiome-${name}.bin`;
    return u16 ? rd16(f) : rd8(f);
  };
  const st = new TileStore(W, H);
  for (const [k, u] of [['type', true], ['flags', false], ['wall', true], ['liquid', false],
    ['liquidType', false], ['half', false], ['slope', false], ['wire', false]] as Array<[string, boolean]>) {
    Object.defineProperty(st, k, { value: mk(k, u), configurable: true });
  }
  const rng = new RNG(SEED);
  const gs = {
    seed: SEED, seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380, beachLeftEnd: 376, beachRightStart: 3873,
    dungeonSide: 1 as 1 | -1, dungeonX: 2733,
    snowOriginLeft: 2608, snowOriginRight: 2861,
    remixMushroomLayerLow: 850, remixMushroomLayerHigh: 1000,
    desertHiveHigh: H, desertHiveLow: 0, desertHiveLeft: W, desertHiveRight: 0,
    undergroundDesert: null as never, undergroundDesertHive: null as never,
  } as never as Parameters<typeof runDesertPass>[2];

  let rollN = 0;
  const phases: Array<[string, number]> = [];
  const tagLines: string[] = [];
  const evLines: string[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g.__swOnRoll = (value: number) => {
    rollN++;
    const leaf = (globalThis as { __swLeaf?: string | null }).__swLeaf;
    if (leaf) { tagLines.push(`${rollN}|${value}|${leaf}|`); return; }
    const lim0 = Error.stackTraceLimit;
    Error.stackTraceLimit = 30;
    const s = new Error().stack ?? '';
    Error.stackTraceLimit = lim0;
    const fr = s.split('\n').slice(1).map((l) => l.trim())
      .map((l) => /^at (?:(\S+) )?\(?([^()]+?):(\d+):\d+\)?/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .filter((m) => !/[\\/](core[\\/]rng|tools)[\\/]/.test(m[2]!))
      .filter((m) => !m[2]!.includes('node:'))
      .map((m) => `${(m[2]!.split(/[\\/]/).pop() ?? '?').replace('.ts', '')}:${m[3]}${m[1] ? '#' + m[1].replace(/[^A-Za-z0-9_$<>].*/, '') : ''}`);
    tagLines.push(`${rollN}|${value}|${fr.slice(0, 8).join('>')}`);
  };
  g.__swD56 = (t: string) => { phases.push([t, rollN]); };
  g.__swD59v = (o: Record<string, unknown>) => { evLines.push(JSON.stringify({ n: rollN, ...o })); };

  runDesertPass(st, rng, gs);
  delete g.__swOnRoll; delete g.__swD56; delete g.__swD59v;

  console.log(`internalSample total=${rollN}; anchors=${evLines.filter((l) => l.includes('"e":"avf"')).length}`);
  let prev = 0;
  for (const [t, n] of phases) { console.log(`phase ${t}: +${n - prev} (abs=${n})`); prev = n; }
  writeFileSync('/tmp/iii56-out/js-tags-i59.txt', tagLines.join('\n') + '\n');
  writeFileSync(`${OUT}/js-events.jsonl`, evLines.join('\n') + '\n');
  console.log(`events=${evLines.length} → ${OUT}/js-events.jsonl`);

  // 方差段入口快照（离线语义重放用，通道与 i56a 同名）
  if (process.env.SW_I59_DUMP === '1') {
    for (const ch of ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const) {
      writeFileSync(`${OUT}/prevar-${ch}.bin`, Buffer.from((st[ch] as Uint8Array | Uint16Array).buffer as ArrayBuffer,
        (st[ch] as Uint8Array | Uint16Array).byteOffset, (st[ch] as Uint8Array | Uint16Array).byteLength));
    }
    console.log(`[snapshot] variance-begin store → ${OUT}/prevar-*.bin`);
  }

  // ---- 对拍 019_Full_Desert ----
  const xt = rd16(`${G2}/019_Full_Desert.typ`), xa = rd8(`${G2}/019_Full_Desert.act`), xw = rd16(`${G2}/019_Full_Desert.wal`),
    xl = rd8(`${G2}/019_Full_Desert.liq`), xlty = rd8(`${G2}/019_Full_Desert.lty`), xhf = rd8(`${G2}/019_Full_Desert.half`),
    xsl = rd8(`${G2}/019_Full_Desert.slope`), xia = rd8(`${G2}/019_Full_Desert.inact`);
  interface Fam { n: number; bb: [number, number, number, number]; ex: number }
  const famsT = new Map<string, Fam>(), famsA = new Map<string, Fam>();
  const addFam = (m: Map<string, Fam>, k: string, x: number, y: number) => {
    const e = m.get(k);
    if (!e) m.set(k, { n: 1, bb: [x, y, x, y], ex: y * W + x });
    else { e.n++; e.bb[0] = Math.min(e.bb[0], x); e.bb[1] = Math.min(e.bb[1], y); e.bb[2] = Math.max(e.bb[2], x); e.bb[3] = Math.max(e.bb[3], y); }
  };
  let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0, dGhReal = 0;
  const L = [] as string[];
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; addFam(famsA, va ? 'x86active>jsoff' : 'x86off>jsactive', x, y); }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; addFam(famsT, `T${vt}(${NAME_BY_SHEET.get(vt)})>${jt === 9999 ? '?' : jt}(${jt === 9999 ? 'raw' + st.type[i] : NAME_BY_SHEET.get(jt) ?? ''})`, x, y); }
    if (xw[i]! !== st.wall[i]!) dW++;
    if (xl[i]! !== st.liquid[i]!) dL++;
    const vl = xl[i]! > 0 ? xlty[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) dLt++;
    if (xhf[i]! !== st.half[i]!) dHf++;
    if (xsl[i]! !== st.slope[i]!) dSl++;
    if ((xia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
    if (!va && !ja) {
      const xv = xt[i]!;
      const tRaw = st.type[i]!;
      const jv = tRaw === 0 ? 0 : (SHEET[tRaw] >= 0 ? SHEET[tRaw]! : -2);
      if (xv !== jv) dGhReal++;
    }
  }
  const show = (title: string, m: Map<string, Fam>, cap = 14) => {
    L.push(`-- ${title}`);
    [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, cap).forEach(([k, e]) => {
      L.push(`   ${k.padEnd(46)}×${e.n}  bbox=(${e.bb[0]},${e.bb[1]})..(${e.bb[2]},${e.bb[3]})`);
    });
  };
  console.log(`dA=${dA} dT=${dT} dW=${dW} dL=${dL} dLt=${dLt} dHf=${dHf} dSl=${dSl} dIa=${dIa} 真Gh=${dGhReal}`);
  show('T 家族', famsT); show('A 家族', famsA, 4);
  const rep = [`dA=${dA} dT=${dT} dW=${dW} dL=${dL} dLt=${dLt} dHf=${dHf} dSl=${dSl} dIa=${dIa} 真Gh=${dGhReal}`, ...L].join('\n');
  writeFileSync(`${OUT}/bench-report.txt`, rep + '\n');
}, 600_000);
