// IIII174b 批一次性普查仪（LXVIII 备案①/② 罕见路径暴露面定谳）：
//   ①placeTight「合并终列」失配族掷位缺口——统计 ShimmerPass.placeTight（Desert/
//     CaveHouse/MarbleGranite 消费方同经此函数）每次放置写入的 style，失配族
//     （x86 初始列 54/0 基 → UpdateStalagtiteStyle 重掷 1×Next(3) 的锚族
//     117/25/203/163/164/200 + wall62 垂挂双）写入 style ∈ {1,2,3,8,9,10,11}。
//     事件源=ShimmerPass d59 钩（pt-in/pt-done，零 src 编辑）。
//   ②checkStalactite 省略 InvalidTileForPilesOrSpeleothems 门——每槽末全图扫
//     「地面形 165 立于活性巨石」候选面（fy90→底=(x,y+1)；fy36→底=(x,y+2)；
//     fy54→底=(x,y+1)；x86 CheckStalactite 对该底格查 Boulders 表杀，JS 留）。
//     Boulders=TileID.Sets.Boulders {138,484,664,665,711..716}（1457 TileID.cs:195）。
// 用法：cd game && SW_I174=1 npx vitest run tools/_iii174census.test.ts
//   SW_I174_CHAINS='name|seed|evil|flags;...'（flags=逗号分隔 SeedFlags 字段名）
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I174 === '1';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const STALAC = 165;
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
// 失配族写入 style（x86 会多掷 1×Next(3) 的列基）：117→1, 25→2, 203→3,
// 164→8, 163→9, 200→10, wall62 垂挂双→11
const MISMATCH_STYLES = new Set([1, 2, 3, 8, 9, 10, 11]);
const STYLE_BY_FX54 = new Map<number, number>([
  [0, 7], [1, 0], [2, 11], [3, 12], [4, 1], [5, 2], [6, 3], [7, 4],
  [8, 5], [9, 6], [10, 8], [11, 9], [12, 10],
]);
const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', celebrationmk10: 'tenthAnniversary',
  fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
  tooeasy: 'startInHardmode', tse: 'startInHardmode',
  dsv: 'theConstant',
};

interface ChainCfg { name: string; seed: string; evil: number; flags?: Record<string, boolean>; w?: number; h?: number; }
const DEFAULT_CHAINS: ChainCfg[] = [
  { name: 'g', seed: '9293480', evil: 0 },
  { name: 's22222', seed: '22222', evil: 1 },
  { name: 'c12345', seed: '12345', evil: 1 },
  { name: 'ftw', seed: '1671560105', evil: 0, flags: { getGoodWorld: true } },
  { name: 'tooeasy', seed: 'tooeasy|20260911', evil: 0, flags: { startInHardmode: true } },
  { name: 'dsv', seed: 'theconstant|20260912', evil: 0, flags: { theConstant: true } },
];
function parseChains(spec: string | undefined): ChainCfg[] {
  if (!spec) return DEFAULT_CHAINS;
  return spec.split(';').filter(Boolean).map((e) => {
    const [name, seed, evil, flags] = e.split('|');
    const fl: Record<string, boolean> = {};
    for (const f of (flags ?? '').split(',').filter(Boolean)) fl[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
    return { name, seed, evil: Number(evil ?? '-1'), flags: Object.keys(fl).length ? fl : undefined };
  });
}

(RUN ? it : it.skip)('IIII174 placeTight/checkStalactite rare-path census', async () => {
  const g = globalThis as { __swD59v?: (o: Record<string, unknown>) => void };
  for (const c of parseChains(process.env.SW_I174_CHAINS)) {
    // —— 本链普查态 ——
    let ptIn = 0, ptPlaced = 0, ptMismatch = 0;
    let ptInMark = 0, ptPlacedMark = 0, ptMismatchMark = 0;
    const slotRows: string[] = [];
    const boulderHits: { slot: number; n: number; samples: string[] }[] = [];
    g.__swD59v = (o) => {
      if (o.e === 'pt-in') ptIn++;
      else if (o.e === 'pt-done' && o.placed === 1) {
        ptPlaced++;
        const fx = Number(o.fx ?? -1);
        const style = STYLE_BY_FX54.get(Math.trunc(fx / 54));
        if (style !== undefined && MISMATCH_STYLES.has(style)) ptMismatch++;
      }
    };
    const t0 = Date.now();
    await generateWorld({
      width: c.w ?? 4200, height: c.h ?? 1200, seedText: c.seed,
      evil: c.evil as -1 | 0 | 1, seedFlags: c.flags,
      onWorldPartial: (w, i, pn) => {
        const st = w.store as unknown as {
          w: number; h: number; flags: Uint8Array; type: Uint16Array; frameY: Uint16Array;
        };
        const dIn = ptIn - ptInMark, dPl = ptPlaced - ptPlacedMark, dMis = ptMismatch - ptMismatchMark;
        ptInMark = ptIn; ptPlacedMark = ptPlaced; ptMismatchMark = ptMismatch;
        // —— 槽末全图扫：地面形 165 立于活性巨石 ——
        let n165 = 0, onBoulder = 0;
        const samples: string[] = [];
        const W = st.w, H = st.h, fl = st.flags, ty = st.type, fy = st.frameY;
        for (let x = 0; x < W; x++) {
          for (let y = 1; y < H - 2; y++) {
            const idx = y * W + x;   // TileStore 行主序 idx=y*w+x（与 harness cmp 同构）
            if (fl[idx] === 0 || SHEET[ty[idx]] !== STALAC) continue;
            const f = fy[idx];
            let by = -1;
            if (f === 90 || f === 54) by = y + 1;
            else if (f === 36) by = y + 2;
            if (by < 0) continue;
            n165++;
            const bi = by * W + x;
            if (fl[bi] !== 0 && BOULDERS.has(SHEET[ty[bi]])) {
              onBoulder++;
              if (samples.length < 3) samples.push(`(${x},${y})fy${f}底${SHEET[ty[bi]]}`);
            }
          }
        }
        if (dIn || dPl || dMis) slotRows.push(`#${String(i).padStart(3, '0')} ${pn}: pt_in+${dIn} placed+${dPl} mismatch+${dMis}`);
        if (onBoulder > 0) {
          boulderHits.push({ slot: i, n: onBoulder, samples });
          slotRows.push(`#${String(i).padStart(3, '0')} ${pn}: ★165-on-boulder=${onBoulder} [${samples.join(' ')}]`);
        }
        void n165;
      },
    });
    g.__swD59v = undefined;
    const nSlotRows = slotRows.length;
    console.log(`\n== census[${c.name}] seed=${c.seed} evil=${c.evil} flags=${JSON.stringify(c.flags ?? {})} (${((Date.now() - t0) / 1000).toFixed(0)}s) ==`);
    console.log(`placeTight: in=${ptIn} placed=${ptPlaced} mismatch-family-placed=${ptMismatch}（x86 每处多掷 1×Next(3)）`);
    console.log(`165-on-boulder 槽末候选面: ${boulderHits.length} 槽非零, 峰值=${boulderHits.reduce((a, b) => Math.max(a, b.n), 0)}`);
    for (const r of slotRows) console.log('  ' + r);
    if (nSlotRows === 0) console.log('  （全链零失配放置·零巨石候选=双罕见路径本链未现实例）');
  }
}, 600_000);
