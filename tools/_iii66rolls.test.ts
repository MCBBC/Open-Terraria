// IIII66 批第二仪：FTW 窗口样本流对拍（JS 侧）。与 x86 rig 的 SW_ROLLWIN/SW_TAGLOG
// 同口径：---START <dumpIdx> / ---PASS <dumpIdx> <name> 分段，段内每行 `ln|value|api`。
// 取样钩=RNG 既有 __swOnRoll 观察点；api 经原型包装（UnifiedRandom/RNG 公共方法名）
// 记录调用面；实例锚=窗口内首个样本（≡rig MainInst 启发式），其余实例记 |XTRA 前缀。
import { it } from 'vitest';
import { writeFileSync, appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { readFileSync } from 'node:fs';

const RUN = process.env.SW_I66_ROLLS === '1';
/** SW_I66_STACKS=1：每掷附最近调用帧（src 域过滤,深度≤6）——与 rig SW_TAGLOG 的
 *  Terraria.* 帧对位。首个帧签名分歧=分支结构差真凶（值流相等的两实现可在
 *  相同骰序下走不同写入动作）。 */
const STACKS = process.env.SW_I66_STACKS === '1';
/** SW_I66_ACTS=1：动作事件流（__swSWAct 织入：S/P/K/T/B=坡/半砖/杀/补/踩），
 *  行格式 A|<ln>|<fn>|<x>|<y>|<e>；掷值行 R|<ln>|<v>。与 x86 taglog 的
 *  {lambda 直掷, KillTile 掷, Dust 掷} 三分类帧签名对位用。 */
const ACTS = process.env.SW_I66_ACTS === '1';
/** SW_I66_FNT=1：SQ 级联事件行（S|ln|x|y），与 rig SW_FNTLOG 的 SQ 序对位 */
const FNT = process.env.SW_I66_FNT === '1';
const STACK_FILTER = /(HalfBrick|Pots|Webs|Vines|Tree|TileRunner|Cleanup|world\/gen)/;
const SEED = process.env.SW_III66_SEED ?? '1671560105';
const EVIL = Number(process.env.SW_III66_EVIL ?? 0);
const OUT = process.env.SW_I66_ROLLS_OUT ?? '/tmp/iii66-out/jsrolls-ftw.txt';
const ABORT_SLOT = Number(process.env.SW_I66_ABORT_SLOT ?? -1);

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III66_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}
/** 目标槽末 dump 序号表（与 _mile8 SLOT_END 一致的全覆盖段；隔槽也标界,
 *  否则记流会把多个 vanilla pass 混进同段——ABORT 也须在表外槽生效） */
const SLOT_IDX = new Map<number, number>([
  [0, 0], [1, 1], [2, 13], [3, 35], [4, 36], [5, 37], [6, 38], [7, 39],
  [8, 48], [9, 49], [10, 50], [11, 51], [12, 52], [13, 53], [14, 54], [15, 55],
  [16, 56], [17, 57], [18, 63], [19, 64], [20, 65], [21, 66], [22, 67], [23, 68],
  [24, 69], [25, 70], [26, 71], [27, 72], [28, 73], [29, 74], [30, 75], [31, 76],
  [32, 77], [33, 78], [34, 79], [35, 80], [36, 81], [37, 82], [38, 83], [39, 84],
  [40, 85], [41, 87], [42, 88], [43, 89], [44, 90], [45, 91], [46, 93], [47, 94],
  [48, 95], [49, 96], [50, 97], [51, 98], [52, 99], [53, 100], [54, 101], [55, 102],
  [56, 103], [57, 104], [58, 105],
]);
const DUMPNAME = new Map<number, string>();

(RUN || process.env.SW_I66_REPLAY === '1'
  ? it
  : it.skip)('III66 FTW roll stream capture', async () => {
  // ★可选重放态注入（与 _iii66.test.ts 同源）：SW_I66_REPLAY=1 时以 x86-G2 052
  //   快照在 SmoothWorld 头覆写 store（loadI66ReplayStore），配合 ACTS/STACKS 得到
  //   「同输入下的我方动作流」。
  if (process.env.SW_I66_REPLAY === '1') {
    const b16 = (pp: string): Uint16Array => {
      const bb = readFileSync(pp);
      return new Uint16Array(bb.buffer, bb.byteOffset, bb.length >> 1);
    };
    const u8 = (pp: string): Uint8Array => new Uint8Array(readFileSync(pp));
    const gx = process.env.SW_I66_G2 ?? '/tmp/iii44-out/x86-ftw';
    const preX = `${gx}/052_Shell_Piles`;
    const preJ = `${process.env.SW_I66_OUT ?? '/tmp/iii66-out/jsdump'}/052_Shell_Piles`;
    (globalThis as Record<string, unknown>).__SW_I66_PRE_STATE = {
      t: b16(`${preX}.typ`), a: u8(`${preX}.act`), w: b16(`${preX}.wal`),
      l: u8(`${preX}.liq`), lt: u8(`${preX}.lty`), hf: u8(`${preX}.half`),
      sl: u8(`${preX}.slope`), ia: u8(`${preX}.inact`), jt: b16(`${preJ}.rawtyp`),
    };
  }
  console.log(`[cfg] SLOT_IDX.has(12)=${SLOT_IDX.has(12)} val=${SLOT_IDX.get(12)} ABORT_SLOT=${process.env.SW_I66_ABORT_SLOT} seed=${SEED}`);
  for (const f of readdirSync('/tmp/iii44-out/x86-ftw')) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  mkdirSync('/tmp/iii66-out', { recursive: true });
  // ── api 包装：公共方法进入时记 curApi（同步嵌套安全：__swOnRoll 在栈内同线触发）
  let curApi = '?';
  const wrapC = (proto: object, names: string[]): void => {
    for (const nm of names) {
      const o = (proto as Record<string, (...a: unknown[]) => unknown>)[nm];
      if (typeof o !== 'function') continue;
      (proto as Record<string, unknown>)[nm] = function (...a: unknown[]) {
        const prev = curApi;
        curApi = `${nm}(${a.map((x) => String(x)).join(',')})`;
        try { return o.apply(this, a); } finally { curApi = prev; }
      };
    }
  };
  wrapC(UnifiedRandom.prototype, ['next', 'nextIntRange', 'nextInt', 'nextDouble', 'peek']);
  wrapC(RNG.prototype, ['next', 'int', 'range', 'chance', 'pick', 'nextInt', 'nextIntRange']);

  const lines: string[] = [];
  let rec = false;
  let ln = 0;
  let mainKey: object | null = null;
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const actsH = (globalThis as unknown as { __swSWAct?: (f: string, x: number, y: number, e: number) => void });
  if (ACTS) {
    actsH.__swSWAct = (f: string, x: number, y: number, e: number) => {
      if (!rec || lines.length > 60_000_000) return;
      lines.push(`A|${ln}|${f}|${x}|${y}|${e}`);
    };
  }
  if (FNT || ACTS) {
    (globalThis as unknown as { __swFntSq?: (x: number, y: number) => void }).__swFntSq =
      (x: number, y: number): void => {
        if (!rec || lines.length > 60_000_000) return;
        lines.push(`Q|${ln}|${x}|${y}`);
      };
  }
  g.__swOnRoll = (v: number, inst: object) => {
    if (!rec || lines.length > 60_000_000) return;
    if (ACTS) {
      ln++;
      lines.push(`R|${ln}|${v}`);
      return;
    }
    ln++;
    let tag: string;
    if (!STACKS) {
      if (mainKey === null) mainKey = inst;
      const isMain = inst === mainKey;
      tag = isMain ? curApi : 'XTRA|';
    } else {
      // 栈捕获：跳过 rng 自身帧，取前 6 个含 src/world 域的帧
      if (ACTS) {
        // 动作版不需要栈；由 swAct 钩另行落行
        tag = '';
      } else {
        const save = Error.stackTraceLimit;
        Error.stackTraceLimit = 12;
        const st = new Error().stack ?? '';
        Error.stackTraceLimit = save;
        const fr = st.split('\n').slice(1)
          .map((s) => s.trim())
          .filter((s) => !/rng\.ts|core/.test(s))
          .map((s) => s.replace(/^at /, '').replace(/ \/Users[^ ]*game\//, ' ').replace(/\?.*$/, '').slice(0, 90))
          .slice(0, 3);
        tag = fr.join('|');
      }
    }
    lines.push(`${ln}|${v}|${tag}`);
    if (ln % 65536 === 0) process.stderr.write(`[rolls] ${ln}\n`);
  };

  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: Number(process.env.SW_III66_W ?? 4200), height: Number(process.env.SW_III66_H ?? 1200),
      seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (_w, i, pn) => {
        // ★勘误（IIII66）：①ABORT 须先于映射门(否则表外槽永不中止——曾把
        //   栈版探针拖到 10min 超时)；②本表为 number(dump 序号)，首版误用
        //   .d 字段(undefined)导致 rec 永假。
        if (i === ABORT_SLOT || i >= 58) throw new AbortOK(`rolls-abort-${i}`);
        const d = SLOT_IDX.get(i);
        if (d === undefined) return;
        if (!rec && d >= 52) { rec = true; mainKey = null; lines.push(`---START ${d}`); }
        else if (rec) { lines.push(`---PASS ${d} ${DUMPNAME.get(d) ?? '?'}`); }
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
  }
  g.__swOnRoll = undefined;
  rmSync(OUT, { force: true });
  // 分块落盘（栈版曾因 join 超 V8 字符串上限炸写盘）
  let buf: string[] = [];
  let fw = 0;
  const flush = (): void => {
    appendFileSync(OUT, buf.join('\n') + '\n');
    fw += buf.length;
    buf = [];
  };
  for (const l of lines) { buf.push(l); if (buf.length >= 1_000_000) flush(); }
  if (buf.length) flush();
  console.log(`rolllog written ${fw} lines -> ${OUT}`);
}, 900_000);
