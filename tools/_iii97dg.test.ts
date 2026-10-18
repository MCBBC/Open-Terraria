// IIII93 批一次性探针：FTW 地牢域(#32 Dungeon)反演重放实验室。
//   设计：mile8 实证 FTW 0..31 全绿 ⇒ x86 dump031_Slush ≡ 我方 live 态（八通道）。
//   在 ▶Dungeon reseed 时点把 G2 权威 031_Slush 八通道整图注入 store
//   （复用 loadI66ReplayStore，jt=我方 live rawtyp 保真），管线原样跑完地牢城邦族，
//   在 ▶MountainCaveOpenings reseed 前（=地牢域全部写完）落盘 js32 快照。
//   若残差 == live 行32 签名 ⇒ 分歧面完全锁定在地牢 pass 内部；再按窗口掷数/
//   坐标事件定位首分叉。
// 用法：
//   SW_I97DG=1 npx vitest run tools/_iii97dg.test.ts            # 反演重放
//   SW_I97_REPLAY=0 …                                           # 仅抓 live 快照
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { loadI66ReplayStore } from '../src/world/gen/vanilla/HalfBrickPass';

const RUN = process.env.SW_I97DG === '1';
const REPLAY = process.env.SW_I97_REPLAY !== '0';
const G2 = process.env.SW_I97_G2 ?? `${process.env.HOME ?? ''}/GoldenChains/golden-ftw`;
const OUT = process.env.SW_I97_OUT ?? '/tmp/iii97-out/jsreplay';
const SEEDV = process.env.SW_I97_SEED ?? '1.1.1.4.1671560105';
const W = Number(process.env.SW_I97_W ?? 4200), H = Number(process.env.SW_I97_H ?? 1200);
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** 与 tools/_mile8.test.ts 同源标签提取 */
const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('III97 ftw dungeon inversion replay', async () => {
  mkdirSync(OUT, { recursive: true });
  const b16 = (p: string): Uint16Array => {
    const buf = readFileSync(p);
    return new Uint16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };
  const u8v = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

  interface St {
    t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; lt: Uint8Array;
    hf: Uint8Array; sl: Uint8Array; ia: Uint8Array; jt: Uint16Array | null;
  }

  // ★主实例精确绑定：reseed 后首个样本即主流（x86 JJHook.MainInst 同构）
  const mainRef = { inst: null as object | null, rc: 0 };
  // ★累计主流掷（整个生成期不重置）：与 x86 JJHook MainRolls 累计口径同构
  (globalThis as unknown as Record<string, unknown>).__i97cum = { n: 0 };
  const prevOnRoll = (globalThis as unknown as Record<string, unknown>).__swOnRoll;
  // —— 掷流计数钩：__swOnRoll 全实例分账窗口=Dungeon→MountainCaveOpenings ——
  //   （pc.txt 权威=x86 genRand 累计掷数；JS 内部 hall LCG 实例也走 internalSample，
  //   故按实例分桶取最大桶为主流真账。）
  const rolling = { on: false, total: 0, map: new Map<object, number>() };
  const windowMain = { rc: 0 };
  (globalThis as unknown as Record<string, unknown>).__swOnRoll = (_v: number, inst: object) => {
    if (mainRef.inst === null) mainRef.inst = inst;      // 首样本=主流锚（pass 头后立即重掷）
    if (!rolling.on) return;
    if (inst === mainRef.inst) { mainRef.rc++; windowMain.rc++; ((globalThis as unknown as { __i97cum?: { n: number } }).__i97cum!).n++; }
    rolling.total++;
    rolling.map.set(inst, (rolling.map.get(inst) ?? 0) + 1);
  };
  // —— 段级观察：每段累计主流账（x86 rig MakeDungeon mark 同位对拍源）——
  const SEGDUMP = (process.env.SW_I97_SEG_DUMP ?? '').split(',').filter(Boolean);
  (globalThis as unknown as Record<string, unknown>).__dgSegWatch = (name: string, st2: typeof curStore) => {
    let best = 0;
    for (const v of rolling.map.values()) if (v > best) best = v;
    console.log(`[i97][seg] ${name} totalInner+main=${rolling.total} mainBest=${best} mainRC=${(globalThis as unknown as { __swRollN?: number }).__swRollN ?? -1} winMain=${windowMain.rc}`);
    if (SEGDUMP.includes(name)) dumpStore(st2 as never, `${OUT}/seg_${name}`);
  };
  const rp = RNG.prototype as unknown as Record<string, unknown>;
  const oInt = rp.internalSample as (this: unknown) => number;
  const oReseed = rp.reseed as (this: unknown, s: number) => void;

  let curStore: Parameters<typeof dumpStore>[0] | null = null;
  let doneDump = false;

  rp.internalSample = function (this: unknown): number {
    if (rolling.on) rolling.count++;
    return oInt.call(this);
  };
  rp.reseed = function (this: unknown, s: number) {
    mainRef.inst = null;                                 // ★每 pass 头重绑主流实例（与 x86 MainInst 复位同构）
    windowMain.rc = 0;
    if (curStore && !doneDump) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii97dg')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (REPLAY && lab === 'Dungeon') {
            console.log(`[i97] base injection @▶Dungeon`);
            const jt = new Uint16Array(curStore.type);       // live rawtyp 保真源
            (globalThis as unknown as Record<string, unknown>).__SW_I66_PRE_STATE = {
              t: b16(`${G2}/031_Slush.typ`), a: u8v(`${G2}/031_Slush.act`),
              w: b16(`${G2}/031_Slush.wal`), l: u8v(`${G2}/031_Slush.liq`),
              lt: u8v(`${G2}/031_Slush.lty`), hf: u8v(`${G2}/031_Slush.half`),
              sl: u8v(`${G2}/031_Slush.slope`), ia: u8v(`${G2}/031_Slush.inact`), jt,
            };
            loadI66ReplayStore(curStore);
            dumpStore(curStore, `${OUT}/base31inj`);         // 注入基座自检快照
            rolling.on = true;                               // 窗口起算
            void jt;
          } else if (lab === 'MountainCaveOpenings') {
            rolling.on = false;
            let bestInst = 0; for (const v of rolling.map.values()) if (v > bestInst) bestInst = v;
            console.log(`[i97] dungeon window rolls total=${rolling.total} mainBest=${bestInst} insts=${rolling.map.size}`);
            dumpStore(curStore, `${OUT}/js32`);
            doneDump = true;
            class AbortOK extends Error {}
            throw new AbortOK('i97-abort-after-dungeon');
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };

  // —— 布局/厅道追踪仪挂载（与 x86 rig itN/startpos 标记同位对拍）——
  const layoutTrace: Array<Record<string, number>> = [];
  const hallTrace: Array<Record<string, number>> = [];
  const wvLines: string[] = [];
  (globalThis as unknown as Record<string, unknown>).__dgLayoutTrace = layoutTrace;
  (globalThis as unknown as Record<string, unknown>).__dgHallTrace = hallTrace;
  (globalThis as unknown as Record<string, unknown>).__wvLines = wvLines;
  (globalThis as unknown as Record<string, unknown>).__dgPitTrace = [];
  (globalThis as unknown as Record<string, unknown>).__dgPitReason = [];
  (globalThis as unknown as Record<string, unknown>).__i97dgp = [];

  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: W, height: H, seedText: SEEDV,
      onWorldPartial: (w2) => { if (!curStore) curStore = w2.store as never as typeof curStore; },
    });
    console.log('[i97] generation completed without abort hook?');
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
    console.log(`[i97] aborted after dungeon ${REPLAY ? '(replayed)' : '(live)'} OK`);
  } finally {
    rp.reseed = oReseed;
    rp.internalSample = oInt;
    const pitT = (globalThis as { __dgPitTrace?: Array<Record<string, number>> }).__dgPitTrace;
    const pitR = (globalThis as { __dgPitReason?: string[] }).__dgPitReason;
    const dgpT = (globalThis as unknown as { __i97dgp?: Array<{ name: string; cum: number }> }).__i97dgp;
    if (dgpT) writeFileSync(`${OUT}/dgp-trace.json`, JSON.stringify(dgpT));
    if (pitT) writeFileSync(`${OUT}/pit-trace.json`, JSON.stringify(pitT));
    if (pitR) writeFileSync(`${OUT}/pit-reason.json`, JSON.stringify(pitR));
    const TT98 = (globalThis as unknown as { __dgTowerTrace?: Record<string, number | string> }).__dgTowerTrace;
    if (TT98) writeFileSync(`${OUT}/tower-trace.json`, JSON.stringify(TT98));
    writeFileSync(`${OUT}/layout-trace.json`, JSON.stringify(layoutTrace));
    writeFileSync(`${OUT}/hall-trace.json`, JSON.stringify(hallTrace));
    writeFileSync(`${OUT}/wvlines.log`, wvLines.join('\n'));
  }
}, 900_000);

interface StoreView {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}
function dumpStore(st: StoreView, pre: string): void {
  const typ = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    typ[i] = ja
      ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)
      : (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
  }
  const lt = new Uint8Array(N);
  for (let i = 0; i < N; i++) lt[i] = st.liquidType[i]! > 0 ? st.liquidType[i]! - 1 : 0;
  writeFileSync(`${pre}.typ`, Buffer.from(typ.buffer));
  writeFileSync(`${pre}.rawtyp`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
  writeFileSync(`${pre}.act`, Buffer.from(st.flags.slice()));
  writeFileSync(`${pre}.wal`, Buffer.from(st.wall.buffer, st.wall.byteOffset, st.wall.byteLength));
  writeFileSync(`${pre}.liq`, Buffer.from(st.liquid.slice()));
  writeFileSync(`${pre}.half`, Buffer.from(st.half.slice()));
  writeFileSync(`${pre}.slope`, Buffer.from(st.slope.slice()));
  writeFileSync(`${pre}.lty`, Buffer.from(lt));
  const ia = new Uint8Array(N);
  for (let i = 0; i < N; i++) ia[i] = (st.wire[i]! >>> 5) & 1;
  writeFileSync(`${pre}.inact`, Buffer.from(ia));
  console.log(`[i97] dumped ${pre}`);
}
