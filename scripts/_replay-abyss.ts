// ★6xx:Abyss(+Abyss Decorations) pass 重放判卷(克隆 _replay-crag.ts;流语义定谳:RNG(seed) fresh)
// 边界定谳(FNV 对账):探针 PASS 行 tf=该 pass 完成后状态(WorldGenerator.cs:497 每 pass 重播);
//   输入=「Draedon Structures 完成态」快照(tf 对账锁定),输出=「Abyss 完成态」快照。
//   两 pass 连跑(真链一个 Abyss pass 的两段:Abyss.cs:40-803 主体 + :530-799 装饰归
//   gen-abyss.ts;单一连续流,Decorations 不重播)。
// gs:sulphurAtLeft=false(真链 AtLeftSideOfWorld=SulphurousSea.cs:188 dungeonX<maxTilesX/2,
//   dungeonX=3421>2100→false,零掷);sulphurYStart=gen-sea DetermineYStart 同式扫描
//   (真链由海 pass 零掷扫描产出,此处按同一算法对 pre 快照重算)。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(带 content JSON 属性面——genSolid/实心门依赖 solid 标志;
//  键字典序=全链分配序,stableId 从 1030 起)
{
  let nextId = 1030;
  const tileDir = `${root}/mods/calamity/content/tiles`;
  for (const f of readdirSync(tileDir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${tileDir}/${f}`, 'utf8'));
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`,
        name: spec.name ?? f.replace('.json', ''),
        solid: spec.solid ?? false,
        platform: spec.platform ?? false,
        decor: spec.decor ?? false,
        chest: spec.chest ?? false,
        framed: spec.framed ?? false,
        w: spec.w, h: spec.h,
        opacity: spec.opacity ?? (spec.solid ? 1 : 0),
        pick: spec.pick ?? 0,
        axe: spec.axe ?? -1,
        mapColor: spec.mapColor ?? '#808080',
        blend: spec.frame === 'blend' || spec.frame === 'auto' ? true : false,
        vanilla: { frame: spec.frame ?? 'style', fw: spec.w ?? 1, fh: spec.h ?? 1 },
      }, nextId++);
    } catch { /* skip */ }
  }
}

// ── gen pass 消费的全局面(同 mods/calamity/tests/gen-pass-golden.test.ts 装载路径)──
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;
(globalThis as unknown as { __calamityGenTiles?: Record<string, number> }).__calamityGenTiles = {};

// 快照载入(x 主序→行主序;gzip)
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(join2(LOGS, f)));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall, file: f };
}
import { join as join2 } from 'node:path';

// ── FNV 对账锁边界(genprobe.log PASS 行 tf ↔ 快照 type-FNV)──
// 快照 type 流=x 主序 u16 LE;FNV-1a 32 仅 type 通道(低字节→高字节;同 _anchor-compare.ts)
const fnvOf = (buf: Uint8Array): string => {
  const w = 4200, h = 1200;
  let hh = 0x811c9dc5;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    hh ^= buf[o]; hh = Math.imul(hh, 0x01000193) >>> 0;
    hh ^= buf[o + 1]; hh = Math.imul(hh, 0x01000193) >>> 0;
  }
  return hh.toString(16).padStart(8, '0');
};
// 解析 genprobe.log PASS 行 → name→tf
const passTf = new Map<string, string>();
{
  const log = readFileSync(join2(LOGS, 'genprobe.log'), 'utf8');
  for (const line of log.split('\n')) {
    const cols = line.split('\t');
    if (cols[0] !== 'PASS') continue;
    passTf.set(cols[2], cols[3]);
  }
}
const TF_IN = passTf.get('Draedon Structures');
const TF_OUT = passTf.get('Abyss');
if (!TF_IN || !TF_OUT) throw new Error('genprobe.log 缺 Draedon Structures/Abyss PASS 行');
let preFile = '', postFile = '';
for (const f of readdirSync(LOGS).sort()) {
  if (!f.startsWith('genprobe-snap-') || !f.endsWith('.bin.gz')) continue;
  const tf = fnvOf(gunzipSync(readFileSync(join2(LOGS, f))));
  if (tf === TF_IN) preFile = f;
  if (tf === TF_OUT) postFile = f;
}
if (!preFile || !postFile) throw new Error(`FNV 对账失败: 输入(${TF_IN})=${preFile || '无'} 输出(${TF_OUT})=${postFile || '无'}`);
console.log(`[replay] FNV 边界锁定: 输入=${preFile}(tf=${TF_IN}) 输出=${postFile}(tf=${TF_OUT})`);

// C# id→本仓内部 id
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
// mod 运行时 id→名(终版 twld tileMap)
class BER { off = 0; constructor(public b: Uint8Array) {} u8() { return this.b[this.off++]; } i16() { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; } i32() { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; } bytes(n: number) { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; } str() { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); } }
function payload(id: number, r: BER): unknown {
  switch (id) {
    case 1: return r.u8(); case 2: return r.i16(); case 3: return r.i32();
    case 4: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 5: { const v = r.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
    case 6: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 11: { const n = r.i32(); const o: number[] = []; for (let i = 0; i < n; i++) o.push(r.i32()); return o; }
    case 7: return r.bytes(r.i32()); case 8: return r.str();
    case 9: { const e = r.u8(), n = r.i32(); const o: unknown[] = []; for (let i = 0; i < n; i++) o.push(payload(e, r)); return o; }
    case 10: { const t: Array<{ t: number; name: string; v: unknown }> = []; for (;;) { if (r.off >= r.b.length) break; const id2 = r.u8(); if (id2 === 0) break; const nm = r.str(); t.push({ t: id2, name: nm, v: payload(id2, r) }); } return t; }
    default: throw new Error('pid ' + id);
  }
}
const MOD_ID_TO_NAME = new Map<number, number>();   // cs id → 本仓 internal id
{
  const twld = gunzipSync(readFileSync(`${root}/mods/calamity/golden-oracle/golden-calamity.twld`));
  const r = new BER(twld);
  r.u8(); r.str();
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const snake = String(get('name')).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const our = TILE_BY_KEY[`mod_calamity_${snake}`];
    if (our !== undefined) MOD_ID_TO_NAME.set(Number(get('value')), our);
  }
  console.log('[replay] mod 名映射', MOD_ID_TO_NAME.size);
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

// store 构建
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const t = CS_TO_OURS(snap.type[i]);
    type[i] = t; flags[i] = t !== 0 ? 1 : 0;
    wall[i] = snap.wall[i];
  }
  return {
    w, h, type, flags, wall, liquid, liquidType, wire, half, slope, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
    get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy; },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; },
    purgeGhostTiles() { return 0; },
  };
}

const pre = loadSnap(preFile.replace(/^genprobe-snap-\d+-/, '').replace('.bin.gz', ''));
const post = loadSnap(postFile.replace(/^genprobe-snap-\d+-/, '').replace('.bin.gz', ''));
const store = buildStore(pre);

// ── worldSurfaceLow 等价值标定(★652)────────────────────────────────
// ChasmGenerator 起点 j 只通过「探针列首个实心行」起作用:probe 自 j 下行扫首个
// HasTile。若 j ≤ 列首行,probe 命中=列首行(j 取何值无关)。取三探针列
// (chasmX/chasmX∓22 各 -125)首实心行的 min-65 作安全等价值(L+65 ≤ 各列首行恒成立),
// 并用真链雕顶( PRE 有 POST 无 的最高行≈命中行-半宽)校验「真 j ≤ 列首行」前提。
const chasmX0 = 4030;
const probeCols = [chasmX0 - 125, chasmX0 - 22 - 125, chasmX0 + 22 - 125];
const ftOf = (col: number) => {
  for (let y = 1; y < h; y++) if (store.hasTile(col, y)) return y;
  return h;
};
const fts = probeCols.map(ftOf);
let realCarveTop = -1;
for (let y = 1; y < h && realCarveTop < 0; y++) {
  for (let x = chasmX0 - 60; x < chasmX0 + 60; x++) {
    const i = y * w + x;
    if (pre.type[i] !== 0 && post.type[i] === 0) { realCarveTop = y; break; }
  }
}
const surfLowEquiv = Number(process.env.SW_ABYSS_SURFLOW) || (Math.min(...fts) - 65);
console.log(`[replay] 探针列首实心行 [${probeCols.join(',')}] = [${fts.join(',')}] 真雕顶=${realCarveTop}(命中≈雕顶+13) → worldSurfaceLow 等价值=${surfLowEquiv}`);

// sulphurYStart 重算(gen-sea DetermineYStart 同式:SulphurousSea.cs:228;
//  biomeWidth=370(W=4200),atLeft=false → getActualX(371)=4200-1-371=3828;
//  surfLow=worldSurfaceLow → 自 surfLow-20 下行探第一个实心,黑檀石(sheet25)西移重试)
let sulphurYStart = 337;
{
  const xCheck0 = w - 1 - (370 + 1);
  let xCheck = xCheck0;
  const genSolid0 = (x: number, y: number) => {
    if (!store.hasTile(x, y)) return false;
    const d = TILE_DEFS[store.get(x, y)] as { solid?: boolean } | undefined;
    return !!(d && d.solid);
  };
  const scanFrom = Math.max(1, surfLowEquiv - 20);
  for (let guard = 0; guard <= 370; guard++) {
    let found = -1;
    for (let y = scanFrom; y < Math.min(h, scanFrom + 3000); y++) {
      if (genSolid0(xCheck, y)) { found = y; break; }
    }
    if (found < 0) break;
    const td = TILE_DEFS[store.get(xCheck, found)] as { vanilla?: { sheet: number } } | undefined;
    if (td?.vanilla?.sheet === 25) { xCheck += -1; continue; }
    sulphurYStart = found;
    break;
  }
  const topSolid = (() => { for (let y = 1; y < h; y++) if (genSolid0(xCheck0, y)) return y; return -1; })();
  console.log(`[replay] sulphurYStart 重算=${sulphurYStart}(x=${xCheck0} 起扫 y=${scanFrom};列顶实心=${topSolid}——同值则起点无关)`);
}

const genMod = await import('../mods/calamity/src/gen.ts');
const abyssMod = await import('../mods/calamity/src/gen-abyss.ts');
let abyssFn: ((...a: unknown[]) => void) | null = null;
let decorFn: ((...a: unknown[]) => void) | null = null;
const captured: string[] = [];
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
      captured.push(name);
      if (name === 'Abyss') abyssFn = fn;
      if (name === 'Abyss Decorations') decorFn = fn;
    };
    if (prop === 'log') return (...a: unknown[]) => console.log('[gen]', ...a);
    return () => {};
  },
  has: () => true,
});
(genMod as { setupGen(sw: unknown): void }).setupGen(stub);
(abyssMod as { setupGenAbyss(sw: unknown): void }).setupGenAbyss(stub);
if (!abyssFn || !decorFn) throw new Error(`pass 未注册齐: captured=[${captured.join(', ')}]`);
console.log('[replay] pass fn 就绪:', captured.join(', '));

const gs = {
  seed: translateSeed('9293480'),
  worldSurface: 337, rockLevel: 535,
  // ★652:worldSurfaceLow=真链 GenVars 顶层字段(引擎 ctxGs[0] 同名同位;
  //  TerrainPass.ts:195 产出)——gen.ts Abyss 段消费此键定堑壕起点
  worldSurfaceLow: surfLowEquiv,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200,
  seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {},
    chests: [] as unknown[],
    // 真链状态面(SulphurousSea.cs:188 零掷派生;dungeonX=3421>2100→false)
    sulphurAtLeft: false,
    sulphurYStart,
  },
};
const atLeft = gs.mods.sulphurAtLeft as boolean;
const genLimit = Math.floor(w / 2);
const chasmX = atLeft ? 170 : genLimit + (genLimit - 135) - 35;
const xLo0 = chasmX - 170;
console.log(`[replay] atLeft=${atLeft} chasmX=${chasmX} 区 x∈[${chasmX - 170}, ${Math.min(w, chasmX + 170)}]`);
// 堑壕探针命中行(与 pass 内同式:自 j 下行探首个实心;j=L+65 / L / L)
{
  const L = gs.worldSurfaceLow as number;
  const hit = (col: number, j: number) => { for (let y = Math.max(0, j); y < h - 1; y++) if (store.hasTile(col, y)) return y; return -1; };
  console.log(`[replay] 堑壕探针命中: 中(${chasmX - 125},${L + 65})→${hit(chasmX - 125, L + 65)} 左(${chasmX - 22 - 125},${L})→${hit(chasmX - 22 - 125, L)} 右(${chasmX + 22 - 125},${L})→${hit(chasmX + 22 - 125, L)}`);
}

// 两 pass 连跑(真链一个 Abyss pass 的两段;单流连续)
// K 扫描钩:SW_ABYSS_PREFIX_ROLLS 覆盖 Prefix(-1) 世界流掷数(校准用)
if (process.env.SW_ABYSS_PREFIX_ROLLS) (globalThis as { __swAbyssPrefixRolls?: number }).__swAbyssPrefixRolls = Number(process.env.SW_ABYSS_PREFIX_ROLLS);
const preHad = new Uint8Array(n);
for (let i = 0; i < n; i++) preHad[i] = store.flags[i] & 1;
const rng = new RNG(gs.seed as number);
let drawCount = 0;
const drawVals: number[] = [];
const rawNext = rng.next.bind(rng);
(rng as { next: () => number }).next = () => { const v = rawNext(); drawCount++; if (drawVals.length < 16384) drawVals.push(v); return v; };
(abyssFn as (...a: unknown[]) => void)(store, rng, gs);
console.log(`[replay] Abyss pass 掷数=${drawCount}`);
drawCount = 0;
(decorFn as (...a: unknown[]) => void)(store, rng, gs);
console.log(`[replay] Decorations 掷数=${drawCount}`);
console.log(`[replay] chests=${gs.mods.chests.length}`);

// ── 填充 dither 位流对拍(★652):真 POST 反推 coin 位 vs 我方掷值序 ──
// 可写格=!has||vanilla;三 dither 带:1-2(526-535) coin→gravel(806) else shale(847);
// 2-3(707-709) coin→pyre(815) else gravel(806);3-4(857-859) coin→void(852) else pyre(815)。
// POST 被后期覆盖的格(非候选值)跳过。j=全带掷序游标。
{
  const CS_INV = new Map<number, number>();
  for (const [cs, internal] of MOD_ID_TO_NAME) CS_INV.set(internal, cs);
  const pyreCs = 815, voidCs = 852, gravelCs = 806, shaleCs = 847;
  (globalThis as { __abyssCs?: unknown }).__abyssCs = { pyreCs, voidCs, gravelCs, shaleCs, CS_INV };
  const pyreCs2 = pyreCs, voidCs2 = voidCs, gravelCs2 = gravelCs;
  const lowerCsOf = (u: number) => (u === pyreCs ? gravelCs : u === voidCs ? pyreCs : shaleCs);
  const CS_INV2 = CS_INV;
  let j = 0, mismatch = 0, checked = 0, skipped = 0, outOfVals = 0;
  const repairs: string[] = [];
  let firstMis = '';
  for (let x = 3870; x < 4200; x++) for (let y = 0; y < 1000; y++) {
    const i = y * w + x;
    const has = pre.type[i] !== 0;
    if (has && pre.type[i] >= 753) continue;         // mod tile=不可写,零掷
    let upperCs = -1, lowerCs = -1;
    if (y >= 525 && y <= 535) { upperCs = gravelCs; lowerCs = shaleCs; }   // rock-10=525,11 行
    else if (y >= 707 && y <= 709) { upperCs = pyreCs; lowerCs = gravelCs; }
    else if (y >= 857 && y <= 859) { upperCs = voidCs; lowerCs = pyreCs; }
    else continue;
    const myVal = drawVals[j];
    if (myVal === undefined) { outOfVals++; break; }
    const realCs = CS_TO_OURS(post.type[i]) !== 0 ? CS_INV.get(CS_TO_OURS(post.type[i])) ?? -1 : 0;
    if (realCs !== upperCs && realCs !== lowerCs) { skipped++; j++; continue; }  // 后期覆盖/雕除(含空)=歧义格
    checked++;
    const realBit = realCs === upperCs;
    const myBit = myVal < 0.5;
    if (myBit !== realBit) {
      mismatch++;
      if (!firstMis) {
        firstMis = `首分歧 掷#${j} (${x},${y}) 真=${realBit ? 1 : 0}`;
        // 相位假设检验:j+δ (δ∈-3..3) 后续 500 个对拍位的匹配率
        let best = '';
        for (let d = -48; d <= 48; d++) {
          let ok = 0, tot = 0;
          let jj = j + d;
          for (let x2 = x, y2 = y + 1;; y2++) {
            if (y2 >= 1000) { y2 = 0; x2++; if (x2 >= 4200) break; }
            const ii2 = y2 * w + x2;
            const has2 = pre.type[ii2] !== 0;
            if (has2 && pre.type[ii2] >= 753) continue;
            let u2 = -1;
            if (y2 >= 525 && y2 <= 535) u2 = gravelCs;
            else if (y2 >= 707 && y2 <= 709) u2 = pyreCs;
            else if (y2 >= 857 && y2 <= 859) u2 = voidCs;
            else continue;
            const rc2 = CS_TO_OURS(post.type[ii2]) !== 0 ? CS_INV.get(CS_TO_OURS(post.type[ii2])) ?? -1 : -2;
            if (rc2 !== u2 && rc2 !== (u2 === pyreCs ? gravelCs : u2 === voidCs ? pyreCs : shaleCs)) continue;
            const v2 = drawVals[jj];
            if (v2 === undefined || tot >= 500) break;
            tot++;
            if ((v2 < 0.5) === (rc2 === u2)) ok++;
            jj++;
          }
          best += ` δ${d}:${ok}/${tot}`;
        }
        console.log(`[replay] 相位检验:${best}`);
        // 打印分歧点前后掷值
        const ctx: string[] = [];
        for (let k = j - 4; k <= j + 8; k++) ctx.push(`#${k}=${drawVals[k]?.toFixed(3) ?? '—'}`);
        console.log(`[replay] 掷值窗: ${ctx.join(' ')}`);
        // 邻域明细:x∈[j列-2, j列+2] 全 dither 行的 PRE/POST/我位/真位
        {
          const CS_INV3 = CS_INV;
          for (let x3 = x - 2; x3 <= x + 2; x3++) {
            const rows = [525,526,527,528,529,530,531,532,533,534,535,707,708,709,857,858,859];
            const parts: string[] = [];
            for (const y3 of rows) {
              const ii3 = y3 * w + x3;
              const preV = pre.type[ii3], postV = post.type[ii3];
              const rc3 = CS_TO_OURS(postV) !== 0 ? CS_INV3.get(CS_TO_OURS(postV)) ?? -1 : 0;
              const u3 = (y3 >= 525 && y3 <= 535) ? gravelCs : (y3 >= 707 && y3 <= 709) ? pyreCs : voidCs;
              const valid = rc3 === u3 || rc3 === (u3 === pyreCs ? gravelCs : u3 === voidCs ? pyreCs : shaleCs);
              parts.push(`y${y3}:pre${preV}/post${postV}${valid ? (rc3 === u3 ? '↥1' : '↧0') : '?'}`);
            }
            console.log(`[replay] x=${x3}: ${parts.join(' ')}`);
          }
        }
      }
    }
    j++;
  }
  console.log(`[replay] dither 位对拍: 查=${checked} 歧义=${skipped} 窗外=${outOfVals} 分歧=${mismatch}/${checked} ${firstMis}`);
  console.log(`[replay] 相位修复 ${repairs.length} 处:`, repairs.slice(0, 12).join(' | '));
  // 偏移扫描:收集真位流(带格坐标),在首分歧后试 offset ∈ [-4..4],看后续 240 位匹配率
  {
    const realSeq: Array<{ x: number; y: number; bit: boolean }> = [];
    const xColMax = Number(process.env.SW_ABYSS_BITCOLS ?? 4200);
    let j2 = 0;
    for (let x = 3870; x < 4200; x++) for (let y = 0; y < 1000; y++) {
      const i = y * w + x;
      const has = pre.type[i] !== 0;
      if (has && pre.type[i] >= 753) continue;
      let upperCs = -1;
      if (y >= 525 && y <= 535) upperCs = gravelCs2;
      else if (y >= 707 && y <= 709) upperCs = pyreCs2;
      else if (y >= 857 && y <= 859) upperCs = voidCs2;
      else continue;
      const realCs = CS_TO_OURS(post.type[i]) !== 0 ? CS_INV2.get(CS_TO_OURS(post.type[i])) ?? -1 : 0;
      if (realCs !== upperCs && realCs !== lowerCsOf(upperCs) && realCs !== 0) { j2++; continue; }
      if (x > xColMax) { j2++; continue; }
      realSeq.push({ x, y, bit: realCs === upperCs });
      j2++;
    }
    // 找首分歧位置(不修复的朴素游标)
    let jj = 0, firstDivIdx = -1;
    for (let k = 0; k < realSeq.length; k++) {
      const v = drawVals[jj];
      if (v === undefined) break;
      if ((v < 0.5) !== realSeq[k].bit) { firstDivIdx = k; break; }
      jj++;
    }
    if (firstDivIdx >= 0) {
      console.log(`[replay] 朴素游标首分歧 realSeq[${firstDivIdx}] (${realSeq[firstDivIdx].x},${realSeq[firstDivIdx].y})`);
      for (let off = -4; off <= 4; off++) {
        let ok = 0, tot = 0;
        for (let k = firstDivIdx; k < Math.min(realSeq.length, firstDivIdx + 240); k++) {
          const v = drawVals[jj + off + (k - firstDivIdx)];
          if (v === undefined) break;
          tot++;
          if ((v < 0.5) === realSeq[k].bit) ok++;
        }
        console.log(`[replay] offset=${off}: ${ok}/${tot}`);
      }
    }
  }
}

// 我方雕除带(PRE 有 tile → pass 后无)vs 真链雕除带——堑壕路径对拍
{
  const yB = new Map<number, number>(), xB = new Map<number, number>();
  for (let x = xLo0; x < w; x++) for (let y = 0; y < h; y++) {
    const i = y * w + x;
    if (preHad[i] && !(store.flags[i] & 1)) {
      yB.set(Math.floor(y / 50) * 50, (yB.get(Math.floor(y / 50) * 50) ?? 0) + 1);
      xB.set(Math.floor(x / 25) * 25, (xB.get(Math.floor(x / 25) * 25) ?? 0) + 1);
    }
  }
  console.log('[replay] 我雕 y 带:', [...yB.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b}:${c}`).join(' '));
  console.log('[replay] 我雕 x 带:', [...xB.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b}:${c}`).join(' '));
}

// ── diff 剖面 ──
let diff = 0, diffIn = 0, diffOut = 0;
const diffByType = new Map<string, number>();
let firstDiff = '';
const xLo = chasmX - 170, xHi = Math.min(w, chasmX + 170);
const yBands = new Map<number, number>();
const xBands = new Map<number, number>();
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  if (store.type[i] !== realT) {
    diff++;
    const x = i % w, y = Math.floor(i / w);
    if (x >= xLo && x < xHi) diffIn++; else diffOut++;
    yBands.set(Math.floor(y / 100) * 100, (yBands.get(Math.floor(y / 100) * 100) ?? 0) + 1);
    xBands.set(Math.floor(x / 50) * 50, (xBands.get(Math.floor(x / 50) * 50) ?? 0) + 1);
    const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    if (!firstDiff) firstDiff = `首格(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`;
  }
}
console.log(`[replay] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(2)}%) 区内=${diffIn} 区外=${diffOut} ${firstDiff}`);
// 纯堑壕带(y∈[realCarveTop-20, 380)——页岩岛带起点≥382,填充门 490 之上无其他写入)
// = L 的干净探测器(L 决定堑壕掷数→流位;岛/装饰污染不进入此带)
{
  let chasmBand = 0;
  for (let y = Math.max(0, realCarveTop - 20); y < 380; y++) {
    for (let x = chasmX - 170; x < Math.min(w, chasmX + 170); x++) {
      const i = y * w + x;
      if (store.type[i] !== CS_TO_OURS(post.type[i])) chasmBand++;
    }
  }
  console.log(`[replay] 纯堑壕带 diff(y[${Math.max(0, realCarveTop - 20)},380))=${chasmBand}`);
}
console.log('[replay] y 带差格(y:count):', [...yBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `${b}:${c}`).join(' '));
console.log('[replay] x 带差格(x:count):', [...xBands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([b, c]) => `${b}:${c}`).join(' '));
console.log('[replay] 迁移对 TOP15(我→真):');
for (const [k, c] of [...diffByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${k}: ${c}`);

// 双侧聚合(全图)
const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const oursC = cnt(store.type), realC = cnt(Array.from(post.type, CS_TO_OURS));
const keys = new Set([...oursC.keys(), ...realC.keys()]);
const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0] as [string, number, number]).filter((r) => Math.abs(r[1] - r[2]) > 0).sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
console.log('[replay] 聚合差全列(tile 我 真 Δ):');
for (const [k, a, b] of rows) console.log(`  ${k}: ${a} vs ${b}  Δ${b - a}`);
process.exit(0);
