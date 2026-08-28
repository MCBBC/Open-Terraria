// IIII11 批一次性诊断：NTB 每调用（call 1..7）in/out 全球快照落盘 + 三件套之一。
// 复用 NotTheBeesPass.ts 既有 __swNTBCap(phase, gs, st) 钩（pristine 自带，零源改动）；
// 探针侧按调用序号 keying（IIII9 §⑥1 教训：不按调用号落盘会被覆盖成最后一次）。
// 快照格式与 x86 rig JJHook.DumpLiquidState K.* 完全同构：
//   typ=vanilla sheet id(u16, 不过滤活性) / act=bit0 / wal=u16 / liq=u8 /
//   lty=JS-1 基（=原版 0 基，不过滤活性）。W=4200 固定。
// 用法：cd game && SW_MB_1457=1 SW_III11=1 npx vitest run --cache=false tools/_iii11.test.ts
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_III11 === '1';
const OUT = '/tmp/iii11-out/jcall';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS?.[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('ntb per-call in/out snapshots', async () => {
  let callN = 0;
  let outstanding = false;
  const g0 = globalThis as {
    __swNTBCap?: (phase: string, gs: unknown, st: {
      w: number; h: number; type: Uint16Array; wall: Uint16Array;
      flags: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array;
    }) => void;
    __swNTBChron?: (tag: string, a: number, b: number) => void;
  };
  // IIII11：chron 流缓冲（call 边界打 CALLBEGIN/CALLEND 与 rig 对齐）
  const chronAll: string[] = [];
  g0.__swNTBChron = (tag, a, b) => { chronAll.push(`${tag} ${a} ${b}`); };
  g0.__swNTBCap = (phase, _gs, st) => {
    if (phase === 'in') {
      if (outstanding) throw new Error('ntbcap pairing broken: in before out');
      callN++;
      outstanding = true;
      chronAll.push(`CALLBEGIN ${callN} 0`);
    } else if (phase === 'out') {
      if (!outstanding) throw new Error('ntbcap pairing broken: out before in');
      outstanding = false;
      chronAll.push(`CALLEND ${callN} 0`);
    } else return;
    const dir = `${OUT}/${phase}-${callN}`;
    const n = st.w * st.h;
    const typ = new Uint16Array(n);
    const wal = new Uint16Array(n);
    const act = new Uint8Array(n);
    const liq = new Uint8Array(n);
    const lty = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const t = st.type[i]!;
      const s = t >= 0 && t < SHEET.length ? SHEET[t]! : -1;
      typ[i] = s >= 0 ? s : 65000;
      wal[i] = st.wall[i]!;
      act[i] = st.flags[i] !== 0 ? 1 : 0;
      liq[i] = st.liquid[i]!;
      const lt = st.liquidType[i]!;
      lty[i] = lt > 0 ? lt - 1 : 0;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/K.typ`, Buffer.from(typ.buffer));
    writeFileSync(`${dir}/K.wal`, Buffer.from(wal.buffer));
    writeFileSync(`${dir}/K.act`, act);
    writeFileSync(`${dir}/K.liq`, liq);
    writeFileSync(`${dir}/K.lty`, lty);
    console.log(`[iii11] snap ${phase}-${callN} -> ${dir}`);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1372357239', evil: -1 as -1 | 0 | 1,
      seedFlags: { notTheBees: true },
      // ★槽末快照（口径同 _mile8 SLOT_END）：50 微群系 / 51 二次沉降 / 52 仙人掌珊瑚
      onWorldPartial: (w, slot) => {
        const want = new Set([48, 49, 50, 51, 52]);
        if (!want.has(slot)) return;
        const st = w.store;
        const dir = `${OUT}/jslot-${String(slot).padStart(2, '0')}`;
        const n = st.w * st.h;
        const typ = new Uint16Array(n);
        const wal = new Uint16Array(n);
        const act = new Uint8Array(n);
        const liq = new Uint8Array(n);
        const lty = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          const t = st.type[i]!;
          const s = t >= 0 && t < SHEET.length ? SHEET[t]! : -1;
          typ[i] = s >= 0 ? s : 65000;
          wal[i] = st.wall[i]!;
          act[i] = st.flags[i] !== 0 ? 1 : 0;
          liq[i] = st.liquid[i]!;
          const lt = st.liquidType[i]!;
          lty[i] = lt > 0 ? lt - 1 : 0;
        }
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/K.typ`, Buffer.from(typ.buffer));
        writeFileSync(`${dir}/K.wal`, Buffer.from(wal.buffer));
        writeFileSync(`${dir}/K.act`, act);
        writeFileSync(`${dir}/K.liq`, liq);
        writeFileSync(`${dir}/K.lty`, lty);
      },
    });
    console.log(`[iii11] done calls=${callN}`);
  } finally {
    writeFileSync('/tmp/iii11-out/j-chron.txt', chronAll.join('\n') + '\n');
    g0.__swNTBCap = undefined;
    g0.__swNTBChron = undefined;
  }
}, 900_000);
