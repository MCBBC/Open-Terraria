// IIII62（REMIX #28 UW 七杀案）一次性取证：JS 管线 quickWater 中间态对拍仪。
// 与 x86 rig 私有钩（/tmp/iii64-rig-src JJHook QwBegin/QwEnd/LsevSettle +
// Liquid.cs 注入）同格式配对：
//   · 每次 sim.quickWater() 出口全图 4 通道快照 qw{NN}.liq/.lty/.act/.typ
//     （行主序 y 外 x 内；lty 先 -1 归一为 vanilla 0 基；typ=u16 LE 原始含 ghost）
//   · manifest 行 "BEG/END <seq> ..."，与 rig qw-manifest.txt 按 seq 配对；
//     END 行带 liq/lty 的 FNV-1a(u32) 十六进制（与 pc.txt 同算法自证通道一致）
//   · SW_I64_ROWSPEC="y0:y1:x0:x1;..." 时改走「复刻驱动器」——逐格原子调真
//     settleWaterAt，规格带内每行行尾落 qwr{NN}_{Y}.bin=[boxLiq|boxLty|boxAct]
//     （首行盒定行序；行为准对拍沉降轨迹的首分歧行）
// 只读世界+写文件、零 RNG 触碰。
// 用法: cd game && SW_I64=1 npx vitest run tools/_iii64qw.test.ts
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_I64 === '1';
const SEED = process.env.SW_I64_SEED ?? '1138154190';
const EVIL = Number(process.env.SW_I64_EVIL ?? 0);
const W = Number(process.env.SW_I64_W ?? 4200), H = Number(process.env.SH_I64_H ?? process.env.SW_I64_H ?? 1200);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I64_FLAGS ?? 'remix').split(',').filter(Boolean)) FLAGS[f] = true;
const OUT = process.env.SW_I64_OUT ?? '/tmp/iii64-out/js-qw';

/** SW_I64_SEVBOX="x0,x1,y0,y1"：沉降逐调盒快照（与 rig SevSnap 同构同格式） */
const SEVBOX = (() => {
  const s = process.env.SW_I64_SEVBOX;
  if (!s) return null;
  const p = s.split(',').map(Number);
  return p.length === 4 ? p : null;
})();
const WIN_HW = 20, WIN_UP = 5, WIN_DN = 40;

function winBytes(st: {
  w: number; h: number; idx(x: number, y: number): number; liquid: Uint8Array; liquidType: Uint8Array; flags: Uint8Array;
}, ox: number, oy: number): Uint8Array {
  const bw = WIN_HW * 2 + 1, bh = WIN_UP + WIN_DN + 1;
  const outb = new Uint8Array(bw * bh * 3);
  let k = 0;
  for (let yy = oy - WIN_UP; yy <= oy + WIN_DN; yy++) {
    for (let xx = ox - WIN_HW; xx <= ox + WIN_HW; xx++, k++) {
      if (xx < 0 || xx >= st.w || yy < 0 || yy >= st.h) continue; // 与 rig 相同：越界=全零
      const i2 = st.idx(xx, yy);
      const ltRaw = st.liquidType[i2];
      outb[k] = st.liquid[i2];
      outb[bw * bh + k] = ltRaw > 0 ? ltRaw - 1 : 0;
      outb[bw * bh * 2 + k] = st.flags[i2] ? 1 : 0;
    }
  }
  return outb;
}

interface Cap {
  liquid: Uint8Array; liquidType: Uint8Array; flags: Uint8Array; type: Uint16Array;
  w: number; h: number; idx(x: number, y: number): number;
}
const dumpPre = (stArg: Cap, s: number) => {
  const sp = snap(stArg);
  const n = String(s).padStart(2, '0');
  writeFileSync(`${OUT}/${n}_qwpre.liq`, Buffer.from(sp.liq.buffer));
  writeFileSync(`${OUT}/${n}_qwpre.lty`, Buffer.from(sp.lt.buffer));
  writeFileSync(`${OUT}/${n}_qwpre.act`, Buffer.from(sp.act.buffer));
};

/** spec 解析："y0:y1:x0:x1;..." */
const SPECS = (process.env.SW_I64_ROWSPEC ?? '').split(';').filter(Boolean).map((s) => {
  const p = s.split(':').map(Number);
  return { y0: Math.min(p[0], p[1]), y1: Math.max(p[0], p[1]), x0: Math.min(p[2], p[3]), x1: Math.max(p[2], p[3]) };
});

interface Snap { liq: Uint8Array; lt: Uint8Array; act: Uint8Array; typ: Uint16Array }
function snap(st: {
  w: number; h: number; idx(x: number, y: number): number;
  liquid: Uint8Array; liquidType: Uint8Array; flags: Uint8Array; type: Uint16Array;
}): Snap {
  const n = st.w * st.h;
  const liq = new Uint8Array(n), ltRaw = new Uint8Array(n), act = new Uint8Array(n);
  const typ = new Uint16Array(n);
  // 直接拷整块（store 数组布局即行主序 y 外 x 内，st.idx == y*w+x）后统一 lty -1 归一
  liq.set(st.liquid);
  ltRaw.set(st.liquidType);
  act.set(st.flags);
  typ.set(st.type);
  const lt = new Uint8Array(n);
  for (let i = 0; i < n; i++) lt[i] = ltRaw[i] > 0 ? ltRaw[i] - 1 : 0;
  return { liq, lt, act, typ };
}
function fnv(b: Uint8Array | Uint16Array): string {
  // FNV-1a 32bit，按字节小端扫（与 JJHook.Fnv 同算法：u16 数组按内存 LE 序）
  const u8 = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) {
    h ^= u8[i];
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

(RUN ? it : it.skip)('i62 quickwater intermediate parity probe', async () => {
  mkdirSync(OUT, { recursive: true });
  const man: string[] = [];
  let lastLabel = 'pre';
  let curStore: Parameters<typeof snap>[0] | null = null;
  let done = false;

  const proto = LiquidSim.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  const oQW = proto.quickWater;
  const oSettle = (proto as unknown as { settleWaterAt: (...a: never[]) => unknown }).settleWaterAt;
  let seq = 0;
  let qwPending = 0;
  const idxLines: string[] = [];

  // IIII62·二轮：沉降逐调盒快照仪（与 rig SevSnap 同名同格式落盘）
  if (SEVBOX) {
    writeFileSync(`${OUT}/sev-index.txt`, '');
    let sevCnt = 0;
    (proto as unknown as { settleWaterAt: (x: number, y: number) => void }).settleWaterAt =
      function (this: unknown, ox: number, oy: number) {
        const sim2 = this as unknown as { world: { store: Parameters<typeof winBytes>[0] } };
        if (ox < SEVBOX![0] || ox > SEVBOX![1] || oy < SEVBOX![2] || oy > SEVBOX![3]) {
          return (oSettle as (x: number, y: number) => void).call(this, ox, oy);
        }
        const pre = winBytes(sim2.world.store, ox, oy);
        const r = (oSettle as (x: number, y: number) => void).call(this, ox, oy);
        const post = winBytes(sim2.world.store, ox, oy);
        const base = `sev${String(qwPending).padStart(2, '0')}_${String(sevCnt).padStart(6, '0')}`;
        writeFileSync(`${OUT}/${base}_p.bin`, Buffer.from(pre.buffer));
        writeFileSync(`${OUT}/${base}_q.bin`, Buffer.from(post.buffer));
        idxLines.push(`${sevCnt} ${ox} ${oy}`);
        sevCnt++;
        return r;
      };
    console.log(`[i64qw] SEVBOX on ${SEVBOX}`);
  }

  const dumpFull = (stArg: Parameters<typeof snap>[0], s: number, tag: string) => {
    const sp = snap(stArg);
    const n = String(s).padStart(2, '0');
    writeFileSync(`${OUT}/${n}_qw.liq`, Buffer.from(sp.liq.buffer));
    writeFileSync(`${OUT}/${n}_qw.lty`, Buffer.from(sp.lt.buffer));
    writeFileSync(`${OUT}/${n}_qw.act`, Buffer.from(sp.act.buffer));
    writeFileSync(`${OUT}/${n}_qw.typ`, Buffer.from(sp.typ.buffer));
    man.push(`END ${s} ${tag} FL:${fnv(sp.liq)} FT:${fnv(sp.lt)}`);
    console.log(`[i64qw] END ${s} FL:${fnv(sp.liq)} FT:${fnv(sp.lt)}`);
  };

  if (SPECS.length === 0) {
    proto.quickWater = function (this: unknown, ...a: never[]) {
      man.push(`BEG ${seq} v=? pass=${lastLabel}`);
      qwPending = seq;
      dumpPre((this as unknown as { world: { store: unknown } }).world.store as never, seq);
      const r = (oQW as (...x: unknown[]) => unknown).apply(this, a as unknown[]);
      dumpFull((this as unknown as { world: { store: Parameters<typeof snap>[0] } }).world.store, seq, `pass=${lastLabel}`);
      seq++;
      return r;
    };
  } else {
    // 复刻驱动器：LiquidSim.quickWater 本体逐句镜像（真实私有方法/settleWaterAt），
    // 规格带内逐行落盘。与原版差异仅文件写出（零 RNG）。
    proto.quickWater = function (this: unknown, minYArg?: number, maxYArg?: number) {
      const sim = this as unknown as {
        world: { store: Parameters<typeof snap>[0] };
        generatingWorld: boolean; isGeneratingOrLoadingWorld: boolean;
        shimmerRemoveWater(): void; tilesIgnoreWater(b: boolean): void;
        settleWaterAt(x: number, y: number): void; liquidInteractionsCleanup(): void;
        solidNP: Uint8Array; id379: number;
      };
      const st = sim.world.store;
      man.push(`BEG ${seq} v=? pass=${lastLabel}`);
      qwPending = seq;
      dumpPre(st, seq);
      if (sim.generatingWorld) sim.shimmerRemoveWater();
      sim.solidNP[sim.id379] = 1;
      sim.tilesIgnoreWater(true);
      const minY = minYArg ?? 3;
      const yMax = (maxYArg ?? -1) < 0 ? st.h - 3 : maxYArg!;
      for (let y = yMax; y >= minY; y--) {
        for (let x = 4; x < st.w - 4; x++) {
          if (st.liquid[st.idx(x, y)] !== 0) sim.settleWaterAt(x, y);
        }
        const sp = SPECS.find((q) => y >= q.y0 && y <= q.y1);
        if (sp) {
          const bw = sp.x1 - sp.x0 + 1;
          const liq = new Uint8Array(bw), lt = new Uint8Array(bw), act = new Uint8Array(bw);
          for (let k = 0; k < bw; k++) {
            const ii = st.idx(sp.x0 + k, y);
            liq[k] = st.liquid[ii];
            const ltr = st.liquidType[ii];
            lt[k] = ltr > 0 ? ltr - 1 : 0;
            act[k] = st.flags[ii];
          }
          const out = new Uint8Array(bw * 3);
          out.set(liq, 0); out.set(lt, bw); out.set(act, bw * 2);
          writeFileSync(`${OUT}/qwr${String(seq).padStart(2, '0')}_${String(y).padStart(5, '0')}.bin`,
            Buffer.from(out.buffer));
        }
      }
      sim.tilesIgnoreWater(false);
      if (sim.generatingWorld) sim.shimmerRemoveWater();
      if (sim.generatingWorld) sim.liquidInteractionsCleanup();
      dumpFull(st, seq, `pass=${lastLabel}`);
      seq++;
    };
  }

  // GLM ▶label 追踪（同 _i60snap 手法）：reseed 栈回溯最近 ▶标签 → manifest 语境列
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) {
      try { src = require('node:fs').readFileSync(file, 'utf8').split('\n'); } catch { src = []; }
      srcCache.set(file, src);
    }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };

  try {
    // UnderworldPass 入口钩（源生 __swUwCap）：抓 GenState 阈值域（remix 落水分型带）
    (globalThis as unknown as { __swUwCap?: (gs: Record<string, unknown>) => void }).__swUwCap = (gs) => {
      man.push(`GS uw ws=${gs.worldSurface} rock=${gs.rockLevel} waterLine=${gs.waterLine} lavaLine=${gs.lavaLine}`
        + ` shimmer=${gs.shimmerX},${gs.shimmerY} remixW=${JSON.stringify((gs as unknown as { genRemixWater?: unknown }).genRemixWater ?? null)}`);
      console.log(`[i64qw] GS ${man[man.length - 1]}`);
    };
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as 0,
      seedFlags: FLAGS,
      onWorldPartial: (_w, _i, _pn) => {
        if (!curStore) curStore = (_w.store as never);
      },
    });
    done = true;
  } finally {
    proto.quickWater = oQW;
  }
  if (SEVBOX) writeFileSync(`${OUT}/sev-index.txt`, idxLines.join('\n') + '\n');
  writeFileSync(`${OUT}/js-qw-manifest.txt`, man.join('\n') + '\n');
  console.log(`[i64qw] seq=${seq} done=${done} out=${OUT}`);
}, 900_000);
