// IIII99b：JS 逐槽快照(_iii108cap) × G2 x86 dump 对拍（vitest 一次性诊断，跳过缺省）。
// A) 全图四通道(act/type/wall/liq)计数 + 首差；B) 指定窗口(KEG/STALAC 两残余域)逐格明细。
// 用法：SW_I08CMP=1 npx vitest run tools/_iii108cmp.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I08CMP === '1';
const JS = process.env.SW_I08_JS ?? '/tmp/iii108-out/js';
const G2 = process.env.SW_I08_G2 ?? `${process.env.HOME}/GoldenChains/golden-toadstool`;
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p).buffer ?? readFileSync(p));
// 槽名→x86 pass 名（_mile8 SLOT_END 中段+尾段抄表；dump 序号由名表现场反查）
const SLOT2NAME = new Map<number, string>([
  [31,'地表装饰'],[32,'矿骨堆'],[33,'出生点'],[34,'草墙'],[35,'起始镇民'],[36,'向日葵'],
  [37,'栽树'],[38,'炼金草药'],[39,'染料植物'],[40,'蛛网蜂巢'],[41,'地表植物'],[42,'丛林植物P2'],
  [43,'藤蔓'],[44,'地表花'],[45,'地表蘑菇'],[46,'宝石系统'],[47,'长苔藓'],[48,'丛林墙'],
  [49,'蜂巢幼虫'],[50,'微群系'],[51,'二次沉降'],[52,'仙人掌珊瑚'],[53,'瓦片清理'],[54,'蜥蜴祭坛'],
  [55,'水生植物'],[56,'钟乳石宝石树'],[57,'断线陷阱清理'],[58,'终清理'],
]);
const CN2XNAME = new Map<string,string>([
  ['矿骨堆','Piles'],['出生点','Spawn_Point'],['草墙','Grass_Wall'],['起始镇民','Guide'],
  ['向日葵','Sunflowers'],['栽树','Planting_Trees'],['炼金草药','Herbs'],['染料植物','Dye_Plants'],
  ['蛛网蜂巢','Webs_And_Honey'],['地表植物','Glowing_Mushrooms_and_Jungle_Plants'],
  ['丛林植物P2','Jungle_Plants'],['藤蔓','Vines'],['地表花','Flowers'],['地表蘑菇','Mushrooms'],
  ['宝石系统','Random_Gems'],['长苔藓','Moss_Grass'],['丛林墙','Muds_Walls_In_Jungle'],
  ['蜂巢幼虫','Larva'],['微群系','Micro_Biomes'],['二次沉降','Settle_Liquids_Again'],
  ['仙人掌珊瑚','Cactus__Palm_Trees____Coral'],['瓦片清理','Tile_Cleanup'],['蜥蜴祭坛','Lihzahrd_Altars'],
  ['水生植物','Water_Plants'],['钟乳石宝石树','Stalac'],['断线陷阱清理','Remove_Broken_Traps'],
  ['终清理','Final_Cleanup'],
]);
const dumpNames: Record<number, string> = {};
for (const f of readdirSync(G2)) { const m = f.match(/^(\d{3})_(.+)\.typ$/); if (m) dumpNames[Number(m[1])] = m[2]!; }
const vT = (tid: number): string => (SHEET[tid] >= 0 ? String(SHEET[tid]) : '?');

(RUN ? it : it.skip)('III99b js-slot × x86-dump four-channel diff', () => {
  const slots = readdirSync(JS).filter((f) => /^s\d\d_flags\.bin$/.test(f)).map((f) => Number(f.slice(1, 3))).sort();
  const NAME2IDX = new Map<string, number>();
  for (const f of readdirSync(G2)) { const m = f.match(/^(\d{3})_(.+)\.typ$/); if (m) NAME2IDX.set(m[2]!, Number(m[1])); }
  const dumpIdxOf = (sl: number): number => {
    const cn = SLOT2NAME.get(sl);
    const xn = cn ? CN2XNAME.get(cn) : undefined;
    return xn !== undefined && NAME2IDX.has(xn) ? NAME2IDX.get(xn)! : sl - 50 + 97;
  };
  const winDefs: Array<[string, number, number, number, number]> = [
    ['keg', 2680, 2745, 880, 930],
    ['stalac', 2700, 2730, 700, 1080],
  ];
  const loadJ = (s: number) => ({
    a: u8(`${JS}/s${String(s).padStart(2, '0')}_flags.bin`),
    t: le16(`${JS}/s${String(s).padStart(2, '0')}_type.bin`),
    fx: le16(`${JS}/s${String(s).padStart(2, '0')}_frameX.bin`),
    fy: le16(`${JS}/s${String(s).padStart(2, '0')}_frameY.bin`),
    w: le16(`${JS}/s${String(s).padStart(2, '0')}_wall.bin`),
    l: u8(`${JS}/s${String(s).padStart(2, '0')}_liquid.bin`),
  });
  const loadX = (xi: number) => {
    const nm = dumpNames[xi];
    if (!nm) return null;
    const p = `${G2}/${String(xi).padStart(3, '0')}_${nm}`;
    return { nm, a: u8(`${p}.act`), t: le16(`${p}.typ`), w: le16(`${p}.wal`), l: u8(`${p}.liq`) };
  };
  for (const s of slots) {
    const xi = dumpIdxOf(s);
    const X = loadX(xi);
    if (!X) { console.log(`s${s}: (no dump)`); continue; }
    const J = loadJ(s);
    let n = 0; const firsts: string[] = [];
    const jT = (i: number): string => ((SHEET[J.t[i]] >= 0 ? String(SHEET[J.t[i]]) : '?') );
    for (let i = 0; i < W * H; i++) {
      const ja = J.a[i] & 1, xa = X.a[i];
      if (xa !== ja || (ja && X.t[i] !== SHEET[J.t[i]]) || J.w[i] !== X.w[i] || J.l[i] !== X.l[i]) {
        n++;
        if (firsts.length < 10) {
          const x = i % W, y = Math.floor(i / W);
          firsts.push(`(${x},${y}) j=${ja ? `t${vT(J.t[i])}f${J.fx[i]},${J.fy[i]}` : '·'}/l${J.l[i]} x=${xa ? `t${X.t[i]}` : '·'}/l${X.l[i]}${J.w[i] !== X.w[i] ? ` w${X.w[i]}>${J.w[i]}` : ''}`);
        }
      }
    }
    console.log(`s${String(s)} vs #${xi}_${X.nm}: ${n} 处四通道差${n ? '\n   ' + firsts.join('\n   ') : ''}`);
  }
  console.log('--- 窗口明细 ---');
  const sPair = ['51'];
  for (const s of slots.map(String)) {
    void sPair;
    const xi = dumpIdxOf(Number(s));
    const X = loadX(xi), J = loadJ(Number(s));
    if (!X) continue;
    for (const [tag, x0, x1, y0, y1] of winDefs) {
      const cells: string[] = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const ja = J.a[i] & 1, xa = X.a[i];
        if (xa !== ja || (ja && X.t[i] !== SHEET[J.t[i]]) || J.w[i] !== X.w[i] || J.l[i] !== X.l[i]) {
          cells.push(`(${x},${y}) j=${ja ? `t${vT(J.t[i])}f${J.fx[i]},${J.fy[i]}` : '·'}/${J.l[i]} x=${xa ? `t${X.t[i]}` : '·'}/${X.l[i]}`);
        }
      }
      if (cells.length) console.log(`[s${s}·${tag}] ${cells.length}:\n   ${cells.slice(0, 60).join('\n   ')}`);
    }
  }
}, 300_000);
