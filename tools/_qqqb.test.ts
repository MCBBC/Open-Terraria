// QQQB 探针（qqq-b 会话私有）：全程低层掷流录制 s22222/evil=1
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_QQQB === '1';
(RUN ? it : it.skip)('low-level roll capture b', async () => {
  const out = process.env.SW_QQQB_OUT ?? '/tmp/qqq-out/jsb-all.txt';
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (this: UnifiedRandom) => number;
  let n = 0;
  let buf: string[] = [];
  const h = openSync(out, 'w');
  const flush = () => { if (buf.length) { writeSync(h, buf.join('')); buf = []; } };
  proto.internalSample = function (this: UnifiedRandom) {
    const v = orig.call(this);
    buf.push(`${v}\n`);
    if (++n % 2_000_000 === 0) flush();
    return v;
  };
  const QUIET = new Set(['treeTry', 'iceTry', 'trapTry', 'campTry', 'swordTry']);
  const marks: string[] = [];
  const segPath = process.env.SW_QQQB_SEG ?? '/tmp/qqq-out/jsb-seg.txt';
  const sh = openSync(segPath, 'w');
  let sbuf: string[] = [];
  (globalThis as { __swSeg?: unknown }).__swSeg = (name: string, detail?: unknown) => {
    if (name === 'G' || name === 'U' || name === 'UQ' || name === 'D' || name === 'DQ' || name === 'S4' || name === 'K') {
      sbuf.push(`${name} ${detail !== undefined ? JSON.stringify(detail) : ''}@${n}\n`);
      if (sbuf.length >= 400_000) { writeSync(sh, sbuf.join('')); sbuf = []; }
      return;
    }
    if (QUIET.has(name)) return;
    marks.push(`S ${name}${detail !== undefined ? JSON.stringify(detail) : ''}@${n}`);
  };
  (globalThis as { __swSegFlush?: unknown }).__swSegFlush = () => { if (sbuf.length) { writeSync(sh, sbuf.join('')); sbuf = []; } closeSync(sh); };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '22222', evil: 1,
      onWorldPartial: (w, i, nm) => {
        marks.push(`P ${i} ${nm}@${n}`);
        if ((nm === '瓦片清理' || nm === '仙人掌珊瑚') && process.env.SW_QQQB_SNAP === '1') {
          const tag = nm === '瓦片清理' ? 'js100' : 'js099';
          const st = w.store;
          const W = st.w, H = st.h;
          const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
          for (let q = 0; q < TILE_DEFS.length; q++) {
            const s = TILE_DEFS[q]?.vanilla?.sheet;
            if (typeof s === 'number') SHEET[q] = s;
          }
          const act = new Uint8Array(W * H), typ = new Uint16Array(W * H);
          for (let i = 0; i < W * H; i++) {
            act[i] = st.flags[i]! & 1;
            typ[i] = act[i] ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
          }
          const dump = (nm2: string, arr: Uint8Array | Uint16Array) =>
            writeSync(openSync(`/tmp/qqq-out/${tag}.${nm2}`, 'w'), Buffer.from(arr.buffer, arr.byteOffset, arr.length * arr.BYTES_PER_ELEMENT));
          dump('act', act);
          dump('typ', typ);
          if (tag === 'js099') {
            // 帧通道（137 雕像规则用）——内部 id 直接存，重放端只查 137 的内部 id
            dump('fx', st.frameX);
            dump('fy', st.frameY);
            dump('half', st.half);
            dump('slope', st.slope);
            dump('inact', new Uint8Array(st.wire.buffer, st.wire.byteOffset, st.wire.length)); // bit5=inActive 原样
          }
          marks.push(`SNAP ${tag} done@${n}`);
          if (tag === 'js100') throw new Error('QQQB snap-abort after TileCleanup');
          return;
        }
      },
    });
  } finally {
    proto.internalSample = orig;
    delete (globalThis as { __swSeg?: unknown }).__swSeg;
    (globalThis as { __swSegFlush?: unknown }).__swSegFlush?.();
    flush();
    closeSync(h);
  }
  let off = 0;
  const text = `${marks.join('\n')}\nTOTAL ${n}\n`;
  while (off < text.length) off += writeSync(2, text.slice(off));
}, 600_000);
