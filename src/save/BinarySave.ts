// 存档二进制容器(v6,2026-09-06):消除 JSON+base64 中间层,大世界峰值 -300MB。
// 格式: [4B magic 'SBW6'][4B jsonLen][jsonLen B JSON 元数据][4B chLen][chLen B raw]×11 通道
// 通道序: tiles,walls,liquid,liquidType,wire,blocks,paint,paintWall,coat,explored,tileActive
// 旧 JSON 档自动迁移: loadFromKey 检测首字节 '{' = JSON → parse → packBinary → 回写。
import type { SaveData } from './serialize';

export const BINARY_MAGIC = 'SBW6';
const CHANNELS = ['tiles','walls','liquid','liquidType','wire','blocks','paint','paintWall','coat','explored','tileActive'] as const;

/** SaveData → 二进制 ArrayBuffer(binary 通道从 base64 解回 raw,元数据留 JSON) */
export function packSaveBinary(save: SaveData): ArrayBuffer {
  const rec = save as unknown as Record<string, unknown>;
  const meta: Record<string, unknown> = {};
  const chans: Array<Uint8Array> = [];
  for (const ch of CHANNELS) {
    const v = rec[ch];
    if (typeof v === 'string' && v.length > 0) {
      chans.push(b64Decode(v));
      meta[ch] = undefined;
    } else {
      chans.push(new Uint8Array(0));
      meta[ch] = undefined;
    }
  }
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const total = 8 + 4 + metaBytes.length + chans.reduce((a, c) => a + 4 + c.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set(new TextEncoder().encode(BINARY_MAGIC), 0);
  dv.setUint32(4, metaBytes.length, true);
  out.set(metaBytes, 8);
  let off = 8 + metaBytes.length;
  for (const c of chans) {
    dv.setUint32(off, c.length, true); off += 4;
    out.set(c, off); off += c.length;
  }
  return out.buffer;
}

/** 二进制 ArrayBuffer → SaveData(binary 通道以 Uint8Array 直出,loadSaveData 兼容) */
export function unpackSaveBinary(buf: ArrayBuffer): SaveData {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (u8.length < 8 || new TextDecoder().decode(u8.slice(0, 4)) !== BINARY_MAGIC)
    throw new Error('非二进制存档');
  const jsonLen = dv.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(u8.slice(8, 8 + jsonLen)));
  let off = 8 + jsonLen;
  const save = meta as unknown as SaveData;
  const rec = save as unknown as Record<string, unknown>;
  for (const ch of CHANNELS) {
    const len = dv.getUint32(off, true); off += 4;
    rec[ch] = len > 0 ? u8.slice(off, off + len) : undefined;
    off += len;
  }
  return save;
}

export function isBinarySave(data: ArrayBuffer | string): boolean {
  if (typeof data === 'string') return false;
  const u8 = new Uint8Array(data);
  return u8.length >= 4 && u8[0] === 0x53 && u8[1] === 0x42 && u8[2] === 0x57 && u8[3] === 0x36; // 'SBW6'
}

function b64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
