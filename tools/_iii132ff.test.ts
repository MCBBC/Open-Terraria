// IIII105b：ddual GroundFurniture_DualDungeons 移植——单 pass 反演重放（克隆 _iii89dg 模式）。
// 基座=/tmp/iii129-out/cap-ddual（IIIII102b 批捕获 @#033 头，selfcheck vs G2 dump032 已零）；
// 目标=Dungeon pass（#033）八通道 vs G2 /tmp/iii84-out/x86-i78-ddual。
// 用法：cd game && SW_I132REPLAY=1 npx vitest run tools/_iii132ff.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN_RE = process.env.SW_I132REPLAY === '1';
const OUT = process.env.SW_I132_OUT ?? '/tmp/iii129-out/cap-ddual';
const G2 = process.env.SW_I132_G2 ?? '/tmp/iii84-out/x86-i78-ddual';
const CMP_IDX = Number(process.env.SW_I132_CMP ?? 33);
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as GenState;
  return { st, gs };
}
const le16 = (p: string): Uint16Array => new Uint16Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).length >> 1);

(RUN_RE ? it : it.skip)('replay Dungeon pass on cap-ddual base vs G2 dump#33', () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  // —— 蛇槽缓存重建 + dual 模块态恢复（IIIII93b 口径，与 _iii89dg 同构）——
  if (!existsSync(`${OUT}/base_dual.json`)) throw new Error('cap missing base_dual.json');
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as {
    enabled: boolean; potentialBounds: typeof dualDungeonState.potentialBounds;
    dungeons: typeof dualDungeonState.dungeons; ndsf: number;
  };
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;
  console.log(`[i132] dual restored dungeons=${du.dungeons.length} pb=${du.potentialBounds.length}`);
  const { st, gs } = hydrate();
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st.w, st.h);
    for (const c of CHANS) {
      const src = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gs.seed), gs);
    console.log(`[i132] snakes rebuilt: ${dualSnakes.map((s) => s ? s.lines.length : 'null').join(',')}`);
  }
  // 基座自检 vs #032（反演有效性）
  {
    const nm32 = DUMPNAME.get(32)!;
    const a32 = readFileSync(`${G2}/032_${nm32}.act`), t32 = le16(`${G2}/032_${nm32}.typ`);
    let dA = 0, dT = 0;
    for (let i = 0; i < N; i++) {
      if (a32[i] !== (st.flags[i]! & 1)) dA++;
      else if (a32[i] && t32[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) dT++;
    }
    console.log(`[selfcheck vs #032_${nm32}] dAct=${dA} dTyp=${dT}${dA || dT ? ' ✗ 反演无效!' : ' ✓'}`);
  }
  // —— 掷账 + marks ——
  const wv: string[] | undefined = process.env.SW_I132_MARKS ? [] : undefined;
  if (wv) (globalThis as unknown as { __wvLines?: string[] }).__wvLines = wv;
  (globalThis as unknown as { __swWvLog?: unknown }).__swWvLog = wv ? {} : undefined;
  (globalThis as unknown as { __swRollN?: number }).__swRollN = 0;
  const ROLLLOG = process.env.SW_I132_ROLLLOG;
  if (ROLLLOG) writeFileSync(ROLLLOG, '');
  let rollH = 2166136261 >>> 0;
  const oOnRoll = (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll;
  (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v) => {
    const box = (globalThis as unknown as { __swRollN?: number });
    box.__swRollN = (box.__swRollN ?? 0) + 1;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
    if (ROLLLOG) {
      try { appendFileSync(ROLLLOG, `${box.__swRollN}|${v}\n`); } catch { /* ignore */ }
    }
  };
  globalThis.__i132RollHash = () => `${rollH.toString(16)}(${rollH})`;
  const rng = new RNG(gs.seed);
  const t0 = Date.now();
  // 窗口快照：dungeonT→dungeonF 段增分（与 rig box-snapshot 序列 45→46 对位）
  let snapT: { typ: Uint16Array; act: Uint8Array } | null = null;
  (globalThis as unknown as { __dgSegWatch?: (n: string, s2: TileStore) => void }).__dgSegWatch =
    (name, s2) => {
      if (name === 'dungeonT') {
        snapT = { typ: new Uint16Array(s2.type), act: new Uint8Array(s2.flags) };
      }
      if (name === 'dungeonF' && snapT) console.log('[i132] segment watch captured dungeonT/F');
    };
  try {
    runDungeonPass(st, rng, gs, []);
  } finally {
    delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
    (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = oOnRoll;
  }
  const sT = snapT;
  console.log(`runDungeonPass ${Date.now() - t0}ms totalSample=${(globalThis as unknown as { __swRollN?: number }).__swRollN}`);
  console.log(`passFnvHash=${globalThis.__i132RollHash?.() ?? 'na'}`);
  // —— 八通道对拍 #033——
  const nm33 = DUMPNAME.get(CMP_IDX)!;
  const pre33 = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${nm33}`;
  const xa = readFileSync(`${pre33}.act`), xt = le16(`${pre33}.typ`), xw = le16(`${pre33}.wal`),
    xl = readFileSync(`${pre33}.liq`), xlt = readFileSync(`${pre33}.lty`),
    xhf = readFileSync(`${pre33}.half`), xsl = readFileSync(`${pre33}.slope`),
    xia = readFileSync(`${pre33}.inact`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  let fI = -1;
  let dAd0 = 0, dTd0 = 0, dWd0 = 0, dAd1 = 0, dTd1 = 0, dWd1 = 0;
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    const dom = i % W <= 2200 ? 0 : 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; if (dom) dAd1++; else dAd0++; continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; fI = fI < 0 ? i : fI; if (dom) dTd1++; else dTd0++; continue; }
    if (xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; if (dom) dWd1++; else dWd0++; continue; }
    if (xl[i] !== st.liquid[i]) { dL++; continue; }
    if (xhf[i] !== st.half[i]) { dHf++; continue; }
    if (xsl[i] !== st.slope[i]) { dSl++; continue; }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; continue; }
    if ((xia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) { dIa++; continue; }
  }
  console.log(`DIFF A=${dA}(d0=${dAd0},d1=${dAd1}) T=${dT}(d0=${dTd0},d1=${dTd1}) W=${dW}(d0=${dWd0},d1=${dWd1}) L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  // —— F 窗口增分盒对账（与 x86r-snap 盒 3100..3400×340..440 对位）——
  if (sT && process.env.SW_I132_BOX === '1') {
    const X0 = 3100, X1 = 3400, Y0 = 340, Y1 = 440;
    let gainsJs = 0, gainsX = 0, both = 0;
    const rows: string[] = [];
    const gA = readFileSync('/tmp/iii132-out/x86r-snap/snaps/045_dg_dungeonT.act');
    const gT = le16('/tmp/iii132-out/x86r-snap/snaps/045_dg_dungeonT.typ');
    const fA = readFileSync('/tmp/iii132-out/x86r-snap/snaps/046_dg_dungeonF.act');
    const fT = le16('/tmp/iii132-out/x86r-snap/snaps/046_dg_dungeonF.typ');
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
        const i = y * W + x;
        const jg = ((st.flags[i] & 1) !== 0)
          && ((sT.act[i] ?? 0) === 0 || sT.typ[i] !== st.type[i]);   // T→F 增分格（活、且新类型）
        const bIdx = (y - Y0) * (X1 - X0 + 1) + (x - X0);
        const xg = fA[bIdx] === 1 && (gA[bIdx] === 0 || fT[bIdx] !== gT[bIdx]);
        if (jg) { gainsJs++; if (rows.length < 40000) rows.push(`${x},${y},${SHEET[st.type[i]]}`); }
        if (xg) gainsX++;
        if (jg && xg) both++;
      }
    }
    console.log(`[boxF-window] JS-gains=${gainsJs} X-gains=${gainsX} both=${both}`);
    writeFileSync('/tmp/iii132-out/jsboxf-gains.csv', `x,y,sheet\n${rows.join('\n')}`);
  }
  if (process.env.SW_I132_SAVE === '1') {
    const sheetTyp = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      sheetTyp[i] = (st.flags[i]! & 1) ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    }
    writeFileSync('/tmp/iii132-out/jsafter.typ', Buffer.from(sheetTyp.buffer, sheetTyp.byteOffset, N * 2));
    const acts = new Uint8Array(N);
    for (let i = 0; i < N; i++) acts[i] = st.flags[i]! & 1;
    writeFileSync('/tmp/iii132-out/jsafter.act', Buffer.from(acts.buffer, 0, N));
    writeFileSync('/tmp/iii132-out/jsafter.wal', Buffer.from(st.wall.buffer, st.wall.byteOffset, N * 2));
    console.log('[i132] jsafter saved');
  }
  if (wv) {
    for (const l of wv.filter((l2) => /MARK\|dungeon|I132|d61layout/.test(l2))) console.log('  ' + l);
    writeFileSync('/tmp/iii132-out/marks.txt', wv.join('\n'));
  }
}, 600_000);
