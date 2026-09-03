// W3 复核探针（一次性）：GERunner 裸读幽灵格时 js(内存 fresh) vs js2(存档读回) 是否一致。
// 前置=幽灵保域批（WorldGen finalize 净化删除 + serialize v5 tileActive 通道）。
// 心跳走 fs.appendFileSync('/tmp/w3probe-heartbeat.log')（vitest console 有缓冲,不便盯）。
import { it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';
import { RNG } from '../src/core/rng';
import { serializeSave } from '../src/save/serialize';
import { buildSaveParts, loadSaveData } from '../src/save/SaveFile';

const HB = '/tmp/w3probe-heartbeat.log';
const log = (s: string) => { appendFileSync(HB, `${new Date().toISOString().slice(11, 19)} ${s}\n`); console.log(s); };

type Snap = Record<string, Uint8Array | Uint16Array>;
function snap(st: { w: number; h: number; type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array }, tag: string): Snap {
  const n = st.w * st.h;
  const out: Snap = {
    act: new Uint8Array(n), typ: new Uint16Array(n), wal: new Uint16Array(n),
    liq: new Uint8Array(n), lty: new Uint8Array(n), half: new Uint8Array(n), slope: new Uint8Array(n),
  };
  let ghosts = 0, act = 0;
  for (let i = 0; i < n; i++) {
    out.act[i] = st.flags[i] & 1; out.typ[i] = st.type[i]; out.wal[i] = st.wall[i];
    out.liq[i] = st.liquid[i]; out.lty[i] = st.liquidType[i];
    out.half[i] = st.half[i]; out.slope[i] = st.slope[i];
    if (st.flags[i] & 1) act++; else if (st.type[i] !== 0) ghosts++;
  }
  log(`[${tag}] act=${act} ghost=${ghosts}`);
  return out;
}
function diff(a: Snap, b: Snap): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of Object.keys(a)) {
    let d = 0;
    for (let i = 0; i < a[k].length; i++) if (a[k][i] !== b[k][i]) d++;
    o[k] = d;
  }
  return o;
}

it('W3: fresh-HM ≡ save/load-HM（幽灵跨存档）', async () => {
  const W = 4200, H = 1200, SEED = '12345';
  const t0 = Date.now();
  let w1last = 0;
  const w1 = await generateWorld({ width: W, height: H, seedText: SEED, evil: 0 },
    (s, p) => { if (p - w1last > 0.25) { w1last = p; log(`genA ${(p * 100) | 0}% ${s}`); } });
  log(`genA done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const preA = snap(w1.store, 'js pre');
  initializeHardMode(w1, new RNG(w1.seed));
  const postA = snap(w1.store, 'js post');

  const t1 = Date.now();
  const w0 = await generateWorld({ width: W, height: H, seedText: SEED, evil: 0 });
  log(`genB done ${((Date.now() - t1) / 1000).toFixed(0)}s`);
  const parts = buildSaveParts(w0);
  const json = serializeSave(parts.view, parts.meta, parts.player, 0);
  log(`save bytes=${json.length} hasTileActive=${json.includes('"tileActive"')}`);
  const { world: w2 } = loadSaveData(JSON.parse(json));
  const preB = snap(w2.store, 'js2 loaded');
  const preD = diff(preA, preB);
  log(`pre diff fresh-vs-reloaded ${JSON.stringify(preD)}`);
  // ★W3 定谳①：幽灵保域批后，fresh 内存态与存档读回态逐位一致（v5 tileActive 承载）
  for (const k of Object.keys(preD)) expect(preD[k]).toBe(0);
  initializeHardMode(w2, new RNG(w2.seed));
  const postB = snap(w2.store, 'js2 post');
  const postD = diff(postA, postB);
  log(`post diff js vs js2 ${JSON.stringify(postD)}`);
  // ★W3 定谳②：HM 变换（GERunner 裸读幽灵格）跨进程位确定——NB-A2 act=10/typ=34061
  //  在幽灵保域（finalize 净化删除+save tileActive 通道）后归零
  for (const k of Object.keys(postD)) expect(postD[k]).toBe(0);
  expect(json.includes('"tileActive"')).toBe(true);
  expect(preD && postD && Object.keys(postA).length).toBeGreaterThan(0);
}, 900000);
