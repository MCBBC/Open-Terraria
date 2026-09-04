// IIII159（2026-09-04）winter 最后一刀——#3961→#3962 相移逐掷归属仪。
// 基座 = _iii148sim 决定性实验（base 重放 22,859 事件恒等）,本仪升级:
//  ①全管线跑抓 Piles 头(store+gs+GenSolid LUT)——同 _iii148sim;
//  ②离线重放 runPilesPass,**全程**掷值流(约 50 万掷)+结构事件(TF/KT/SQ/TI)+
//    attempt 级追踪(__swI148Att)+PT/SP 事件;
//  ③对 x86 侧 RV 窗(/tmp/iii148-out/x86-rv-window.txt,行 n=第 n+1 掷)做逐掷对齐
//    diff→完整分歧区间表;事件流对 x86-piles-labeled.txt 同步对齐。
// 用法:cd game && SW_I159SIM=1 npx vitest run tools/_iii159sim.test.ts
// 产物:/tmp/iii159-out/{js-rv-full,js-struct,js-events,js-att,rv-diff,evt-diff}.txt
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_I159SIM === '1';
const SEED = '1.1.1.0.winteriscoming|20260914';
const OUT = process.env.SW_I159_OUT ?? '/tmp/iii159-out';
const W = 4200, H = 1200;
// 结构事件取证窗(掷位,JS 口径 第 n 掷);可用 SW_I159_WIN="a,b;c,d" 覆盖
const DEF_WIN = '12050,12260;33650,33980';
const WINS: [number, number][] = (process.env.SW_I159_WIN ?? DEF_WIN)
  .split(';').map((s) => { const [a, b] = s.split(',').map(Number); return [a!, b!] as [number, number]; });
const inWin = (n: number) => WINS.some(([a, b]) => n >= a && n <= b);

const CH = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'coat'] as const;
function cloneStore(st: TileStore): TileStore {
  const c = new TileStore(st.w, st.h);
  for (const k of CH) (c as unknown as Record<string, Uint8Array | Uint16Array>)[k].set((st as unknown as Record<string, Uint8Array | Uint16Array>)[k]);
  return c;
}

(RUN ? it : it.skip)('III159SIM full-roll attribution replay', async () => {
  mkdirSync(OUT, { recursive: true });
  // ---- ① 全管线:Piles 头捕获 ----
  let grab: { st: TileStore; gs: GenState; lut: ReturnType<typeof snapshotGenSolid> } | null = null;
  let lastReseed = -1;
  const rp2 = RNG.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const origReseed2 = rp2.reseed;
  rp2.reseed = function (this: unknown, s: number) { lastReseed = s; return (origReseed2 as (...a: unknown[]) => void).call(this, s); };
  (globalThis as { __swI148Grab?: unknown }).__swI148Grab = (rawSt: unknown, rawGs: unknown) => {
    if (grab) return;
    grab = { st: cloneStore(rawSt as TileStore), gs: { ...(rawGs as GenState) } as GenState, lut: snapshotGenSolid() };
  };
  await generateWorld({ width: W, height: H, seedText: SEED });
  rp2.reseed = origReseed2;
  (globalThis as { __swI148Grab?: unknown }).__swI148Grab = undefined;
  if (!grab) throw new Error('grab failed');
  const { st, gs, lut } = grab;
  const seed = lastReseed;
  console.log(`grab ok seed=${seed} surface=${gs.worldSurface} rock=${gs.rockLevel} beach=${gs.beachDistance}`);

  // ---- ①b pre-Piles 全通道落盘(对 x86 076_Traps 8 通道 dump 对账) ----
  {
    const fs4 = await import('node:fs');
    const u16 = (a: Uint16Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    const u8 = (a: Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    fs4.writeFileSync(`${OUT}/js-076.typ`, u16(st.type));
    fs4.writeFileSync(`${OUT}/js-076.act`, u8(st.flags));
    fs4.writeFileSync(`${OUT}/js-076.wal`, u16(st.wall));
    fs4.writeFileSync(`${OUT}/js-076.slope`, u8(st.slope));
    fs4.writeFileSync(`${OUT}/js-076.half`, u8(st.half));
    fs4.writeFileSync(`${OUT}/js-076.liq`, u8(st.liquid));
    fs4.writeFileSync(`${OUT}/js-076.lty`, u8(st.liquidType));
    fs4.writeFileSync(`${OUT}/js-076.fx`, u16(st.frameX));
    fs4.writeFileSync(`${OUT}/js-076.fy`, u16(st.frameY));
  }

  // ---- ② 重放:全程掷值流 + 结构事件 + attempt 追踪 ----
  const rv: string[] = [];
  const struct: string[] = [];
  const evs: string[] = [];
  const att: string[] = [];
  let roll = 0;
  const G = globalThis as unknown as Record<string, unknown>;
  const prevOnRoll = G.__swOnRoll;
  G.__swOnRoll = (v: number) => {
    roll++;
    rv.push(`${roll} ${v}`);
    if (inWin(roll)) struct.push(`R ${roll} ${v}`);
  };
  const prevFnt = G.__swFntProbeI39;
  G.__swFntProbeI39 = {
    emit: (l: string) => { if (inWin(roll)) struct.push(`${l} @${roll}`); },
    rc: () => roll,
  };
  const prevCap = G.__swPilesCap;
  G.__swPilesCap = (x: number, y: number, t: number, s2: number, z: number, k: number) => {
    evs.push(`${k === 1 ? 'SP' : 'PT'} r${roll} (${x},${y}) t${t} s${s2}${k === 1 ? ` z${z}` : ''}`);
  };
  const prevAtt = G.__swI148Att;
  G.__swI148Att = (x: number, y: number, bl: number, wl: number) => {
    att.push(`r${roll} att (${x},${y}) below=${bl} wall=${wl}`);
  };
  const prevVer = G.__swI159Ver;
  const ver: string[] = [];
  G.__swI159Ver = (seg: number, m: number, budget: number, x: number, y: number, t: number, s: number, ok: boolean, raw: number, flag: boolean, wall: number, below: number) => {
    ver.push(`s${seg} m${m} b${budget} r${roll} (${x},${y}) t${t} s${s} ok${ok ? 1 : 0} raw${raw} flag${flag ? 1 : 0} w${wall} bel${below}`);
  };
  const prevOT = G.__swI159OT;
  const ot: string[] = [];
  G.__swI159OT = (x: number, y: number) => {
    ot.push(`OT|${roll}|${x},${y}`);
  };
  const prevD59 = G.__swD59v;
  const d59l: string[] = [];
  G.__swD59v = (o: Record<string, unknown>) => {
    if (roll >= 12100 && roll <= 34200) d59l.push(JSON.stringify(o) + ` @${roll}`);
  };
  try {
    restoreGenSolid(lut);
    const stc = cloneStore(st);
    const rng = new RNG(0);
    rng.reseed(seed);
    runPilesPass(stc, rng, gs);
  } finally {
    G.__swOnRoll = prevOnRoll;
    G.__swFntProbeI39 = prevFnt;
    G.__swPilesCap = prevCap;
    G.__swI148Att = prevAtt;
    G.__swI159Ver = prevVer;
    G.__swI159OT = prevOT;
    G.__swD59v = prevD59;
  }
  console.log(`replay total rolls=${roll} events=${evs.length} attempts=${att.length} verdicts=${ver.length}`);
  writeFileSync(`${OUT}/js-rv-full.txt`, rv.join('\n'));
  writeFileSync(`${OUT}/js-struct.txt`, struct.join('\n'));
  writeFileSync(`${OUT}/js-events.txt`, evs.join('\n'));
  writeFileSync(`${OUT}/js-att.txt`, att.join('\n'));
  writeFileSync(`${OUT}/js-ver.txt`, ver.join('\n'));
  writeFileSync(`${OUT}/js-ot.txt`, ot.join('\n'));
  writeFileSync(`${OUT}/js-d59.txt`, d59l.join('\n'));

  // ---- ③a 事件流对齐:x86-piles-labeled(R n = 第 n+1 掷) ----
  const x86s: string[] = [];
  for (const l of readFileSync('/tmp/iii148-out/x86-piles-labeled.txt', 'utf8').split('\n')) {
    const m = l.match(/^(PT|SP)\|(\d+)\|([^|]*)\|R(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)$/);
    if (!m) continue;
    const kind = m[1]!, seq = m[2]!, r = Number(m[4])!, x = m[5]!, y = m[6]!, a = m[7]!, b = m[8]!;
    // x86 行:PT|seq|pass|R|x|y|type|style / SP|seq|pass|R|x|y|style|size
    x86s.push(kind === 'PT'
      ? `PT r${r} (${x},${y}) t${a} s${b}`
      : `SP r${r} (${x},${y}) t185 s${a} z${b}`);
  }
  const evtDiff: string[] = [];
  {
    const n = Math.min(x86s.length, evs.length);
    for (let k = 0; k < n; k++) {
      // x86 事件 R 与 JS 事件 r 同口径(调用时已完成的掷数,实测 PT(1689,779) 两侧均 33775)
      if (evs[k] !== x86s[k]) {
        evtDiff.push(`#${k} js=${evs[k]}  x86=${x86s[k]}`);
        if (evtDiff.length > 30) break;
      }
    }
    evtDiff.unshift(`x86 events=${x86s.length} js events=${evs.length}`);
  }
  writeFileSync(`${OUT}/evt-diff.txt`, evtDiff.join('\n'));
  console.log(`evt-diff lines=${evtDiff.length}`);
  for (const d of evtDiff.slice(0, 8)) console.log('  ', d);

  // ---- ③b 掷值流对齐:x86 RV 窗(行 n v = 第 n+1 掷) ----
  const x86rv = new Map<number, number>();
  for (const l of readFileSync('/tmp/iii148-out/x86-rv-window.txt', 'utf8').split('\n')) {
    const m = l.match(/^(\d+) (\d+)$/);
    if (m) x86rv.set(Number(m[1])! + 1, Number(m[2])!);   // 行 n → JS 第 n+1 掷
  }
  const jsrv = new Map<number, number>();
  for (const l of rv) { const sp = l.indexOf(' '); jsrv.set(Number(l.slice(0, sp)), Number(l.slice(sp + 1))); }
  const diffs: string[] = [];
  let cur: { from: number; to: number } | null = null;
  const intervals: string[] = [];
  let ndiff = 0;
  for (const [n, xv] of [...x86rv.entries()].sort((a, b) => a[0] - b[0])) {
    const jv = jsrv.get(n);
    if (jv !== undefined && jv !== xv) {
      ndiff++;
      if (diffs.length < 60) diffs.push(`roll#${n} js=${jv} x86=${xv}`);
      if (cur && cur.to >= n - 1) cur.to = n;
      else { if (cur) intervals.push(`${cur.from}..${cur.to}`); cur = { from: n, to: n }; }
    }
  }
  if (cur) intervals.push(`${cur.from}..${cur.to}`);
  const summary = [
    `compared=${x86rv.size} rolls, value diffs=${ndiff}`,
    `diff intervals=${intervals.length ? intervals.join(' ; ') : 'NONE(全窗逐掷恒等)'}`,
  ].join('\n');
  writeFileSync(`${OUT}/rv-diff.txt`, summary + '\n' + diffs.join('\n'));
  console.log(summary);
  for (const d of diffs.slice(0, 20)) console.log('  ', d);
}, 600_000);
