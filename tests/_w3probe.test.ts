// W3 复核探针（一次性）：GERunner 裸读幽灵格时 js(内存 fresh) vs js2(存档读回) 是否一致。
// 前置=幽灵保域批（WorldGen finalize 净化删除 + serialize v5 tileActive 通道）。
// 心跳走 fs.appendFileSync('/tmp/w3probe-heartbeat.log')（vitest console 有缓冲,不便盯）。
// ★SW_W3PROBE=1 门控（2026-09-13）：困难模式世界生成×2+存档回环数十秒起,一次性取证仪
//   不设门会拖累全量套件（模式同 tests/_dgidump.test.ts 的 SW_DGI_DUMP）。
// ★diff≠0 定谳状态=未定/疑与「幽灵净化方案B·读档边界（2026-09-07,dae304d4,
//   src/save/SaveFile.ts purgeGhostTiles）」时序吻合：本探针（bc6ee391 09-03）前提=
//   幽灵保域批（serialize v5 tileActive 通道,81fb4f8f 09-03）的「fresh≡存档读回
//   逐位一致」,该前提被 09-07 方案B 推翻（幽灵=不可见不碰撞私有状态,读档边界净化;
//   写侧零就地写,SaveFile.ts:164）。心跳实证：diff 恰=typ 通道=fresh 内存幽灵数
//   （1637781,js2 读回 ghost=0）,act/wal/liq/lty/half/slope 全 0——act 通道零漂移=
//   v5 tileActive 通道本身工作正常。待专项按净化语义改写判据（fresh 内存幽灵残差属
//   预期）,不得为凑绿改生产。
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

it.skipIf(!process.env.SW_W3PROBE)('W3: fresh-HM ≡ save/load-HM（幽灵跨存档）', async () => {
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
