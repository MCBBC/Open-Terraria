// Vernal Pass 重放判卷(克隆 _replay-sea/_replay-sunken;流语义定谳=每 pass 重播种)
// 边界 FNV 对账锁定(2026-10-14,三跑全等):
//   输入=PASS 102 "Muds Walls In Jungle" 完成态  type-FNV=f14baac9 wf=646c85b3
//   输出=PASS 103 "Vernal Pass" 完成态           type-FNV=fa0c8a61 wf=5509e4c9
//   真链掷数 dN=62(PASS103 SPY);探针快照由 GENPROBE_SNAPSHOT='Vernal Pass' 重跑重生成:
//     genprobe-snap-00-pre-Muds_Walls_In_Jungle(输入)/ genprobe-snap-01-post-Vernal_Pass(输出)
//   「pre-X」文件=X 完成态(探针语义:FNV 实证;nextIsMod 命名规则见 GenProbe.cs Dump)。
// 真实增量(pre→post 快照差,26,012 格):cs#1916(VernalSoil 运行时 id)+1,090;
//   vanilla 填充族 mud/草/泥墙等;变化域 bbox x[989,1263] y[832,1044]。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(须透传 content json 字段——_replay-crag/_replay-sunken 判例)
{
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${root}/mods/calamity/content/tiles/${f}`, 'utf8')) as Record<string, unknown>;
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`,
        name: (spec.name as string) ?? '',
        solid: (spec.solid as boolean) ?? false,
        platform: (spec.platform as boolean) ?? false,
        decor: (spec.decor as boolean) ?? false,
        chest: (spec.chest as boolean) ?? false,
        framed: (spec.framed as boolean) ?? false,
        w: spec.w as number | undefined,
        h: spec.h as number | undefined,
        opacity: spec.opacity as number | undefined,
        pick: (spec.pick as number) ?? 0,
        mapColor: (spec.mapColor as string) ?? '#808080',
        blend: false,
      }, nextId++);
    } catch { /* skip */ }
  }
}
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;

const w = 4200, h = 1200, n = w * h;

// FNV-1a(探针同式:x 主序 u16 LE 字节流)
function fnv1a(bytes: Uint8Array): string {
  let v = 0x811c9dc5 | 0;
  for (let i = 0; i < bytes.length; i++) { v ^= bytes[i]; v = Math.imul(v, 0x01000193) | 0; }
  return (v >>> 0).toString(16).padStart(8, '0');
}

// genprobe.log PASS 行解析(name → {idx, tf, wf, dN})
function parsePassLog() {
  const txt = readFileSync(`${LOGS}/genprobe.log`, 'utf8');
  const map = new Map<string, { idx: number; tf: string; wf: string; dN: number }>();
  for (const line of txt.split('\n')) {
    if (!line.startsWith('PASS\t')) continue;
    const f = line.split('\t');
    const spy = f[6] ?? '';
    const dN = Number(/dN=(\d+)/.exec(spy)?.[1] ?? 0);
    map.set(f[2], { idx: Number(f[1]), tf: f[3], wf: f[4], dN });
  }
  return map;
}

function loadSnapRaw(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  return { name: f, buf: gunzipSync(readFileSync(`${LOGS}/${f}`)) };
}
function snapFNVs(buf: Uint8Array) {
  const tb = Buffer.alloc(n * 2), wb = Buffer.alloc(n * 2);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4, ti = (x * h + y) * 2;
    tb[ti] = buf[o]; tb[ti + 1] = buf[o + 1];
    wb[ti] = buf[o + 2]; wb[ti + 1] = buf[o + 3];
  }
  return { tf: fnv1a(tb), wf: fnv1a(wb) };
}

// 边界锁定:PASS 行 tf/wf ↔ 快照 FNV 双向匹配(fail-loud)
const passLog = parsePassLog();
const IN = passLog.get('Muds Walls In Jungle');
const OUT = passLog.get('Vernal Pass');
if (!IN || !OUT) throw new Error('genprobe.log 缺 PASS 102/103 行(探针重跑?)');
console.log(`[lock] PASS${IN.idx} Muds Walls In Jungle tf=${IN.tf} wf=${IN.wf} | PASS${OUT.idx} Vernal Pass tf=${OUT.tf} wf=${OUT.wf} dN=${OUT.dN}`);
const preRaw = loadSnapRaw('pre-Muds_Walls_In_Jungle');
const postRaw = loadSnapRaw('post-Vernal_Pass');
for (const [tag, raw, want] of [['输入', preRaw, IN], ['输出', postRaw, OUT]] as const) {
  const got = snapFNVs(raw.buf);
  const ok = got.tf === want.tf && got.wf === want.wf;
  console.log(`[lock] ${tag}=${raw.name} tf=${got.tf} wf=${got.wf} ${ok ? '✓锁定' : `✗不匹配(期望 ${want.tf}/${want.wf})`}`);
  if (!ok) throw new Error('边界 FNV 对账失败:' + tag);
}

function loadSnap(buf: Uint8Array) {
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall };
}
const pre = loadSnap(preRaw.buf);
const post = loadSnap(postRaw.buf);

// C# id→本仓内部 id
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
class BER { off = 0; b: Uint8Array; constructor(b: Uint8Array) { this.b = b; } u8() { return this.b[this.off++]; } i16() { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; } i32() { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; } bytes(n2: number) { const s = this.b.subarray(this.off, this.off + n2); this.off += n2; return s; } str() { const n2 = this.i16(); return Buffer.from(this.bytes(n2)).toString('utf8'); } }
function payload(id: number, r: BER): unknown {
  switch (id) {
    case 1: return r.u8(); case 2: return r.i16(); case 3: return r.i32();
    case 4: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 5: { const v = r.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
    case 6: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 11: { const n2 = r.i32(); const o: number[] = []; for (let i = 0; i < n2; i++) o.push(r.i32()); return o; }
    case 7: return r.bytes(r.i32()); case 8: return r.str();
    case 9: { const e = r.u8(), n2 = r.i32(); const o: unknown[] = []; for (let i = 0; i < n2; i++) o.push(payload(e, r)); return o; }
    case 10: { const t: Array<{ t: number; name: string; v: unknown }> = []; for (;;) { if (r.off >= r.b.length) break; const id2 = r.u8(); if (id2 === 0) break; const nm = r.str(); t.push({ t: id2, name: nm, v: payload(id2, r) }); } return t; }
    default: throw new Error('pid ' + id);
  }
}
const MOD_ID_TO_NAME = new Map<number, number>();
{
  const twld = gunzipSync(readFileSync(`${root}/mods/calamity/golden-oracle/golden-calamity.twld`));
  const r = new BER(twld);
  r.u8(); r.str();
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  const ourByKey = (nm: string): number | undefined => {
    const s1 = nm.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    for (const s of [s1, s1.replace(/([a-z])(\d)/g, '$1_$2')]) {
      const id = TILE_BY_KEY[`mod_calamity_${s}`];
      if (id !== undefined) return id;
    }
    return undefined;
  };
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const our = ourByKey(String(get('name')));
    if (our !== undefined) MOD_ID_TO_NAME.set(Number(get('value')), our);
  }
  console.log('[replay] mod 名映射', MOD_ID_TO_NAME.size);
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => (TILE_DEFS[id] as { key?: string } | undefined)?.key ?? `#${id}`;

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

// 蓝图绑定(loader.ts schematics/*.json 同式)
{
  const sch = JSON.parse(readFileSync(`${root}/mods/calamity/schematics/VernalPass.json`, 'utf8'));
  (globalThis as Record<string, unknown>).__calamitySchematics = { VernalPass: sch };
}

// pass fn 提取(setupGenMisc stub 捕获)
let passFn: ((...a: unknown[]) => void) | null = null;
{
  const mod = await import('../mods/calamity/src/gen-misc.ts');
  const stub = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
        if (name === 'Vernal Pass') passFn = fn;
      };
      if (prop === 'log') return (...a: unknown[]) => console.log('[gen-misc]', ...a);
      return () => {};
    },
    has: () => true,
  });
  (mod as { setupGenMisc(sw: unknown): void }).setupGenMisc(stub);
  if (!passFn) throw new Error('Vernal Pass 未注册');
}
console.log('[replay] pass fn 就绪');

// 神庙界带 = 真链 GenVars.t* 定谳常量(CustomTemple.cs:297-325 语义=room 极端值±10):
//   tBottom=788:ppy=tBottom+150=938(扫描最优,SW_SCAN 实证;NoTempleNearby 首查即真=
//   无走位,ppy 无掷可反解)。
//   tRight=1144:ppx=1125=tLeft+floor(u0×(tRight-tLeft))(首掷 u0=fresh RNG(seed) 首样,
//   扫描最优);tLeft=853=砖 bbox 左(863)−10(C# 语义直推;左壁=房间矩形左缘)。
//   tTop=576=砖 bbox 上(586)−10(仅进 `tTop<maxTilesX/2` 方向门,恒真,不敏感)。
//   右/下与砖 bbox 差 +5/+10 不齐 = room 极端值含神庙入口/门厅结构(快照不可直推,
//   以真链落位反解为准;判卷夹具常量,域=CustomTemple 输出,非 Vernal 段参数)。
//   ★快照 lihzahrd 砖只扫 C# id 226(混入本仓 internal id 比对=撞车,_replay-sunken 同坑)。
const tb = (() => {
  let l = 1e9, r = -1, t = 1e9, b = -1;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    if (pre.type[y * w + x] === 226) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  const tLeft = Number(process.env.SW_TL ?? 853), tRight = Number(process.env.SW_TR ?? 1144);
  const tTop = Number(process.env.SW_TT ?? 576), tBottom = Number(process.env.SW_TB ?? 788);
  console.log(`[replay] 神庙砖 bbox x[${l},${r}] y[${t},${b}](参照);t*=[${tLeft},${tRight}]×[${tTop},${tBottom}] initY=tBottom+150=${tBottom + 150}`);
  return { tLeft, tRight, tTop, tBottom, brick: { l, r, t, b } };
})();

const store = buildStore(pre);
const gs = {
  seed: translateSeed('9293480'),
  worldSurface: 337, worldSurfaceLow: 246, rockLevel: 535, lavaLine: h - 200, waterLine: 330,
  crimson: false, dungeonX: 3421, dungeonSide: 1 as const,
  dungeonMinX: 0, dungeonMaxX: 4200, dungeonMaxY: 207,
  jungleX: 0, snowOriginLeft: 0, snowOriginRight: 0,
  tLeft: tb.tLeft, tRight: tb.tRight, tTop: tb.tTop, tBottom: tb.tBottom, tRooms: 0,
  undergroundDesert: { x0: 1638, y0: 300, x1: 1978, y1: 1000 },
  shimmerX: -1, shimmerY: -1, larvaX: [] as number[], larvaY: [] as number[],
  oreTiers: { copper: 7, iron: 6, silver: 9, gold: 8 },
  genW: w, genH: h,
  protectedRects: [] as Array<{ x0: number; y0: number; x1: number; y1: number; pad: number }>,
  seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {} as Record<string, number>,
    wallIdByKey: {} as Record<string, number>,
    chests: [] as unknown[],
  },
};

// RNG=fresh(流语义定谳=每 pass 重播种)+ 掷数计数(对拍真链 SPY dN)
const rng = new RNG(gs.seed as number);
let drawCount = 0;
const METH: Record<string, number> = {};
const firstDraws: number[] = [];
{
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(rng))) {
    const fn = proto[m];
    if (typeof fn === 'function' && /^(next|int|intRange|nextBool|nextFloat|nextDouble|range)/i.test(m)) {
      proto[m] = function (this: unknown, ...a: unknown[]) {
        drawCount++;
        METH[m] = (METH[m] ?? 0) + 1;
        const v = fn.apply(this, a);
        if (firstDraws.length < 8) firstDraws.push(typeof v === 'number' ? Number(v.toFixed(6)) : -1);
        return v;
      };
    }
  }
}
(passFn as unknown as (...a: unknown[]) => void)(store, rng, gs);
// 存档域归一(★652 同式):post 快照=已保存世界视图
for (let i = 0; i < n; i++) { if (!(store.flags[i] & 1) && store.type[i] !== 0) store.type[i] = 0; }

// 落位 2D 扫描(SW_SCAN=1):ppx/ppy 候选域逐个重跑,取 diff 最小者定谳
if (process.env.SW_SCAN === '1') {
  const mkGs = (ppx: number, ppy: number) => ({
    ...gs, tLeft: ppx, tRight: ppx + 1, tBottom: ppy - 150, tTop: ppy - 150 - 10,
    protectedRects: [] as typeof gs.protectedRects, mods: { ...gs.mods, chests: [] as unknown[] },
  });
  const trial = (ppx: number, ppy: number) => {
    const st = buildStore(pre);
    const rg = new RNG(gs.seed as number);
    const g2 = mkGs(ppx, ppy);
    (passFn as unknown as (...a: unknown[]) => void)(st, rg, g2);
    for (let i = 0; i < n; i++) { if (!(st.flags[i] & 1) && st.type[i] !== 0) st.type[i] = 0; }
    let d = 0;
    for (let i = 0; i < n; i++) if (st.type[i] !== CS_TO_OURS(post.type[i])) d++;
    return d;
  };
  const X0 = Number(process.env.SW_PPX0 ?? 1120), X1 = Number(process.env.SW_PPX1 ?? 1141);
  const Y0 = Number(process.env.SW_PPY0 ?? 928), Y1 = Number(process.env.SW_PPY1 ?? 951);
  let best = { d: -1, ppx: 0, ppy: 0 };
  const grid: string[] = [];
  for (let ppy = Y0; ppy < Y1; ppy++) {
    let row = '';
    for (let ppx = X0; ppx < X1; ppx++) {
      const d = trial(ppx, ppy);
      row += d.toString(16).padStart(3, ' ').slice(-3) + ' ';
      if (best.d < 0 || d < best.d) best = { d, ppx, ppy };
    }
    grid.push(`ppy=${ppy}: ${row}`);
  }
  console.log(`[scan] 落位扫描 ppx∈[${X0},${X1}) ppy∈[${Y0},${Y1}):\n` + grid.join('\n'));
  console.log(`[scan] 最优 ppx=${best.ppx} ppy=${best.ppy} diff=${best.d} (ox=${best.ppx - 138} oy=${best.ppy - 104})`);
  process.exit(0);
}

// 我方落位自报:t*→ppy=tBottom+150(上界守卫即真)、ppx=首掷
const u0 = firstDraws[0] ?? -1;
const ppxOurs = tb.tLeft + Math.floor((firstDraws[0] ?? 0) * (tb.tRight - tb.tLeft));
const ppyOurs = tb.tBottom + 150;
console.log(`[replay] 我方落位: 首掷=${u0} ppx≈${ppxOurs} ppy=${ppyOurs} → ox=${ppxOurs - 138} oy=${ppyOurs - 104}(Center, sch 276×208)`);
console.log(`[replay] 掷数=${drawCount}(真链 SPY dN=${OUT.dN}, Δ=${drawCount - OUT.dN}) 方法直方: ${Object.entries(METH).map(([m, c]) => `${m}:${c}`).join(' ') || '-'} 首掷序列=[${firstDraws.join(', ')}]`);

// 逐格 diff(类型域)
let diff = 0, modDiff = 0;
const diffByType = new Map<string, number>();
const firstDiffs: string[] = [];
const isMod = (id: number) => id >= 1030;
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  if (store.type[i] !== realT) {
    diff++;
    if (isMod(store.type[i]) || isMod(realT)) modDiff++;
    const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    const x = i % w, y = Math.floor(i / w);
    if (firstDiffs.length < 6) firstDiffs.push(`(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`);
  }
}
console.log(`[replay] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(3)}%) mod 差格=${modDiff} 首差: ${firstDiffs.join(' | ')}`);
const rowsT = [...diffByType.entries()].sort((a, b) => b[1] - a[1]);
console.log('[replay] diff 分类型 TOP20:');
for (const [k, c] of rowsT.slice(0, 20)) console.log(`  ${k}: ${c}`);
// 残差全列(diff≤64 时):pre 上下文供逐格定谳
if (diff > 0 && diff <= 64) {
  console.log('[replay] 残差全列(格 我 真 pre):');
  for (let i = 0; i < n; i++) {
    const realT = CS_TO_OURS(post.type[i]);
    if (store.type[i] !== realT) {
      const x = i % w, y = Math.floor(i / w);
      console.log(`  (${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)} pre=${KEY_OF(CS_TO_OURS(pre.type[i]))}`);
    }
  }
}

// 墙域 diff(蓝图 modWalls=['_'] keepWall;vanilla 墙直写应全等)
let wallDiff = 0;
const wallByType = new Map<string, number>();
for (let i = 0; i < n; i++) {
  if (store.wall[i] !== post.wall[i]) {
    wallDiff++;
    const key = `${store.wall[i]}→${post.wall[i]}`;
    wallByType.set(key, (wallByType.get(key) ?? 0) + 1);
  }
}
console.log(`[replay] 墙 diff=${wallDiff} TOP8: ${[...wallByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => `${k}:${c}`).join(' ') || '-'}`);

// 变化域行/列分布(真实 bbox x[989,1263] y[832,1044] 外扩)
{
  const X0 = 980, X1 = 1280, Y0 = 820, Y1 = 1060;
  const perRow = new Map<number, number>(), perCol = new Map<number, number>();
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    if (store.type[y * w + x] !== CS_TO_OURS(post.type[y * w + x])) {
      perRow.set(y, (perRow.get(y) ?? 0) + 1);
      perCol.set(x, (perCol.get(x) ?? 0) + 1);
    }
  }
  const band = (m: Map<number, number>, size: number) => {
    const out: string[] = [];
    let s = -1, c = 0, start = -1;
    for (const [k, v] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
      if (s < 0) { s = k; start = k; c = v; continue; }
      if (k - s <= size) { c += v; s = k; continue; }
      out.push(`${start}-${s}:${c}`); s = k; start = k; c = v;
    }
    if (s >= 0) out.push(`${start}-${s}:${c}`);
    return out.join(' ');
  };
  console.log('[replay] 行差带(y:count): ' + band(perRow, 8));
  console.log('[replay] 列差带(x:count): ' + band(perCol, 8));
}

// ASCII 对照窗(左=我 右=真)
{
  const CLS = (t: number): string => {
    const k = KEY_OF(t);
    if (k.endsWith('vernal_soil')) return 'V';
    if (k.endsWith('mud')) return 'm';
    if (k.endsWith('jungle_grass') || k.endsWith('grass')) return 'g';
    if (t === 0) return ' ';
    return '#';
  };
  const lines: string[] = [];
  for (let y = 840; y < 1040; y += 4) {
    let row = '';
    for (let x = 1000; x < 1240; x += 2) row += CLS(store.type[y * w + x]);
    row += ' | ';
    for (let x = 1000; x < 1240; x += 2) row += CLS(CS_TO_OURS(post.type[y * w + x]));
    lines.push(row);
  }
  console.log('[win] 我|真 (x1000-1240 step2, y840-1040 step4, V=vernal_soil):\n' + lines.join('\n'));
}

// mod 族双侧聚合(全图)
const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const oursC = cnt(store.type), realC = cnt(Array.from(post.type, CS_TO_OURS));
console.log('[replay] mod 族 我 vs 真(全图):');
const modKeys = [...new Set([...oursC.keys(), ...realC.keys()])].filter((k) => k.startsWith('mod_')).sort();
for (const k of modKeys) {
  const a = oursC.get(k) ?? 0, b = realC.get(k) ?? 0;
  if (a > 0 || b > 0) console.log(`  ${k.replace('mod_calamity_', '')}: ${a} vs ${b}${a !== b ? '  ←Δ' + (b - a) : ''}`);
}
// 真实增量(快照 pre→post 差,族级;C# id 域→key)
{
  const delta = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (pre.type[i] !== post.type[i]) {
      delta.set(KEY_OF(CS_TO_OURS(post.type[i])), (delta.get(KEY_OF(CS_TO_OURS(post.type[i]))) ?? 0) + 1);
      delta.set(KEY_OF(CS_TO_OURS(pre.type[i])), (delta.get(KEY_OF(CS_TO_OURS(pre.type[i]))) ?? 0) - 1);
    }
  }
  const rows = [...delta.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  console.log('[replay] 真实增量(快照差 TOP14): ' + rows.slice(0, 14).map(([k, v]) => `${k.replace('mod_calamity_', 'M:')}:${v > 0 ? '+' : ''}${v}`).join(' '));
}
process.exit(0);
