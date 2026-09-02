// IIIII165 批一次性诊断：ddual 座1（i2）主骰流位失准点二分 —— JS 侧采集器。
//   承 _iii164gc.test.ts 换档：JOUT 缺省 /tmp/iii165-out，env 门 SW_I165GC。
//   ★本批增量：
//   ①接通 __swRollTotal（drlRc() 既有死管线，此处在 __swOnRoll 写入）⇒ DR|S 系 mark 的
//     rc= 字段变活，与 x86 JJHook.RollCount（全实例掷计数）同口径可对拍；
//   ②__swI113 收到的每行追加 |jmr=<主实例掷>|jrc=<全实例掷>（回调同步于发射时刻，
//     与 rig 侧 mark 后打印 RollCount 同位）；
//   ③保留 _iii164gc 的 GC-/wv/walk 采集面（SW_DG_GC / __swWvLog / __swI156Walk）。
//   对拍锚（x86 /tmp/iii158-out/rig3/mark.log，i1/i2 段界 rc）：
//     i1 INL30 EN65 ST67 EH94 BIO436 RM17622 CSR17787 CSH45738 RGN46534 PRH50034 HG69879
//     i2 INL518747 EN518782 ST518784 EH518807 BIO519308 RM536781 CSR536788 CSH564590
//        RGN565473 PRH565473 HG582971
//   判据窗口：W2=i2 INL→BIO（x86 rc Δ561）；W1=i1 HG→i2 INL（x86 rc Δ448,868）。
// 用法：cd game && SW_I165GC=1 SW_DG_GC=1 npx vitest run tools/_iii165gc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I165GC === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';
const JOUT = process.env.SW_I165GC_OUT ?? '/tmp/iii165-out';

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  function desVal(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(desVal);
    if (v && typeof v === 'object') {
      const o = v as { __t?: string; d?: unknown[] };
      if (o.__t) {
        const Ctor = (globalThis as unknown as Record<string, new (n: number) => Uint8Array | Int16Array>)[o.__t];
        const arr = new (Ctor as unknown as new (n: number) => never)(o.d?.length ?? 0) as unknown as { set(a: unknown[]): void };
        arr.set(o.d!);
        return arr;
      }
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

(RUN ? it : it.skip)('i165 GC stream-position bisect js-side capture', { timeout: 600_000 }, async () => {
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;

  const st0 = hydrate().st;
  const gsRaw = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as unknown as { seed: string };
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st0.w, st0.h);
    for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const src = (st0 as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gsRaw.seed), gsRaw as never);
  }

  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void; __swRollN?: number; __swRollTotal?: number };
  let rollN = 0;
  let rollAll = 0;
  let mainInst: object | undefined;
  // ★i165b：掷位直方图探针（SW_I165_SITES='name:lo:hi,...'；主实例掷在窗内按 1/N 采样
  //   抓栈顶函数名链，定位该窗掷量的 call-site 分布 —— 对照 C# 源找结构性多掷位）
  const siteWin = (process.env.SW_I165_SITES ?? '').split(',').filter(Boolean).map((s) => {
    const [nm, lo, hi, den] = s.split(':');
    return { nm, lo: Number(lo), hi: Number(hi), den: Number(den ?? 8), hit: 0, sites: new Map<string, number>() };
  });
  const siteLines: string[] = [];
  const grabSite = (): string => {
    const st = new Error().stack ?? '';
    const frames = st.split('\n').slice(2, 24);
    const out: string[] = [];
    for (const f of frames) {
      const m = f.match(/at (\S+) \((\S+):(\d+):\d+\)/) ?? f.match(/at (\S+) (\S+):(\d+):\d+/);
      if (!m) continue;
      const [, fn, path, ln] = m;
      // 跳过 harness/rng 框架帧（探针回调与 UnifiedRandom 内部），从真实 call-site 起收 4 帧
      if (/rng\.ts|core\/rng|_iii165gc\.test\.ts/.test(path)) continue;
      out.push(`${fn}@${path.split('/').pop()}:${ln}`);
      if (out.length >= 4) break;
    }
    return out.join(' <- ');
  };
  g.__swOnRoll = (_v, inst) => {
    rollAll++;
    g.__swRollTotal = rollAll; // drlRc() 既有读取位：DR|S mark 的 rc= 字段就此变活
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) return;
    rollN++;
    g.__swRollN = rollN;
    for (const w of siteWin) {
      if (rollN > w.lo && rollN <= w.hi && rollN % w.den === 0) {
        w.hit++;
        const site = grabSite();
        w.sites.set(site, (w.sites.get(site) ?? 0) + w.den);
      }
    }
  };

  const gcLines: string[] = [];
  const drLines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    const s = args.map(String).join(' ');
    if (s.startsWith('GC-') || s.startsWith('T-') || s.startsWith('DGD-') || s.startsWith('PDC-') || s.startsWith('BATT-') || s.startsWith('GTR-')) gcLines.push(`${s}|mr=${rollN}`);
  };
  // ★i165：全部 DR| 行带 |jmr=|jrc= 注脚采集（回调同步于发射时刻，与 rig mark 同位）
  (globalThis as { __swI113?: (line: string) => void }).__swI113 = (line: string) => {
    drLines.push(`${line}|jmr=${rollN}|jrc=${rollAll}`);
  };
  const wvLines: string[] = [];
  (globalThis as { __swWvLog?: unknown }).__swWvLog = true;
  (globalThis as { __wvLines?: string[] }).__wvLines = wvLines;
  if (process.env.SW_I165_WALK === '1') {
    const walkLines: string[] = [];
    (globalThis as { __swI156Walk?: (p: Record<string, unknown>) => void }).__swI156Walk = (p) => {
      walkLines.push(JSON.stringify(p));
    };
    (globalThis as { __swI156WalkOut?: string[] }).__swI156WalkOut = walkLines;
  }

  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, []);

  console.log = origLog;
  delete g.__swOnRoll;
  delete (globalThis as { __swI113?: unknown }).__swI113;
  delete (globalThis as { __swWvLog?: unknown }).__swWvLog;
  delete (globalThis as { __wvLines?: unknown }).__wvLines;

  writeFileSync(`${JOUT}/js-gc-trace.txt`, gcLines.join('\n') + '\n');
  writeFileSync(`${JOUT}/js-dr-trace.txt`, drLines.join('\n') + '\n');
  writeFileSync(`${JOUT}/js-wv-marks.txt`, wvLines.join('\n') + '\n');
  for (const w of siteWin) {
    const rows = [...w.sites.entries()].sort((a, b) => b[1] - a[1]);
    siteLines.push(`== ${w.nm} window (${w.lo},${w.hi}] sampled≈${rows.reduce((a, r) => a + r[1], 0)} rolls, ${rows.length} sites`);
    for (const [site, cnt] of rows.slice(0, 40)) siteLines.push(`${String(cnt).padStart(8)}  ${site}`);
  }
  if (siteLines.length) writeFileSync(`${JOUT}/js-sites.txt`, siteLines.join('\n') + '\n');
  const walkOut = (globalThis as { __swI156WalkOut?: string[] }).__swI156WalkOut;
  if (walkOut) writeFileSync(`${JOUT}/js-lg-walk.txt`, walkOut.join('\n') + '\n');
  console.log(`[i165gc] gc rows=${gcLines.length} dr rows=${drLines.length} wv rows=${wvLines.length} -> ${JOUT}`);
});
