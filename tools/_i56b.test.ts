// IIII54 仪B：desert 段隔离 bench（snap-18 真态快照装载 → runDesertPass → 对拍 019_Full_Desert）。
// 与 i48aa 的区别：不再用 BYSHEET 反查重建 store（会把全部空格伪造成 dirt 幽灵），
// 直接装载 IIII54 仪A 冻结的 JS 原始通道（snap-18-DesertBiome-*.bin），语义零失真。
// 用法：cd game && SW_I56B=1 npx vitest run tools/_i56b.test.ts
// 可选：SW_I56B_WIN=x,y[,r] 在报告尾部打印邻窗逐格对拍表。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runDesertPass } from '../src/world/gen/vanilla/DesertPass';

it.skipIf(process.env.SW_I56B !== '1')('i56b desert bench', () => {
  const G2 = '/tmp/iii45-out/x86-remix';
  const OUT = '/tmp/iii56-out';
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
  // ---- 装载 snap-18 原始通道 ----
  const mk = (name: string, u16: boolean) => {
    const f = `${OUT}/snap-18-DesertBiome-${name}.bin`;
    return u16 ? rd16(f) : rd8(f);
  };
  const st = new TileStore(W, H);
  for (const [k, u] of [['type', true], ['flags', false], ['wall', true], ['liquid', false],
    ['liquidType', false], ['half', false], ['slope', false], ['wire', false]] as Array<[string, boolean]>) {
    Object.defineProperty(st, k, { value: mk(k, u), configurable: true });
  }
  // i48aa 的 GenState 复刻（live 前沿 193/583 与本架逐位一致故参数成立）
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
  // IIII54：genRand(internalSample) 计数 + 阶段标记（__swOnRoll/__swD56 与 x86 同位对拍）
  //   ★SW_I56B_ROLL='tag' 模式：逐样本记录 V8 调用点签名（与 x86 SW_TAGLOG 同构对齐）。
  let rollN = 0;
  const phases: Array<[string, number]> = [];
  const vlogs: Array<Record<string, unknown>> = [];
  const tagLines: string[] = [];
  const ROLLV = process.env.SW_I56B_ROLL; if (ROLLV === '1' || ROLLV === 'tag') {
    const g = globalThis as unknown as Record<string, unknown>;
    g.__swOnRoll = () => {
      rollN++;
      if (ROLLV === 'tag') {
        const lim0 = Error.stackTraceLimit;
        Error.stackTraceLimit = 14;
        const s = new Error().stack ?? '';
        Error.stackTraceLimit = lim0;
        const fr = s.split('\n').slice(1).map((l) => l.trim())
          .map((l) => /^at (?:(\S+) )?\(?([^()]+?):(\d+):\d+\)?/.exec(l))
          .filter((m): m is RegExpExecArray => !!m)
          .filter((m) => !/[\\/](core[\\/]rng|tools)[\\/]/.test(m[2]!))
          .filter((m) => !m[2]!.includes('node:'))
          .map((m) => `${(m[2]!.split(/[\\/]/).pop() ?? '?').replace('.ts', '')}:${m[3]}${m[1] ? '#' + m[1].replace(/[^A-Za-z0-9_$<>].*/, '') : ''}`);
        tagLines.push(`${rollN}|sig|${fr.slice(0, 5).join('>')}`);
      }
    };
    g.__swD56 = (t: string) => { phases.push([t, rollN]); };
    g.__swD56v = (o: Record<string, unknown>) => {
      if (o.e === 'anchor') { o.t0 = rollN; }
      vlogs.push(o);
    };
  }
  runDesertPass(st, rng, gs);
  if (ROLLV === '1' || ROLLV === 'tag') {
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.__swOnRoll; delete g.__swD56; delete g.__swD56v;
    console.log(`internalSample total=${rollN}; anchors=${vlogs.filter((v) => v.e === 'anchor').length}`);
    let prev = 0;
    for (const [t, n] of phases) {
      console.log(`phase ${t}: +${n - prev} (abs=${n})`);
      prev = n;
    }
    writeFileSync(`${OUT}/js-phase-counts.json`, JSON.stringify({ total: rollN, phases }));
    writeFileSync(`${OUT}/js-variance-log.json`, JSON.stringify(vlogs));
    if (tagLines.length) writeFileSync(`${OUT}/js-tags-p19.txt`, tagLines.join('\n') + '\n');
    // JS 终态导出（python 端与 x86 派生真值逐锚对照）
    writeFileSync(`${OUT}/b019-js.typ`, Buffer.from((() => {
      const o = new Uint16Array(N);
      for (let i = 0; i < N; i++) o[i] = (st.flags[i]! & 1) ? Math.max(0, SHEET[st.type[i]!] ?? -1) : 0;
      return o.buffer;
    })()));
    writeFileSync(`${OUT}/b019-js.act`, Buffer.from(Uint8Array.from(st.flags, (v) => v & 1)));
  }
  console.log(`hiveBounds=[${gs.desertHiveHigh},${gs.desertHiveLow}] x[${gs.desertHiveLeft},${gs.desertHiveRight}]`);

  // ---- 对拍 019_Full_Desert ----
  const f = '019_Full_Desert';
  const xt = rd16(`${G2}/${f}.typ`), xa = rd8(`${G2}/${f}.act`), xw = rd16(`${G2}/${f}.wal`),
    xl = rd8(`${G2}/${f}.liq`), xlty = rd8(`${G2}/${f}.lty`), xhf = rd8(`${G2}/${f}.half`),
    xsl = rd8(`${G2}/${f}.slope`), xia = rd8(`${G2}/${f}.inact`);
  const xlt = xlty;
  interface Fam { n: number; bb: [number, number, number, number]; ex: number }
  const famsT = new Map<string, Fam>(), famsA = new Map<string, Fam>(), famsL = new Map<string, Fam>(), famsW = new Map<string, Fam>(), famsGh = new Map<string, Fam>();
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
    if (va !== ja) { dA++; addFam(famsA, va ? `x86active>jsoff` : `x86off>jsactive`, x, y); }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; addFam(famsT, `T${vt}(${NAME_BY_SHEET.get(vt)})>${jt === 9999 ? '?' : jt}(${jt === 9999 ? 'raw' + st.type[i] : NAME_BY_SHEET.get(jt) ?? ''})`, x, y); }
    if (xw[i]! !== st.wall[i]!) { dW++; addFam(famsW, `W${xw[i]}>${st.wall[i]}`, x, y); }
    if (xl[i]! !== st.liquid[i]!) dL++;
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; addFam(famsL, `Y${vl}>${jl}`, x, y); }
    if (xhf[i]! !== st.half[i]!) dHf++;
    if (xsl[i]! !== st.slope[i]!) dSl++;
    if ((xia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
    if (!va && !ja) {
      const xv = xt[i]!;
      const tRaw = st.type[i]!;
      const jv = tRaw === 0 ? 0 : (SHEET[tRaw] >= 0 ? SHEET[tRaw]! : -2);
      if (xv !== jv) { dGhReal++; addFam(famsGh, `Gh v${xv}>j${jv}`, x, y); }
    }
  }
  const show = (title: string, m: Map<string, Fam>, cap = 14) => {
    L.push(`-- ${title}`);
    [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, cap).forEach(([k, e]) => {
      L.push(`   ${k.padEnd(46)}×${e.n}  bbox=(${e.bb[0]},${e.bb[1]})..(${e.bb[2]},${e.bb[3]})`);
    });
  };
  console.log(`dA=${dA} dT=${dT} dW=${dW} dL=${dL} dLt=${dLt} dHf=${dHf} dSl=${dSl} dIa=${dIa} 真Gh=${dGhReal}`);
  show('T 家族', famsT); show('A 家族', famsA, 4); show('Lt(Y) 家族', famsL, 10); show('W 家族', famsW, 8); show('真Gh 家族', famsGh, 8);
  const rep = [`dA=${dA} dT=${dT} dW=${dW} dL=${dL} dLt=${dLt} dHf=${dHf} dSl=${dSl} dIa=${dIa} 真Gh=${dGhReal}`, ...L].join('\n');
  writeFileSync(`${OUT}/b019-report.txt`, rep + '\n');
  console.log(rep);
  // 差异掩码导出（离线取证用）
  const saveMask = (name: string, pred: (i: number) => boolean) => {
    const m = new Uint8Array(N);
    let n = 0;
    for (let i = 0; i < N; i++) if (pred(i)) { m[i] = 1; n++; }
    writeFileSync(`${OUT}/${name}`, Buffer.from(m));
    console.log(`mask ${name}: ${n}`);
  };
  saveMask('b019-maskY.bin', (i) => (xl[i]! > 0 ? xlty[i]! + 1 : 0) !== (st.liquid[i]! > 0 ? st.liquidType[i]! : 0));
  saveMask('b019-maskT.bin', (i) => ((xa[i]! ? xt[i]! : 0) !== (st.flags[i]! & 1 ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999) : 0)));
  saveMask('b019-maskA.bin', (i) => xa[i]! !== (st.flags[i]! & 1));

  // ---- 可选窗口逐格表 ----
  const win = process.env.SW_I56B_WIN;
  if (win) {
    const [wx, wy, wr0] = win.split(',').map(Number);
    const r = wr0 ?? 6;
    const rows: string[] = [];
    for (let y = wy - r; y <= wy + r; y++) for (let x = wx - r; x <= wx + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      const va = xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : -2) : 0;
      const vlv = xl[i]! > 0 ? xlty[i]! + 1 : 0;
      const jlv = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      const mark = (va !== ja || vt !== jt || xl[i] !== st.liquid[i]) ? '*'
        : vlv !== jlv ? '#' : ' ';
      rows.push(`(${String(x).padStart(4)},${String(y).padStart(4)})${mark}` +
        ` A${va}${ja}` +
        ` Tv${vt}(${NAME_BY_SHEET.get(vt)}) jv${jt}(${jt === -2 ? `raw${st.type[i]}` : NAME_BY_SHEET.get(jt)})` +
        ` Wv${xw[i]} j${st.wall[i]}` +
        ` Lv${xl[i]}.${xlt[i]} j${st.liquid[i]}.${st.liquidType[i]}` +
        ` Sl${xsl[i]}/${st.slope[i]} Hf${xhf[i]}/${st.half[i]}`);
    }
    console.log(rows.join('\n'));
    writeFileSync(`${OUT}/b019-window-${wx}-${wy}.txt`, rows.join('\n') + '\n');
  }
}, 600_000);
