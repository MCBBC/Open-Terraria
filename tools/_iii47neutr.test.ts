// IIIII45 一次性诊断：x86 DRUNK 链插桩中立性 A/B（grid 级）。
// dump 链   = /tmp/iii47-out/x86-drunk       （JJHook 全通道开，pc.txt 记账）
// nodump 链 = /tmp/iii47-out/x86-drunk-nodump（SW_DUMP_ALL/SW_PASSCHAIN 未导出）
// 用法：cd game && SW_III47N=1 npx vitest run tools/_iii47neutr.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_III47N === '1';

function fnv(data: Uint8Array): number {
  let h = 2166136261;
  for (let k = 0; k < data.length; k++) {
    h ^= data[k]!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

interface Grid {
  typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
  pt: Uint8Array; pw: Uint8Array;
}

function loadGrid(p: string): { g: Grid; dims: string; ver: number } {
  const w = parseWld(new Uint8Array(readFileSync(p)));
  const t = w.tiles;
  const n = t.active.length;
  const g: Grid = {
    typ: t.type, act: t.active.map((v) => v), wal: t.wall,
    liq: t.liquid, hf: t.half, sl: t.slope,
    lt: new Uint8Array(n), ia: new Uint8Array(n), pt: t.paint, pw: t.paintWall,
  };
  // WldParser wire：bit5=已致动（域内档）；liquidType 原版 0 基→本仓 1 基——保持原版 0 基对齐 JJHook
  for (let i = 0; i < n; i++) {
    g.lt[i] = t.liquid[i]! > 0 ? Math.max(0, t.liquidType[i]! - 1) : 0;
    g.ia[i] = ((t.wire[i]! >>> 5) & 1) ? 1 : 0;
  }
  return { g, dims: `${w.tilesWide}x${w.tilesHigh}`, ver: w.version };
}

(RUN ? it : it.skip)('drunk x86 dump-vs-nodump grid A/B', () => {
  const A = loadGrid('/tmp/iii47-out/x86-drunk/w.wld');
  const B = loadGrid('/tmp/iii47-out/x86-drunk-nodump/w.wld');
  console.log(`dump-run : ${A.dims} v${A.ver}`);
  console.log(`nodump   : ${B.dims} v${B.ver}`);
  if (A.dims !== B.dims) throw new Error(`尺寸不一致 ${A.dims} vs ${B.dims}`);
  const N = A.g.act.length;
  const d: Record<string, number> = { act: 0, typ: 0, wal: 0, liq: 0, hf: 0, sl: 0, lt: 0, ia: 0, pt: 0, pw: 0 };
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = A.g.act[i]!, vb = B.g.act[i]!;
    if (va !== vb) { d.act++; if (samples.length < 6) samples.push(`act(${i % 4200},${(i / 4200) | 0}) ${va}<${vb}`); }
    const at = va ? A.g.typ[i]! : 0, bt = vb ? B.g.typ[i]! : 0;
    if (at !== bt) { d.typ++; if (samples.length < 6) samples.push(`typ(${i % 4200},${(i / 4200) | 0}) ${at}<${bt}`); }
    if (A.g.wal[i]! !== B.g.wal[i]!) { d.wal++; }
    if (A.g.liq[i]! !== B.g.liq[i]!) { d.liq++; }
    if (A.g.hf[i]! !== B.g.hf[i]!) { d.hf++; }
    if (A.g.sl[i]! !== B.g.sl[i]!) { d.sl++; }
    if (A.g.lt[i]! !== B.g.lt[i]!) { d.lt++; }
    if (A.g.ia[i]! !== B.g.ia[i]!) { d.ia++; }
    if (A.g.pt[i]! !== B.g.pt[i]!) { d.pt++; }
    if (A.g.pw[i]! !== B.g.pw[i]!) { d.pw++; }
  }
  console.log('diff counts:', JSON.stringify(d));
  if (samples.length) console.log('samples:', samples.join(' | '));
  console.log('dump-run hashes:', JSON.stringify({
    T: fnv(A.g.typ.slice().buffer && bytesOf(A.g.typ)),
    act: fnv(A.g.act),
  }));
  const totalBad = d.act + d.typ + d.wal + d.liq + d.hf + d.sl + d.lt + d.ia + d.pt + d.pw;
  console.log(totalBad === 0
    ? '★ 中立性门槛(grid 级): dump vs nodump 全 10 通道零差 ✓'
    : `✗ 中立性违背: 总差=${totalBad}`);
});

function bytesOf(u: Uint16Array): Uint8Array {
  return new Uint8Array(u.buffer, u.byteOffset, u.byteLength);
}
