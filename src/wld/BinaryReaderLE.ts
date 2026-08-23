// 小端二进制读取器（.NET BinaryReader 兼容）
export class BinaryReaderLE {
  pos = 0;
  constructor(public buf: Uint8Array) {}
  get eof() { return this.pos >= this.buf.length; }

  /** 越界断言（R4-9 附带）：读穿返回 undefined 会沿 NaN/乱码静默传播（头解析错位
   *  类 bug 因此不可观测）——.NET BinaryReader 同位置是 EndOfStreamException。 */
  private need(n: number) {
    if (this.pos + n > this.buf.length) {
      throw new Error(`BinaryReaderLE: 越界读取（pos=${this.pos} 需要 ${n}B 总长 ${this.buf.length}）`);
    }
  }

  byte(): number { this.need(1); return this.buf[this.pos++]; }
  u8(): number { this.need(1); return this.buf[this.pos++]; }
  i8(): number { this.need(1); return (this.buf[this.pos++] << 24) >> 24; }
  i16(): number {
    this.need(2);
    const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
    this.pos += 2;
    return (v << 16) >> 16;
  }
  u16(): number {
    this.need(2);
    const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = (this.buf[this.pos] | (this.buf[this.pos + 1] << 8) |
      (this.buf[this.pos + 2] << 16) | (this.buf[this.pos + 3] << 24)) >>> 0;
    this.pos += 4;
    return v | 0;
  }
  u32(): number {
    this.need(4);
    const v = (this.buf[this.pos] | (this.buf[this.pos + 1] << 8) |
      (this.buf[this.pos + 2] << 16) | (this.buf[this.pos + 3] << 24)) >>> 0;
    this.pos += 4;
    return v;
  }
  i64(): bigint {
    const lo = this.u32(), hi = this.u32();
    return (BigInt(hi) << 32n) | BigInt(lo);
  }
  u64(): bigint {
    return BigInt.asUintN(64, this.i64());
  }
  f32(): number {
    const v = this.u32();
    const dv = new DataView(new ArrayBuffer(4));
    dv.setUint32(0, v, true);
    return dv.getFloat32(0, true);
  }
  f64(): number {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(0, this.u32(), true);
    dv.setUint32(4, this.u32(), true);
    return dv.getFloat64(0, true);
  }
  boolean(): boolean { return this.byte() !== 0; }
  bytes(n: number): Uint8Array {
    this.need(n);
    const v = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }
  /** .NET BinaryReader.ReadString：7-bit varint 长度 + UTF-8 */
  string(): string {
    let len = 0, shift = 0;
    for (;;) {
      this.need(1);
      const b = this.buf[this.pos++];
      len |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const bytes = this.bytes(len);
    return new TextDecoder('utf-8').decode(bytes);
  }
  seek(p: number) { this.pos = p; }
}
