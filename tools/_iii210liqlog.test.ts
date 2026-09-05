// ★IIIII210 一次性仪①：#99 Settle_Liquids_Again 逐迭代指纹流（JS 侧,管线内零重放）。
// _iii213liqlog 的 ddual 改锚版：基座不再离线 snap 重放,而是 generateWorld 全管线 +
// __swI91Cap 槽头钩（『二次沉降』头）就地挂 LiquidSim.prototype.updateLiquid 尾指纹钩
// ——消解 iii209 批离线 MB 重放上下文失真（mb-replay.log dA=11914 ✗,管内 #98 恒绿）。
// 镜像 rig SW_LIQLOG（i137rsrc JJHook.OnLiquidIter：UpdateLiquid 尾 tilesIgnoreWater(false)
// 后,14B/条 x:i16le y:i16le delay:i32le kill:i32le amt:u8 lty:u8(vanilla0基) → FNV-1a →
// "I <iter> <nl> <nb> <hash8>";iter 每 pass BEGIN 归零,首行=1）。与 run210.sh 产出的
// x-liqlog.txt "---PASS BEGIN 99 Settle Liquids Again" 段逐行对拍 → 首分歧迭代。
// SW_I210_DUMPAT=逗号集合：命中迭代尾追加 entries+世界通道 dump（与 rig SW_LIQDUMP_AT 同锚同格式）。
// 用法：cd game && SW_MB_1457=1 SW_I210LL=1 npx vitest run tools/_iii210liqlog.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I210LL === '1';
const OUT = process.env.SW_I210_OUT ?? '/tmp/iii210-out';
const G2 = process.env.SW_I210_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const W = 4200, H = 1200, N = W * H;
const DUMPAT = new Set((process.env.SW_I210_DUMPAT ?? '').split(',').map(Number).filter((n) => n > 0));

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

// rig dumpNames 对拍用（098_Micro_Biomes / 099_Settle_Liquids_Again）
function dumpPre(idx: number, name: string) {
  const p = `${G2}/${String(idx).padStart(3, '0')}_${name}`;
  return {
    t: le16(`${p}.typ`), a: readFileSync(`${p}.act`), w: le16(`${p}.wal`),
    l: readFileSync(`${p}.liq`), hf: readFileSync(`${p}.half`), sl: readFileSync(`${p}.slope`),
    lt: readFileSync(`${p}.lty`), ia: readFileSync(`${p}.inact`),
  };
}
function cmp8(st: TileStore, xv: ReturnType<typeof dumpPre>) {
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, fI = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = xv.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; if (fI < 0) fI = i; continue; }
    const vt = va ? xv.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!]! >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; if (fI < 0) fI = i; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (xv.w[i] !== st.wall[i]) { dW++; if (fI < 0) fI = i; }
    if (xv.l[i] !== st.liquid[i]) { dL++; if (fI < 0) fI = i; const k = `L${xv.l[i]}>${st.liquid[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (xv.hf[i] !== st.half[i]) { dHf++; if (fI < 0) fI = i; }
    if (xv.sl[i] !== st.slope[i]) { dSl++; if (fI < 0) fI = i; }
    const vl = xv.l[i]! > 0 ? xv.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (fI < 0) fI = i; }
    const via = xv.ia[i]! ? 1 : 0, jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; if (fI < 0) fI = i; }
  }
  return {
    dA, dT, dW, dL, dHf, dSl, dLt, dIa,
    first: fI < 0 ? '' : `(${fI % W},${Math.floor(fI / W)})`,
    pairs: [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' '),
  };
}

(RUN ? it : it.skip)('iii210 settle liqlog js (ddual in-pipeline)', async () => {
  const g = globalThis as Record<string, unknown>;
  const lines: string[] = [];
  const fnvTable = new Uint8Array(2 * 1024 * 1024);
  let active = false;
  let rel = 0;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  const serialize = (st: TileStore, dir: string, tag: string) => {
    mkdirSync(dir, { recursive: true });
    for (const c of CHANS) {
      const arr = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      writeFileSync(`${dir}/${tag}_${c}.bin`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    }
  };
  // ---- 指纹钩（updateLiquid 尾=rig OnLiquidIter 同锚：tilesIgnoreWater(false) 后）----
  type SimT = LiquidSim & {
    world: { store: TileStore }; numLiquid: number; bufCount: number;
    liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
    bufX: Int32Array; bufY: Int32Array;
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  // ---- WC 尾镜像（rig JJHook.AfterWaterCheck：sweep 清单 dump + "---WC n nl=.."）----
  let wcCount = 0;
  const oWc = proto.waterCheck;
  proto.waterCheck = function (this: unknown) {
    const r = oWc.apply(this, arguments);
    if (!active) return r;
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    wcCount++;
    const nl = sim.numLiquid, nb = sim.bufCount;
    const buf: string[] = ['# x y delay kill amt lty'];
    for (let k = 0; k < nl; k++) {
      const e = sim.liquids[k]!;
      const ti = e.y * s.w + e.x;
      buf.push(`${e.x} ${e.y} ${e.delay} ${e.kill} ${s.liquid[ti]} ${s.liquidType[ti] === 0 ? 0 : s.liquidType[ti]! - 1}`);
    }
    buf.push(`# buf n=${nb}`);
    writeFileSync(`${OUT}/j-entries-wc${wcCount}.txt`, buf.join('\n') + '\n');
    if (wcCount === 1 || wcCount === 2) {
      // 世界通道 wc 时刻快照（对 x86 K.wc1-s89.*）——入口清单≠湿格全 Womens（top-off 支不进列）
      mkdirSync(`${OUT}/jdumpwc`, { recursive: true });
      const typ = Buffer.alloc(N * 2), wal = Buffer.alloc(N * 2);
      const act = Buffer.alloc(N), liq = Buffer.alloc(N), lt = Buffer.alloc(N), ia = Buffer.alloc(N);
      for (let q = 0; q < N; q++) {
        typ[q * 2] = SHEET[s.type[q]]! & 0xff; typ[q * 2 + 1] = (SHEET[s.type[q]]! >> 8) & 0xff;
        act[q] = s.flags[q]! & 1;
        wal[q * 2] = s.wall[q]! & 0xff; wal[q * 2 + 1] = (s.wall[q]! >> 8) & 0xff;
        liq[q] = s.liquid[q]!;
        lt[q] = s.liquidType[q] === 0 ? 0 : s.liquidType[q]! - 1;
        ia[q] = (s.wire[q]! >>> 5) & 1;
      }
      writeFileSync(`${OUT}/jdumpwc/K.typ-wc${wcCount}`, typ);
      writeFileSync(`${OUT}/jdumpwc/K.wal-wc${wcCount}`, wal);
      writeFileSync(`${OUT}/jdumpwc/K.act-wc${wcCount}`, act);
      writeFileSync(`${OUT}/jdumpwc/K.liq-wc${wcCount}`, liq);
      writeFileSync(`${OUT}/jdumpwc/K.lty-wc${wcCount}`, lt);
      writeFileSync(`${OUT}/jdumpwc/K.inact-wc${wcCount}`, ia);
    }
    lines.push(`---WC ${wcCount} nl=${nl} nb=${nb}`);
    return r;
  };
  proto.updateLiquid = function (this: unknown) {
    const r = oUpd.apply(this, arguments);
    if (!active) return r;
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    rel++;
    const nl = sim.numLiquid, nb = sim.bufCount;
    let pp = 0;
    for (let k = 0; k < nl; k++) {
      const e = sim.liquids[k]!;
      const ti = e.y * s.w + e.x;
      const dl = e.delay | 0, kl = e.kill | 0;
      fnvTable[pp++] = e.x & 0xff; fnvTable[pp++] = (e.x >> 8) & 0xff;
      fnvTable[pp++] = e.y & 0xff; fnvTable[pp++] = (e.y >> 8) & 0xff;
      fnvTable[pp++] = dl & 0xff; fnvTable[pp++] = (dl >>> 8) & 0xff; fnvTable[pp++] = (dl >>> 16) & 0xff; fnvTable[pp++] = (dl >>> 24) & 0xff;
      fnvTable[pp++] = kl & 0xff; fnvTable[pp++] = (kl >>> 8) & 0xff; fnvTable[pp++] = (kl >>> 16) & 0xff; fnvTable[pp++] = (kl >>> 24) & 0xff;
      fnvTable[pp++] = s.liquid[ti]!;
      fnvTable[pp++] = s.liquidType[ti] === 0 ? 0 : s.liquidType[ti]! - 1;
    }
    let h = 2166136261 >>> 0;
    for (let q = 0; q < pp; q++) { h ^= fnvTable[q]!; h = Math.imul(h, 16777619) >>> 0; }
    lines.push(`I ${rel} ${nl} ${nb} ${h.toString(16).padStart(8, '0')}`);
    if (DUMPAT.size > 0 && DUMPAT.has(rel)) {
      // 与 rig SW_LIQDUMP_AT 同锚同格式（迭代尾）：entries + buffer 全序 + 世界通道
      const buf: string[] = ['# x y delay kill amt lty'];
      for (let k = 0; k < nl; k++) {
        const e = sim.liquids[k]!;
        const ti = e.y * s.w + e.x;
        buf.push(`${e.x} ${e.y} ${e.delay} ${e.kill} ${s.liquid[ti]} ${s.liquidType[ti] === 0 ? 0 : s.liquidType[ti]! - 1}`);
      }
      buf.push(`# buf n=${nb}`);
      for (let k = 0; k < nb && k < 50000; k++) buf.push(`B ${k} ${sim.bufX[k]} ${sim.bufY[k]}`);
      writeFileSync(`${OUT}/j-entries-${rel}.txt`, buf.join('\n') + '\n');
      mkdirSync(`${OUT}/jdump1`, { recursive: true });
      const typ = Buffer.alloc(N * 2), wal = Buffer.alloc(N * 2);
      const act = Buffer.alloc(N), liq = Buffer.alloc(N), lt = Buffer.alloc(N), ia = Buffer.alloc(N);
      for (let q = 0; q < N; q++) {
        typ[q * 2] = SHEET[s.type[q]]! & 0xff; typ[q * 2 + 1] = (SHEET[s.type[q]]! >> 8) & 0xff;
        act[q] = s.flags[q]! & 1;
        wal[q * 2] = s.wall[q]! & 0xff; wal[q * 2 + 1] = (s.wall[q]! >> 8) & 0xff;
        liq[q] = s.liquid[q]!;
        lt[q] = s.liquidType[q] === 0 ? 0 : s.liquidType[q]! - 1;
        ia[q] = (s.wire[q]! >>> 5) & 1;
      }
      writeFileSync(`${OUT}/jdump1/K.typ-${rel}`, typ);
      writeFileSync(`${OUT}/jdump1/K.wal-${rel}`, wal);
      writeFileSync(`${OUT}/jdump1/K.act-${rel}`, act);
      writeFileSync(`${OUT}/jdump1/K.liq-${rel}`, liq);
      writeFileSync(`${OUT}/jdump1/K.lty-${rel}`, lt);
      writeFileSync(`${OUT}/jdump1/K.inact-${rel}`, ia);
      writeFileSync(`${OUT}/jdump1/K.chk-${rel}`, Buffer.from(sim['checking' as never] as unknown as Uint8Array));
      writeFileSync(`${OUT}/jdump1/K.skp-${rel}`, Buffer.from(sim['skip' as never] as unknown as Uint8Array));
      console.log(`[i210] dump at rel=${rel} nl=${nl} nb=${nb}`);
    }
    return r;
  };
  // ---- SettleWaterAt S/L 事件流（镜像 rig SW_SETTLEEV：盒门 x[700,800] y[300,900]，
  //      S=拾起 L=落点写回;JS type 为 store 域(1=水)→统一减 1 成 vanilla 0 基）----
  const evLines: string[] = [];
  const inBox = (x: number, y: number) => x >= 700 && x <= 800 && y >= 300 && y <= 900;
  LiquidSim.settleEv = (kind: string, payload: string) => {
    if (!active) return;
    if (kind !== 'S' && kind !== 'L' && kind !== 'M' && kind !== 'F') return;
    const f = payload.split('|');
    const x = Number(f[0]), y = Number(f[1]);
    if (!inBox(x, y)) return;
    if (kind === 'M') {
      // rig 在灌注后记 amt,JS 在灌注前记 → 只对齐坐标域（amt 差语义已知,定罪读 S/L）
      evLines.push(`M|${x}|${y}|${f[2]}|${f[3]}`);
    } else if (kind === 'F') {
      evLines.push(`F|${x}|${y}|${f[2]}|${Number(f[3]) - 1}|${f[4]}|${f[5]}|${f[6]}`);
    } else {
      evLines.push(`${kind}|${x}|${y}|${f[2]}|${Number(f[3]) - 1}`);
    }
  };
  // ---- 槽头钩：『二次沉降』头装锚（capture + active=true,rel=0=rig PASS BEGIN 同锚）----
  g.__swI91Cap = (stRaw: unknown, gsRaw: unknown, _ch: unknown, name: string) => {
    if (name !== '二次沉降') return;
    const st = stRaw as TileStore;
    // 基座自检：槽头(≡#98 末)对 gold 098 —— 应 0 差（0..98 守恒）
    const pre = dumpPre(98, 'Micro_Biomes');
    const r0 = cmp8(st, pre);
    console.log(`[base selfcheck @二次沉降 head vs #098_Micro_Biomes] dA=${r0.dA} dT=${r0.dT} dW=${r0.dW} dL=${r0.dL} dHf=${r0.dHf} dSl=${r0.dSl} dLt=${r0.dLt} dIa=${r0.dIa} ${r0.dA || r0.dT || r0.dL || r0.dLt ? '✗ ' + r0.first + ' ' + r0.pairs : '✓'}`);
    serialize(st, `${OUT}/snap99base`, 'base');
    writeFileSync(`${OUT}/snap99base/base_gs.json`, JSON.stringify(gsRaw));
    lines.push('---PASS BEGIN 99 Settle Liquids Again');
    rel = 0;
    wcCount = 0;
    active = true;
  };
  try {
    await generateWorld({
      width: W, height: H,
      seedText: '1.1.1.0.doubledaringdangers|20260831',
      evil: 0 as -1 | 0 | 1,
      onWorldPartial: (w, _i, name) => {
        if (name !== '二次沉降') return;
        active = false;
        lines.push('---PASS END 99 Settle Liquids Again');
        const st = w.store;
        const end = dumpPre(99, 'Settle_Liquids_Again');
        const r1 = cmp8(st, end);
        console.log(`[endstate vs #099_Settle_Liquids_Again] dA=${r1.dA} dT=${r1.dT} dW=${r1.dW} dL=${r1.dL} dHf=${r1.dHf} dSl=${r1.dSl} dLt=${r1.dLt} dIa=${r1.dIa} ${r1.dA || r1.dT || r1.dL || r1.dLt ? '✗ ' + r1.first + ' ' + r1.pairs : '✓'}`);
        serialize(st, `${OUT}/slot99end`, 'end');
      },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete g.__swI91Cap;
    proto.updateLiquid = oUpd;
  }
  writeFileSync(`${OUT}/j-liqlog.txt`, lines.join('\n') + '\n');
  writeFileSync(`${OUT}/j-settlev.txt`, evLines.join('\n') + '\n');
  console.log(`liqlog lines=${lines.length} ev lines=${evLines.length} first=${lines[1] ?? lines[0]} last=${lines[lines.length - 1]}`);
}, 600_000);
