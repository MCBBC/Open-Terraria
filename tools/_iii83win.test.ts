// IIII83 批（GFB-A 蘑菇主带 #19..27）反演重放窗口仪：
//   有界生成（八字段 zenith 直注）→ 槽 18..21 边界对拍 x86-gfb-a dump →
//   首差格三态邻域（前槽/x86 出口/JS 出口）+ 区块热图 + 变更集交叠比。
// 用法：cd game && SW_III83=1 SW_III83_FLAGS=<逗号旗标> npx vitest run tools/_iii83win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_III83 === '1';
const G2 = process.env.SW_III83_G2 ?? '/tmp/iii82-out/x86-gfb-a';
const SEED = process.env.SW_III83_SEED ?? '9293480';
const EVIL = Number(process.env.SW_III83_EVIL ?? 0);
const W = Number(process.env.SW_III83_W ?? 4200), H = Number(process.env.SW_III83_H ?? 1200);
const N = W * H;
const OUT = process.env.SW_III83_OUT ?? '/tmp/iii83-out/win.json';

const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', constant: 'theConstant', theconstant: 'theConstant',
  notthebees: 'notTheBees', ntb: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', celebrationmk10: 'tenthAnniversary',
  fortheworthy: 'getGoodWorld', ftw: 'getGoodWorld',
  dontdigup: 'remix', drunkworld: 'drunkWorld',
};
const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III83_FLAGS
  ?? 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld')
  .split(',').filter(Boolean)) {
  M8_FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

// label → x86 dump idx（state=上一原版 pass 末态；同 _mile8 LABEL2DUMP 口径）
const L2D: Record<string, number> = {
  SandPatches: 2, Tunnels: 3, MountainCaves: 4, DirtWallBackgrounds: 5,
  RocksInDirt: 6, DirtInRocks: 7, Clay: 8, SmallHoles: 9,
  DirtLayerCaves: 10, RockLayerCaves: 11, SurfaceCaves: 12, WavyCaves: 13,
  IceBiome: 14, Grass: 15, JunglePass: 16, MudCavesToJungleGrass: 17,
  DesertBiome: 18, GlowingMushroomPatches: 19, Marble: 20, Granite: 21,
  FloatingIslands: 22, DirtToMud: 23, Silt: 24, OresAndShinies: 25,
  Webs: 26, Underworld: 27,
};
const NAMES: Record<number, string> = {
  2: 'Ocean_Sand', 3: 'Sand_Patches', 4: 'Tunnels', 5: 'Mount_Caves',
  6: 'Dirt_Wall_Backgrounds', 7: 'Rocks_In_Dirt', 8: 'Dirt_In_Rocks', 9: 'Clay',
  10: 'Small_Holes', 11: 'Dirt_Layer_Caves', 12: 'Rock_Layer_Caves', 13: 'Surface_Caves',
  14: 'Wavy_Caves', 15: 'Generate_Ice_Biome', 16: 'Grass', 17: 'Jungle',
  18: 'Mud_Caves_To_Grass', 19: 'Full_Desert', 20: 'Mushroom_Patches', 21: 'Marble',
  22: 'Granite', 23: 'Floating_Islands', 24: 'Dirt_To_Mud', 25: 'Silt',
  26: 'Shinies', 27: 'Webs', 28: 'Underworld',
};

interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
}
const chanCache = new Map<number, Ch>();
function chans(idx: number): Ch | null {
  const hit = chanCache.get(idx);
  if (hit) return hit;
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${NAMES[idx]}`;
  try { readFileSync(`${pre}.typ`); } catch { return null; }
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
  const c: Ch = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), lt: readFileSync(`${pre}.lty`),
    ia: readFileSync(`${pre}.inact`),
  };
  chanCache.set(idx, c);
  return c;
}

interface StoreView {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}

function jsSheet(st: StoreView, i: number): number {
  const ty = st.type[i];
  if (!st.flags[i]) return 0;
  return SHEET[ty] >= 0 ? SHEET[ty] : 9999;
}

/** 全量差分：通道计数 + pair + 区块热图 + 行主序首 K 格坐标 */
interface DetailCells { T: Array<[number, number, number, number]>; Y: Array<[number, number, number, number]> }
function diffAll(tag: string, idx: number, st: StoreView) {
  const c = chans(idx);
  if (!c) {
    console.log(`${tag} (#${idx}): (no dump @${G2}) —— 跳过`);
    return { tag, idx, chs: {}, pairs: [], cells: [] as Array<[number, number]>, regions: [] as [string, number][], detail: undefined as unknown as DetailCells };
  }
  const chs = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0 };
  const pair = new Map<string, number>();
  const reg = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  const detail: DetailCells = { T: [], Y: [] };
  for (let i = 0; i < N; i++) {
    const va = c.a[i], ja = st.flags[i] & 1;
    let bad = false;
    if (va !== ja) { chs.dA++; bad = true; }
    const vt = va ? c.t[i] : 0;
    const jt = ja ? jsSheet(st, i) : 0;
    if (vt !== jt) {
      chs.dT++; bad = true;
      pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1);
      if (detail.T.length < 4000) detail.T.push([i % W, Math.floor(i / W), vt, jt]);
    }
    if (c.w[i] !== st.wall[i]) { chs.dW++; bad = true; }
    if (c.l[i] !== st.liquid[i]) { chs.dL++; bad = true; }
    if (c.hf[i] !== st.half[i]) { chs.dHf++; bad = true; }
    if (c.sl[i] !== st.slope[i]) { chs.dSl++; bad = true; }
    const vl = c.l[i] > 0 ? c.lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) {
      chs.dLt++; bad = true;
      if (detail.Y.length < 8000) detail.Y.push([i % W, Math.floor(i / W), vl, jl]);
    }
    if ((c.ia[i] ? 1 : 0) !== ((st.wire[i] >>> 5) & 1)) { chs.dIa++; bad = true; }
    if (!bad) continue;
    const rk = `${Math.floor((i % W) / 200)}_${Math.floor((i / W) / 200)}`;
    reg.set(rk, (reg.get(rk) ?? 0) + 1);
    if (cells.length < (idx <= 18 ? 400 : 48)) cells.push([i % W, Math.floor(i / W)]);
  }
  console.log(`${tag} (#${idx} ${NAMES[idx]}): ${JSON.stringify(chs)}`);
  console.log('  pairs:', [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => `${k}×${v}`).join(' ') || '(none)');
  console.log('  regions:', [...reg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, v]) => `b${k}=${v}`).join(' '));
  return { tag, idx, chs, pairs: [...pair.entries()].sort((a, b) => b[1] - a[1]), cells, regions: [...reg.entries()], detail };
}

/** 三态 5×5 邻域打印：pre(x86 prev)/post(x86 target)/js(live store)
 *  非活性格打印 g{ghost}（remix 幽灵泥带是本域关键信息面）。 */
function triNeighborhood(idx: number, cx: number, cy: number, preIdx: number, st: StoreView) {
  const post = chans(idx)!;
  const pre = chans(preIdx);
  const rows: string[] = [];
  const xsym = (c: Ch | null, i: number) => c ? `${c.a[i] ? String(c.t[i]) : `g${c.t[i]}`}` : '.';
  const jsym = (i: number) => {
    const ty = SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999;
    return `${st.flags[i] & 1 ? String(ty) : `g${ty}`}`;
  };
  const pad4 = (s: string) => s.padEnd(4);
  for (let dy = -2; dy <= 2; dy++) {
    let rp = '', rq = '', rj = '';
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) { rp += '____ '; rq += '____ '; rj += '____ '; continue; }
      const i = y * W + x;
      rp += pad4(xsym(pre, i)) + ' ';
      rq += pad4(xsym(post, i)) + ' ';
      rj += pad4(jsym(i)) + ' ';
    }
    rows.push(`y${cy + dy}  pre[${rp}] post[${rq}] js[${rj}]`);
  }
  // 首列差集摘要
  const walls: string[] = [];
  const wpre = pre ? [0, 0] : null;
  void wpre;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x;
      if (post.w[i] !== st.wall[i] || (pre && pre.w[i] !== post.w[i])) {
        walls.push(`(${x},${y})w${st.wall[i]}v${post.w[i]}`);
      }
    }
  }
  console.log(`邻域(${cx},${cy}) *前缀=非活性幽灵:\n  ${rows.join('\n  ')}`);
  console.log(`  墙差异: ${walls.slice(0, 25).join(' ')}`);
}

/** 变更集足迹模式（SW_III83_CHG=1）：在关键标签时点克隆快照，
 *  对比「JS 本窗变更集」vs「x86 相邻 dump 变更集」的逐块交叠。 */
interface Snap { t: Uint16Array; a: Uint8Array; w: Uint16Array }
function snapOf(st: StoreView): Snap {
  return { t: st.type.slice(), a: st.flags.slice(0), w: st.wall.slice() };
}
function chToSnap(c: Ch): Snap {
  return { t: c.t, a: c.a, w: c.w };
}
const snaps = new Map<string, Snap>();
const chgMode = process.env.SW_III83_CHG === '1';

function valOf(s: Snap, i: number): number {
  const t = s.a[i] ? s.t[i] : 0;
  return SHEET[t] >= 0 ? SHEET[t] : 9999;
}

function chgTwo(label: string, preS: Snap, postS: Snap) {
  const reg = new Map<string, number>();
  let n = 0, nw = 0;
  let first = -1;
  for (let i = 0; i < N; i++) {
    const dv = valOf(preS, i) !== valOf(postS, i);
    const dw = preS.w[i] !== postS.w[i];
    if (!dv && !dw) continue;
    n += dv ? 1 : 0;
    nw += dw ? 1 : 0;
    if (first < 0) first = i;
    const rk = `${Math.floor((i % W) / 300)}_${Math.floor((i / W) / 300)}`;
    reg.set(rk, (reg.get(rk) ?? 0) + ((dv ? 2 : 0) + (dw ? 1 : 0)));
  }
  console.log(`[CHG ${label}] typΔ=${n} walΔ=${nw} first=(${first % W},${Math.floor(first / W)})`);
  console.log('  top regions:', [...reg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `${k}=${v}`).join(' '));
}

/** JS 变更集 vs x86 变更集交叠（typ 值面） */
function chgJaccard(label: string, preA: Snap, postA: Snap, preB: Snap, postB: Snap) {
  let both = 0, onlyA = 0, onlyB = 0;
  for (let i = 0; i < N; i++) {
    const da = valOf(preA, i) !== valOf(postA, i);
    const db = valOf(preB, i) !== valOf(postB, i);
    if (da && db) both++;
    else if (da) onlyA++;
    else if (db) onlyB++;
  }
  console.log(`[XCHG ${label}] both=${both} Aonly=${onlyA} Bonly=${onlyB}` +
    ` jaccard=${+(both / Math.max(1, both + onlyA + onlyB)).toFixed(3)}`);
}

(RUN ? it : it.skip)('GFB-A 窗口仪 #18..21 反演重放', async () => {
  type Row = ReturnType<typeof diffAll>;
  const rows: Row[] = [];
  const seen = new Set<string>();
  let lastLabel = '';
  const stopAt = process.env.SW_III83_STOP ?? 'Granite';

  // 抓两份快照：槽边界时点的 live store 引用本身即可（下一个 reseed 时未被改写）
  let live: StoreView | null = null;
  const RNGp = (await import('../src/core/rng')).RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii83win') && !/:349:/.test(line)) {
        const f = m[1], ln = Number(m[2]);
        // 复刻 _mile8 labelOf：向上找 ▶ 标签
        let lab = `${f.split('/').pop()}:${ln}`;
        try {
          const src = readFileSync(f, 'utf8').split('\n');
          for (let l = Math.min(ln, src.length) - 1; l >= 0 && l >= ln - 40; l--) {
            const mm = src[l].match(/▶([^（(]+?)[（(\s]/);
            if (mm) { lab = mm[1].trim(); break; }
          }
        } catch { /* noop */ }
        if (L2D[lab] !== undefined && !seen.has(lab)) {
          seen.add(lab);
          lastLabel = lab;
          rows.push(diffAll(`@${lab}`, L2D[lab], live!));
          if (chgMode && live) {
            if (lab === 'DesertBiome') snaps.set('head', snapOf(live));
            if (lab === 'GlowingMushroomPatches') snaps.set('postDesert', snapOf(live));
            if (lab === 'Marble') snaps.set('postMush', snapOf(live));
          }
          if (lab === stopAt) throw new Error('SW_III83_STOP');
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  void lastLabel;

  const t0 = Date.now();
  try {
    // 蘑菇头探针：打印沙漠侧关键隐藏态（undergroundDesert=CombinedArea.Inflate(10)）
    const gg = globalThis as { __swMushGsCap?: (gs: unknown, st?: unknown) => void };
    gg.__swMushGsCap = (gscap) => {
      const g = gscap as {
        dungeonSide: number; dungeonLocation: number; jungleX: number;
        undergroundDesert: { x0: number; y0: number; x1: number; y1: number } | null;
        undergroundDesertHive: { x0: number; y0: number; x1: number; y1: number } | null;
        crimsonLeft: boolean; seed: number;
      };
      console.log(`[GS@mushhead] dungeonSide=${g.dungeonSide} dungeonLocation=${g.dungeonLocation} jungleX=${g.jungleX} crimsonLeft=${g.crimsonLeft} ud=${JSON.stringify(g.undergroundDesert)} hive=${JSON.stringify(g.undergroundDesertHive)}`);
      gg.__swMushGsCap = undefined;
    };
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (wp) => {
        live = wp.store as never as StoreView;
      },
      onProgress: () => {},
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!msg.includes('SW_III83_STOP')) throw e;
    console.log(`stop @${stopAt} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } finally {
    RNGp.reseed = oReseed;
  }

  // 变更集足迹对拍（SW_III83_CHG=1）
  if (chgMode && snaps.has('head') && snaps.has('postDesert') && snaps.has('postMush')) {
    const x18 = chans(18), x19 = chans(19), x20 = chans(20);
    chgTwo('x86 desert 018→019', chToSnap(x18!), chToSnap(x19!));
    chgTwo('JS   desert head→postDesert', snaps.get('head')!, snaps.get('postDesert')!);
    if (x20) {
      chgTwo('x86 mush 019→020', chToSnap(x19!), chToSnap(x20));
      chgTwo('JS   mush postDesert→postMush', snaps.get('postDesert')!, snaps.get('postMush')!);
      chgJaccard('desert窗 (A=JS, B=x86)', snaps.get('head')!, snaps.get('postDesert')!,
        chToSnap(x18!), chToSnap(x19!));
      chgJaccard('mush窗 (A=JS, B=x86)', snaps.get('postDesert')!, snaps.get('postMush')!,
        chToSnap(x19!), chToSnap(x20));
    }
  }

  // 三态邻域：逐个对比点取首 4 个差格
  for (let ri = 0; ri < rows.length; ri++) {
    const preI = ri === 0 ? Math.max(0, rows[ri].idx - 0) : rows[ri - 1].idx;
    void preI;
    const cells = rows[ri].cells.slice(0, 4);
    for (const [cx, cy] of cells) {
      console.log(`\n── ${rows[ri].tag} 首差格 (${cx},${cy}) ──`);
      triNeighborhood(rows[ri].idx, cx, cy, rows[ri].idx - 1, live!);
    }
  }
  writeFileSync(OUT, JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? String(v) : v)));
  console.log(`written ${OUT}; labels=${[...seen].join(',')}`);
}, 900_000);

function passNameSig(label: string): string {
  // onProgress 用 passes[i].name；Granite/Marble 在 marble granite 包装内
  return label.toLowerCase();
}
