// ★IIIII44（2026-08-29）一次性对拍仪：skyblock 加型链 mile8 八通道逐槽对拍。
// 真值链 G2 = /tmp/iii46-out/x86-skyblock（rig /tmp/iii40-rig.app，serverconfig
// seed_skyblock=1，seed=20260829 evil=1 autocreate=1 小图；JJHook 107 槽全通道 dump，
// pc.txt 见目录）。x86 链实证：Terrain 全跑(掷 5.29M) → Skyblock(35.3k) → Dunes 头部
// 五掷+门跳 → 各槽零消耗冻结 → SmoothWorld(4.83M!) 与 Speleothems(8.97M) 无门照跑
// → FinalCleanup(7)+FinalizeSecretSeeds(-4 探针 5998)。
// 用法：cd game && SW_I46=1 npx vitest run tools/_i46.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

process.env.SW_MB_1457 ||= '1';                          // 认证链基准=1457 执行序

const RUN = process.env.SW_I46 === '1';
const G2 = process.env.SW_I46_G2 ?? '/tmp/iii46-out/x86-skyblock';
const SEED = process.env.SW_I46_SEED ?? '20260829';
const EVIL = Number(process.env.SW_I46_EVIL ?? 1);
const W = Number(process.env.SW_I46_W ?? 4200), H = Number(process.env.SW_I46_H ?? 1200);
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** JS 槽名 → {d: dump idx, nm: 期望 x86 槽名}。锚点完整性注释见各后续批。 */
const SLOT_END = new Map<string, { d: number; nm: string }>([
  ['原版地形', { d: 0, nm: 'Terrain' }],
  ['空岛', { d: 1, nm: 'Skyblock' }],
  ['沙丘', { d: 2, nm: 'Dunes' }],
  ['洞穴', { d: 15, nm: 'Wavy Caves' }],
  ['生物群系', { d: 35, nm: 'Gems' }],
  ['引力沙', { d: 37, nm: 'Create Ocean Caves' }],
  ['微光', { d: 38, nm: 'Shimmer' }],
  ['清理', { d: 39, nm: 'Clean Up Dirt' }],
  ['结构', { d: 48, nm: 'Jungle Chests' }],
  ['水体沉降', { d: 49, nm: 'Settle Liquids' }],
  ['沙上清水', { d: 50, nm: 'Remove Water From Sand' }],
  ['绿洲', { d: 51, nm: 'Oasis' }],
  ['海滩装饰', { d: 52, nm: 'Shell Piles' }],
  ['半砖平滑', { d: 53, nm: 'Smooth World' }],
  ['瀑布唇缘', { d: 54, nm: 'Waterfalls' }],
  ['薄冰', { d: 55, nm: 'Ice' }],
  ['洞穴墙变体', { d: 56, nm: 'Wall Variety' }],
  ['生命水晶', { d: 57, nm: 'Life Crystals' }],
  ['雕像宝箱', { d: 63, nm: 'Spider Caves' }],
  ['宝石洞', { d: 64, nm: 'Gem Caves' }],
  ['苔藓', { d: 65, nm: 'Moss' }],
  ['神庙陈设', { d: 66, nm: 'Temple' }],
  ['洞穴墙', { d: 67, nm: 'Cave Walls' }],
  ['地下丛林树', { d: 68, nm: 'Jungle Trees' }],
  ['浮空岛屋', { d: 69, nm: 'Floating Island Houses' }],
  ['快清理', { d: 70, nm: 'Quick Cleanup' }],
  ['瓦罐', { d: 71, nm: 'Pots' }],
  ['地狱熔炉', { d: 72, nm: 'Hellforge' }],
  ['表面', { d: 73, nm: 'Spreading Grass' }],
  ['地表矿石', { d: 74, nm: 'Surface Ore and Stone' }],
  ['倒木水景', { d: 75, nm: 'Place Fallen Log' }],
  ['地表装饰', { d: 76, nm: 'Traps' }],
  ['矿骨堆', { d: 77, nm: 'Piles' }],
  ['出生点', { d: 78, nm: 'Spawn Point' }],
  ['草墙', { d: 79, nm: 'Grass Wall' }],
  ['起始镇民', { d: 80, nm: 'Guide' }],
  ['向日葵', { d: 81, nm: 'Sunflowers' }],
  ['栽树', { d: 82, nm: 'Planting Trees' }],
  ['炼金草药', { d: 83, nm: 'Herbs' }],
  ['染料植物', { d: 84, nm: 'Dye Plants' }],
  ['蛛网蜂巢', { d: 85, nm: 'Webs And Honey' }],
  ['地表植物', { d: 87, nm: 'Glowing Mushrooms and Jungle Plants' }],
  ['丛林植物P2', { d: 88, nm: 'Jungle Plants' }],
  ['藤蔓', { d: 89, nm: 'Vines' }],
  ['地表花', { d: 90, nm: 'Flowers' }],
  ['地表蘑菇', { d: 91, nm: 'Mushrooms' }],
  ['宝石系统', { d: 93, nm: 'Random Gems' }],
  ['长苔藓', { d: 94, nm: 'Moss Grass' }],
  ['丛林墙', { d: 95, nm: 'Muds Walls In Jungle' }],
  ['蜂巢幼虫', { d: 96, nm: 'Larva' }],
  ['微群系', { d: 97, nm: 'Micro Biomes' }],
  ['二次沉降', { d: 98, nm: 'Settle Liquids Again' }],
  ['仙人掌珊瑚', { d: 99, nm: 'Cactus, Palm Trees, & Coral' }],
  ['瓦片清理', { d: 100, nm: 'Tile Cleanup' }],
  ['蜥蜴祭坛', { d: 101, nm: 'Lihzahrd Altars' }],
  ['水生植物', { d: 102, nm: 'Water Plants' }],
  ['钟乳石宝石树', { d: 103, nm: 'Stalac' }],
  ['断线陷阱清理', { d: 104, nm: 'Remove Broken Traps' }],
  ['终清理', { d: 105, nm: 'Final Cleanup' }],
]);

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
const CHAN_FILES = ['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const;

function loadChans(d: number, nm: string): Ch | null {
  // JJHook 落盘把空格与非字母数字统一替换为 '_'（见 099_Cactus__Palm_Trees____Coral）
  const pre = `${G2}/${String(d).padStart(3, '0')}_${nm.replaceAll(' ', '_').replace(/[^\w_]/g, '_')}`;
  if (!existsSync(`${pre}.typ`)) return null;
  const miss = CHAN_FILES.filter((c) => !existsSync(`${pre}.${c}`));
  if (miss.length > 0) throw new Error(`假绿免疫: ${pre} 缺通道 [${miss}]`);
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
}

interface Row { d: number; tag: string; A: number; T: number; W: number; L: number; Hf: number; Sl: number; Lt: number; Ia: number; first: string; pairs: Array<[string, number]> }

function cmp(tag: string, d: number, c: Ch | null, st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}): Row {
  const r: Row = { d, tag, A: 0, T: 0, W: 0, L: 0, Hf: 0, Sl: 0, Lt: 0, Ia: 0, first: '', pairs: [] };
  if (!c) { r.first = '(no dump)'; return r; }
  const pair = new Map<string, number>();
  let firstI = -1;
  const bump = (k: string, i: number) => { pair.set(k, (pair.get(k) ?? 0) + 1); if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.A++; bump(`A${va}>${ja}`, i); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { r.T++; bump(`T${vt}>${jt}`, i); }
    if (c.w[i]! !== st.wall[i]!) { r.W++; bump(`W${c.w[i]}>${st.wall[i]}`, i); }
    if (c.l[i]! !== st.liquid[i]!) { r.L++; bump(`L${c.l[i]}>${st.liquid[i]}`, i); }
    if (c.hf[i]! !== st.half[i]!) { r.Hf++; bump(`H${c.hf[i]}>${st.half[i]}`, i); }
    if (c.sl[i]! !== st.slope[i]!) { r.Sl++; bump(`S${c.sl[i]}>${st.slope[i]}`, i); }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.Lt++; bump(`Y${vl}>${jl}`, i); }
    const via = c.ia[i]! ? 1 : 0;
    if (via !== ((st.wire[i]! >>> 5) & 1)) { r.Ia++; }
  }
  r.first = firstI >= 0 ? `(${firstI % W},${Math.floor(firstI / W)})` : '';
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return r;
}

(RUN ? it : it.skip)('IIIII44 skyblock 链 mile8 八通道逐槽对拍', async () => {
  // ★掷流标定（SW_I46_TAG=1）：空岛槽内 internalSample 全量写 js-tags-1.txt
  let tagArm = false, tagLn = 0; const tagOut: string[] = [];
  const lnHolder = { v: 0 };
  const g = globalThis as { __swOnRoll?: (v: number, inst: unknown) => void };
  (globalThis as never as { __swI46Ln?: { v: number } }).__swI46Ln = lnHolder;
  const prevOnRoll = g.__swOnRoll;
  if (process.env.SW_I46_TAG === '1') {
    g.__swOnRoll = (v: number) => {
      if (tagArm) { tagLn++; if (tagOut.length < 2000000) tagOut.push(tagLn + '|' + v); }
      lnHolder.v = tagLn;
      prevOnRoll?.(v, null);
    };
  }
  const lnRef = { v: 0 };
  const files = readdirSync(G2);
  if (files.filter((f) => f.endsWith('.typ')).length < 100) {
    throw new Error(`真值不完整: ${G2} 仅 ${files.filter((f) => f.endsWith('.typ')).length} 槽 typ`);
  }
  const t0 = Date.now();
  const seen = new Set<number>();
  const rows: Row[] = [];
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: { skyblock: true },
    onWorldPartial: (w, _i, pn) => {
      if (process.env.SW_I46_TAG === '1') {
        if (pn === '原版地形') tagArm = true;
        if (pn === '空岛') console.log('PHASES', JSON.stringify((globalThis as never as { __swI46Phase?: Record<string, number> }).__swI46Phase ?? {}));
        if (pn === '沙丘') {
          tagArm = false;
          writeFileSync('/tmp/iii46-out/js-tags-1.txt', tagOut.join('\n') + '\n');
          console.log(`tag lines=${tagLn}`);
        }
      }
      const ent = SLOT_END.get(pn);
      if (!ent || seen.has(ent.d)) return;
      seen.add(ent.d);
      const ch = loadChans(ent.d, ent.nm);
      // ★调试:SW_I46_DUMP=<槽idx列表> 时把 JS 对应槽末通道落盘(诊断用)
      {
        const want = (process.env.SW_I46_DUMP ?? '').split(',').map(Number).filter(Boolean);
        if (want.includes(ent.d)) {
          const stx = w.store as never as { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array };
          const pre = `/tmp/iii46-out/js-${String(ent.d).padStart(3, '0')}_${pn}`;
          { const b = Buffer.alloc(N * 2); for (let i = 0; i < N; i++) b.writeUInt16LE(SHEET[stx.type[i]!] >= 0 ? SHEET[stx.type[i]!]! : 9999, i * 2); writeFileSync(pre + '.typ', b); }
          { const b = Buffer.alloc(N); for (let i = 0; i < N; i++) b[i] = stx.flags[i]! & 1; writeFileSync(pre + '.act', b); }
          { const b = Buffer.alloc(N * 2); for (let i = 0; i < N; i++) b.writeUInt16LE(stx.wall[i]!, i * 2); writeFileSync(pre + '.wal', b); }
          { const b = Buffer.alloc(N); for (let i = 0; i < N; i++) b[i] = stx.liquid[i]!; writeFileSync(pre + '.liq', b); }
          { const b = Buffer.alloc(N); for (let i = 0; i < N; i++) b[i] = (stx as never as { half: Uint8Array }).half[i]!; writeFileSync(pre + '.half', b); }
        }
      }
      if (!ch) throw new Error(`无 dump: ${ent.d}_${ent.nm}`);
      rows.push(cmp(pn, ent.d, ch, w.store as never));
      if (seen.size === SLOT_END.size) return;
    },
  });
  rows.sort((a, b) => a.d - b.d);
  for (const r of rows) {
    const bad = r.A || r.T || r.W || r.L || r.Hf || r.Sl || r.Lt || r.Ia;
    console.log(
      `${String(r.d).padStart(3)} ${(SLOT_END.get(r.tag)?.nm ?? '?').padEnd(36)} ← ${r.tag.padEnd(10)} ` +
      `A=${String(r.A).padStart(6)} T=${String(r.T).padStart(6)} W=${String(r.W).padStart(5)} L=${String(r.L).padStart(5)} ` +
      `Hf=${String(r.Hf).padStart(4)} Sl=${String(r.Sl).padStart(4)} Lt=${String(r.Lt).padStart(4)} Ia=${String(r.Ia).padStart(3)} ` +
      `${bad ? '✗ ' + r.first : '✓'}${bad && r.pairs.length ? '  ' + r.pairs.map(([k, n]) => `${k}×${n}`).join(' ') : ''}`,
    );
  }
  const missing = [...SLOT_END.entries()].filter(([, e]) => !seen.has(e.d)).map(([k]) => k);
  console.log(`covered ${seen.size}/${SLOT_END.size}${missing.length ? ` 缺:${missing.join(',')}` : ''}`);
  const firstBad = rows.find((r) => r.A || r.T || r.W || r.L || r.Hf || r.Sl || r.Lt || r.Ia);
  console.log(`★ skyblock 首差边界: ${firstBad ? `#${firstBad.d} @${firstBad.tag} ${firstBad.first}` : '无（全绿）'}`);
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
