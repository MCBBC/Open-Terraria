// ★632d:tMod 解包(格式=TmodFile.cs:198-260 源码定谳,2026.6 实证):
//   "TMOD" + varint版本串 + hash20 + sig256 + dataLen int32 + varint modName + varint modVersion
//   + int32 count + 【名表段】(varint名+int32 ulen+int32 clen)×n + 【数据段】blob×n(表序;
//   clen==ulen=存储,否则 .NET DeflateStream=raw deflate)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflateSync, inflateRawSync } from 'node:zlib';

const tmodPath = process.argv[2];
const outDir = process.argv[3];
const filter = process.argv[4] ?? '';
const buf = readFileSync(tmodPath);
if (buf.subarray(0, 4).toString('latin1') !== 'TMOD') { console.error('magic 不符'); process.exit(1); }
let off = 4;
const rdVarStr = () => {
  let len = 0, s = 0;
  for (;;) { const x = buf[off++]; len |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; }
  const str = buf.subarray(off, off + len).toString('utf8');
  off += len;
  return str;
};
const version = rdVarStr();
off += 20 + 256 + 4;
const modName = rdVarStr();
const modVersion = rdVarStr();
const count = buf.readInt32LE(off); off += 4;
console.log(`[tmod] ${modName} ${modVersion} (tML ${version}) 文件 ${count}`);
// ① 名表段
const entries = [];
for (let i = 0; i < count; i++) {
  const name = rdVarStr();
  const ulen = buf.readInt32LE(off); off += 4;
  const clen = buf.readInt32LE(off); off += 4;
  entries.push({ name, ulen, clen });
}
// ② 数据段(表序)
let extracted = 0;
for (const e of entries) {
  const data = buf.subarray(off, off + e.clen); off += e.clen;
  let out;
  if (e.clen === e.ulen) out = data;
  else {
    try { out = inflateRawSync(data); }
    catch { out = inflateSync(data); }
  }
  if (out.length !== e.ulen) throw new Error(`长度不符 ${e.name} ${out.length}≠${e.ulen}`);
  if (!filter || e.name.startsWith(filter)) {
    const dst = join(outDir, e.name);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, out);
  }
  extracted++;
}
console.log(`[tmod] 解包完成 ${extracted} 条 → ${outDir}`);
