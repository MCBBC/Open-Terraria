// IIII109c 批（IIIII97c）：sparkle LT 域净 +66 差定位分析探针。
// 复用 _iii101a 的 cap-lt 基座（SW_I101_OUT），重放 runLivingTreesPass 后与 G2 dump#41/#42
// 八通道对拍，并输出：
//   ①WATCH 家族 tile 的【pass 净贡献】对比表（x86 NET=#42−#41；JS=replay 终态 vs base 终态）
//   ②loom/chair 等关键件的簇 locus 清单（两侧分列）
//   ③wall244 mask 的逐行区间 diff 摘要（tube 几何）
// 全部只读比对，零写入 tests/golden。用法：
//   cd game && npx vitest run tools/_iii109a.test.ts   （env: SW_I101_OUT / SW_I101_G2）
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runLivingTreesPass } from '../src/world/gen/vanilla/LivingTreePass';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const OUT = process.env.SW_I101_OUT ?? '/tmp/iii101-out/cap-lt';
const G2 = process.env.SW_I101_G2 ?? '/tmp/iii80-out/x86-sparkle';
const CMP_IDX = Number(process.env.SW_I101_CMP ?? 42);
const W = RUN ? Number(JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8')).w) : 0;   // ★套件门:RUN=0 不读夹具
const N = W * 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// 内部 id 反查表（诊断打印用）
const NAME_OF = new Map<number, string>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sh = SHEET[i];
  if (sh >= 0 && !NAME_OF.has(sh)) NAME_OF.set(sh, `${TILE_DEFS[i]?.key}(sh${sh})`);
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  // gs 只需 seed 与 worldSurface（seedFlags 由重放侧默认补齐）
  const GS_MIN = { worldSurface: 337, rockLevel: 475, beachDistance: 380 };
  return { st, gs: { ...GS_MIN, seedFlags: { hallowOnTheSurface: true }, numMCaves: 0, mCaveX: [] } as never as GenState };
}

(RUN ? it : it.skip)('III109 analysis: net contributions + loci', async () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pre = (n: number): string => `${G2}/${String(n).padStart(3, '0')}_${DUMPNAME.get(n)}`;
  const xtA = readFileSync(`${pre(CMP_IDX)}.act`), xtT = le16(`${pre(CMP_IDX)}.typ`);
  const xbA = readFileSync(`${pre(CMP_IDX - 1)}.act`), xbT = le16(`${pre(CMP_IDX - 1)}.typ`);
  // ★IIIII97c 勘误：本探针不再自跑 pass——重放执行统一由 _iii101a(SW_I101REPLAY) 负责
  //   （此处自搭 gs 缺全字段曾致 pass 空转、且 __swOnRoll 通道未生效）。本文件只做
  //   静态差分分析：x86 G2 dump 与 cap-lt 里最新一份 replay_* 存档。
  const { st } = hydrate();
  const baseType = st.type.slice();
  const baseFlags = st.flags.slice();

  const WATCH = [10, 15, 19, 21, 185, 187, 191, 192, 304];
  // dump 值域=vanilla sheet 直读；JS 内部 id 经 SHEET 换算
  const cnt = (typ: Uint16Array, act: Uint8Array, vanillaDirect: boolean): Map<number, number> => {
    const m = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      if (!(act[i] & 1)) continue;
      const sh = vanillaDirect ? typ[i] : (SHEET[typ[i]] >= 0 ? SHEET[typ[i]] : -3);
      if (WATCH.includes(sh)) m.set(sh, (m.get(sh) ?? 0) + 1);
    }
    return m;
  };
  const x42 = cnt(xtT, xtA, true);
  const x41 = cnt(xbT, xbA, true);
  // JS 侧终态 − 基座
  const jtT = le16(`${OUT}/replay_type.bin`), jtF = readFileSync(`${OUT}/replay_flags.bin`);
  const jEnd = cnt(jtT, jtF), jBase = cnt(baseType, baseFlags);

  console.log('kind        X86NET    JSNET');
  for (const sh of WATCH) {
    const xv = (x42.get(sh) ?? 0) - (x41.get(sh) ?? 0);
    const jv = (jEnd.get(sh) ?? 0) - (jBase.get(sh) ?? 0);
    console.log(`sheet${String(sh).padStart(4)} ${String(xv).padStart(9)} ${String(jv).padStart(8)} ${xv !== jv ? ' <<<DIFF' : ''} (${NAME_OF.get(sh)})`);
  }
  // 关键件 locus 簇
  const loci = (typ: Uint16Array, act: Uint8Array, wantSh: number, fromArr?: boolean): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < N; i++) {
      if (!(act[i] & 1)) continue;
      const sh = fromArr ? typ[i] : (SHEET[typ[i]] >= 0 ? SHEET[typ[i]] : -3);
      if (sh === wantSh) pts.push([i % W, Math.floor(i / W)]);
    }
    return pts;
  };
  const clusterize = (pts: Array<[number, number]>, r = 5): string[] => {
    const groups: Array<Array<[number, number]>> = [];
    for (const p of pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      let ok = false;
      for (const g of groups.slice(-10)) {
        if (g.some(q => Math.abs(p[0] - q[0]) <= r && Math.abs(p[1] - q[1]) <= r)) { g.push(p); ok = true; break; }
      }
      if (!ok) groups.push([p]);
    }
    return groups.map(g => `[${g[0]}×${g.length}]`);
  };
  const xbTt = le16(`${pre(CMP_IDX - 1)}.typ`);
  for (const sh of [304, 15, 21]) {
    const xa = loci(xtT, xtA, sh, true);
    const xOld = loci(xbTt, xbA, sh, true);
    const jj = loci(jtT, jtF, sh);
    const jb = loci(baseType, baseFlags, sh);
    const setAdd = (l: Array<[number, number]>) => new Set(l.map(p => `${p[0]},${p[1]}`));
    const sub = (big: Set<string>, small: Set<string>): Array<[number, number]> =>
      [...big].filter(x => !small.has(x)).map(s => { const [a, b] = s.split(','); return [Number(a), Number(b)] as [number, number]; });
    console.log(`sheet${sh} X86-NET clusters: ${clusterize(sub(setAdd(xa), setAdd(xOld)))}`);
    console.log(`sheet${sh} JS-NET clusters : ${clusterize(sub(setAdd(jj), setAdd(jb)))}`);
  }
}, 300_000);
