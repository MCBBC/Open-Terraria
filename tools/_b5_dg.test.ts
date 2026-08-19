// BBBBB 批一次性探针（2026-08-19）：两新链 #32 Dungeon 槽级猎杀。
// 手动链（chainCheckpoints 同构，尺寸参化）→ ▶Dungeon 前验 dump031 8通道全等
// → runDungeonPass 17 段 vs caves-oracle 新跑 JSON（/tmp/b5-ora-*.json）
// → dump032 8通道全差清单（/tmp/b5-dg-diff-{SEED}.json）+ __dgTowerTrace 入口谱系。
// 用法：cd game && SW_B5=1 SW_B5_SEED=22222 SW_B5_EVIL=1 npx vitest run tools/_b5_dg.test.ts
//       SW_B5=1 SW_B5_SEED=20260811 SW_B5_EVIL=0 SW_B5_W=6400 SW_B5_H=1800 \
//       SW_B5_G2=/tmp/sw-slp/g-m20260811 SW_B5_ORA=/tmp/b5-ora-m.json npx vitest run tools/_b5_dg.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDunesPass } from '../src/world/gen/vanilla/DunesPass';
import { runOceanSandPass } from '../src/world/gen/vanilla/BeachPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { runMountCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
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
import { runShiniesPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runWebsPass } from '../src/world/gen/vanilla/WebsPass';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { runHellFortPass } from '../src/world/gen/vanilla/HellFortPass';
import { runLakesPass } from '../src/world/gen/vanilla/LakesPass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { fnv1a } from '../tests/pass-hash.test';

const RUN = process.env.SW_B5 === '1';
const SEED = process.env.SW_B5_SEED ?? '22222';
const EVIL = Number(process.env.SW_B5_EVIL ?? 1) as 0 | 1;
const W = Number(process.env.SW_B5_W ?? 4200), H = Number(process.env.SW_B5_H ?? 1200), N = W * H;
const G2 = process.env.SW_B5_G2 ?? '/tmp/sw-slp/g-s22222';
const ORA = process.env.SW_B5_ORA ?? '/tmp/b5-ora-22222.json';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (i: number, e: string) => new Uint8Array(readFileSync(gPath(i, e)).buffer.slice(0));
const b16 = (i: number, e: string) => new Uint16Array(readFileSync(gPath(i, e)).buffer.slice(0));

const V_ID = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}
const hashGrids = (st: { type: Uint16Array; flags: Uint8Array; liquid: Uint8Array; wall: Uint16Array }) => {
  const mapped = new Uint16Array(N), ghost = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const v = V_ID[st.type[i]!];
    if (st.flags[i]) mapped[i] = v < 0 ? 0x7fff : v;
    else ghost[i] = v < 0 ? 0x7fff : v;
  }
  return `${fnv1a(mapped)} ${fnv1a(st.flags)} ${fnv1a(st.liquid)}`;
};
const hashWall = (st: { wall: Uint16Array }) => fnv1a(st.wall);

/** 8 通道全差清单（mile8 cmp 口径，收集全量差格） */
function diffAll(idx: number, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}): Record<string, unknown>[] {
  const t = b16(idx, 'typ'), a = b8(idx, 'act'), w = b16(idx, 'wal'), l = b8(idx, 'liq');
  const hf = b8(idx, 'half'), sl = b8(idx, 'slope'), lt = b8(idx, 'lty'), ia = b8(idx, 'inact');
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    const va = a[i]!, ja = st.flags[i]! & 1;
    const vt = va ? t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    const vl = l[i]! > 0 ? lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (va !== ja) out.push({ x, y, ch: 'A', v: va, j: ja, vt: t[i], jt: st.type[i] >= 0 ? SHEET[st.type[i]!] : -1 });
    else if (vt !== jt) out.push({ x, y, ch: 'T', v: vt, j: jt });
    if (w[i]! !== st.wall[i]!) out.push({ x, y, ch: 'W', v: w[i], j: st.wall[i] });
    if (l[i]! !== st.liquid[i]!) out.push({ x, y, ch: 'L', v: l[i], j: st.liquid[i] });
    if (hf[i]! !== st.half[i]!) out.push({ x, y, ch: 'H', v: hf[i], j: st.half[i] });
    if (sl[i]! !== st.slope[i]!) out.push({ x, y, ch: 'S', v: sl[i], j: st.slope[i] });
    if (vl !== jl) out.push({ x, y, ch: 'Y', v: vl, j: jl });
    if ((ia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) out.push({ x, y, ch: 'I', v: ia[i] ? 1 : 0, j: (st.wire[i]! >>> 5) & 1 });
  }
  return out;
}

(RUN ? it : it.skip)(`B5 chain→dungeon ${SEED} ${W}x${H}`, async () => {
  const t0 = Date.now();
  const { world, rng, gs, seed } = runResetAndTerrain({ width: W, height: H, seedText: SEED, evil: EVIL });
  const st = world.store;
  const replay = () => rng.reseed(seed);
  const snaps = new Map<string, string>();
  const snap = (name: string) => { snaps.set(name, `${hashGrids(st)} ${hashWall(st)}`); };
  const oraGold = new Map<string, string>();
  if (existsSync(ORA)) {
    const o = JSON.parse(readFileSync(ORA, 'utf8')) as { checkpoints: string[] };
    for (const line of o.checkpoints) {
      const f = line.split(/[| ]+/);
      oraGold.set(f[0]!, `${f[1]} ${f[2]} ${f[4]} ${f[3]}`);
    }
  }
  const chk = (name: string) => {
    snap(name);
    const g = oraGold.get(name);
    if (!g) return;
    // desert 前墙通道不具裁决力（Terrain 自加渲染墙）——只比 typ/act/liq
    const ours3 = snaps.get(name)!.split(' ').slice(0, 3).join(' ');
    const g3 = g.split(' ').slice(0, 3).join(' ');
    if (ours3 !== g3) console.log(`PRE ${name.padEnd(12)} ✗ js=${ours3} ora=${g3}`);
  };
  chk('terrain');
  replay(); runDunesPass(st, rng, gs); chk('dunes');
  replay(); runOceanSandPass(st, rng, gs); chk('oceansand');
  replay(); runSandPatchesPass(st, rng, gs); chk('sandpatches');
  replay(); runTunnelsPass(st, rng, gs); chk('tunnels');
  replay(); runMountCavesPass(st, rng, gs); chk('mountaincaves');
  replay(); runDirtWallBgPass(st, rng, gs); chk('dirtwallbg');
  replay(); runRocksAndClayPass(st, rng, gs); chk('rocksclay');
  replay(); runSmallHolesPass(st, rng, gs); chk('smallholes');
  replay(); runCavesPass(st, rng, gs); chk('surfacecaves');
  replay(); runIceBiomePass(st, rng, gs); chk('icebiome');
  replay(); runGrassPass(st, rng, gs); chk('grass');
  replay(); runJunglePass(st, rng, gs); chk('jungle');
  replay(); runMudCavesPass(st, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!); chk('mudcaves');
  const desc = runDesertMoundOnly(st, rng, gs); chk('desertmound');
  runDesertEntrancesAndHive(st, rng, gs, desc, () => { }); chk('desertdone');
  replay(); runMushroomPass(st, rng, gs); chk('mushroom');
  replay(); runMarblePass(st, rng, gs); chk('marble');
  replay(); runGranitePass(st, rng, gs); chk('granite');
  replay(); runFloatingIslandsPass(st, rng, gs); chk('islands');
  replay(); runDirtToMudPass(st, rng, gs); chk('dirttomud');
  replay(); runSiltPass(st, rng, gs); chk('silt');
  replay(); runShiniesPass(st, rng, gs); chk('ores');
  replay(); runWebsPass(st, rng, gs); chk('webs');
  replay(); runUnderworldPass(st, rng, gs);
  runHellFortPass(st, rng, gs); chk('underworld');
  replay(); runCorruptionPass(st, rng, gs); chk('corruption');
  replay(); runLakesPass(st, rng, gs); chk('lakes');
  replay(); runSlushPass(st, gs); chk('slush');
  // ▶Dungeon 前 8 通道 vs dump031（输入洁净度裁决）
  const pre = diffAll(31, st);
  console.log(`pre-dungeon vs dump031: ${pre.length} diffs${pre.length ? ' e.g. ' + JSON.stringify(pre.slice(0, 3)) : ''}`);
  // 地牢 pass + 17 段
  const TT: Record<string, number | string> = {};
  (globalThis as { __dgTowerTrace?: Record<string, number | string> }).__dgTowerTrace = TT;
  replay();
  runDungeonPass(st, rng, gs, world.chests, (name) => snap(name));
  (globalThis as { __dgTowerTrace?: Record<string, number | string> }).__dgTowerTrace = undefined;
  console.log(`__dgTowerTrace: ${JSON.stringify(TT)}`);
  // vs oracle checkpoints
  if (existsSync(ORA)) {
    const ora = JSON.parse(readFileSync(ORA, 'utf8')) as { checkpoints: string[] };
    const gold = new Map<string, string>();
    for (const line of ora.checkpoints) {
      const f = line.split(/[| ]+/);
      if (f[0]!.startsWith('dungeon')) gold.set(f[0]!, `${f[1]} ${f[2]} ${f[4]} ${f[3]}`);
    }
    let firstBad = '';
    for (const [name, g] of gold) {
      const ours = snaps.get(name);
      const ok = ours === g;
      if (!ok && !firstBad) firstBad = name;
      console.log(`${name.padEnd(10)} ${ok ? '✓' : '✗'} js=${ours} ora=${g}`);
    }
    console.log(`★ oracle 对拍首差: ${firstBad || '(全绿)'}`);
  }
  // vs dump032 全差清单
  const post = diffAll(32, st);
  writeFileSync(`/tmp/b5-dg-diff-${SEED}.json`, JSON.stringify(post));
  const byCh: Record<string, number> = {};
  for (const d of post) byCh[d.ch as string] = (byCh[d.ch as string] ?? 0) + 1;
  console.log(`post-dungeon vs dump032: ${post.length} diffs byCh=${JSON.stringify(byCh)} → /tmp/b5-dg-diff-${SEED}.json`);
  console.log(`first 12: ${JSON.stringify(post.slice(0, 12))}`);
  // 差格邻域双视图（van|js 类型图）——SW_B5_NB="x0,y0,x1,y1" 可指定；缺省取首簇±8
  const t32v = b16(32, 'typ'), a32v = b8(32, 'act');
  const nbs: Array<[number, number, number, number]> = [];
  const nbEnv = process.env.SW_B5_NB;
  if (nbEnv) { const [x0, y0, x1, y1] = nbEnv.split(',').map(Number); nbs.push([x0!, y0!, x1!, y1!]); }
  else if (post.length) {
    const xs = post.map((d) => d.x), ys = post.map((d) => d.y);
    const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 4, y1 = Math.max(...ys) + 4;
    if (x1 - x0 <= 200 && y1 - y0 <= 120) nbs.push([x0, y0, x1, y1]);
  }
  for (const [x0, y0, x1, y1] of nbs) {
    for (let y = y0; y <= y1; y++) {
      let rv = `v${y} |`, rj = `j${y} |`;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        rv += (a32v[i] ? String(t32v[i]).padStart(4) : '  . ') + ' ';
        const ja = st.flags[i]! & 1;
        const jt = st.type[i]! >= 0 && SHEET[st.type[i]!]! >= 0 ? SHEET[st.type[i]!]! : -1;
        rj += (ja ? String(jt).padStart(4) : '  . ') + ' ';
      }
      console.log(rv + '   |' + rj.slice(2));
    }
  }
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 1_800_000);
