// IIII108c（2026-09-04）winter B 格 Piles 流重放仪——决定性实验:
//  ①随全管线跑,@CORRHEAD(__swI87Cap call7=Piles 前最后钩)深拷贝 store+gs,reseed#91 抓种子;
//  ②用快照+同种子重放 runPilesPass——验证能逐条复现真实 Piles PT/SP 流;
//  ③把 ghost 账本残差(C+B 1,121 格)翻成 x86 幽灵值,重放对比——流是否对齐(B 归零判据)。
// 用法:cd game && SW_I148SIM=1 npx vitest run tools/_iii148sim.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_I148SIM === '1';
const SEED = '1.1.1.0.winteriscoming|20260914';
const OUT = process.env.SW_I148_OUT ?? '/tmp/iii148-out';
const W = 4200, H = 1200;
const LEDGER = process.env.SW_I148_LEDGER ?? '/tmp/iii148-out/ledger.txt';

const CH = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'coat'] as const;
function cloneStore(st: TileStore): TileStore {
  const c = new TileStore(st.w, st.h);
  for (const k of CH) (c as unknown as Record<string, Uint8Array | Uint16Array>)[k].set((st as unknown as Record<string, Uint8Array | Uint16Array>)[k]);
  return c;
}

(RUN ? it : it.skip)('III148SIM piles replay experiment', async () => {
  mkdirSync(OUT, { recursive: true });
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  const INTERNAL = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') { SHEET[i] = s; if (!INTERNAL.has(s)) INTERNAL.set(s, i); }
  }

  // ---- ① 全管线跑:Piles 头捕获(__swI148Grab,WorldGen.ts:1641 env 门钩) ----
  let grab: { st: TileStore; gs: GenState; lut: Map<number, boolean> } | null = null;
  let lastReseed = -1; let reseedCount = 0;
  const rp2 = RNG.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const origReseed2 = rp2.reseed;
  rp2.reseed = function (this: unknown, s: number) { reseedCount++; lastReseed = s; return (origReseed2 as (...a: unknown[]) => void).call(this, s); };
  (globalThis as { __swI148Grab?: unknown }).__swI148Grab = (rawSt: unknown, rawGs: unknown) => {
    if (grab) return;
    grab = { st: cloneStore(rawSt as TileStore), gs: { ...(rawGs as GenState) } as GenState, lut: snapshotGenSolid() };
  };
  await generateWorld({ width: W, height: H, seedText: SEED });
  rp2.reseed = origReseed2;
  (globalThis as { __swI148Grab?: unknown }).__swI148Grab = undefined;
  if (!grab) throw new Error('grab failed');
  const { st, gs } = grab;
  const capturedSeed: number = lastReseed;
  console.log(`reseed at Piles head: last=${lastReseed} gs.seed=${gs.seed} world?=${(gs as unknown as { worldSeed?: number }).worldSeed} count=${reseedCount}`);
  // 校验:call7 态 ≡ reseed91 态(js-prepiles)?
  // (js-prepiles.typ 是 reseed91 快照;若 call7 与之有差,先记差数)
  console.log(`grab ok: seed=${capturedSeed} surface=${gs.worldSurface} rock=${gs.rockLevel} beach=${gs.beachDistance} noTraps=${gs.seedFlags.noTraps}`);
  // 落盘现行码 pre-Piles 快照(账本复审用)
  {
    const fs4 = await import('node:fs');
    fs4.writeFileSync(`${OUT}/js-prepiles-postfix.typ`, Buffer.from(st.type.buffer, st.type.byteOffset, W * H * 2));
    fs4.writeFileSync(`${OUT}/js-prepiles-postfix.act`, Buffer.from(st.flags.buffer, st.flags.byteOffset, W * H));
  }

  // ---- ② 重放器 ----
  const attLog: string[] = [];
  const rollVals: string[] = [];
  const replay = (label: string, mutate?: (s: TileStore) => void): [string, number][] => {
    restoreGenSolid(grab!.lut);                     // 生成期 tileSolid 覆写表原样搬运
    const stc = cloneStore(st);
    mutate?.(stc);
    const evs: [string, number][] = [];
    let roll = 0;
    const prevOnRoll = (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
    (globalThis as { __swOnRoll?: unknown }).__swOnRoll = (v: number) => { roll++; if (roll >= 33770 && roll <= 33800) rollVals.push(`${roll}:${v}`); };
    const prevCap = (globalThis as { __swPilesCap?: unknown }).__swPilesCap;
    const prevAtt = (globalThis as { __swI148Att?: unknown }).__swI148Att;
    (globalThis as { __swI148Att?: unknown }).__swI148Att = (x: number, y: number, bl: number, wl: number) => {
      if (roll >= 33700 && roll <= 33830) attLog.push(`r${roll} att (${x},${y}) below=${bl} wall=${wl}`);
    };
    (globalThis as { __swPilesCap?: unknown }).__swPilesCap = (x: number, y: number, t: number, s2: number, z: number, k: number) => {
      evs.push([`${k === 1 ? 'SP' : 'PT'} ${roll} (${x},${y}) ${t} ${s2}${k === 1 ? ` ${z}` : ''}`, roll]);
    };
    try {
      const rng = new RNG(0);
      rng.reseed(capturedSeed!);
      runPilesPass(stc, rng, gs);
    } finally {
      (globalThis as { __swOnRoll?: unknown }).__swOnRoll = prevOnRoll;
      (globalThis as { __swPilesCap?: unknown }).__swPilesCap = prevCap;
      (globalThis as { __swI148Att?: unknown }).__swI148Att = prevAtt;
    }
    writeFileSync(`${OUT}/replay-${label}.txt`, evs.map((e) => e[0]).join('\n'));
    return evs;
  };

  // 载入真实流(js-stream-postfix.txt:R=global−104617430)与 x86 全窗流
  const real: string[] = [];
  for (const l of (await import('node:fs')).readFileSync(`${OUT}/js-stream-postfix.txt`, 'utf8').split('\n')) {
    const m = l.match(/^(PT|SP) r(\d+) \((\d+),(\d+)\) t(-?\d+) s(-?\d+)(?: z(\d+))?$/);
    if (!m) continue;
    const kind = m[1]!, r = Number(m[2]) - 104617430, x = m[3], y = m[4], t = m[5], s2 = m[6], z = m[7] ?? '';
    if (r < 0) continue;
    real.push(`${kind} ${r} (${x},${y}) ${t} ${s2}${z ? ` ${z}` : ''}`);
  }

  // ---- 基线重放(无翻转) ----
  const base = replay('base');
  // ---- ②b post-Piles 状态差(JS 重放 vs x86 077 dump)——定位 outcome 分歧格 ----
  {
    const G2 = `${process.env.HOME ?? ''}/GoldenChains/golden-winter/`;
    const fs2 = await import('node:fs');
    const x77t = new Uint16Array(fs2.readFileSync(`${G2}077_Piles.typ`).buffer, 0, W * H);
    const x77a = new Uint8Array(fs2.readFileSync(`${G2}077_Piles.act`).buffer, 0, W * H);
    const x77s = new Uint8Array(fs2.readFileSync(`${G2}077_Piles.slope`).buffer, 0, W * H);
    // base 重放已把 clone 写穿——重放一次拿终态
    const stc = cloneStore(st);
    restoreGenSolid(grab!.lut);
    const rng = new RNG(0);
    rng.reseed(capturedSeed);
    runPilesPass(stc, rng, gs);
    const diffs: string[] = [];
    for (let k = 0; k < W * H; k++) {
      const jt = stc.type[k]! === 0 ? 0 : (stc.type[k]! < SHEET.length ? SHEET[stc.type[k]!] : -2);
      const ja = stc.flags[k]!, js2 = stc.slope[k]!;
      if (jt !== x77t[k]! || ja !== x77a[k]! || js2 !== x77s[k]!) {
        diffs.push(`(${k % W},${(k / W) | 0}) x86=(${x77t[k]},${x77a[k]},${x77s[k]}) js=(${jt},${ja},${js2})`);
      }
    }
    fs2.writeFileSync(`${OUT}/postpiles-diff.txt`, diffs.join('\n'));
    console.log(`post-Piles state diffs=${diffs.length}`);
    for (const d of diffs.slice(0, 12)) console.log('  ', d);
  }
  let firstBad = -1;
  const n = Math.min(base.length, real.length);
  for (let k = 0; k < n; k++) {
    if (base[k]![0] !== real[k]) { firstBad = k; break; }
  }
  console.log(`base replay events=${base.length} real=${real.length} firstMismatch=${firstBad}`);
  if (firstBad >= 0) {
    for (let k = Math.max(0, firstBad - 2); k < Math.min(n, firstBad + 3); k++) {
      console.log(`  #${k} replay=${base[k]![0]}\n      real=${real[k]}`);
    }
  }

  // ---- ③ 账本翻转重放 ----
  const flips: { x: number; y: number; to: number }[] = [];
  for (const line of (await import('node:fs')).readFileSync(LEDGER, 'utf8').split('\n')) {
    const m = line.match(/\((\d+),(\d+)\) cls=(\w+) x86=(-?\d+) js=(\S+)/);
    if (!m) continue;
    const cls = m[3]!, vx = Number(m[4])!;
    if (cls === 'D') continue;                    // D=双空映射伪影,不翻
    const internal = vx === 0 ? 0 : (INTERNAL.get(vx) ?? -1);
    if (vx !== 0 && internal < 0) continue;
    flips.push({ x: Number(m[1]), y: Number(m[2]), to: internal });
  }
  console.log(`ledger flips(C+B)=${flips.length}`);
  const flipEvs = replay('flip', (s2) => {
    for (const f of flips) s2.type[s2.idx(f.x, f.y)] = f.to;
  });
  let firstBad2 = -1;
  for (let k = 0; k < Math.min(flipEvs.length, real.length); k++) {
    if (flipEvs[k]![0] !== real[k]) { firstBad2 = k; break; }
  }
  console.log(`flip replay events=${flipEvs.length} firstMismatch vs real=${firstBad2}`);
  // ---- ④ flip 重放 vs x86 全窗流（决定性:B 格归零判据）----
  const x86s: string[] = [];
  for (const l of (await import('node:fs')).readFileSync(`${OUT}/x86-piles-labeled.txt`, 'utf8').split('\n')) {
    const m = l.match(/^(PT|SP)\|\d+\|[^|]*\|R(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)$/);
    if (!m) continue;
    const kind = m[1]!, r = Number(m[2])!, x = m[3]!, y = m[4]!, a = m[5]!, b = m[6]!;
    x86s.push(`${kind} ${r} (${x},${y}) ${kind === 'SP' ? b : a} ${kind === 'SP' ? a : b}`.replace(/ (\d+) (\d+)$/, (_mm, p1, p2) => kind === 'SP' ? ` ${p2} ${p1}` : ` ${p1} ${p2}`));
  }
  const x86n = x86s.map((l) => {
    // 统一格式:PT r (x,y) type style / SP r (x,y) style size
    const m = l.match(/^(PT|SP) (\d+) \((\d+),(\d+)\) (\d+) (\d+)$/)!;
    return m[1] === 'SP' ? `SP ${m[2]} (${m[3]},${m[4]}) ${m[6]} ${m[5]}` : l;
  });
  let firstBad3 = -1;
  for (let k = 0; k < Math.min(flipEvs.length, x86n.length); k++) {
    if (flipEvs[k]![0] !== x86n[k]) { firstBad3 = k; break; }
  }
  console.log(`x86 events=${x86n.length} flip-vs-x86 firstMismatch=${firstBad3}`);
  if (firstBad3 >= 0) {
    for (let k = Math.max(0, firstBad3 - 2); k < Math.min(Math.min(flipEvs.length, x86n.length), firstBad3 + 5); k++) {
      console.log(`  #${k} flip=${flipEvs[k]![0]}\n      x86=${x86n[k]}`);
    }
  }
  writeFileSync(`${OUT}/att-trace.txt`, attLog.join('\n'));
  // ---- ⑤ 流位置解码:枚举 attempt 起点,匹配两侧事件坐标 ----
  {
    const fs3 = await import('node:fs');
    const dec: string[] = [];
    const targets: [string, number, number, number, number][] = [
      // 名称, 事件R, x, y, 段(y上限:seg1=899, seg2=1189)
      ['x86@33797', 33797, 2072, 1085, 1189],
      ['x86@33805', 33805, 2477, 1070, 1189],
      ['js @33814', 33814, 3053, 663, 899],
      ['js @33818', 33818, 3910, 797, 899],
      ['x86@33851', 33851, 1770, 1091, 1189],
      ['x86@33874', 33874, 1762, 1106, 1189],
    ];
    for (const [nm, evR, tx, ty, yMax] of targets) {
      for (let start = evR - 1; start >= evR - 30; start--) {
        const r2 = new RNG(0);
        r2.reseed(capturedSeed);
        let c2 = 0;
        const prev = (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
        (globalThis as { __swOnRoll?: unknown }).__swOnRoll = () => { c2++; };
        while (c2 < start) r2.next();
        const x = r2.int(25, W - 26);
        const y0 = r2.int(yMax === 1189 ? H - 300 : Math.floor(gs.worldSurface), yMax === 1189 ? H - 11 : 899);
        // dropTo 复刻(segment①② 同型:锚不活下探至脚下活格)
        let y = y0;
        while (!st.flags[st.idx(x, y + 1)] && y < H - 5) y++;
        (globalThis as { __swOnRoll?: unknown }).__swOnRoll = prev;
        if (x === tx && y === ty) { dec.push(`${nm}: attempt x,yRaw=${y0} draws start at stream pos ${start} (call@${evR})`); break; }
      }
    }
    fs3.writeFileSync(`${OUT}/decode.txt`, dec.join('\n'));
    console.log(dec.join('\n'));
  }
  writeFileSync(`${OUT}/rollvals.txt`, rollVals.join('\n'));
  writeFileSync(`${OUT}/sim-summary.txt`,
    `base: events=${base.length} real=${real.length} firstMismatch=${firstBad}\nflips=${flips.length}\nflip: events=${flipEvs.length} firstMismatch(real)=${firstBad2}\nx86 events=${x86n.length} flip-vs-x86 firstMismatch=${firstBad3}\n`);
}, 600_000);
