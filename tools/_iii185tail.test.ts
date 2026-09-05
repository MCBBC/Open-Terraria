// IIII185 批：座2 SPIKES 尾部解码仪（一次性诊断,零主路径改动）。
// 假设：rig 配额 num7=68 vs js 67（scalar=rooms/20：rig rooms.Count=130 vs js 129）。
// 预言：rig 窗尾（js 窗末 mc=524,886 之后）恰再烧 ~100 掷纯拒 attempt + 1 个受收
// attempt（5 掷,x,y,d,n11,n11），其走查锚与带形=golden-only 簇 (2672..2674,556..565)。
// 本仪：①__dgSegWatch 钩取 'dungeonS'（SPIKES 槽末）全态 ②用 js attempt (x,y)↔骰值
// 回归解出 x/y 域 (L,W,Y0,H) 并逐 attempt 精确验证 ③按 js 谓词在快照态上重放 rig 尾掷。
// 用法：cd game && SW_I185T=1 npx vitest run tools/_iii185tail.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I185T === '1';
const W = 4200, H = 1200, N2 = W * H;
const SC = 4.656612875245797e-10;
const WIN_LO = 518957, WIN_HI = 524886, RIG_HI = 524991;

(RUN ? it : it.skip)('i185 rig tail decode', { timeout: 900_000 }, async () => {
  let snapS: { type: Uint16Array; flags: Uint8Array; wall: Uint8Array } | null = null;
  (globalThis as { __dgSegWatch?: (name: string, s: unknown) => void }).__dgSegWatch = (name, s2) => {
    if (name === 'dungeonS') {
      const st = s2 as { type: Uint16Array; flags: Uint8Array; wall: Uint8Array };
      snapS = { type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice() };
    }
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete (globalThis as { __dgSegWatch?: unknown }).__dgSegWatch;
  }
  if (!snapS) throw new Error('dungeonS snapshot missing');
  const S = snapS;
  { // IIII185: dump snapshot for python side simulation
    const fs2 = await import('node:fs');
    fs2.writeFileSync('/tmp/iii185-out/snapS.typ', Buffer.from(S.type.buffer, S.type.byteOffset, N2 * 2));
    fs2.writeFileSync('/tmp/iii185-out/snapS.flg', Buffer.from(S.flags.buffer, S.flags.byteOffset, N2));
    fs2.writeFileSync('/tmp/iii185-out/snapS.wal', Buffer.from(S.wall.buffer, S.wall.byteOffset, N2));
    console.log('[i185t] snapshot dumped N=' + N2);
  }
  const sheetOf = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') sheetOf[i] = s;
  }
  const idx = (x: number, y: number): number => y * W + x;
  const inB = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H;
  const act = (x: number, y: number): number => (inB(x, y) ? (S.flags[idx(x, y)] & 1) : 0);
  const wal = (x: number, y: number): number => (inB(x, y) ? S.wall[idx(x, y)] : 0);
  const shOf = (x: number, y: number): number => (inB(x, y) ? (sheetOf[S.type[idx(x, y)]] ?? -1) : -1);

  // ── 骰值流 ──
  const rollLines = readFileSync('/tmp/iii185-out/js-roll-main.txt', 'utf8').split('\n').slice(1);
  const V: number[] = rollLines.map(l => Number(l.slice(l.indexOf('|') + 1)));
  // attempts（座2）
  const atts: Array<{ mc: number; x: number; y: number; w: number; g: number; a: number; r: number }> = [];
  for (const ln of readFileSync('/tmp/iii185-out/js-dr-mc.txt', 'utf8').split('\n')) {
    if (!ln.startsWith('DR|SPK|r=')) continue;
    const kv: Record<string, string> = {};
    for (const seg of ln.split('|')) { const i = seg.indexOf('='); if (i > 0) kv[seg.slice(0, i)] = seg.slice(i + 1); }
    const mc = Number(kv.mc);
    if (mc < WIN_LO || mc > WIN_HI) continue;
    atts.push({ mc, x: +kv.x, y: +kv.y, w: +kv.w, g: +kv.g, a: +kv.a, r: +kv.r });
  }
  // 观测墙门集（w→g 一致性）
  const gateMap = new Map<number, Set<number>>();
  for (const a of atts) {
    if (!gateMap.has(a.w)) gateMap.set(a.w, new Set());
    gateMap.get(a.w)!.add(a.g);
  }
  const gateSet = new Set<number>();
  let gateConflict = 0;
  for (const [w, gs] of gateMap) { if (gs.size > 1) gateConflict++; if (gs.has(1)) gateSet.add(w); }
  console.log(`[i185t] attempts=${atts.length} gateSet=${[...gateSet].sort((a, b) => a - b).join(',')} conflicts=${gateConflict}`);

  // ── 域拟合：x = L + floor(s(v)·W), y = Y0 + floor(s(v2)·H) ──
  const pairs = atts.map(a => ({ vx: V[a.mc - 2], vy: V[a.mc - 1], x: a.x, y: a.y }));
  // 线性回归初值
  const fit = (sel: (p: typeof pairs[0]) => [number, number]): [number, number] => {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pairs) { const [u, v] = sel(p); n++; sx += u; sy += v; sxx += u * u; sxy += u * v; }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    return [a, b];
  };
  const [x0f, xf] = fit(p => [p.vx * SC, p.x]);
  const [y0f, yf] = fit(p => [p.vy * SC, p.y]);
  let L = Math.round(x0f), Wd = Math.round(xf);
  let Y0 = Math.round(y0f), Hd = Math.round(yf);
  const tryFit = (): number => {
    let bad = 0;
    for (const p of pairs) {
      if (L + Math.floor(p.vx * SC * Wd) !== p.x) bad++;
      if (Y0 + Math.floor(p.vy * SC * Hd) !== p.y) bad++;
    }
    return bad;
  };
  let bad = tryFit();
  for (let dl = -2; dl <= 2 && bad > 0; dl++) for (let dw = -3; dw <= 3 && bad > 0; dw++) {
    L = Math.round(x0f) + dl; Wd = Math.round(xf) + dw;
    const b2 = (() => { let c = 0; for (const p of pairs) if (L + Math.floor(p.vx * SC * Wd) !== p.x) c++; return c; })();
    if (b2 < bad) { bad = b2; }
    else { L = Math.round(x0f) + dl; Wd = Math.round(xf) + dw; }
  }
  for (let dy = -2; dy <= 2 && bad > 0; dy++) for (let dh = -4; dh <= 4 && bad > 0; dh++) {
    Y0 = Math.round(y0f) + dy; Hd = Math.round(yf) + dh;
    const b2 = (() => { let c = 0; for (const p of pairs) { if (L + Math.floor(p.vx * SC * Wd) !== p.x) c++; if (Y0 + Math.floor(p.vy * SC * Hd) !== p.y) c++; } return c; })();
    if (b2 < bad) bad = b2; else { Y0 = Math.round(y0f) + dy; Hd = Math.round(yf) + dh; }
  }
  console.log(`[i185t] domain fit: L=${L} W=${Wd} (R=${L + Wd - 1}) Y0=${Y0} H=${Hd} (B=${Y0 + Hd}) bad=${bad}/${pairs.length * 2}`);

  // ── js 谓词（快照态上重放）──
  const CRACKED = new Set([481, 482, 483]);
  const canSupport = (x: number, y: number): boolean => {
    if (act(x, y) === 0) return false;
    const sh = shOf(x, y);
    if (sh < 0) return true;
    // 帧重要/切割表：用 TILE_DEFS 建模面近似（平台 19 等已有 framed/decor 旗）
    const d = TILE_DEFS[S.type[idx(x, y)]];
    const framed = d?.vanilla?.framed === true || d?.vanilla?.decor === true;
    if (framed) return false;
    if (CRACKED.has(sh)) return false;
    return true;
  };
  const decodeAttempt = (k: number) => {
    const x = L + Math.floor(V[k - 1] * SC * Wd);
    const y = Y0 + Math.floor(V[k] * SC * Hd);
    return { x, y };
  };
  // 重放 rig 尾部：mc 524,887..524,991（105 掷）
  let k = WIN_HI + 1;
  let n = 0;
  while (k + 1 <= RIG_HI) {
    n++;
    const { x, y } = decodeAttempt(k);
    const w = wal(x, y);
    const g = w > 0 && gateSet.has(w) ? 1 : 0;
    const a = act(x, y);
    let line = `tail#${n} mc=${k} (${x},${y}) w=${w} g=${g} a=${a === 0 ? 0 : 1}`;
    if (g === 1 && a === 0) {
      const d = (Math.floor(V[k + 1] * SC * 2) === 0) ? -1 : 1;
      let wx = x, wy = y;
      for (;;) {
        if (!inB(wx, wy)) break;
        if (act(wx, wy) !== 0) break;
        if (!(wx > 5 && wx < W - 5)) break;
        wx += d;
      }
      const hit = inB(wx, wy);
      const okA = hit && act(wx - 1, wy) !== 0;
      const okB = hit && act(wx + 1, wy) !== 0;
      const okC = hit && canSupport(wx - 1, wy);
      const okD = hit && act(wx - 1, wy - d) === 0;
      const okE = hit && act(wx + 1, wy - d) === 0;
      const ok = hit && okA && okB && okC && okD && okE;
      line += ` d=${d} walkEnd=(${wx},${wy}) t=${shOf(wx, wy)} ok=${ok ? 1 : 0}`;
      if (ok) {
        const n11a = 5 + Math.floor(V[k + 2] * SC * 8);
        const n11b = 5 + Math.floor(V[k + 3] * SC * 8);
        line += ` n11a=${n11a} n11b=${n11b} endMc=${k + 4}`;
        // 带形预测：锚列 wx，带列 wx-d（num14=d），行 wy-n11a+1..wy（向上）∪ wy+1..wy+n11b（向下）
        const rows: string[] = [];
        for (let yy = wy - n11a + 1; yy <= wy; yy++) {
          const bandOk = act(wx - d, yy - 1) === 0 && act(wx - d, yy + 1) === 0 && canSupportBand(wx - d, yy);
          rows.push(`${yy}:${act(wx, yy)}|${bandOk ? 'B' : '.'}`);
        }
        console.log(`${line} rowsUp=${rows.join(' ')}`);
      }
      k += 5; continue;
    }
    console.log(line);
    k += 2;
  }
  function canSupportBand(bx: number, by: number): boolean { return act(bx, by) === 0; }
  console.log(`[i185t] tail attempts=${n} lastMcUsed=${k}`);
}, 900_000);
