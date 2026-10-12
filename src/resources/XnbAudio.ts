// XNB 音效解码(2026-10-12 材质包音效通道):Steam 工坊包的音效以原版 .xnb 形态
// 分发(本仓 public/sounds 的 .wav/.mp3/.opus 是当年离线提取产物)。web 端
// decodeAudioData 不认 XNB → 此处解容器:非压缩 XNB v5 + SoundEffectReader 对象
// (formatSize u32 + WAVEFORMATEX + dataSize u32 + PCM + loopStart/loopEnd/
// durationMs),提取 PCM 包 RIFF/WAVE 头喂既有 Sfx 覆盖面(decodeAudioData 可解)。
// 仅支持无压缩 PCM(formatTag 1);其余(ADPCM/WMA)返回 null 由调用方按跳过计数。
// 结构实测锚:Waifu 包 Player_Hit_0.xnb hexdump(PCM 48000/16bit/mono,data 62464)。

/** XNB → WAV 字节。非音效 XNB/压缩/非 PCM 返回 null。 */
export function decodeXnbSoundToWav(b: Uint8Array): Uint8Array | null {
  try {
    if (b.length < 14 || b[0] !== 0x58 || b[1] !== 0x4e || b[2] !== 0x42) return null; // 'XNB'
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // [3]=platform('w'), [4]=version(5), [5]=flags(0x80 HiDef / 0x40 LZX压缩 / 0x01 hiding)
    const flags = b[5];
    let off = 6;
    const totalSize = dv.getUint32(off, true); off += 4;
    if (totalSize > b.length) return null;
    if (flags & 0x40) return null;   // LZX 压缩 XNB:web 端不解(登记跳过)
    // 7-bit 长度字符串(readers)
    const read7 = (): number => {
      let v = 0, shift = 0;
      for (;;) {
        const x = b[off++];
        v |= (x & 0x7f) << shift;
        if (!(x & 0x80)) return v;
        shift += 7;
      }
    };
    const readStr = (): string => {
      const len = read7();
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(b[off++]);
      return s;
    };
    const readerCount = read7();
    for (let i = 0; i < readerCount; i++) { readStr(); off += 4; }   // name + version u32
    off++;   // shared resource count(★7-bit 编码非 u32——实测 19/19 布局票选定谳)
    off++;   // object count(7-bit)
    // SoundEffect 对象:formatSize u32 + fmt + dataSize u32 + pcm
    const formatSize = dv.getUint32(off, true); off += 4;
    const fmt = b.subarray(off, off + formatSize); off += formatSize;
    const fmtDv = new DataView(fmt.buffer, fmt.byteOffset, fmt.byteLength);
    const formatTag = fmtDv.getUint16(0, true);
    const channels = fmtDv.getUint16(2, true);
    const rate = fmtDv.getUint32(4, true);
    const bits = fmtDv.getUint16(14, true);
    const dataSize = dv.getUint32(off, true); off += 4;
    const pcm = b.subarray(off, off + dataSize);
    if (formatTag !== 1) return null;            // 非 PCM(ADPCM=2 等):不支持
    if (rate < 3000 || rate > 256000 || channels < 1 || channels > 2) return null;
    if (pcm.length === 0 || bits % 8 !== 0) return null;
    // 包 RIFF/WAVE(PCM):'RIFF'+size+'WAVE'+'fmt '+16+fmt16+'data'+pcm
    const fmtChunk = new Uint8Array(16);
    const fdv = new DataView(fmtChunk.buffer);
    fdv.setUint16(0, 1, true);                   // wFormatTag=PCM
    fdv.setUint16(2, channels, true);
    fdv.setUint32(4, rate, true);
    const blockAlign = channels * bits / 8;
    fdv.setUint32(8, rate * blockAlign, true);
    fdv.setUint16(12, blockAlign, true);
    fdv.setUint16(14, bits, true);
    const head = new TextEncoder().encode('RIFF____WAVEfmt ' + '____');
    const wav = new Uint8Array(44 + pcm.length);
    wav.set(head, 0);
    const wdv = new DataView(wav.buffer);
    wdv.setUint32(4, 36 + pcm.length, true);     // RIFF size
    wdv.setUint32(16, 16, true);                 // fmt chunk size
    wdv.setUint16(20, 1, true);
    wdv.setUint16(22, channels, true);
    wdv.setUint32(24, rate, true);
    wdv.setUint32(28, rate * blockAlign, true);
    wdv.setUint16(32, blockAlign, true);
    wdv.setUint16(34, bits, true);
    wav.set(new TextEncoder().encode('data'), 36);
    wdv.setUint32(40, pcm.length, true);
    wav.set(pcm, 44);
    return wav;
  } catch (e) {
    // 解析失败诊断(坏容器/未支持变体):debug 级不刷屏,坏包走跳过计数
    console.debug('[xnb] 音效解码失败(跳过):', (e as Error)?.message ?? e);
    return null;
  }
}
