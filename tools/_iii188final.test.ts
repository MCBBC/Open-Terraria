// IIII188 终态帧对账仪:generateWorld **返回态(=finalize 后)** 帧面 vs x86 #105 dump 全域对拍。
// ★为什么不用 _iii163fx 五点:其槽末锚=onWorldPartial(pass 完成),finalize 在全部 pass 之后
//   执行 ⇒ 槽 105 快照=净化前态,对帧净化改判刀不敏感(实测 g/notraps/drunk 刀前后逐值全等)。
// 本仪对拍口径=normFrame 双侧 0xFFFF→0 归一(tools/_iii163frame 同源),全域(活+幽灵分层):
//   x86_framed_js0 / js_framed / mismatch / artifact(双侧哨兵) 四类,另列 192/53/75/384/396/638
//   继承帧族专项(改判刀的正 当目标域)。
// 用法:
//   cd game && SW_I188F_CHAIN=drunk npx vitest run tools/_iii188final.test.ts
//   SW_I188F_TAG=drunk-after 附加产物后缀;产物 /tmp/iii188-out/final-<TAG>.json
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I188F_CHAIN=1 npx vitest run tools/_iii188final.test.ts
const RUN = process.env.SW_I188F_CHAIN === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { frameClass } from './_iii163frame';

const HOME = process.env.HOME ?? '';
const CHAIN = process.env.SW_I188F_CHAIN ?? 'drunk';
const TAG = process.env.SW_I188F_TAG ?? CHAIN;
const OUT = process.env.SW_I188_OUT ?? '/tmp/iii188-out';

interface Cfg { seed: string; evil: -1 | 0 | 1; flags?: Record<string, boolean>; w?: number; h?: number; g2: string }
const C = (...p: string[]): string => `${HOME}/GoldenChains/${p.join('/')}`;
// 链表=_iii100spot §CHAINS 同配方(桶=帧桶变体);'||'分隔防 seed 内 '|' 撞 IFS
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

const FAMILY = new Set([192, 53, 75, 384, 396, 638]);

it('iii188 final frame audit', async () => {
  const cfg = CHAINS[CHAIN];
  if (!cfg) throw new Error(`unknown chain ${CHAIN}`);
  // x86 #105 dump
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

  // JS 全量生成(返回态=finalize 后)
  const world = await generateWorld({
    width: cfg.w ?? 4200, height: cfg.h ?? 1200, seedText: cfg.seed, evil: cfg.evil,
    seedFlags: cfg.flags,
  });
  const st = world.store;
  const N = xTyp.length;
  const cls: Record<string, number> = { x86_framed_js0: 0, js_framed: 0, mismatch: 0, js_neg: 0, artifact: 0 };
  const fam: Record<string, number> = {};
  const famAct: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let first = '';
  for (let i = 0; i < N; i++) {
    const cx = frameClass(xFx[i]!, st.frameX[i]!);
    const cy = frameClass(xFy[i]!, st.frameY[i]!);
    let c: string;
    if (cx === 'artifact' && cy === 'artifact') c = 'artifact';
    else if (cx === 'x86_framed_js0' || cy === 'x86_framed_js0') c = 'x86_framed_js0';
    else if (cx === 'js_framed' || cy === 'js_framed') c = 'js_framed';
    else if (cx === 'js_neg' || cy === 'js_neg') c = 'js_neg';
    else c = 'mismatch';
    cls[c] = (cls[c] ?? 0) + 1;
    const ty = xTyp[i]!;
    if (c !== 'artifact' && FAMILY.has(ty)) {
      fam[c] = (fam[c] ?? 0) + 1;
      if (xAct[i] === 1) famAct[c] = (famAct[c] ?? 0) + 1;
      byType[`t${ty}:${c}`] = (byType[`t${ty}:${c}`] ?? 0) + 1;
    }
    if (!first && c !== 'artifact') first = `(${i % (cfg.w ?? 4200)},${(i / (cfg.w ?? 4200)) | 0}) t${ty} x86f(${xFx[i]},${xFy[i]}) jsf(${st.frameX[i]},${st.frameY[i]}) act=${xAct[i]} cls=${c}`;
  }
  const res = { chain: CHAIN, tag: TAG, dump: `${cfg.g2}/${pref}.${fxExt}`, cls, fam, famAct, byType, first };
  writeFileSync(`${OUT}/final-${TAG}.json`, JSON.stringify(res, null, 1));
  console.log(`[iii188f ${TAG}] cls=${JSON.stringify(cls)}`);
  console.log(`  fam=${JSON.stringify(fam)} famAct=${JSON.stringify(famAct)}`);
  console.log(`  byType=${JSON.stringify(byType)}`);
  console.log(`  first=${first}`);
}, 600_000);
