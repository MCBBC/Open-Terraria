// IIII204 帧域组 A 终刀一次性取证仪：克隆 tools/_iii190census.test.ts（CLXVII 口径），
// 差异点：
//   ①链表补 winter（G2=golden-winter-10ch≡rig w159,seed '1.1.1.0.winteriscoming|20260914',
//     evil 0,无 flags——worldIsFrozen 由配方段自带;CXLV/CLXIV 同配方）
//   ②四类全枚举：x86_framed_js0（residual）/js_framed/js_neg/mismatch 逐格落盘
//     （x,y,sheet,x86 帧,JS 帧,act + x86 106 槽逐 pass 时间线）——CLXVII 只落 residual,
//     本批组 A 跨 mismatch(t41 chTile reset 残帧)/x86_framed_js0(t33 style 帧)/
//     js_framed(地牢窗钟乳石带) 三类,须全量对账。
// 用法：
//   cd game && SW_I204C_CHAIN=winter SW_I204C_TAG=winter npx vitest run tools/_iii204census.test.ts
// 产物：/tmp/iii204-out/c204-<TAG>.json
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { frameClass } from './_iii163frame';

const RUN = process.env.SW_I204C === '1';

const HOME = process.env.HOME ?? '';
const CHAIN = process.env.SW_I204C_CHAIN ?? 'winter';
const TAG = process.env.SW_I204C_TAG ?? CHAIN;
const OUT = process.env.SW_I204C_OUT ?? '/tmp/iii204-out';

interface Cfg { seed: string; evil: -1 | 0 | 1; flags?: Record<string, boolean>; w?: number; h?: number; g2: string }
const C = (...p: string[]): string => `${HOME}/GoldenChains/${p.join('/')}`;
// 链表 = _iii190census §CHAINS 逐字（配方漂移=伪影源,禁手改）+ winter 追加项
const CHAINS: Record<string, Cfg> = {
  winter: { seed: '1.1.1.0.winteriscoming|20260914', evil: 0, g2: C('golden-winter-10ch') },
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

interface Cell { x: number; y: number; t: number; xfx: number; xfy: number; jfx: number; jfy: number; act: number; timeline: number[][] }
interface PassFile { fd: number; typ: number; act: number; fx: number; fy: number; name: string }

(RUN ? it : it.skip)('iii204 group-A frame census (four-class, name-anchored)', async () => {
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

  // 四类全枚举
  const cells: Record<string, Cell[]> = { x86_framed_js0: [], js_framed: [], js_neg: [], mismatch: [] };
  const byType: Record<string, Record<string, number>> = {};
  for (let i = 0; i < N; i++) {
    const cx = frameClass(xFx[i]!, st.frameX[i]!);
    const cy = frameClass(xFy[i]!, st.frameY[i]!);
    let c: string;
    if (cx === 'artifact' && cy === 'artifact') continue;
    else if (cx === 'x86_framed_js0' || cy === 'x86_framed_js0') c = 'x86_framed_js0';
    else if (cx === 'js_framed' || cy === 'js_framed') c = 'js_framed';
    else if (cx === 'js_neg' || cy === 'js_neg') c = 'js_neg';
    else c = 'mismatch';
    const x = i % W, y = (i / W) | 0;
    const ty = `t${xTyp[i]!}`;
    (byType[c] ??= {})[ty] = ((byType[c] ??= {})[ty] ?? 0) + 1;
    cells[c]!.push({ x, y, t: xTyp[i]!, xfx: xFx[i]!, xfy: xFy[i]!, jfx: st.frameX[i]!, jfy: st.frameY[i]!, act: xAct[i]!, timeline: [] });
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
  for (const cls of Object.keys(cells)) {
    for (const cell of cells[cls]!) {
      const i = cell.y * W + cell.x;
      for (const p of passes) {
        cell.timeline.push([rd8(p.act, i), rd16(p.fd, i), rd16(p.fx, i), rd16(p.fy, i)]);
      }
    }
  }
  for (const p of passes) { closeSync(p.fd); closeSync(p.act); closeSync(p.fx); closeSync(p.fy); }

  const res = {
    chain: CHAIN, tag: TAG, dump: `${cfg.g2}/${pref}.${fxExt}`, W,
    passes: passes.map((p) => p.name),
    counts: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.length])),
    byType,
    cells,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/c204-${TAG}.json`, JSON.stringify(res));
  console.log(`[iii204 ${TAG}] counts=${JSON.stringify(res.counts)} byType=${JSON.stringify(byType)}`);
  for (const cls of Object.keys(cells)) {
    for (const c of cells[cls]!.slice(0, 6)) console.log(`  ${cls} (${c.x},${c.y}) t${c.t} x86f(${c.xfx},${c.xfy}) jsf(${c.jfx},${c.jfy}) act=${c.act}`);
  }
}, 600_000);
