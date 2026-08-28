// IIII4 批一次性诊断：ntb #98 液体调度簿记 round 级对拍仪（JS 侧）。
// 配方（IIII2 移交）：SW_DUMPROUNDS round 对拍 + liquids[] 序/checking/buffer 序列比对。
// 镜像 rig JJHook 三钩（同构双端标定流，防跨插桩态伪影——UUU/VVV 账本坑）：
//   1) liqlog  ：每次 updateLiquid 返回后对活动表做 FNV-1a，14B 条目
//                (x:i16le y:i16le delay:i32le kill:i32le amt:u8 lty:u8 vanilla0基)
//                → "I <inst> <iter> <nl> <nb> <hash8>"（rig: "I <iter> <nl> <nb> <hash8>"）
//   2) wc 快照 ：每次 waterCheck 返回后整图六通道 K.*（typ=u16 sheet/act/wal=u16/
//                liq/lty(vanilla0基)/inact）→ jround/<inst>-<seq>/（seq1=初始 WC=head2 锚，
//                seq2..11=轮尾 WC ↔ rig WcRoundMark s2k=k-1 轮）
//   3) E 流    ：SW_III4_RAW=1 时镜像 rig SW_LIQRAW：head2(=该实例首次 waterCheck，
//                即初始 WC) 之后每次 updateLiquid 尾写全活动表
//                "E <rel> <k> <x> <y> <delay> <kill> <amt>" + "---IT <rel> end"
//                （rig 侧 rel=相对 head2 的全局迭代号，跨全部 10 轮连续）
//   4) R30 触点：LiquidSim.r30Sink 挂接 → "R30 <n> <x> <y> <v>"（晋升掷事件序）
//   5) SW_III4_DUMPAT=rel1,rel2,… 在指定迭代后额外落 entries 文本 + buffer 全序
// 用法：cd game && SW_III4=1 npx vitest run tools/_iii4a.test.ts
import { it } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_III4 === '1';
const SEED = '1372357239';
const W = 4200, H = 1200;
const OUT = '/tmp/iii4-out';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('ntb #98 liquid bookkeeping instrument', async () => {
  mkdirSync(`${OUT}/jround`, { recursive: true });
  const RAW_ON = process.env.SW_III4_RAW === '1';
  const dumpAt = new Set((process.env.SW_III4_DUMPAT ?? '')
    .split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0));
  const entriesDump: string[] = [];
  const logLines: string[] = [];
  const erawChunks: string[] = [];
  let r30N = 0;

  // fnv 增量缓冲：条目流逐迭代重入（无状态可保留），直接单缓冲即可
  const fnvTable = new Uint8Array(512 * 1024);
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  interface Inst { id: number; iter: number; rel: number; head2: boolean; wcSeq: number; ups: number; wcs: number }
  const insts = new Map<number, Inst>();
  const idOf = (sim: object): number => {
    let id = ids.get(sim);
    if (!id) { id = nextId++; ids.set(sim, id); }
    return id;
  };

  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  const oUpd = proto.updateLiquid;
  const oWc = proto.waterCheck;
  type SimT = LiquidSim & {
    world: { store: { w: number; h: number; liquid: Uint8Array; liquidType: Uint8Array; type: Uint16Array; flags: Uint8Array; wall: Uint16Array; wire: Uint8Array } };
    numLiquid: number; bufferLen: number; liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
    bufX: Int32Array; bufY: Int32Array; bufCount: number; checking: Uint8Array; skip: Uint8Array;
  };

  let curUpdInst = -1;
  const TRK_INST = Number(process.env.SW_III4_TRKINST ?? 2);
  let trkBuf = '';
  let trkKeep: typeof LiquidSim.trkProbe = null;

  proto.updateLiquid = function (this: unknown) {
    curUpdInst = idOf(this);
    const rr = insts.get(curUpdInst);
    const keepTrk = curUpdInst === TRK_INST;
    if (!keepTrk) { trkKeep = LiquidSim.trkProbe; LiquidSim.trkProbe = null; }
    LiquidSim.trkIterCur = rr ? rr.rel : 0;
    try {
      oUpd.apply(this, arguments);
    } finally {
      if (!keepTrk) { LiquidSim.trkProbe = trkKeep; }
    }
    const sim = this as unknown as SimT;
    const st = sim.world.store;
    const id = idOf(sim);
    let rec = insts.get(id);
    if (!rec) { rec = { id, iter: 0, rel: 0, head2: false, wcSeq: 0, ups: 0, wcs: 0 }; insts.set(id, rec); }
    rec.iter++; rec.ups++;
    if (!rec.head2) return;
    rec.rel++;
    const nl = sim.numLiquid, nb = sim.bufferLen;
    const L = sim.liquids;
    let p = 0;
    for (let k = 0; k < nl; k++) {
      const e = L[k]!;
      const ti = e.y * st.w + e.x;
      const amt = st.liquid[ti];
      const lt = st.liquidType[ti] === 0 ? 0 : st.liquidType[ti] - 1;
      fnvTable[p++] = e.x & 0xff; fnvTable[p++] = (e.x >> 8) & 0xff;
      fnvTable[p++] = e.y & 0xff; fnvTable[p++] = (e.y >> 8) & 0xff;
      const dl = e.delay | 0; const kl = e.kill | 0;
      fnvTable[p++] = dl & 0xff; fnvTable[p++] = (dl >>> 8) & 0xff; fnvTable[p++] = (dl >>> 16) & 0xff; fnvTable[p++] = (dl >>> 24) & 0xff;
      fnvTable[p++] = kl & 0xff; fnvTable[p++] = (kl >>> 8) & 0xff; fnvTable[p++] = (kl >>> 16) & 0xff; fnvTable[p++] = (kl >>> 24) & 0xff;
      fnvTable[p++] = amt;
      fnvTable[p++] = lt;
    }
    let h = 2166136261 >>> 0;
    for (let q = 0; q < p; q++) { h ^= fnvTable[q]!; h = Math.imul(h, 16777619) >>> 0; }
    logLines.push(`I ${id} ${rec.rel} ${nl} ${nb} ${h.toString(16).padStart(8, '0')}`);
    // E 流
    if (RAW_ON) {
      const buf: string[] = [];
      for (let k = 0; k < nl; k++) {
        const e = L[k]!;
        buf.push(`E ${rec.rel} ${k} ${e.x} ${e.y} ${e.delay} ${e.kill} ${st.liquid[e.y * st.w + e.x]}`);
      }
      buf.push(`---IT ${rec.rel} inst${id} end`);
      erawChunks.push(buf.join('\n') + '\n');
    }
    if (dumpAt.has(rec.rel)) {
      const lines: string[] = [`# rel=${rec.rel} x y delay kill amt lty`];
      for (let k = 0; k < nl; k++) {
        const e = L[k]!;
        const ti = e.y * st.w + e.x;
        lines.push(`${e.x} ${e.y} ${e.delay} ${e.kill} ${st.liquid[ti]} ${st.liquidType[ti] === 0 ? 0 : st.liquidType[ti] - 1}`);
      }
      lines.push(`# buf n=${sim.bufCount}`);
      for (let k = 0; k < sim.bufCount && k < 20000; k++) lines.push(`B ${k} ${sim.bufX[k]} ${sim.bufY[k]}`);
      entriesDump.push(lines.join('\n'));
      {
        const ddir = `${OUT}/jdump/${id}-rel${rec.rel}`;
        mkdirSync(ddir, { recursive: true });
        const n2 = st.w * st.h;
        const typ = new Uint16Array(n2), wal = new Uint16Array(n2);
        const act = new Uint8Array(n2), liq = new Uint8Array(n2), lt = new Uint8Array(n2), ia = new Uint8Array(n2);
        for (let q = 0; q < n2; q++) {
          typ[q] = SHEET[st.type[q]]!;
          act[q] = st.flags[q] & 1;
          wal[q] = st.wall[q];
          liq[q] = st.liquid[q];
          lt[q] = st.liquidType[q] === 0 ? 0 : st.liquidType[q] - 1;
          ia[q] = (st.wire[q] >>> 5) & 1;
        }
        writeFileSync(`${ddir}/K.typ`, Buffer.from(typ.buffer));
        writeFileSync(`${ddir}/K.act`, act);
        writeFileSync(`${ddir}/K.wal`, Buffer.from(wal.buffer));
        writeFileSync(`${ddir}/K.liq`, liq);
        writeFileSync(`${ddir}/K.lty`, lt);
        writeFileSync(`${ddir}/K.inact`, ia);
      }
    }
  };

  proto.waterCheck = function (this: unknown) {
    oWc.apply(this, arguments);
    const sim = this as unknown as SimT;
    const st = sim.world.store;
    const id = idOf(sim);
    let rec = insts.get(id);
    if (!rec) { rec = { id, iter: 0, rel: 0, head2: false, wcSeq: 0, ups: 0, wcs: 0 }; insts.set(id, rec); }
    rec.wcSeq++; rec.wcs++;
    if (rec.wcSeq === 1) rec.head2 = true; // 初始 WC = head2 锚（rig DumpList("head2") 位）
    const dir = `${OUT}/jround/${id}-${String(rec.wcSeq).padStart(2, '0')}`;
    mkdirSync(dir, { recursive: true });
    const n = st.w * st.h;
    const typ = new Uint16Array(n), wal = new Uint16Array(n);
    const act = new Uint8Array(n), liq = new Uint8Array(n), lt = new Uint8Array(n), ia = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      typ[i] = SHEET[st.type[i]]!;
      act[i] = st.flags[i] & 1;
      wal[i] = st.wall[i];
      liq[i] = st.liquid[i];
      lt[i] = st.liquidType[i] === 0 ? 0 : st.liquidType[i] - 1;
      ia[i] = (st.wire[i] >>> 5) & 1;
    }
    writeFileSync(`${dir}/K.typ`, Buffer.from(typ.buffer));
    writeFileSync(`${dir}/K.act`, act);
    writeFileSync(`${dir}/K.wal`, Buffer.from(wal.buffer));
    writeFileSync(`${dir}/K.liq`, liq);
    writeFileSync(`${dir}/K.lty`, lt);
    writeFileSync(`${dir}/K.inact`, ia);
    console.log(`JWCMARK inst=${id} seq=${rec.wcSeq} ups=${rec.ups} nl=${sim.numLiquid} nb=${sim.bufferLen}`);
  };

  // 盒内分支迹（rig SW_TRKBOX 同构）：SW_III4_TRKBOX="x0,x1,y0,y1" + SW_III4_TRKPATH
  const tb = (process.env.SW_III4_TRKBOX ?? '').split(',').map(Number);
  if (tb.length === 4 && tb.every(Number.isFinite)) {
    LiquidSim.trkBox = { x0: tb[0], x1: tb[1], y0: tb[2], y1: tb[3] };
    const tw = writeFileSync;
    let buf = '';
    LiquidSim.trkProbe = (iter, x, y, sig, amtA, ltyA, kill, delay, pre) => {
      if (sig === -1) {
        trkBuf += `P ${iter} ${x} ${y} ${pre.amt} ${pre.lty}\n`;
      } else {
        trkBuf += `T ${iter} ${x} ${y} ${sig.toString(16)} ${amtA} ${ltyA} ${kill} ${delay}\n`;
      }
    };
  }

  // R30 晋升掷触点流（rig SW_R30LOG 同格式 "<n> <x> <y> <val>"）
  const r30Path = `${OUT}/j-r30.txt`;
  LiquidSim.r30Sink = (x, y, v) => {
    r30N++;
    r30Lines.push(`${r30N} ${x} ${y} ${v} i${curUpdInst}`);
  };
  const r30Lines: string[] = [];

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { notTheBees: true },
    });
  } finally {
    LiquidSim.r30Sink = null;
    writeFileSync(`${OUT}/j-liqlog.txt`, logLines.join('\n') + '\n');
    if (erawChunks.length) writeFileSync(`${OUT}/j-eraw.txt`, erawChunks.join(''));
    writeFileSync(r30Path, r30Lines.join('\n') + '\n');
    writeFileSync(`${OUT}/j-trkbox.txt`, trkBuf);
    if (entriesDump.length) writeFileSync(`${OUT}/j-entries.txt`, entriesDump.join('\n=====\n'));
    for (const [id, rec] of [...insts.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`INST ${id}: ups=${rec.ups} wcs=${rec.wcs} relMax=${rec.rel} iterSum=${rec.iter}`);
    }
    console.log('J-DONE');
  }
}, 900_000);

void existsSync; void unlinkSync;
