// ★IIII29 批一次性仪（终局收口：notraps#76 桶受理面收官 + const#31 微卡定罪）。
// 用法（纯 vitest，不需要 dev server）：
//   cd game && SW_I30=1 SW_I30_CHAIN=notraps npx vitest run tools/_i30nt.test.ts
//   cd game && SW_I30=1 SW_I30_CHAIN=const    npx vitest run tools/_i30nt.test.ts
// 可选：SW_I30_WATCH=x0,y0,x1,y1 —— 全生成期只把该盒内 KillTile 入口事件织入流。
// 产物（SW_I30_OUT=/tmp/iii30-out）：
//   j-tnt-<chain>.txt   有序事件流（pass 标记/TNT 逐尝试/头变异触发/watch 区 Kill）
//   res76-<chain>.txt   Traps 槽末全差异坐标清单（vs /tmp/rrrr-out/x86-<chain>）
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I30 === '1';
const CHAIN = process.env.SW_I30_CHAIN ?? 'notraps';
const OUT = process.env.SW_I30_OUT ?? '/tmp/iii30-out';
const G2 = `/tmp/rrrr-out/x86-${CHAIN}`;
const W = 4200, H = 1200, N = W * H;

const CFG = CHAIN === 'const'
  ? { seedText: '1321365005', evil: -1 as -1 | 0 | 1, seedFlags: { theConstant: true } }
  : { seedText: '1896728457', evil: 1 as -1 | 0 | 1, seedFlags: { noTraps: true } };

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)(`i30 ${CHAIN} instrumented run`, async () => {
  mkdirSync(OUT, { recursive: true });
  const evs: string[] = [];
  let rollN = 0;
  (globalThis as unknown as Record<string, unknown>).__swOnRoll = () => { rollN++; };
  (globalThis as unknown as Record<string, unknown>).__swTntEv = (m: string) => { evs.push(m); };

  const wenv = process.env.SW_I30_WATCH ?? '';
  const g1 = (): string => {
    const st = new Error().stack ?? '';
    const ls = st.split('\n').slice(2);
    return ls.filter((l) => l.includes('src/world/gen')).slice(0, 4)
      .map((l) => l.replace(/^.*?(src\/[^:]+\.ts).*$/, '$1') + ':' + (l.match(/:(\d+):\d+\)?$/) ? l.replace(/^.*?[^(]*\(?([^:) ]+):(\d+):\d+\)?$/, '$2') : '?'))
      .join(' <- ');
  };
  if (wenv) {
    const [wx0, wy0, wx1, wy1] = wenv.split(',').map(Number);
    evs.push(`WATCH ${wx0},${wy0}-${wx1},${wy1}`);
    (globalThis as unknown as Record<string, unknown>).__swKillW = (m: string) => {
      const [sx, sy] = m.split(',').map(Number);
      if (sx >= wx0 && sx <= wx1 && sy >= wy0 && sy <= wy1) evs.push(`K ${m} ${g1()}`);
    };
  }

  let snap76: null | {
    flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array;
    liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  } = null;
  const passNames: string[] = [];
  try {
    await generateWorld({
      width: W, height: H,
      seedText: CFG.seedText, evil: CFG.evil,
      seedFlags: CFG.seedFlags,
      onWorldPartial: (w, _i, pn) => {
        passNames.push(pn);
        evs.push(`PASS ${pn}`);
        if (/装饰/.test(pn)) {
          const s = w.store as unknown as {
            flags: Uint8Array; type: Uint16Array; wall: Uint16Array; liquid: Uint8Array;
            liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
          };
          snap76 = {
            flags: s.flags.slice(), type: s.type.slice(), wall: s.wall.slice(), liquid: s.liquid.slice(),
            liquidType: s.liquidType.slice(), half: s.half.slice(), slope: s.slope.slice(), wire: s.wire.slice(),
          };
          evs.push(`SNAP ${pn} rolls=${rollN}`);
        }
      },
    });
  } finally {
    delete (globalThis as unknown as Record<string, unknown>).__swTntEv;
    delete (globalThis as unknown as Record<string, unknown>).__swOnRoll;
    delete (globalThis as unknown as Record<string, unknown>).__swKillW;
  }
  writeFileSync(`${OUT}/j-tnt-${CHAIN}.txt`, evs.join('\n') + '\n');
  writeFileSync(`${OUT}/j-passnames-${CHAIN}.txt`, passNames.join('\n') + '\n');
  console.log(`events=${evs.length} rolls=${rollN}`);
  if (!snap76) throw new Error('no Traps snapshot captured');
  // ---- 与 x86 真值对拍（8 通道残差坐标清单）----
  const names = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) names.set(Number(m[1]), m[2]);
  }
  let idxD = [...names.entries()].find(([, nm]) => /traps/i.test(nm))?.[0] ?? -1;
  if (idxD < 0) throw new Error(`no Traps dump in ${G2}`);
  const pre = `${G2}/${String(idxD).padStart(3, '0')}_${names.get(idxD)}`;
  const c = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
  const lines: string[] = [`dump=${idxD}_${names.get(idxD)} (${G2})`];
  const groups = new Map<string, number[]>();
  const push = (g: string, i: number) => {
    const arr = groups.get(g) ?? [];
    arr.push(i);
    groups.set(g, arr);
  };
  const s76 = snap76;
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = s76.flags[i] & 1;
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[s76.type[i]] >= 0 ? SHEET[s76.type[i]] : 9999) : 0;
    if (va !== ja) push(`A${va}>${ja}`, i);
    if (vt !== jt) push(`T${vt}>${jt}`, i);
    if (c.w[i] !== s76.wall[i]) push(`W${c.w[i]}>${s76.wall[i]}`, i);
    if (c.l[i] !== s76.liquid[i]) push(`L${c.l[i]}>${s76.liquid[i]}`, i);
    if (c.hf[i] !== s76.half[i]) push(`H${c.hf[i]}>${s76.half[i]}`, i);
    if (c.sl[i] !== s76.slope[i]) push(`S${c.sl[i]}>${s76.slope[i]}`, i);
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = s76.liquid[i] > 0 ? s76.liquidType[i] : 0;
    if (vl !== jl) push(`Y${vl}>${jl}`, i);
    const via = c.ia[i]! ? 1 : 0;
    const jia = (s76.wire[i] >>> 5) & 1;
    if (via !== jia) push(`I${via}>${jia}`, i);
    const vg = va ? 0 : c.t[i]!;
    const jg = ja ? 0 : (SHEET[s76.type[i]] >= 0 ? SHEET[s76.type[i]] : 9999);
    if (vg !== jg && vt === jt) push(`GH${vg}>${jg}`, i);
  }
  const all = [...groups.values()].flat().sort((a, b) => a - b);
  lines.push(`firstDiff=${all.length ? fmtCell(all[0]) : 'none'}`);
  for (const [k, arr] of groups) {
    const uq = [...new Set(arr)].sort((a, b) => a - b);
    lines.push(`== ${k} ×${uq.length}: ${uq.slice(0, 64).map(fmtCell).join(' ')}`);
  }
  writeFileSync(`${OUT}/res76-${CHAIN}.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 900_000);

function fmtCell(i: number): string {
  return `(${i % W},${Math.floor(i / W)})`;
}
