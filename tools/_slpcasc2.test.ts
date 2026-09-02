// #53 雪崩预分析·续（SW_SLP2=1）：
// ① 雪崩点火格 (151,869/870) 的债值签名（归属上游族）+ x<600 typ/act 债格清单；
// ② R0 两格残差 (2428,664)/(2680,714) 定性：REV 映射伪差 or 真移植差
//    （同型重放：typ 一律取管线 id（通道相等格）→ 看两格是否消失）；
// ③ S(22,664)2 的 draw 序号 → loop1/loop2 归属。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { snapshotGenSolid, restoreGenSolid, genSolidType } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_SLP2 === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
if (RUN) for (const f of readdirSync(G2))   // ★套件门(2026-09-02):夹具目录缺省不扫 { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

interface Snap { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; wire: Uint8Array }
const snapStore = (st: TileStore): Snap => ({
  type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice(), liquid: st.liquid.slice(),
  liquidType: st.liquidType.slice(), half: st.half.slice(), slope: st.slope.slice(),
  frameX: st.frameX.slice(), frameY: st.frameY.slice(), wire: st.wire.slice(),
});

(RUN ? it : it.skip)('#53 avalanche follow-up', async () => {
  // ── 管线抓 @52 ──
  let js52: Snap | null = null, solid52: Map<number, boolean> | null = null;
  class Ab extends Error { constructor() { super('AB'); } }
  const g0 = globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void };
  try {
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 0,
      onWorldPartial: (w, i) => { if (i === 12) { js52 = snapStore(w.store); solid52 = snapshotGenSolid(); } else if (i === 13) throw new Ab(); },
    });
  } catch (e) { const c = (e as { cause?: unknown })?.cause; if (!(e instanceof Ab || c instanceof Ab)) throw e; } finally { g0.__swSWAct = undefined; }
  const j52 = js52 as Snap, solid = solid52 as Map<number, boolean>;
  const t52 = rd16(52, 'typ'), a52 = rd8(52, 'act'), l52 = rd8(52, 'liq'), lt52 = rd8(52, 'lty'), hf52 = rd8(52, 'half'), sl52 = rd8(52, 'slope');

  // ── ① typ/act 债格清单：x<600 + 点火格 3×3 ──
  console.log('== typ/act 债格(x<600) ==');
  let shown = 0;
  for (let i = 0; i < N && shown < 30; i++) {
    const x = i % W; if (x >= 600) continue;
    const va = a52[i] !== 0, ja = j52.flags[i] !== 0;
    const vt = va ? t52[i] : 0, jt = ja ? (SHEET[j52.type[i]] ?? -1) : 0;
    if (va === ja && vt === jt) continue;
    shown++;
    console.log(`  (${x},${(i / W) | 0}) act ${ja ? 1 : 0}>${va ? 1 : 0} typ ${jt}>${vt}`);
  }
  console.log('  (151,867..872) 3×3 环境: golden[typ@act] / JS[sheet@act half/slope]');
  for (let y = 866; y <= 872; y++) {
    let rg = '', js = '';
    for (let x = 150; x <= 152; x++) {
      const i = y * W + x;
      rg += `${a52[i] ? t52[i] : '·'} `;
      js += `${j52.flags[i] ? SHEET[j52.type[i]] : '·'}${j52.half[i] || ''}${j52.slope[i] || ''} `;
    }
    console.log(`  y${y}: g[${rg}] js[${js}]`);
  }
  // 点火格债的黄金侧引入 pass：golden 值在哪个 dump 段变化
  const cellIntro = (x: number, y: number) => {
    const i = y * W + x;
    let pv = a52[i] ? t52[i] : 0;
    const seq: string[] = [];
    for (let p = 32; p <= 52; p++) {
      const a = rd8(p, 'act'), t = rd16(p, 'typ');
      const v = a[i] ? t[i] : 0;
      if (v !== pv) { seq.push(`#${p}(${DUMPNAME.get(p)}):${pv}→${v}`); pv = v; }
    }
    return seq.join(' ') || '(031→052 golden 恒定)';
  };
  console.log(`  点火格 golden 侧引入史: (151,869)=${cellIntro(151, 869)} | (151,870)=${cellIntro(151, 870)}`);

  // ── ② R0 两格定性 ──
  const around = (x: number, y: number, label: string) => {
    console.log(`${label} 3×3:`);
    for (let yy = y - 1; yy <= y + 1; yy++) {
      let rg = '', js = '', rev = '';
      for (let xx = x - 1; xx <= x + 1; xx++) {
        const i = yy * W + xx;
        const gT = a52[i] ? t52[i] : 0;
        rg += `${gT || '·'}${hf52[i] ? 'h' : ''}${sl52[i] || ''} `;
        js += `${j52.flags[i] ? SHEET[j52.type[i]] : '·'}${j52.half[i] ? 'h' : ''}${j52.slope[i] || ''} `;
        const rid = a52[i] ? (REV.get(t52[i]) ?? -1) : 0;
        const d = TILE_DEFS[rid];
        rev += `${rid}${d ? (d.platform ? 'p' : '') + (d.framed ? 'f' : '') + (genSolidType(rid) ? 'S' : 'n') : '?'} `;
      }
      console.log(`  y${yy}: g[${rg}] js[${js}] REV[${rev}]`);
    }
  };
  around(2428, 664, 'R0 格 A (2428,664)');
  around(2680, 714, 'R0 格 B (2680,714)');
  console.log(`  A/B 点 JS 侧 id vs REV: A jsId=${j52.type[664 * W + 2428]} revId=${REV.get(t52[664 * W + 2428])} | B jsId=${j52.type[714 * W + 2680]} revId=${REV.get(t52[714 * W + 2680])}`);

  // 重放 B：typ 取管线 id（act/typ 相等格），其余 golden → R0 是否消失
  const build = (useJsType: boolean): TileStore => {
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      st.flags[i] = a52[i] ? 1 : 0;
      if (useJsType && a52[i] && j52.flags[i] && (SHEET[j52.type[i]] ?? -1) === t52[i]) st.type[i] = j52.type[i];
      else st.type[i] = a52[i] ? (REV.get(t52[i]) ?? 0) : 0;
      st.liquid[i] = l52[i]; st.liquidType[i] = l52[i] > 0 ? lt52[i] + 1 : 0;
      st.half[i] = hf52[i]; st.slope[i] = sl52[i];
      st.wall[i] = j52.wall[i]; st.frameX[i] = j52.frameX[i]; st.frameY[i] = j52.frameY[i]; st.wire[i] = j52.wire[i];
    }
    return st;
  };
  const runReplay = (label: string, useJsType: boolean) => {
    const st = build(useJsType);
    restoreGenSolid(solid);
    const rng = new RNG(SEED);
    const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
    const orig = ur.internalSample.bind(ur);
    const box = { n: 0 };
    ur.internalSample = () => { box.n++; return orig(); };
    const acts: string[] = [];
    (globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void }).__swSWAct = (fn, x, y, e) => {
      if (acts.length < 400_000) acts.push(`${box.n}:${fn}(${x},${y})${e || ''}`);
    };
    try { runSmoothWorldPass(st, rng, { seed: SEED } as GenState); } finally { (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined; }
    const hf53 = rd8(53, 'half'), sl53 = rd8(53, 'slope'), a53 = rd8(53, 'act'), t53 = rd16(53, 'typ');
    let dT = 0, dA = 0, dH = 0, dS = 0;
    const cells: string[] = [];
    for (let i = 0; i < N; i++) {
      const va = a53[i] !== 0, ja = st.flags[i] !== 0;
      const bad = va !== ja || (va && st.flags[i] && t53[i] !== (SHEET[st.type[i]] ?? -1)) || hf53[i] !== st.half[i] || sl53[i] !== st.slope[i];
      if (!bad) continue;
      if (va !== ja) dA++; else if (t53[i] !== (SHEET[st.type[i]] ?? -1)) dT++; else if (hf53[i] !== st.half[i]) dH++; else dS++;
      if (cells.length < 8) cells.push(`(${i % W},${(i / W) | 0}) a${ja ? 1 : 0}>${va ? 1 : 0} t${SHEET[st.type[i]] ?? -1}>${t53[i]} h${st.half[i]}>${hf53[i]} s${st.slope[i]}>${sl53[i]}`);
    }
    console.log(`[${label}] draws=${box.n} (diff=${box.n - 5097254}) dA=${dA} dT=${dT} dH=${dH} dS=${dS} ${cells.join(' ')}`);
    return { acts, dH, dS };
  };
  const rb = runReplay('clean·REV 型', false);
  const rj = runReplay('clean·管线 id 型（typ 相等格取管线 id）', true);

  // ── ③ S(22,664) draw 序号（loop1 总掷=5097254-4160*1160=271654）──
  const LOOP1 = 5_097_254 - 4160 * 1160;
  const hit = rj.acts.find((s) => s.includes('(22,664)'));
  console.log(`\nS(22,664) draw 序号: ${hit ?? '无'}（loop1 掷总数=${LOOP1} → ${hit && parseInt(hit) > LOOP1 ? 'loop2 写入' : 'loop1 写入'}）`);
  const idx22 = rj.acts.indexOf(hit ?? '');
  console.log(`  前后事件: ${rj.acts.slice(Math.max(0, idx22 - 4), idx22 + 4).join(' ')}`);
  void rb;
}, 580_000);
