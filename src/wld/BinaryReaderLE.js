// 小端二进制读取器（.NET BinaryReader 兼容）
export class BinaryReaderLE {
    constructor(buf) {
        Object.defineProperty(this, "buf", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: buf
        });
        Object.defineProperty(this, "pos", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    get eof() { return this.pos >= this.buf.length; }
    byte() { return this.buf[this.pos++]; }
    u8() { return this.buf[this.pos++]; }
    i8() { return (this.buf[this.pos++] << 24) >> 24; }
    i16() {
        const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
        this.pos += 2;
        return (v << 16) >> 16;
    }
    u16() {
        const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
        this.pos += 2;
        return v;
    }
    i32() {
        const v = (this.buf[this.pos] | (this.buf[this.pos + 1] << 8) |
            (this.buf[this.pos + 2] << 16) | (this.buf[this.pos + 3] << 24)) >>> 0;
        this.pos += 4;
        return v | 0;
    }
    u32() {
        const v = (this.buf[this.pos] | (this.buf[this.pos + 1] << 8) |
            (this.buf[this.pos + 2] << 16) | (this.buf[this.pos + 3] << 24)) >>> 0;
        this.pos += 4;
        return v;
    }
    i64() {
        const lo = this.u32(), hi = this.u32();
        return (BigInt(hi) << 32n) | BigInt(lo);
    }
    u64() {
        return BigInt.asUintN(64, this.i64());
    }
    f32() {
        const v = this.u32();
        const dv = new DataView(new ArrayBuffer(4));
        dv.setUint32(0, v, true);
        return dv.getFloat32(0, true);
    }
    f64() {
        const dv = new DataView(new ArrayBuffer(8));
        dv.setUint32(0, this.u32(), true);
        dv.setUint32(4, this.u32(), true);
        return dv.getFloat64(0, true);
    }
    boolean() { return this.buf[this.pos++] !== 0; }
    bytes(n) {
        const v = this.buf.subarray(this.pos, this.pos + n);
        this.pos += n;
        return v;
    }
    /** .NET BinaryReader.ReadString：7-bit varint 长度 + UTF-8 */
    string() {
        let len = 0, shift = 0;
        for (;;) {
            const b = this.buf[this.pos++];
            len |= (b & 0x7f) << shift;
            if (!(b & 0x80))
                break;
            shift += 7;
        }
        const bytes = this.bytes(len);
        return new TextDecoder('utf-8').decode(bytes);
    }
    seek(p) { this.pos = p; }
}
