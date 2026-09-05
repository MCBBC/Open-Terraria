// IIII190 一次性取证仪：残余 89 格「写面继承保真债」分族定谳。
// 口径 = _iii188final（generateWorld 返回态=finalize 后 vs x86 #105 dump,normFrame 归一），
// 差异点：①x86_framed_js0 格【全量落盘】（含 x/y/type/x86 帧/JS 帧/act）；
//   ②每格做 **x86 逐 pass 时间线**（106 槽 .typ/.act/.fx|.frx/.fy|.fry 按字节偏移定点读,
//     零全量载入）→ 帧在哪个 vanilla pass 落盘、前一刻该格是什么（继承源）一锤定音；
//   ③mismatch 域只计数（DungeonPass 家具门族=移交域,本批不裁）。
// 用法：
//   cd game && SW_I190_CHAIN=jagged SW_I190_TAG=jagged npx vitest run tools/_iii190census.test.ts
// 产物：/tmp/iii190-out/c190-<TAG>.json
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { frameClass } from './_iii163frame';

const HOME = process.env.HOME ?? '';
const CHAIN = process.env.SW_I190_CHAIN ?? 'jagged';
const TAG = process.env.SW_I190_TAG ?? CHAIN;
const OUT = process.env.SW_I190_OUT ?? '/tmp/iii190-out';

interface Cfg { seed: string; evil: -1 | 0 | 1; flags?: Record<string, boolean>; w?: number; h?: number; g2: string }
const C = (...p: string[]): string => `${HOME}/GoldenChains/${p.join('/')}`;
// 链表 = _iii188final §CHAINS 逐字（配方漂移=伪影源,禁手改）
const CHAINS: Record<string, Cfg> = {
  g: { seed: '9293480', evil: 0, g2: C('gen2-g') },
  s22222: { seed: '22222', evil: 1, g2: C('gen2-s22222') },
  m: { seed: '20260811', evil: 0, w: 6400, h: 1800, g2: C('gen2-m') },
  const: { seed: '1321365005', evil: -1, flags: { theConstant: true }, g2: C('golden-const-fr') },
  ntb: { seed: '1372357239', evil: -1, flags: { notTheBees: true }, g2: C('gen2-ntb') },
  notraps: { seed: '1896728457', evil: 1, flags: { noTraps: true }, g2: C('golden-notraps') },
  c12345: { seed: '12345', evil: 1, g2: C('gen2-12345') },
  skyblock: { seed: '20260829', evil: 1, flags: { skyblock: true }, g2: C('golden-skyblock') },
  drunk: { seed: '51620200', evil: -1, flags: { drunkWorld: true }, g2: C('golden-drunk-10ch') },
  celeb: { seed: '1999040562', evil: 0, flags: { tenthAnniversary: true }, g2: C('golden-celeb-fr') },
  toadstool: { seed: '771002', evil: 0, flags: { surfaceIsMushrooms: true }, g2: C('golden-toadstool') },
  fishmox: { seed: '771003', evil: 0, flags: { noInfection: true }, g2: C('golden-fishmox') },
  ftw: { seed: '1671560105', evil: 0, flags: { getGoodWorld: true }, g2: C('golden-ftw-fr') },
  pumpkin: { seed: 'pumpkinseason|20260904', evil: 0, flags: {}, g2: C('golden-pumpkin-fr') },
  jagged: { seed: '771005', evil: 0, flags: { digExtraHoles: true }, g2: C('golden-jagged-fr') },
  xrayvision: { seed: 'xrayvision|106107', evil: 0, g2: C('golden-xrayvision-fr') },
  monochrome: { seed: 'monochrome|106108', evil: 0, g2: C('golden-monochrome-fr') },
  waterpark: { seed: 'waterpark|20260905', evil: 0, flags: { extraLiquid: true }, g2: C('golden-waterpark-fr') },
  remix: { seed: '1138154190', evil: -1, flags: { remix: true }, g2: C('golden-remix-fr') },
  planetoids: { seed: 'planetoids|20260908', evil: 0, flags: { roundLandmasses: true }, g2: C('golden-planetoids-fr') },
  sgis: { seed: '771001', evil: 0, flags: { surfaceIsInSpace: true }, g2: C('golden-sgis-fr') },
  arachno: { seed: 'arachnophobia|20260904', evil: 0, g2: C('golden-arachno-fr') },
};

interface Cell { x: number; y: number; t: number; xfx: number; xfy: number; act: number; timeline: number[][] }
interface PassFile { fd: number; typ: number; act: number; fx: number; fy: number; name: string }

it('iii190 residual write-face census', async () => {
  const cfg = CHAINS[CHAIN];
  if (!cfg) throw new Error(`unknown chain ${CHAIN}`);
  // ── x86 #105 dump ──
  const files = readdirSync(cfg.g2);
  const pref = (files.find((f) => /^105_.+\.typ$/.test(f)) ?? '').replace(/\.typ$/, '');
  if (!pref) throw new Error(`no #105 dump in ${cfg.g2}`);
  const fxExt = files.some((f) => f === `${pref}.fx`) ? 'fx' : 'frx';
  const fyExt = files.some((f) => f === `${pref}.fy`) ? 'fy' : 'fry';
  const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1); };
  const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
  const xTyp = le16(`${cfg.g2}/${pref}.typ`);
  const xAct = u8(`${cfg.g2}/${pref}.act`);
  const xFx = le16(`${cfg.g2}/${pref}.${fxExt}`);
  const xFy = le16(`${cfg.g2}/${pref}.${fyExt}`);
  const W = cfg.w ?? 4200;

  // ── JS 全量生成（返回态=finalize 后）──
  const world = await generateWorld({
    width: W, height: cfg.h ?? 1200, seedText: cfg.seed, evil: cfg.evil,
    seedFlags: cfg.flags,
  });
  const st = world.store;
  const N = xTyp.length;

  // 差分收集：x86_framed_js0 全量 / mismatch 计数（移交域）
  const cells: Cell[] = [];
  const mismatchByType: Record<string, number> = {};
  let mismatch = 0, jsFramed = 0, jsNeg = 0;
  for (let i = 0; i < N; i++) {
    const cx = frameClass(xFx[i]!, st.frameX[i]!);
    const cy = frameClass(xFy[i]!, st.frameY[i]!);
    let c: string;
    if (cx === 'artifact' && cy === 'artifact') continue;
    else if (cx === 'x86_framed_js0' || cy === 'x86_framed_js0') c = 'x86_framed_js0';
    else if (cx === 'js_framed' || cy === 'js_framed') c = 'js_framed';
    else if (cx === 'js_neg' || cy === 'js_neg') c = 'js_neg';
    else c = 'mismatch';
    if (c === 'js_framed') jsFramed++;
    else if (c === 'js_neg') jsNeg++;
    else if (c === 'mismatch') {
      mismatch++;
      const ty = xTyp[i]!;
      mismatchByType[`t${ty}`] = (mismatchByType[`t${ty}`] ?? 0) + 1;
    } else {
      cells.push({
        x: i % W, y: (i / W) | 0, t: xTyp[i]!,
        xfx: xFx[i]!, xfy: xFy[i]!, act: xAct[i]!, timeline: [],
      });
    }
  }

  // ── x86 逐 pass 时间线（定点读,零全量载入）──
  const passes: PassFile[] = [];
  for (const f of files.filter((f) => /^\d{3}_.+\.typ$/.test(f)).sort()) {
    const p = f.replace(/\.typ$/, '');
    const pfx = files.some((q) => q === `${p}.fx`) ? 'fx' : 'frx';
    const pfy = files.some((q) => q === `${p}.fy`) ? 'fy' : 'fry';
    passes.push({
      name: p,
      fd: openSync(`${cfg.g2}/${p}.typ`, 'r'), typ: 0,
      act: openSync(`${cfg.g2}/${p}.act`, 'r'),
      fx: openSync(`${cfg.g2}/${p}.${pfx}`, 'r'),
      fy: openSync(`${cfg.g2}/${p}.${pfy}`, 'r'),
    });
  }
  const rd16 = (fd: number, i: number): number => {
    const b = Buffer.alloc(2);
    readSync(fd, b, 0, 2, i * 2);
    return b[0]! | (b[1]! << 8);
  };
  const rd8 = (fd: number, i: number): number => {
    const b = Buffer.alloc(1);
    readSync(fd, b, 0, 1, i);
    return b[0]!;
  };
  for (const cell of cells) {
    const i = cell.y * W + cell.x;
    for (const p of passes) {
      cell.timeline.push([rd8(p.act, i), rd16(p.fd, i), rd16(p.fx, i), rd16(p.fy, i)]);
    }
  }
  for (const p of passes) { closeSync(p.fd); closeSync(p.act); closeSync(p.fx); closeSync(p.fy); }

  const byType: Record<string, number> = {};
  for (const c of cells) byType[`t${c.t}`] = (byType[`t${c.t}`] ?? 0) + 1;
  const res = {
    chain: CHAIN, tag: TAG, dump: `${cfg.g2}/${pref}.${fxExt}`, W,
    passes: passes.map((p) => p.name),
    residual: cells.length, byType, cells,
    mismatch, mismatchByType, jsFramed, jsNeg,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/c190-${TAG}.json`, JSON.stringify(res));
  console.log(`[iii190 ${TAG}] residual(x86_framed_js0)=${cells.length} byType=${JSON.stringify(byType)} mismatch=${mismatch} jsFramed=${jsFramed} jsNeg=${jsNeg}`);
  for (const c of cells.slice(0, 8)) console.log(`  (${c.x},${c.y}) t${c.t} x86f(${c.xfx},${c.xfy}) act=${c.act}`);
}, 600_000);
