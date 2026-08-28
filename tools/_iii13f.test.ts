// 一次性诊断（III13 批）：Traps 槽【双跑差分重放】——基座=/tmp/iii10-out/jslot31
// （IIII10 清净世代、全 10 通道），reseed(gs.seed) 后各跑一次 Traps：
//   A=legacy（SW_I13_LEGACY 语义＝IIII10 终态）  B=new（本批全部修复）
// 输出：A 自洽性（A 输出 ≡ 基座？非——IIII10 引擎产基座，A 复现应全等）
// 与 B-A 净效应（按 kind 计数 + 残差坐标命中表）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { runTrapsPass, __i13SetLegacy } from '../src/world/gen/vanilla/TrapsPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200, N = W * H;
function le16(p: string) { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1); }
function u8(p: string) { return new Uint8Array(readFileSync(p)); }

function buildBase(): TileStore {
  const J = '/tmp/iii10-out/jslot31';
  const st = new TileStore(W, H);
  const typ = le16(`${J}/type`), wal = le16(`${J}/wall`), liq = u8(`${J}/liquid`);
  const lty = u8(`${J}/liquidType`), hf = u8(`${J}/half`), sl = u8(`${J}/slope`);
  const fl = u8(`${J}/flags`), wr = u8(`${J}/wire`), fx = le16(`${J}/frameX`), fy = le16(`${J}/frameY`);
  for (let i = 0; i < N; i++) {
    st.flags[i] = fl[i]! ? 1 : 0;
    st.type[i] = typ[i]!;
    st.wall[i] = wal[i]!;
    st.liquid[i] = liq[i]!;
    st.liquidType[i] = lty[i]!;
    st.half[i] = hf[i]!;
    st.slope[i] = sl[i]!;
    st.wire[i] = wr[i]!;
    st.frameX[i] = fx[i]!;
    st.frameY[i] = fy[i]!;
  }
  return st;
}

function snapshot(st: TileStore): Record<string, Uint8Array | Uint16Array> {
  const cp = (a: Uint8Array | Uint16Array) => a.slice();
  return {
    flags: cp(st.flags as unknown as Uint8Array), type: cp(st.type as unknown as Uint16Array),
    wall: cp(st.wall as unknown as Uint16Array), liquid: cp(st.liquid as unknown as Uint8Array),
    half: cp(st.half as unknown as Uint8Array), slope: cp(st.slope as unknown as Uint8Array),
    frameX: cp(st.frameX as unknown as Uint16Array),
  };
}
function diffS(a: ReturnType<typeof snapshot>, b: ReturnType<typeof snapshot>) {
  let dT = 0, dA = 0, dW = 0, dHf = 0, dFx = 0;
  const firsts: string[] = [];
  for (let i = 0; i < N; i++) {
    if (a.flags[i] !== b.flags[i]) { dA++; if (firsts.length < 6) firsts.push(`A(${i % W},${Math.floor(i / W)})`); }
    if (a.type[i] !== b.type[i]) { dT++; if (firsts.length < 6) firsts.push(`T(${i % W},${Math.floor(i / W)} ${a.type[i]}→${b.type[i]})`); }
    if (a.wall[i] !== b.wall[i]) dW++;
    if (a.half[i] !== b.half[i]) { dHf++; if (firsts.length < 6) firsts.push(`H(${i % W},${Math.floor(i / W)} ${a.half[i]}→${b.half[i]})`); }
    if (a.frameX[i] !== b.frameX[i]) dFx++;
  }
  return { dT, dA, dW, dHf, dFx, firsts };
}

it('iii13f traps differential replay', () => {
  if (process.env.SW_I13F !== '1') return;
  const meta = JSON.parse(readFileSync('/tmp/iii13-out/jslot31-fixed/meta.json', 'utf8'));
  const gsIso: GenState = {
    seed: 1896728457,
    worldSurface: meta.worldSurface, rockLevel: meta.rockLevel, lavaLine: meta.lavaLine,
    beachDistance: meta.beachDistance, dungeonSide: meta.dungeonSide,
    shimmerX: -1, shimmerY: -1,
    seedFlags: meta.seedFlags,
  } as unknown as GenState;
  // RUN A：legacy
  const stA = buildBase(); const baseSnap = snapshot(stA);
  __i13SetLegacy(true);
  runTrapsPass(stA, new RNG(1896728457) as never, gsIso, []);
  const snapA = snapshot(stA);
  // 自洽锚：legacy 输出应 ≡ IIII10 终态输出；基座是它自己的输出 ⇒ diff(base,snapA) 应≈恒等
  const selfchk = diffS(baseSnap, snapA);
  console.log(`SELF-CHK(legacy≈base): T=${selfchk.dT} A=${selfchk.dA} W=${selfchk.dW} Hf=${selfchk.dHf} Fx=${selfchk.dFx} ${selfchk.firsts.join(' ')}`);
  // RUN B：new
  const stB = buildBase();
  __i13SetLegacy(false);
  runTrapsPass(stB, new RNG(1896728457) as never, gsIso, []);
  const snapB = snapshot(stB);
  const delta = diffS(snapA, snapB);
  console.log(`NET-EFFECT(new vs legacy): T=${delta.dT} A=${delta.dA} W=${delta.dW} Hf=${delta.dHf} Fx=${delta.dFx} ${delta.firsts.join(' ')}`);
}, 600_000);
