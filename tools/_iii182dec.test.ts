// IIII182 · GERunner 菱形刷逐访决策迹取证仪(一次性)。挂 __swDec182 钩(IIII182 门控),
// 盒过滤 SW_DEC182_BOX=x0,x1,y0,y1,迹落 SW_DEC182_OUT。
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_DEC182 === '1';
const W = 4200, H = 1200;

(RUN ? it : it.skip)('IIII182 dec trace', async () => {
  const box = (process.env.SW_DEC182_BOX ?? '2020,2100,460,500').split(',').map(Number);
  const out = process.env.SW_DEC182_OUT ?? '/tmp/iii182-out/dec-trace.txt';
  const fd = openSync(out, 'w');
  let n = 0;
  const buf: string[] = [];
  // ★位点标记捕获:__swOnRoll 每掷自增;带 __swMark182 的掷记 (idx,mark,value)
  let rollIdx = 0;
  (globalThis as unknown as { __swOnRoll?: (v: number, inst?: object) => void }).__swOnRoll = (v) => {
    const mk = (globalThis as unknown as { __swMark182?: string }).__swMark182;
    if (mk !== undefined) buf.push(`S|${rollIdx}|${mk}|${v}`);
    rollIdx++;
    if (buf.length >= 8192) { writeSync(fd, buf.join('\n') + '\n'); n += buf.length; buf.length = 0; }
  };
  // ★IIII182 TI 镜像:__swFnt39('TI',x,y,sheet) → TI|x,y|sheet|rc(x86 FntLine 同构)
  (globalThis as unknown as { __swFntProbeI39?: { emit?: (l: string) => void; rc?: () => number } | null }).__swFntProbeI39 = {
    emit: (l: string) => { buf.push(`F|${l}`); if (buf.length >= 8192) { writeSync(fd, buf.join('\n') + '\n'); n += buf.length; buf.length = 0; } },
    rc: () => rollIdx,
  };
  (globalThis as unknown as {
    __swDec182?: (p: { g: number; it: number; m: number; n: number; vx: number; vy: number; j: number; lhs: number; r: number; acc: boolean; pre: number; good: boolean }) => void;
  }).__swDec182 = (p) => {
    if (p.m < box[0] || p.m > box[1] || p.n < box[2] || p.n > box[3]) return;
    buf.push(`D|${p.g}|${p.it}|${p.m}|${p.n}|${p.vx}|${p.vy}|${p.j}|${p.lhs}|${p.r}|${p.acc ? 1 : 0}|${p.pre}`);
    if (buf.length >= 8192) { writeSync(fd, buf.join('\n') + '\n'); n += buf.length; buf.length = 0; }
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: 'tooeasy|20260911', evil: 0,
      seedFlags: { startInHardmode: true },
    });
  } finally {
    if (buf.length) { writeSync(fd, buf.join('\n') + '\n'); n += buf.length; }
    (globalThis as unknown as { __swDec182?: unknown }).__swDec182 = undefined;
    (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = undefined;
    (globalThis as unknown as { __swFntProbeI39?: unknown }).__swFntProbeI39 = null;
    closeSync(fd);
  }
  console.log(`[iii182dec] trace lines=${n} rolls=${rollIdx} -> ${out}`);
}, 900_000);
