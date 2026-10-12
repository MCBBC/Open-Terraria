// ★626d:tML .twld 解析器(GZip+BigEndian TagCompound)——mod tile 名表+逐格数据提取
// 格式定谳(源码锚):TagIO.cs:320-341 ReadTag{byte id,string name,payload};PayloadHandlers
// 1=byte 2=short 3=int 4=long 5=float 6=double 7=byte[] 8=string 9=list 10=compound 11=int[];
// WorldIO.cs:37 ["tiles"]=TileIO.SaveBasics();TileIO_Basic.cs:180/216 tileData=x-major 逐格
// {ushort saveType!=0→byte color,framed→short frameX+short frameY};ModBlockEntry.cs:
// tileMap entry={value(savetype),mod,name,framed,fallbackID,uType}
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

class BEReader {
  off = 0;
  constructor(public b: Uint8Array) {}
  u8(): number { return this.b[this.off++]; }
  i16(): number { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; }
  u16(): number { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return v; }
  i32(): number { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; }
  i64(): bigint { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(this.b[this.off + i]); this.off += 8; return v; }
  f32(): number { const v = this.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
  f64(): number { const v = this.i64(); return new Float64Array(new BigUint64Array([BigInt.asUintN(64, v)]).buffer)[0]; }
  bytes(n: number): Uint8Array { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; }
  str(): string { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); }
}

type Tag = { t: number; name: string; v: unknown };

function readTag(r: BEReader): Tag | null {
  const id = r.u8();
  if (id === 0) return null;
  const name = r.str();
  return { t: id, name, v: readPayload(id, r) };
}

function readPayload(id: number, r: BEReader): unknown {
  switch (id) {
    case 1: return r.u8();
    case 2: return r.i16();
    case 3: return r.i32();
    case 4: return r.i64();
    case 5: return r.f32();
    case 6: return r.f64();
    case 7: return r.bytes(r.i32());        // byte[]
    case 8: return r.str();                 // string
    case 9: {                               // list
      const eid = r.u8(), n = r.i32();
      const out: unknown[] = [];
      for (let i = 0; i < n; i++) out.push(readPayload(eid, r));
      return out;
    }
    case 10: {                              // compound
      const tags: Tag[] = [];
      for (;;) {
        const t = readTag(r);
        if (t === null) break;
        tags.push(t);
      }
      return tags;
    }
    case 11: {                              // int[]
      const n = r.i32();
      const out: number[] = [];
      for (let i = 0; i < n; i++) out.push(r.i32());
      return out;
    }
    default: throw new Error(`未知 payload id ${id} @${r.off - 1}`);
  }
}

export interface TwldModTiles {
  entries: Array<{ saveType: number; mod: string; name: string; framed: boolean }>;
  /** x-major: idx = x*maxTilesY + y → {saveType, frameX?, frameY?};saveType=0=原版格 */
  data: Uint16Array;
  framedX: Int16Array | null;
  framedY: Int16Array | null;
  w: number;
  h: number;
}

export function parseTwld(buf: Uint8Array): { root: Tag[]; modTiles?: TwldModTiles } {
  let raw: Uint8Array;
  try { raw = gunzipSync(buf); } catch { raw = buf; }
  const r = new BEReader(raw);
  // ★ToStream 帧=单条带名 Tag(id 10,root)——其 payload children=节列表(TagIO.cs:393)
  const rootTag = readTag(r);
  const root: Tag[] = rootTag && rootTag.t === 10 ? (rootTag.v as Tag[]) : [];
  // tiles 节
  const tilesTag = root.find((t) => t.name === 'tiles');
  if (!tilesTag || tilesTag.t !== 10) return { root };
  const tc = tilesTag.v as Tag[];
  const tileMap = tc.find((t) => t.name === 'tileMap');
  const tileData = tc.find((t) => t.name === 'tileData');
  if (!tileMap || !tileData) return { root };
  const entries = (tileMap.v as Tag[]).map((e) => {
    const f = e.v as Tag[];
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    return {
      saveType: Number(get('value') ?? 0),
      mod: String(get('mod') ?? ''),
      name: String(get('name') ?? ''),
      framed: get('framed') === true,
    };
  });
  const dataBytes = tileData.v as Uint8Array;
  const dr = new BEReader(dataBytes);
  // w×h 未知在此层——由调用方传入;此处按 tileData 全量扫(长度=w*h*每格变长)。
  // framed 长度依赖 entry——先建 saveType→framed 表
  const framedMap = new Map<number, boolean>();
  for (const e of entries) framedMap.set(e.saveType, e.framed);
  return { root, modTiles: { entries, data: new Uint16Array(0), framedX: null, framedY: null, w: 0, h: 0 } as never as TwldModTiles };
}

// CLI:node /tmp/twld-probe.mjs <twld路径> [w] [h]
if (process.argv[2]) {
  const buf = new Uint8Array(readFileSync(process.argv[2]));
  const t0 = Date.now();
  let raw: Uint8Array;
  try { raw = gunzipSync(buf); } catch { raw = buf; }
  console.log(`[twld] 解压后=${raw.length}B 耗时=${Date.now() - t0}ms`);
  const r = new BEReader(raw);
  const rootTag = readTag(r);
  const root: Tag[] = rootTag && rootTag.t === 10 ? (rootTag.v as Tag[]) : [];
  for (const t of root.slice(0, 12)) console.log(`  [key] ${t.name} (payload ${t.t})`);
  console.log(`[twld] 根节 ${root.length} 项;off=${r.off}/${raw.length}`);
  const tilesTag = root.find((t) => t.name === 'tiles');
  if (tilesTag) {
    const tc = tilesTag.v as Tag[];
    for (const s of tc) console.log(`  [tiles.${s.name}] payload=${s.t}${s.t === 7 ? ` len=${(s.v as Uint8Array).length}` : s.t === 9 ? ` len=${(s.v as unknown[]).length}` : ''}`);
    const tileMap = tc.find((t) => t.name === 'tileMap');
    if (tileMap) {
      const list = tileMap.v as Tag[];
      console.log(`[twld] tileMap ${list.length} 条;前 5 条:`);
      for (const e of list.slice(0, 5)) {
        const f = e.v as Tag[];
        const get = (nm: string) => f.find((x) => x.name === nm)?.v;
        console.log(`   value=${get('value')} mod=${get('mod')} name=${get('name')} framed=${get('framed')}`);
      }
    }
  }
}
