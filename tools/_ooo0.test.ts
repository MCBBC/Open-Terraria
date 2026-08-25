// OOOOOOO 批·①：#97 Micro_Biomes 差异全图提取 + 段事件关联。
// 跑 g 链（9293480）生成，槽末#48 存 TileStore 快照（供独立重放），
// __swMbCap 抓 gs/st，__swSeg 记录段事件；槽末#49 全图 8 通道对拍
// /tmp/jjj-out/g1457/097_* → 差异聚类坐标 + 每事件后监视窗变化账本。
// 用法: cd game && SW_O0=1 npx vitest run tools/_ooo0.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_O0 === '1';
const SEED = process.env.SW_O0_SEED ?? '9293480';
const EVIL = Number(process.env.SW_O0_EVIL ?? 0);
const W = Number(process.env.SW_O0_W ?? 4200), H = Number(process.env.SW_O0_H ?? 1200);
const VG = process.env.SW_O0_VG ?? '/tmp/jjj-out/g1457';
const OUT = '/tmp/ooo-out';
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('ooo0 #97 diff map + segment correlation', async () => {
  const names: Record<number, string> = {};
  for (const f of readdirSync(VG)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) names[Number(m[1])] = m[2];
  }
  const pre = (i: number) => `${VG}/${String(i).padStart(3, '0')}_${names[i]}`;
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const u8 = (p: string) => new Uint8Array(readFileSync(p));
  const v97 = existsSync(`${pre(97)}.typ`) ? {
    typ: le16(`${pre(97)}.typ`), act: u8(`${pre(97)}.act`), wal: le16(`${pre(97)}.wal`),
    liq: u8(`${pre(97)}.liq`), hf: u8(`${pre(97)}.half`), sl: u8(`${pre(97)}.slope`), lt: u8(`${pre(97)}.lty`),
  } : null;

  let storeRef: TileStore | null = null;
  // OOOOOOO：micro pass 内 raw InternalSample 录制（__swMbCap 开 → __swSeg('passEnd') 关）
  const rollLog: number[] = [];
  let recOn = false;
  const URp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = URp.internalSample as (this: UnifiedRandom) => number;
  URp.internalSample = function (this: UnifiedRandom) {
    const v = oIS.call(this);
    if (recOn) rollLog.push(v);
    return v;
  };
  const segEvents: Array<{ name: string; detail: string; changes: number }> = [];
  const g0 = globalThis as {
    __swMbCap?: (gs: unknown, st: unknown, chests?: unknown) => void;
    __swSeg?: (name: string, detail?: unknown) => void;
  };
  // 监视窗：首差簇附近（(2431,61) ±120×±80）
  const WX0 = 2311, WX1 = 2551, WY0 = 0, WY1 = 160;
  let base: { typ: Uint16Array; liq: Uint8Array } | null = null;

  g0.__swMbCap = (gs, st) => {
    storeRef = st as never;
    recOn = true;
    rollLog.length = 0;
    rollMarks.length = 0;
    const g = gs as Record<string, number>;
    console.log(`[mbCap] worldSurface=${g.worldSurface} rockLevel=${g.rockLevel} genWorldSurface=${g.genWorldSurface} genRockLayer=${g.genRockLayer} beachDistance=${g.beachDistance} lavaLine=${g.lavaLine}`);
  };
  const rollMarks: Array<{ at: number; name: string; detail: string }> = [];
  let prevCh = 0;
  g0.__swSeg = (name, detail) => {
    let d = '';
    if (detail !== undefined) { try { d = JSON.stringify(detail); } catch { d = '?'; } }
    rollMarks.push({ at: rollLog.length, name, detail: d });
    if (name === 'passEnd') recOn = false;
    let ch = 0;
    if (base && storeRef) {
      const st = storeRef;
      const hits: string[] = [];
      for (let y = WY0; y < WY1; y++) {
        for (let x = WX0; x < WX1; x++) {
          const i = y * W + x;
          if (st.type[i] !== base.typ[i] || st.liquid[i] !== base.liq[i]) {
            ch++;
            if (hits.length < 12 && ch > prevCh) hits.push(`(${x},${y}) t${base.typ[i]}>${st.type[i]} l${base.liq[i]}>${st.liquid[i]}`);
          }
        }
      }
      // 增量：相对上一事件的监视窗变化数
      if (ch > prevCh) segEvents.push({ name, detail: d + (hits.length ? ' :: ' + hits.join(' ') : ''), changes: ch - prevCh });
      prevCh = ch;
    } else {
      segEvents.push({ name, detail: d, changes: -1 });
    }
  };

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w, i) => {
        if (i === 48) {
          const st = w.store;
          base = { typ: st.type.slice(), liq: st.liquid.slice() };
          // 快照存盘供独立重放
          mkdirSync(`${OUT}/mb-${SEED}`, { recursive: true });
          const wr = (nm: string, a: Uint8Array | Uint16Array) => writeFileSync(`${OUT}/mb-${SEED}/${nm}`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
          wr('type.bin', st.type); wr('flags.bin', st.flags); wr('wall.bin', st.wall);
          wr('liquid.bin', st.liquid); wr('liquidType.bin', st.liquidType);
          wr('half.bin', st.half); wr('slope.bin', st.slope);
          wr('frameX.bin', st.frameX); wr('frameY.bin', st.frameY);
          wr('wire.bin', st.wire); wr('paint.bin', st.paint);
          writeFileSync(`${OUT}/mb-${SEED}/gs.json`, JSON.stringify(lastGenState()));
          writeFileSync(`${OUT}/mb-${SEED}/chests.json`, JSON.stringify(w.chests ?? []));
          console.log(`[slot48] snapshot saved (${OUT}/mb-${SEED})`);
        }
        if (i === 49 && v97) {
          const st = w.store;
          const diffs: Array<{ x: number; y: number; sig: string }> = [];
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const i = y * W + x;
              const va = v97.act[i]!, ja = st.flags[i]! & 1;
              const vt = va ? v97.typ[i]! : 0;
              const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
              const vl = v97.liq[i]! > 0 ? v97.lt[i]! + 1 : 0;
              const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
              if (vt !== jt) diffs.push({ x, y, sig: `T${vt}>${jt}` });
              else if (vl !== jl) diffs.push({ x, y, sig: `Y${vl}>${jl}` });
              else if (v97.wal[i] !== st.wall[i]) diffs.push({ x, y, sig: 'W' });
            }
          }
          writeFileSync(`${OUT}/mb-${SEED}-diffs.txt`, diffs.map(d => `${d.x},${d.y},${d.sig}`).join('\n') + '\n');
          console.log(`[slot49] total diffs vs dump97 = ${diffs.length} → ${OUT}/mb-${SEED}-diffs.txt`);
        }
      },
    });
  } finally {
    delete g0.__swMbCap;
    delete g0.__swSeg;
    URp.internalSample = oIS;
  }
  // raw 样本流 + 段事件锚（与 x86 rollwin 序列 diff 用）
  writeFileSync(`${OUT}/mb-${SEED}-jsrolls.txt`, rollLog.map(v => String(v)).join('\n') + '\n');
  writeFileSync(`${OUT}/mb-${SEED}-jsmarks.txt`, rollMarks.map(m => `${m.at}\t${m.name}\t${m.detail}`).join('\n') + '\n');
  console.log(`[rolls] recorded=${rollLog.length}, marks=${rollMarks.length}`);
  // 监视窗内有变化的段事件
  const hit = segEvents.filter(e => e.changes > 0);
  writeFileSync(`${OUT}/mb-${SEED}-segev.txt`, segEvents.map(e => `${e.name}\t${e.detail}\t${e.changes}`).join('\n') + '\n');
  console.log(`[watch window (${WX0}..${WX1},${WY0}..${WY1})] events with changes:`);
  for (const e of hit.slice(0, 60)) console.log(`  ${e.name} ${e.detail} +${e.changes}`);
  console.log(`total seg events: ${segEvents.length}, with-changes: ${hit.length} → ${OUT}/mb-${SEED}-segev.txt`);
}, 900_000);
