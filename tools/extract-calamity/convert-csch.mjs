// ★一百二十九刀:.csch → content/schematics/*.json(TML144 4 字节索引面)
//  流:magic(4)|gzip|→ u32 nModTileNames/7-bit-str*/u32 nModWalls/str*/u32 nUnique/
//  {u16 tile,u16 wall,u8 liq,u8 ltype,i16 fx,i16 fy,u32 wire,u8 bi}*/u16 w,u16 h/
//  u32 索引阵(y 外层 x 内层)。引擎放置=tile/wall≥Count 走名表,fx/fy 帧真值。
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../../CalamityModPublic/Schematics');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../mods/calamity/schematics');   // content/ 外=key 校验闸豁免(非声明内容)
mkdirSync(OUT, { recursive: true });

const parse = (buf) => {
  const fmt144 = buf[1] === 0xca;   // 0x14=TML14(2 字节索引+无 brightness);0xca=1.4.4
  const g = gunzipSync(buf.subarray(4));
  let off = 0;
  const u16 = () => g.readUInt16LE((off += 2) - 2);
  const u32 = () => g.readUInt32LE((off += 4) - 4);
  const i16 = () => g.readInt16LE((off += 2) - 2);
  const lenU = fmt144 ? u32 : u16;
  const str = () => {
    let len = 0, shift = 0, b;
    do { b = g[off++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const s = g.toString('utf8', off, off + len); off += len; return s;
  };
  const nModTiles = lenU();
  const modTiles = Array.from({ length: nModTiles }, str);
  const nModWalls = lenU();
  const modWalls = Array.from({ length: nModWalls }, str);
  const nUnique = lenU();
  const unique = [];
  for (let i = 0; i < nUnique; i++) {
    unique.push({
      t: u16(), w: u16(), lq: g[off++], lt: g[off++],
      fx: i16(), fy: i16(), wire: g.readUInt32LE((off += 4) - 4), ...(fmt144 ? { bi: g[off++] } : {}),
    });
  }
  const tw = u16(), th = u16();
  const readIdx = fmt144 ? u32 : u16;
  const cells = new Uint32Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) cells[y * tw + x] = readIdx();
  if (off !== g.length) throw new Error(`流尾不对齐 ${off}/${g.length}`);
  return { modTiles, modWalls, unique, tw, th, cells };
};

let n = 0;
for (const f of readdirSync(SRC).filter((f) => f.endsWith('.csch'))) {
  try {
    const d = parse(readFileSync(join(SRC, f)));
    // unique 去空压缩:仅发出被引用的 unique 定义,索引重映射
    const used = new Map();
    const remap = new Uint32Array(d.unique.length);
    const kept = [];
    for (const idx of d.cells) {
      if (!used.has(idx)) { used.set(idx, kept.length); kept.push(d.unique[idx]); }
      remap[0] = remap[0];   // 占位(下轮双遍填充)
    }
    // 双遍:第二遍产重映射 cells
    const cells = new Uint32Array(d.cells.length);
    for (let i = 0; i < d.cells.length; i++) cells[i] = used.get(d.cells[i]);
    const uni = kept.map((u) => [u.t, u.w, u.lq, u.lt, u.fx, u.fy, u.wire, u.bi]);
    const key = basename(f, '.csch');
    writeFileSync(join(OUT, `${key}.json`), JSON.stringify({
      key, w: d.tw, h: d.th,
      modTiles: d.modTiles, modWalls: d.modWalls,
      unique: uni, cells: [...cells],
    }));
    n++;
  } catch (e) { console.log('SKIP', f, e.message); }
}
console.log('converted:', n);
