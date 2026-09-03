// ★IIIII223（2026-09-03）箱序+帧维对账专探针（GFB 链）——XCVII「箱框 fx/sink 登记序债」
// 金标直读翻案的复核仪。两通道：
//   ①箱序通道：__swSeg 'CHEST slot=' 全箱枚举（deadMans 时点）↔ 金标 096_Larva
//     dump 直方（t21/467、fy==0、frx%36==0 顶左锚集）逐条 diff——金标侧无需 rig。
//   ②帧维通道：锚（槽末 96 蜂巢幼虫 / 97 微群系 / 105 终清理）frx/fry 全槽对拍，
//     哨兵折算律照 _iii199frx（65535≡0 双侧折算；x86 KillTile 尾 frameX/Y=-1 位型
//     =JS setTileSilent 0,合法位型差不计差；「从未帧过」0 与「显式 -1」本就等价）。
// 用法：cd game && SW_I223=1 npx vitest run tools/_iii223frx.test.ts
// 产物：/tmp/iii223-out/{frx223.log,chest223.txt}
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I223 === '1';
const G2 = process.env.SW_I223_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const SEED = '9293480';
const W = 4200, H = 1200, N = W * H;
const OUT = process.env.SW_I223_OUT ?? '/tmp/iii223-out';
// GFB 七旗真值集（_iii220dm 同口径；evil=0=金标 crimson=false 直读口径）
const GFB_FLAGS = {
  remix: true, drunkWorld: true, notTheBees: true, noTraps: true,
  theConstant: true, tenthAnniversary: true, getGoodWorld: true,
};
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
interface Ch { typ: Uint16Array; frx: Uint16Array; fry: Uint16Array; act: Uint8Array }
const chCache = new Map<number, Ch>();
const DUMPNAME = new Map<number, string>();
try {
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
} catch { /* G2 缺目录 → 全锚 missing 显式报表 */ }
function chans(idx: number): Ch | null {
  const hit = chCache.get(idx);
  if (hit) return hit;
  const nm = DUMPNAME.get(idx);
  if (nm === undefined) return null;
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  if (!existsSync(`${pre}.typ`) || !existsSync(`${pre}.frx`) || !existsSync(`${pre}.fry`)) return null;
  const rdu = (sfx: string) => {
    const b = readFileSync(`${pre}.${sfx}`);
    const n = Math.min(N * 2, b.length);
    return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + n), 0, n / 2);
  };
  const rdb = (sfx: string) => {
    const b = readFileSync(`${pre}.${sfx}`);
    const n = Math.min(N, b.length);
    return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + n), 0, n);
  };
  const c: Ch = { typ: rdu('typ'), frx: rdu('frx'), fry: rdu('fry'), act: rdb('act') };
  chCache.set(idx, c);
  return c;
}

(RUN ? it : it.skip)('iiii223 chest-sink + frame-dim reconciliation (GFB vs golden-gfb-c)', { timeout: 900_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const chestLines: string[] = [];
  // 箱序通道：MicroBiomesPass.deadMans getPossibleChests 的 segProbe CHEST 行
  // （segProbe 以整行为 name 调 __swSeg,_iii220dm 同口径前缀过滤）
  g.__swSeg = (name: unknown, detail?: unknown) => {
    const line = String(name);
    if (line.startsWith('CHEST slot=')) chestLines.push(line);
    else if (String(detail ?? '').startsWith('CHEST slot=')) chestLines.push(String(detail));
  };
  // 帧维通道锚：槽末 idx → 触发时点（复用 mile8 语义：onWorldPartial 第三参=槽名）
  const ANCHORS = new Map<number, string>([[96, '蜂巢幼虫'], [97, '微群系'], [105, '终清理']]);
  const frameRows: string[] = [];
  const captured = new Map<number, { frx: Uint16Array; fry: Uint16Array; typ: Uint16Array; flags: Uint8Array }>();
  let lastStore: { frameX: Uint16Array; frameY: Uint16Array; type: Uint16Array; flags: Uint8Array } | null = null;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0,
      seedFlags: GFB_FLAGS,
      onWorldPartial: (w, i) => {
        const want = ANCHORS.get(i === 49 ? 96 : i === 50 ? 97 : i === 58 ? 105 : -1);
        if (want === undefined) return;
        const st = w.store as never as typeof lastStore;
        lastStore = st;
        captured.set(i === 49 ? 96 : i === 50 ? 97 : 105, {
          frx: st!.frameX, fry: st!.frameY, typ: st!.type, flags: st!.flags,
        });
      },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    g.__swSeg = undefined;
  }
  // ---- ①箱序通道 ----
  writeFileSync(`${OUT}/chest223.txt`, chestLines.join('\n'));
  const jsChests = chestLines.map((l) => {
    const m = l.match(/slot=(\d+) (\d+),(\d+) t=(\d+) fx=(\d+) fy=(\d+) act=(\d+)/);
    return m ? { slot: +m[1], x: +m[2], y: +m[3], t: +m[4], fx: +m[5], fy: +m[6] } : null;
  }).filter(Boolean) as Array<{ slot: number; x: number; y: number; t: number; fx: number; fy: number }>;
  const jsSet = new Map(jsChests.filter((c) => (c.t === 21 || c.t === 467) && c.fy === 0 && c.fx % 36 === 0)
    .map((c) => [`${c.x},${c.y} t=${c.t} fx=${c.fx}`, c]));
  // 金标 096 直方
  const gc = chans(96);
  console.log(`chest-sink lines=${chestLines.length} (t21/467 顶左锚 ${jsSet.size}); golden096=${gc ? 'loaded' : 'MISSING'}`);
  if (gc) {
    const gSet = new Map<string, string>();
    for (let i = 0; i < N; i++) {
      if (gc.act[i] && (gc.typ[i] === 21 || gc.typ[i] === 467) && gc.fry[i] === 0 && gc.frx[i] % 36 === 0) {
        gSet.set(`${i % W},${(i / W) | 0} t=${gc.typ[i]} fx=${gc.frx[i]}`, `${i % W},${(i / W) | 0}`);
      }
    }
    const onlyG: string[] = [], onlyJ: string[] = [];
    for (const k of gSet.keys()) if (!jsSet.has(k)) onlyG.push(k);
    for (const k of jsSet.keys()) if (!gSet.has(k)) onlyJ.push(k);
    console.log(`★ 箱序通道：金标独有=${onlyG.length} JS独有=${onlyJ.length}`);
    for (const k of onlyG.slice(0, 12)) console.log(`  G-only ${k}`);
    for (const k of onlyJ.slice(0, 12)) console.log(`  J-only ${k}`);
  }
  // ---- ②帧维通道 ----
  for (const [idx, nm] of ANCHORS) {
    const cap = captured.get(idx);
    const gc2 = chans(idx);
    if (!cap || !gc2) { frameRows.push(`${idx} ${nm}: (missing ${cap ? 'golden' : 'js'})`); continue; }
    let dFx = 0, dFy = 0, firstFx = -1, firstFy = -1;
    const fxPair = new Map<string, number>();
    const fyPair = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const va = (gc2.act[i] ? 1 : 0) === (cap.flags[i] & 1 ? 1 : 0);
      const vt = gc2.act[i] ? gc2.typ[i] : 0;
      const jt = (cap.flags[i] & 1) ? (SHEET[cap.typ[i]] >= 0 ? SHEET[cap.typ[i]] : 9999) : 0;
      const sameT = va && vt === jt;
      // 哨兵折算：65535≡0 双侧
      const vx = gc2.frx[i] === 65535 ? 0 : gc2.frx[i];
      const jx = cap.frx[i] === 65535 ? 0 : cap.frx[i];
      const vy = gc2.fry[i] === 65535 ? 0 : gc2.fry[i];
      const jy = cap.fry[i] === 65535 ? 0 : cap.fry[i];
      if (sameT && vx !== jx) {
        dFx++; if (firstFx < 0) firstFx = i;
        const k = `T${vt}:${vx}>${jx}`;
        fxPair.set(k, (fxPair.get(k) ?? 0) + 1);
      }
      if (sameT && vy !== jy) {
        dFy++; if (firstFy < 0) firstFy = i;
        const k = `T${vt}:${vy}>${jy}`;
        fyPair.set(k, (fyPair.get(k) ?? 0) + 1);
      }
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, n]) => `${k}×${n}`).join(' ');
    const line = `${String(idx).padStart(3)} ${nm}: dFx=${dFx}${firstFx >= 0 ? ` @(${firstFx % W},${(firstFx / W) | 0})` : ''} [${top(fxPair)}] dFy=${dFy}${firstFy >= 0 ? ` @(${firstFy % W},${(firstFy / W) | 0})` : ''} [${top(fyPair)}]`;
    frameRows.push(line);
    console.log(`★ 帧维 ${line}`);
  }
  writeFileSync(`${OUT}/frx223.log`, frameRows.join('\n') + '\n');
}, 900_000);
