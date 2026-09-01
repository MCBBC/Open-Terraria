// IIIII111b 反演重放③（用毕可删）：ship 灰烬草段 vs 反编译逐字改写仿真双跑。
// 同一真值输入（x86 #027 注入），分别取 ship 与手写-vanilla 的转换集，差集=语义缺口。
// 运行：cd game && SW_I144E=1 SW_I144_G2=$HOME/GoldenChains/golden-win npx vitest run tools/_iii144e.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I144E === '1';
const G2 = process.env.SW_I144_G2 ?? '';
const SEED = process.env.SW_I144_SEED ?? '20260907';
const OUT = process.env.SW_I144_OUT ?? '/tmp/iii144-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const N = W * H;

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface X9 { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; lt: Uint8Array; hf: Uint8Array; sl: Uint8Array; ia: Uint8Array }
function x9(dir: string, name: string): X9 {
  const pre = `${dir}/${name}`;
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), lt: readFileSync(`${pre}.lty`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), ia: readFileSync(`${pre}.inact`),
  };
}

(RUN ? it : it.skip)('ash-grass verbatim dual-run', async () => {
  if (!G2) throw new Error('need SW_I144_G2');
  const dumpNames = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) dumpNames.set(Number(m[1]), m[2]);
  }
  const XA = x9(G2, `027_${dumpNames.get(27)!}`);
  const XB = x9(G2, `028_${dumpNames.get(28)!}`);
  const INV = new Int32Array(2048).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && s >= 0 && s < INV.length && INV[s] === -1) INV[s] = i;
  }
  const ASH_V = 57, AG_V = 633;
  const AG_INT = INV[AG_V], ASH_INT = INV[ASH_V];
  if (!(AG_INT > 0 && ASH_INT > 0)) throw new Error('INV map broken');

  // ── 手写 vanilla 仿真（反编译 cs:13877-13901 普通世界支）──
  function vanillaSim(P: X9): Uint8Array {
    const out = new Uint8Array(N); // 1=本段转成633
    for (let x = 25; x < W - 25; x++) {
      if (!((x < W * 0.17) || (x > W * 0.83))) continue;
      for (let y = H - 300; y < H - 100 + 1; y++) {   // 终界含 Next(-1,2) 上端 h-99；扫描取并集上界
        const i = y * W + x;
        if (!P.a[i]) continue;
        if (P.t[i] !== ASH_V && !(out[i])) { /* 已转换者不再重判；首次判定用输入态 */ }
        if (P.t[i] !== ASH_V) continue;
        // 8 邻任一非 active（含越界）即暴露
        let exp = false;
        for (let ox = -1; ox <= 1 && !exp; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const nx = x + ox, ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) { exp = true; break; }
            if (!P.a[ny * W + nx]) { exp = true; break; }
          }
        }
        if (exp) out[i] = 1;
      }
    }
    return out;
  }

  class SnapCap { type!: Uint16Array; flags!: Uint8Array; liquid!: Uint8Array; liquidType!: Uint8Array; wall!: Uint16Array; half!: Uint8Array; slope!: Uint8Array }

  // ── ship 跑 ──
  let injected = false, shipFrom = false, captured: Record<string, Uint8Array | Uint16Array> | null = null;
  const gg = globalThis as Record<string, unknown>;
  const oUw = gg.__swUwCap, oI87 = gg.__swI87Cap;
  function snap(st: unknown): Record<string, Uint8Array | Uint16Array> {
    const s = st as Record<string, Uint8Array | Uint16Array>;
    return {
      type: Uint16Array.from(s.type as Uint16Array), flags: Uint8Array.from(s.flags as Uint8Array),
      wall: Uint16Array.from(s.wall as Uint16Array), liquid: Uint8Array.from(s.liquid as Uint8Array),
      liquidType: Uint8Array.from(s.liquidType as Uint8Array), half: Uint8Array.from(s.half as Uint8Array),
      slope: Uint8Array.from(s.slope as Uint8Array),
    };
  }
  gg.__swUwCap = (_gs: unknown, stX: unknown) => {
    if (injected || shipFrom) return;
    injected = true; shipFrom = true;
    const s = stX as Record<string, Uint8Array | Uint16Array>;
    const typ = s.type as Uint16Array, flags = s.flags as Uint8Array, wall = s.wall as Uint16Array,
      liq = s.liquid as Uint8Array, lty = s.liquidType as Uint8Array, hf = s.half as Uint8Array,
      sl = s.slope as Uint8Array, wire = s.wire as Uint8Array,
      fx = s.frameX as Uint16Array, fy = s.frameY as Uint16Array;
    for (let i = 0; i < N; i++) {
      typ[i] = INV[XA.t[i]!] >= 0 ? INV[XA.t[i]!] : 0;
      flags[i] = XA.a[i]! & 1; fx[i] = 0; fy[i] = 0; wall[i] = XA.w[i]!;
      liq[i] = XA.l[i]!; lty[i] = XA.l[i]! > 0 ? XA.lt[i]! + 1 : 0;
      hf[i] = XA.hf[i]!; sl[i] = XA.sl[i]!;
      wire[i] = (wire[i] & ~32) | ((XA.ia[i]! ? 1 : 0) * 32);
    }
  };
  gg.__swI87Cap = (stX: unknown) => {
    if (injected && !captured) captured = snap(stX);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED,
      seedFlags: { worldIsFrozen: true },
    });
  } finally { gg.__swUwCap = oUw; gg.__swI87Cap = oI87; }
  if (!captured) throw new Error('capture missing');
  const C = captured;

  // ship 转换集：输入是 raw ash(内部 id) 且输出 633
  const shipSet = new Uint8Array(N);
  let shipCnt = 0;
  for (let i = 0; i < N; i++) {
    const jv = ((C.flags[i] as number) & 1) ? SHEET_OF(C.type[i] as number) : -999;
    void jv;
    const ja = (C.flags[i] as number) & 1;
    const wasActive = XA.a[i]!;
    const inpIsAsh = INV[XA.t[i]!] === ASH_INT && !!wasActive;
    const outIsAg = ja && (C.type[i] as number) === AG_INT;
    if (inpIsAsh && outIsAg) { shipSet[i] = 1; shipCnt++; }
  }
  const van = vanillaSim(XA);
  let vanCnt = 0; for (let i = 0; i < N; i++) if (van[i]) vanCnt++;
  console.log(`[I144E] ship convert=${shipCnt} vanillaSim=${vanCnt} (x86 实测≈39459)`);

  const onlyVan: number[] = [], onlyShip: number[] = [];
  for (let i = 0; i < N; i++) {
    if (van[i] && !shipSet[i]) onlyVan.push(i);
    else if (!van[i] && shipSet[i]) onlyShip.push(i);
  }
  console.log(`[I144E] onlyVan=${onlyVan.length} onlyShip=${onlyShip.length}`);
  const sample = (arr: number[], n: number) => arr.slice(0, n).map((i) => `(${i % W},${(i / W) | 0})`).join(' ');
  console.log('[I144E] onlyVan samples:', sample(onlyVan, 24));
  console.log('[I144E] onlyShip samples:', sample(onlyShip, 12));
  // onlyVan 行分布特征（首差形状判读）
  const rowHist = new Map<number, number>();
  for (const i of onlyVan) {
    const y = (i / W) | 0;
    rowHist.set(y, (rowHist.get(y) ?? 0) + 1);
  }
  const rows = [...rowHist.entries()].sort((a, b) => a[0] - b[0]);
  console.log('[I144E] onlyVan rows(first 18):', rows.slice(0, 18).map(([y, c]) => `y${y}:${c}`).join(' '));
  console.log('[I144E] onlyVan rows(last 10):', rows.slice(-10).map(([y, c]) => `y${y}:${c}`).join(' '));
  // x86 真值（#028）中的 633 总量与 von-only 对比口径
  let x86ag = 0;
  for (let i = 0; i < N; i++) if (XB.a[i] && XB.t[i] === AG_V) x86ag++;
  console.log(`[I144E] x86 #028 633 total=${x86ag}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/ash-dual.json`, JSON.stringify({
    shipCnt, vanCnt, x86ag, onlyVan: onlyVan.length, onlyShip: onlyShip.length,
    onlyVanFirst: onlyVan.slice(0, 80).map((i) => [i % W, (i / W) | 0]),
    rows: rows.slice(0, 260),
  }, null, 1));
  console.log(`[I144E] report -> ${OUT}/ash-dual.json`);

  function SHEET_OF(t: number): number {
    const s = TILE_DEFS[t]?.vanilla?.sheet;
    return typeof s === 'number' ? s : -999;
  }
}, 900_000);
