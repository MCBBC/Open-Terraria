// 一次性对拍(2026-08-16 livingtrees/oceancaves JS 审计):
// JS 按 oracle 同序直调各 run*Pass 至目标 pass,取全网格 4 平面
// (typ=vanilla sheet 映射,仅 active 格/act/wal/liq)与 /tmp/sw-num4/van_x86_g
// 的原版逐 pass dump(种子 9293480,4200×1200,evil 0=corruption)逐位比对。
// 差异统计:全量计数 + 100×100 分块热点 + 样本坐标。
// 用法:npx vitest run tools/_ltaudit.test.ts
//   LT_AUDIT_CP=oceancaves,livingtrees,livingtreewalls 裁剪检查点(默认全三)。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runResetAndTerrain, gravitatingSandPass, vanillaCleanup } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass, runBeachesPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass, runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runRocksAndClayPass, runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { runIceBiomePass, runSlushPass } from '../src/world/gen/vanilla/IceBiomePass';
import { runGrassPass } from '../src/world/gen/vanilla/GrassPass';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';
import { runMudCavesPass } from '../src/world/gen/vanilla/Spread';
import { runDesertMoundOnly, runDesertEntrancesAndHive } from '../src/world/gen/vanilla/DesertPass';
import { runMushroomPass } from '../src/world/gen/vanilla/MushroomPass';
import { runMarblePass, runGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { runFloatingIslandsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtToMudPass, runSiltPass } from '../src/world/gen/vanilla/DirtToMudPass';
import { runShiniesPass, runGemsPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runWebsPass } from '../src/world/gen/vanilla/WebsPass';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runOceanCavesPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runShimmerPass } from '../src/world/gen/vanilla/ShimmerPass';
import { runPyramidPass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtRockWallRunnerPass } from '../src/world/gen/vanilla/DirtRockWallRunnerPass';
import { runLivingTreesPass, runLivingTreeWallsPass } from '../src/world/gen/vanilla/LivingTreePass';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const V = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') V[i] = s; }

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const IDX: Record<string, string> = {
  gravitatingsand: '036_Gravitating_Sand',
  oceancaves: '037_Create_Ocean_Caves',
  dirtrockwallrunner: '041_Dirt_Rock_Wall_Runner',
  livingtrees: '042_Living_Trees',
  livingtreewalls: '043_Wood_Tree_Walls',
};
const WANT = (process.env.LT_AUDIT_CP || 'gravitatingsand,oceancaves,dirtrockwallrunner,livingtrees,livingtreewalls').split(',');

function rd(path: string, width: number, little = true): Uint16Array | Uint8Array {
  const buf = readFileSync(path);
  if (width === 1) return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
  return new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);
}

function compareCP(name: string, js: { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array }) {
  const base = `${VG}/${IDX[name]}`;
  const vT = rd(`${base}.typ`, 2) as Uint16Array;
  const vA = rd(`${base}.act`, 1) as Uint8Array;
  const vW = rd(`${base}.wal`, 2) as Uint16Array;
  const vL = rd(`${base}.liq`, 1) as Uint8Array;
  const n = W * H;
  let actD = 0, typD = 0, walD = 0, liqD = 0, ghostD = 0;
  const blocks = new Map<number, number>();
  const samples: string[] = [];
  const pairHist = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const ja = js.act[i], va = vA[i];
    if (ja !== va) {
      actD++;
      const b = (((i / W) | 0) / 100 | 0) * 100 + (((i % W) / 100) | 0);
      blocks.set(b, (blocks.get(b) ?? 0) + 1);
      if (samples.length < 12) samples.push(`act (${i % W},${(i / W) | 0}) js=${ja} van=${va} jsTyp=${js.typ[i]} vanTyp=${vT[i]}`);
      continue;
    }
    if (ja) {
      if (js.typ[i] !== vT[i]) {
        typD++;
        const k = `${js.typ[i]}>${vT[i]}`;
        pairHist.set(k, (pairHist.get(k) ?? 0) + 1);
        const b = (((i / W) | 0) / 100 | 0) * 100 + (((i % W) / 100) | 0);
        blocks.set(b, (blocks.get(b) ?? 0) + 1);
        if (samples.length < 12) samples.push(`typ (${i % W},${(i / W) | 0}) js=${js.typ[i]} van=${vT[i]}`);
      }
    } else if (js.typ[i] !== vT[i]) ghostD++; // inactive 双方:JS 清 0,原版留 ghost——仅计数
    if (js.wal[i] !== vW[i]) {
      walD++;
      const b = (((i / W) | 0) / 100 | 0) * 100 + (((i % W) / 100) | 0);
      blocks.set(b, (blocks.get(b) ?? 0) + 1);
      if (samples.length < 12) samples.push(`wal (${i % W},${(i / W) | 0}) js=${js.wal[i]} van=${vW[i]}`);
    }
    if (js.liq[i] !== vL[i]) {
      liqD++;
      const b = (((i / W) | 0) / 100 | 0) * 100 + (((i % W) / 100) | 0);
      blocks.set(b, (blocks.get(b) ?? 0) + 1);
      if (samples.length < 12) samples.push(`liq (${i % W},${(i / W) | 0}) js=${js.liq[i]} van=${vL[i]}`);
    }
  }
  console.log(`\n===== ${name} (${IDX[name]}) =====`);
  console.log(`act=${actD} typ(active)=${typD} wal=${walD} liq=${liqD} ghost(inactive typ, 仅供参考)=${ghostD}`);
  const top = [...blocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`热点块(y*100+x/100, 计数): ${top.map(([b, c]) => `y${(b / 100 | 0) * 100}x${b % 100 * 100}:${c}`).join(' ')}`);
  console.log(`type 对差 top: ${[...pairHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => `${k}×${c}`).join(' ')}`);
  for (const s of samples) console.log(`  ${s}`);
}

interface Planes { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array }
function loadVan(name: string): Planes {
  const base = `${VG}/${IDX[name]}`;
  return {
    typ: rd(`${base}.typ`, 2) as Uint16Array,
    act: rd(`${base}.act`, 1) as Uint8Array,
    wal: rd(`${base}.wal`, 2) as Uint16Array,
    liq: rd(`${base}.liq`, 1) as Uint8Array,
  };
}
/** 单 pass 写入隔离对账:pre 态匹配(4 平面全等)的格子上比较 pre→post 变化 */
function deltaCP(jsPre: Planes, jsPost: Planes, name: string) {
  const vPre = loadVan(PRE_OF[name]);
  const vPost = loadVan(name);
  const n = W * H;
  let matched = 0, vanChanged = 0, agree = 0, jsExtra = 0, disagree = 0;
  const disagreeBlocks = new Map<number, number>();
  const disagreeSamples: string[] = [];
  const missHist = new Map<string, number>();
  const extraHist = new Map<string, number>();
  const tKey = (t: number, a: number) => a ? `${t}` : `g${t}`;
  for (let i = 0; i < n; i++) {
    const preOK = jsPre.act[i] === vPre.act[i] && jsPre.wal[i] === vPre.wal[i]
      && jsPre.liq[i] === vPre.liq[i]
      && (!vPre.act[i] || jsPre.typ[i] === vPre.typ[i]);
    if (!preOK) continue;
    matched++;
    const vanCh = vPost.act[i] !== vPre.act[i] || vPost.wal[i] !== vPre.wal[i]
      || vPost.liq[i] !== vPre.liq[i] || (vPost.act[i] && vPost.typ[i] !== vPre.typ[i]);
    const jsCh = jsPost.act[i] !== jsPre.act[i] || jsPost.wal[i] !== jsPre.wal[i]
      || jsPost.liq[i] !== jsPre.liq[i] || (jsPost.act[i] && jsPost.typ[i] !== jsPre.typ[i]);
    if (vanCh) vanChanged++;
    if (vanCh && jsCh) {
      const postOK = jsPost.act[i] === vPost.act[i] && jsPost.wal[i] === vPost.wal[i]
        && jsPost.liq[i] === vPost.liq[i]
        && (!vPost.act[i] || jsPost.typ[i] === vPost.typ[i]);
      if (postOK) agree++; else {
        disagree++;
        const b = (((i / W) | 0) / 100 | 0) * 100 + (((i % W) / 100) | 0);
        disagreeBlocks.set(b, (disagreeBlocks.get(b) ?? 0) + 1);
        const k = `(${tKey(vPre.typ[i], vPre.act[i])}) van(${tKey(vPost.typ[i], vPost.act[i])},w${vPost.wal[i]}) vs js(${tKey(jsPost.typ[i], jsPost.act[i])},w${jsPost.wal[i]})`;
        missHist.set('D:' + k, (missHist.get('D:' + k) ?? 0) + 1);
        if (disagreeSamples.length < 14) disagreeSamples.push(`(${i % W},${(i / W) | 0}) pre(a${vPre.act[i]}/t${vPre.typ[i]}/w${vPre.wal[i]}/l${vPre.liq[i]}) van(a${vPost.act[i]}/t${vPost.typ[i]}/w${vPost.wal[i]}/l${vPost.liq[i]}) js(a${jsPost.act[i]}/t${jsPost.typ[i]}/w${jsPost.wal[i]}/l${jsPost.liq[i]})`);
      }
    } else if (!vanCh && jsCh) {
      jsExtra++;
      const b = (((i / W) | 0) / 100 | 0) * 100 + (((i % W) / 100) | 0);
      disagreeBlocks.set(b, (disagreeBlocks.get(b) ?? 0) + 1);
      const k = `(${tKey(vPre.typ[i], vPre.act[i])},w${vPre.wal[i]})→(${tKey(jsPost.typ[i], jsPost.act[i])},w${jsPost.wal[i]},l${jsPost.liq[i]})`;
      extraHist.set(k, (extraHist.get(k) ?? 0) + 1);
      if (disagreeSamples.length < 14) disagreeSamples.push(`[extra] (${i % W},${(i / W) | 0}) pre(a${vPre.act[i]}/t${vPre.typ[i]}/w${vPre.wal[i]}/l${vPre.liq[i]}) js(a${jsPost.act[i]}/t${jsPost.typ[i]}/w${jsPost.wal[i]}/l${jsPost.liq[i]})`);
    } else if (vanCh && !jsCh) {
      disagree++;
      const b = (((i / W) | 0) / 100 | 0) * 100 + (((i % W) / 100) | 0);
      disagreeBlocks.set(b, (disagreeBlocks.get(b) ?? 0) + 1);
      const k = `(${tKey(vPre.typ[i], vPre.act[i])},w${vPre.wal[i]})→(${tKey(vPost.typ[i], vPost.act[i])},w${vPost.wal[i]})`;
      missHist.set(k, (missHist.get(k) ?? 0) + 1);
      if (disagreeSamples.length < 14) disagreeSamples.push(`[miss] (${i % W},${(i / W) | 0}) pre(a${vPre.act[i]}/t${vPre.typ[i]}/w${vPre.wal[i]}/l${vPre.liq[i]}) van(a${vPost.act[i]}/t${vPost.typ[i]}/w${vPost.wal[i]}/l${vPost.liq[i]}) js(a${jsPost.act[i]}/t${jsPost.typ[i]}/w${jsPost.wal[i]}/l${jsPost.liq[i]})`);
    }
  }
  console.log(`\n===== Δ ${name}(pre=${PRE_OF[name]}) =====`);
  console.log(`pre态匹配格=${matched} 原版改动=${vanChanged} 双方改动且一致=${agree} 不一致=${disagree} JS多写=${jsExtra}`);
  const top = [...disagreeBlocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`分歧块: ${top.map(([b, c]) => `y${(b / 100 | 0) * 100}x${b % 100 * 100}:${c}`).join(' ')}`);
  for (const s of disagreeSamples) console.log(`  ${s}`);
  const mh = [...missHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
  if (mh.length) console.log(`不一致直方图: ${mh.map(([k, c]) => `${k}×${c}`).join(' ')}`);
  const eh = [...extraHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
  if (eh.length) console.log(`JS多写直方图: ${eh.map(([k, c]) => `${k}×${c}`).join(' ')}`);
}
const PRE_OF: Record<string, string> = {
  oceancaves: 'gravitatingsand',
  livingtrees: 'dirtrockwallrunner',
  livingtreewalls: 'livingtrees',
};

it('LT/OceanCave JS vs vanilla dump (9293480)', () => {
  const t0 = Date.now();
  const { world, rng, gs, seed } = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const st = world.store;
  const replay = () => rng.reseed(seed);
  const planesAt = new Map<string, { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array }>();
  const snap = (name: string) => {
    if (!WANT.includes(name)) return;
    const n = st.w * st.h;
    const typ = new Uint16Array(n), wal = new Uint16Array(n);
    const act = new Uint8Array(n), liq = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      typ[i] = st.flags[i] ? (V[st.type[i]] < 0 ? 0x7fff : V[st.type[i]]) : 0;
      act[i] = st.flags[i] ? 1 : 0;
      wal[i] = st.wall[i];
      liq[i] = st.liquid[i];
    }
    planesAt.set(name, { typ, act, wal, liq });
    if (process.env.LT_AUDIT_DUMP) {
      const { writeFileSync } = require('node:fs') as typeof import('node:fs');
      const dir = process.env.LT_AUDIT_DUMP;
      const tb = Buffer.alloc(n * 2), ab = Buffer.alloc(n), wb = Buffer.alloc(n * 2), lb = Buffer.alloc(n);
      for (let i = 0; i < n; i++) {
        tb.writeUInt16LE(typ[i], i * 2); ab[i] = act[i];
        wb.writeUInt16LE(wal[i], i * 2); lb[i] = liq[i];
      }
      writeFileSync(`${dir}/${name}.typ`, tb); writeFileSync(`${dir}/${name}.act`, ab);
      writeFileSync(`${dir}/${name}.wal`, wb); writeFileSync(`${dir}/${name}.liq`, lb);
      console.log(`dumped ${dir}/${name}.{typ,act,wal,liq}`);
    }
  };

  // ===== 链驱动(与 tests/caves-checkpoint.test.ts 同序;止于 livingtreewalls) =====
  replay(); runDunesPass(st, rng, gs);
  replay(); runOceanSandPass(st, rng, gs);
  replay(); runSandPatchesPass(st, rng, gs);
  replay(); runTunnelsPass(st, rng, gs);
  replay(); runMountCavesPass(st, rng, gs);
  replay(); runDirtWallBgPass(st, rng, gs);
  replay(); runRocksAndClayPass(st, rng, gs);
  replay(); runSmallHolesPass(st, rng, gs);
  replay(); runCavesPass(st, rng, gs);
  replay(); runIceBiomePass(st, rng, gs);
  replay(); runGrassPass(st, rng, gs);
  replay(); runJunglePass(st, rng, gs);
  replay(); runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  const desc = runDesertMoundOnly(st, rng, gs);
  runDesertEntrancesAndHive(st, rng, gs, desc, undefined);
  replay(); runMushroomPass(st, rng, gs);
  replay(); runMarblePass(st, rng, gs);
  replay(); runGranitePass(st, rng, gs);
  replay(); runFloatingIslandsPass(st, rng, gs);
  replay(); runDirtToMudPass(st, rng, gs);
  replay(); runSiltPass(st, rng, gs);
  replay(); runShiniesPass(st, rng, gs);
  replay(); runWebsPass(st, rng, gs);
  replay(); runUnderworldPass(st, rng, gs);
  replay(); runCorruptionPass(st, rng, gs);
  replay(); runLakesPass(st, rng, gs);
  replay(); runSlushPass(st, gs);
  replay(); runDungeonPass(st, rng, gs, world.chests, undefined);
  replay(); runMountainCavesPass(st, rng, gs);
  replay(); runBeachesPass(st, rng, gs);
  replay(); runGemsPass(st, rng, gs);
  replay(); gravitatingSandPass({ store: st } as never); snap('gravitatingsand');
  replay(); runOceanCavesPass(st, rng, gs); snap('oceancaves');
  replay(); runShimmerPass(st, rng, gs, undefined);
  replay(); vanillaCleanup({ store: st, rng } as never);
  replay(); runPyramidPass(st, rng, gs, world.chests);
  replay(); runDirtRockWallRunnerPass(st, rng, gs); snap('dirtrockwallrunner');
  replay(); runLivingTreesPass(st, rng, gs, world.chests); snap('livingtrees');
  replay(); runLivingTreeWallsPass(st, gs); snap('livingtreewalls');

  for (const name of WANT) compareCP(name, planesAt.get(name)!);
  // ===== Δ 对账:单 pass 写入隔离(继承分歧免疫) =====
  // 对 (pre,post) 检查点对:pre 态四平面全等的格子上,原版改动的格 JS 是否同样改;
  // 以及 JS 在这些格上是否多写(原版没动 JS 动了)。
  deltaCP(planesAt.get('gravitatingsand')!, planesAt.get('oceancaves')!, 'oceancaves');
  deltaCP(planesAt.get('dirtrockwallrunner')!, planesAt.get('livingtrees')!, 'livingtrees');
  deltaCP(planesAt.get('livingtrees')!, planesAt.get('livingtreewalls')!, 'livingtreewalls');
  console.log(`(链驱动+对拍耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}, 600000);

// ===== 原版输入重放(LT_VAN_REPLAY=1):把 041 原版 dump 装载进 JS TileStore,
// 跑 runLivingTreesPass(+Walls),与 042/043 原版 dump 全网格对拍——输入零分歧,
// 任何输出差 = JS 转写 bug 的精确定位。liquidType 不在 dump,沿用 JS 链自身
// 041 态的 liquidType(液类分歧只发生在已分歧格,树区液体为 0 不受影响)。 =====
const VAN_REPLAY = !!process.env.LT_VAN_REPLAY;
(VAN_REPLAY ? it : it.skip)('vanilla-input replay: runLivingTreesPass on 041 dump', () => {
  const t0 = Date.now();
  // 1) 驱动 JS 链到 041 拿 GenState/chests 上下文与 liquidType
  const { world, rng, gs, seed } = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const st = world.store;
  const replay = () => rng.reseed(seed);
  replay(); runDunesPass(st, rng, gs);
  replay(); runOceanSandPass(st, rng, gs);
  replay(); runSandPatchesPass(st, rng, gs);
  replay(); runTunnelsPass(st, rng, gs);
  replay(); runMountCavesPass(st, rng, gs);
  replay(); runDirtWallBgPass(st, rng, gs);
  replay(); runRocksAndClayPass(st, rng, gs);
  replay(); runSmallHolesPass(st, rng, gs);
  replay(); runCavesPass(st, rng, gs);
  replay(); runIceBiomePass(st, rng, gs);
  replay(); runGrassPass(st, rng, gs);
  replay(); runJunglePass(st, rng, gs);
  replay(); runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  const desc = runDesertMoundOnly(st, rng, gs);
  runDesertEntrancesAndHive(st, rng, gs, desc, undefined);
  replay(); runMushroomPass(st, rng, gs);
  replay(); runMarblePass(st, rng, gs);
  replay(); runGranitePass(st, rng, gs);
  replay(); runFloatingIslandsPass(st, rng, gs);
  replay(); runDirtToMudPass(st, rng, gs);
  replay(); runSiltPass(st, rng, gs);
  replay(); runShiniesPass(st, rng, gs);
  replay(); runWebsPass(st, rng, gs);
  replay(); runUnderworldPass(st, rng, gs);
  replay(); runCorruptionPass(st, rng, gs);
  replay(); runLakesPass(st, rng, gs);
  replay(); runSlushPass(st, gs);
  replay(); runDungeonPass(st, rng, gs, world.chests, undefined);
  replay(); runMountainCavesPass(st, rng, gs);
  replay(); runBeachesPass(st, rng, gs);
  replay(); runGemsPass(st, rng, gs);
  replay(); gravitatingSandPass({ store: st } as never);
  replay(); runOceanCavesPass(st, rng, gs);
  replay(); runShimmerPass(st, rng, gs, undefined);
  replay(); vanillaCleanup({ store: st, rng } as never);
  replay(); runPyramidPass(st, rng, gs, world.chests);
  replay(); runDirtRockWallRunnerPass(st, rng, gs);
  // 2) 覆写为原版 041 四平面
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); // 首个(规范化)内部 id
  }
  const vT = rd(`${VG}/041_Dirt_Rock_Wall_Runner.typ`, 2) as Uint16Array;
  const vA = rd(`${VG}/041_Dirt_Rock_Wall_Runner.act`, 1) as Uint8Array;
  const vW = rd(`${VG}/041_Dirt_Rock_Wall_Runner.wal`, 2) as Uint16Array;
  const vL = rd(`${VG}/041_Dirt_Rock_Wall_Runner.liq`, 1) as Uint8Array;
  const n = W * H;
  let unmapped = 0;
  for (let i = 0; i < n; i++) {
    const act = vA[i] !== 0;
    const sheet = vT[i];
    if (act) {
      const id = REV.get(sheet);
      if (id === undefined) { unmapped++; continue; }
      st.type[i] = id; st.flags[i] = 1;
    } else {
      st.type[i] = 0; st.flags[i] = 0;   // 内部 EMPTY ≡ 原版幽灵不可表达,dump 级等价
    }
    st.wall[i] = vW[i];
    st.liquid[i] = vL[i];
    st.half[i] = 0; st.slope[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  console.log(`replay: 041 覆写完成(unmapped active sheets=${unmapped})`);
  // 3) 跑 LivingTrees + Walls,对拍 042/043
  replay();
  runLivingTreesPass(st, rng, gs, world.chests);
  const outT = new Uint16Array(n), outW = new Uint16Array(n);
  const outA = new Uint8Array(n), outL = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    outT[i] = st.flags[i] ? (V[st.type[i]] < 0 ? 0x7fff : V[st.type[i]]) : 0;
    outA[i] = st.flags[i] ? 1 : 0;
    outW[i] = st.wall[i];
    outL[i] = st.liquid[i];
  }
  const cmpPlanes = (tag: string, jT: Uint16Array, jA: Uint8Array, jW: Uint16Array, jL: Uint8Array, base: string) => {
    const qT = rd(`${base}.typ`, 2) as Uint16Array;
    const qA = rd(`${base}.act`, 1) as Uint8Array;
    const qW = rd(`${base}.wal`, 2) as Uint16Array;
    const qL = rd(`${base}.liq`, 1) as Uint8Array;
    let dA = 0, dT = 0, dW = 0, dL = 0;
    const blocks = new Map<number, number>();
    const samples: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = i % W, y = (i / W) | 0;
      if (jA[i] !== qA[i]) { dA++; if (samples.length < 10) samples.push(`act(${x},${y}) js=${jA[i]} van=${qA[i]}`); }
      else if (jA[i] && jT[i] !== qT[i]) { dT++; if (samples.length < 10) samples.push(`typ(${x},${y}) js=${jT[i]} van=${qT[i]}`); }
      if (jW[i] !== qW[i]) { dW++; if (samples.length < 10) samples.push(`wal(${x},${y}) js=${jW[i]} van=${qW[i]}`); }
      if (jL[i] !== qL[i]) { dL++; if (samples.length < 10) samples.push(`liq(${x},${y}) js=${jL[i]} van=${qL[i]}`); }
      if (jA[i] !== qA[i] || (jA[i] && jT[i] !== qT[i]) || jW[i] !== qW[i] || jL[i] !== qL[i]) {
        const b = ((y / 100) | 0) * 100 + ((x / 100) | 0);
        blocks.set(b, (blocks.get(b) ?? 0) + 1);
      }
    }
    console.log(`REPLAY ${tag}: act=${dA} typ=${dT} wal=${dW} liq=${dL}`);
    console.log(`  blocks: ${[...blocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `y${(b / 100 | 0) * 100}x${b % 100 * 100}:${c}`).join(' ')}`);
    for (const s of samples) console.log(`  ${s}`);
  };
  cmpPlanes('livingtrees', outT, outA, outW, outL, `${VG}/042_Living_Trees`);
  runLivingTreeWallsPass(st, gs);
  for (let i = 0; i < n; i++) {
    outT[i] = st.flags[i] ? (V[st.type[i]] < 0 ? 0x7fff : V[st.type[i]]) : 0;
    outA[i] = st.flags[i] ? 1 : 0;
    outW[i] = st.wall[i];
    outL[i] = st.liquid[i];
  }
  cmpPlanes('livingtreewalls', outT, outA, outW, outL, `${VG}/043_Wood_Tree_Walls`);
  console.log(`(replay 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}, 600000);

// ===== 原版输入重放 II(LT_OC_REPLAY=1):种子 8888 的 OceanCaves(该种子掷中
// 1/3 生成门,036→037 原版实写 36862 格)——JS oceanCave 内部路径全量对拍。 =====
const OC_REPLAY = !!process.env.LT_OC_REPLAY;
(OC_REPLAY ? it : it.skip)('vanilla-input replay: runOceanCavesPass on 036 dump (seed 8888)', () => {
  const t0 = Date.now();
  const OC = '/tmp/sw-num4/van_s8888';
  const { world, rng, gs, seed } = runResetAndTerrain({ width: W, height: H, seedText: '8888', evil: 0 });
  const st = world.store;
  const replay = () => rng.reseed(seed);
  replay(); runDunesPass(st, rng, gs);
  replay(); runOceanSandPass(st, rng, gs);
  replay(); runSandPatchesPass(st, rng, gs);
  replay(); runTunnelsPass(st, rng, gs);
  replay(); runMountCavesPass(st, rng, gs);
  replay(); runDirtWallBgPass(st, rng, gs);
  replay(); runRocksAndClayPass(st, rng, gs);
  replay(); runSmallHolesPass(st, rng, gs);
  replay(); runCavesPass(st, rng, gs);
  replay(); runIceBiomePass(st, rng, gs);
  replay(); runGrassPass(st, rng, gs);
  replay(); runJunglePass(st, rng, gs);
  replay(); runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  const desc = runDesertMoundOnly(st, rng, gs);
  runDesertEntrancesAndHive(st, rng, gs, desc, undefined);
  replay(); runMushroomPass(st, rng, gs);
  replay(); runMarblePass(st, rng, gs);
  replay(); runGranitePass(st, rng, gs);
  replay(); runFloatingIslandsPass(st, rng, gs);
  replay(); runDirtToMudPass(st, rng, gs);
  replay(); runSiltPass(st, rng, gs);
  replay(); runShiniesPass(st, rng, gs);
  replay(); runWebsPass(st, rng, gs);
  replay(); runUnderworldPass(st, rng, gs);
  replay(); runCorruptionPass(st, rng, gs);
  replay(); runLakesPass(st, rng, gs);
  replay(); runSlushPass(st, gs);
  replay(); runDungeonPass(st, rng, gs, world.chests, undefined);
  replay(); runMountainCavesPass(st, rng, gs);
  replay(); runBeachesPass(st, rng, gs);
  replay(); runGemsPass(st, rng, gs);
  replay(); gravitatingSandPass({ store: st } as never);
  // 覆写为原版 036 四平面(oceanCave 只读液体量不读液类,liquidType 沿用 JS 态)
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const vT = rd(`${OC}/036_Gravitating_Sand.typ`, 2) as Uint16Array;
  const vA = rd(`${OC}/036_Gravitating_Sand.act`, 1) as Uint8Array;
  const vW = rd(`${OC}/036_Gravitating_Sand.wal`, 2) as Uint16Array;
  const vL = rd(`${OC}/036_Gravitating_Sand.liq`, 1) as Uint8Array;
  const n = W * H;
  let unmapped = 0;
  for (let i = 0; i < n; i++) {
    if (vA[i]) {
      const id = REV.get(vT[i]);
      if (id === undefined) { unmapped++; continue; }
      st.type[i] = id; st.flags[i] = 1;
    } else { st.type[i] = 0; st.flags[i] = 0; }
    st.wall[i] = vW[i];
    st.liquid[i] = vL[i];
    st.half[i] = 0; st.slope[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  console.log(`replay: 036 覆写完成(unmapped=${unmapped}) dungeonSide=${gs.dungeonSide}`);
  replay();
  runOceanCavesPass(st, rng, gs);
  const outT = new Uint16Array(n), outW2 = new Uint16Array(n);
  const outA = new Uint8Array(n), outL = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    outT[i] = st.flags[i] ? (V[st.type[i]] < 0 ? 0x7fff : V[st.type[i]]) : 0;
    outA[i] = st.flags[i] ? 1 : 0;
    outW2[i] = st.wall[i];
    outL[i] = st.liquid[i];
  }
  // 逐位对拍 037
  const qT = rd(`${OC}/037_Create_Ocean_Caves.typ`, 2) as Uint16Array;
  const qA = rd(`${OC}/037_Create_Ocean_Caves.act`, 1) as Uint8Array;
  const qW = rd(`${OC}/037_Create_Ocean_Caves.wal`, 2) as Uint16Array;
  const qL = rd(`${OC}/037_Create_Ocean_Caves.liq`, 1) as Uint8Array;
  let dA = 0, dT = 0, dW = 0, dL = 0;
  const blocks = new Map<number, number>();
  const samples: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % W, y = (i / W) | 0;
    if (outA[i] !== qA[i]) { dA++; if (samples.length < 10) samples.push(`act(${x},${y}) js=${outA[i]}/t${outT[i]} van=${qA[i]}/t${qT[i]}`); }
    else if (outA[i] && outT[i] !== qT[i]) { dT++; if (samples.length < 10) samples.push(`typ(${x},${y}) js=${outT[i]} van=${qT[i]}`); }
    if (outW2[i] !== qW[i]) { dW++; if (samples.length < 10) samples.push(`wal(${x},${y}) js=${outW2[i]} van=${qW[i]}`); }
    if (outL[i] !== qL[i]) { dL++; if (samples.length < 10) samples.push(`liq(${x},${y}) js=${outL[i]} van=${qL[i]}`); }
    if (outA[i] !== qA[i] || (outA[i] && outT[i] !== qT[i]) || outW2[i] !== qW[i] || outL[i] !== qL[i]) {
      const b = ((y / 100) | 0) * 100 + ((x / 100) | 0);
      blocks.set(b, (blocks.get(b) ?? 0) + 1);
    }
  }
  console.log(`REPLAY oceancaves(8888): act=${dA} typ=${dT} wal=${dW} liq=${dL}`);
  console.log(`  blocks: ${[...blocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `y${(b / 100 | 0) * 100}x${b % 100 * 100}:${c}`).join(' ')}`);
  for (const s of samples) console.log(`  ${s}`);
  console.log(`(oc replay 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}, 600000);
