// IIII185 批：座2 SPIKES 收率债定位仪（一次性诊断,零主路径改动）。
// 思路：两侧骰值流逐行恒等、座2 SPIKES 窗起点对齐（mc=518,956）——状态在首个分歧
// attempt 前逐位同态。js 受收 132+2 backstop（ok=1 132）而 rig 窗多耗 105 掷。
// 本仪：①生成世界（_iii181p 同配方）取 LATE 槽末快照（=Dungeon pass 末）②对照
// golden-ddual2 033_Dungeon.typ 的尖刺格（sheet48/232）③把 js 132 个受收锚与
// 330 个走查拒因锚（ok=0）投到 golden 上——「js 拒 rig 收」的 attempt 锚处在
// golden 有刺 = 定位首个分歧 attempt 与判据族。
// 用法：cd game && SW_I185=1 npx vitest run tools/_iii185spk.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

const RUN = process.env.SW_I185 === '1';
const G2 = String(process.env.HOME) + '/GoldenChains/golden-ddual2';
const W = 4200, H = 1200, N = W * H;

(RUN ? it : it.skip)('i185 spike anchor projection', { timeout: 900_000 }, async () => {
  await generateWorld({
    width: W, height: H, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
    seedFlags: { dualDungeons: true },
  } as Parameters<typeof generateWorld>[0]);
  const snap = (globalThis as { __swI181Snap?: { type: Uint16Array; flags: Uint8Array } }).__swI181Snap;
  if (!snap) throw new Error('snap missing (SW_I181_SNAP=1 required)');
  const sheetOf = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') sheetOf[i] = s;
  }
  const SPIKE_INT = TILE_INTERNAL_BY_SHEET.get(48) ?? -1;
  const WSPIKE_INT = TILE_INTERNAL_BY_SHEET.get(232) ?? -1;
  console.log(`[i185] internal ids: spike48=${SPIKE_INT} wood232=${WSPIKE_INT}`);

  const gTyp = new Uint16Array(readFileSync(`${G2}/033_Dungeon.typ`).buffer, 0, N);
  const gAct = new Uint8Array(readFileSync(`${G2}/033_Dungeon.act`).buffer, 0, N);

  // seat 域界（由 SPK attempt x 值域定）：座0 SPIKES 窗 mc<518957, 座1 ≥
  const isSpikeSheet = (sh: number): boolean => sh === 48 || sh === 232;
  const jsSpikes: Array<{ x: number; y: number; sh: number }> = [];
  const gSpikes: Array<{ x: number; y: number; sh: number }> = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jt = sheetOf[snap.type[i]!] ?? -1;
    if ((jt === 48 || jt === 232) && (snap.flags[i]! & 1)) jsSpikes.push({ x, y, sh: jt });
    if (gAct[i] && (gTyp[i] === 48 || gTyp[i] === 232)) gSpikes.push({ x, y, sh: gTyp[i]! });
  }
  const SEAT_X = 2100;
  const j0 = jsSpikes.filter(s => s.x < SEAT_X), j1 = jsSpikes.filter(s => s.x >= SEAT_X);
  const g0 = gSpikes.filter(s => s.x < SEAT_X), g1 = gSpikes.filter(s => s.x >= SEAT_X);
  console.log(`[i185] js spikes: seat0=${j0.length} seat1=${j1.length} | golden 033: seat0=${g0.length} seat1=${g1.length}`);
  console.log(`[i185] seat1 x-range js=${Math.min(...j1.map(s => s.x), 0)}..${Math.max(...j1.map(s => s.x), 0)} golden=${Math.min(...g1.map(s => s.x), 0)}..${Math.max(...g1.map(s => s.x), 0)}`);

  // js attempt 锚投影：attempt json（analyze-spk.js 产物）
  let attempts: Array<{ mc: number; r: number; n3: number; x: number; y: number; w: number; g: number; a: number; walk?: { mc: number; hx: number; hy: number; d: number; ok: number } }> = [];
  try { attempts = JSON.parse(readFileSync('/tmp/iii185-out/spk-s2-attempts.json', 'utf8')).attempts; } catch { console.log('[i185] no attempts json'); }
  // 座0 attempts 直接从 dr-mc 提取
  const lines = readFileSync('/tmp/iii185-out/js-dr-mc.txt', 'utf8').split('\n');
  const kvOf = (ln: string): Record<string, string> => {
    const kv: Record<string, string> = {};
    for (const seg of ln.split('|')) { const i = seg.indexOf('='); if (i > 0) kv[seg.slice(0, i)] = seg.slice(i + 1); }
    return kv;
  };
  const s0a: typeof attempts = [];
  const s0w: Array<{ mc: number; hx: number; hy: number; d: number; ok: number }> = [];
  for (const ln of lines) {
    if (!ln.startsWith('DR|SPK')) continue;
    const kv = kvOf(ln);
    const mc = Number(kv.mc);
    if (mc >= 518957) continue; // 座0 窗（36351..42065）
    if (ln.startsWith('DR|SPKW')) s0w.push({ mc, hx: +kv.hx, hy: +kv.hy, d: +kv.d, ok: +kv.ok });
    else if (mc >= 36300) s0a.push({ mc, r: +kv.r, n3: +kv.n3, x: +kv.x, y: +kv.y, w: +kv.w, g: +kv.g, a: +kv.a });
  }
  s0w.sort((p, q) => p.mc - q.mc);
  let wi = 0;
  for (const at of s0a) {
    while (wi < s0w.length && s0w[wi].mc < at.mc) wi++;
    const nxt = s0a[s0a.indexOf(at) + 1];
    if (wi < s0w.length && (!nxt || nxt.mc > s0w[wi].mc)) { at.walk = s0w[wi]; wi++; }
  }
  console.log(`[i185] seat0 attempts=${s0a.length} walks=${s0w.filter(w => w.ok === 1).length}+${s0w.filter(w => w.ok === 0).length}fails`);

  const gSpikeSet = new Set(gSpikes.map(s => s.y * W + s.x));
  const jSpikeSet = new Set(jsSpikes.map(s => s.y * W + s.x));

  // ① js 受收锚（ok=1）在 golden 是否仍为刺
  const proj = (list: typeof attempts, seat: string): void => {
    const acc = list.filter(a => a.walk?.ok === 1);
    let inG = 0, miss = 0;
    const misses: string[] = [];
    for (const a of acc) {
      if (gSpikeSet.has(a.walk!.hy * W + a.walk!.hx)) inG++;
      else { miss++; if (misses.length < 12) misses.push(`mc=${a.mc}(${a.walk!.hx},${a.walk!.hy})d${a.walk!.d}`); }
    }
    console.log(`[i185] ${seat} js-accepted anchors in golden033-spike: ${inG}/${acc.length} miss=${miss} first-misses: ${misses.slice(0, 6).join(' ')}`);
    // ② js 走查拒（ok=0）锚在 golden 是否有刺（=rig 收/js 拒 候选）
    const rej = list.filter(a => a.walk && a.walk.ok === 0);
    let hit = 0; const hits: string[] = [];
    for (const a of rej) {
      if (gSpikeSet.has(a.walk!.hy * W + a.walk!.hx)) { hit++; if (hits.length < 16) hits.push(`mc=${a.mc}(${a.walk!.hx},${a.walk!.hy})d${a.walk!.d}w${a.w}`); }
    }
    console.log(`[i185] ${seat} js-walkFAIL anchors with golden spike: ${hit}/${rej.length} first: ${hits.slice(0, 10).join(' ')}`);
    // ③ js 门拒/活性拒的采样点在 golden 有刺（=rig 在门口就收的候选,弱信号）
    const grej = list.filter(a => !a.walk);
    let ghit = 0; const ghits: string[] = [];
    for (const a of grej) {
      if (gSpikeSet.has(a.y * W + a.x)) { ghit++; if (ghits.length < 10) ghits.push(`mc=${a.mc}(${a.x},${a.y})g${a.g}a${a.a}`); }
    }
    console.log(`[i185] ${seat} js-PREwalk reject sampled-in-golden-spike: ${ghit}/${grej.length} first: ${ghits.slice(0, 6).join(' ')}`);
  };
  proj(s0a, 'seat0');
  proj(attempts, 'seat1');

  // ④ golden-only 刺（js 没有的）前 20 个（按 y,x 排）——rig 独收写面
  const only = gSpikes.filter(s => !jSpikeSet.has(s.y * W + s.x) && s.x >= SEAT_X);
  console.log(`[i185] seat1 golden-only spikes=${only.length} first20: ${only.slice(0, 20).map(s => `${s.x},${s.y}t${s.sh}`).join(' ')}`);
  const onlyJs = jsSpikes.filter(s => !gSpikeSet.has(s.y * W + s.x) && s.x >= SEAT_X);
  console.log(`[i185] seat1 js-only spikes=${onlyJs.length} first20: ${onlyJs.slice(0, 20).map(s => `${s.x},${s.y}t${s.sh}`).join(' ')}`);
}, 900_000);
