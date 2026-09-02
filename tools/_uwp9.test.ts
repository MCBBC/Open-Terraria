// 一次性诊断:#28 HF 入口状态对拍——UW 段后(dump028 中 HF 不可触区)与 dump28 的差,
// 特别验证 (1114,1043-45) 蛛网在 VAN=HF 内被 TileFrame 击杀而我方 UW 段提前清。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runUnderworldPass } from '../src/world/gen/vanilla/UnderworldPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const t27 = RUN ? new Uint16Array(load(27, 'typ', 'Webs').buffer.slice(0)) : new Uint16Array(0);
const a27 = RUN ? load(27, 'act', 'Webs') : Buffer.alloc(0);
const w27 = RUN ? new Uint16Array(load(27, 'wal', 'Webs').buffer.slice(0)) : new Uint16Array(0);
const l27 = RUN ? load(27, 'liq', 'Webs') : Buffer.alloc(0);
const t28 = RUN ? new Uint16Array(load(28, 'typ', 'Underworld').buffer.slice(0)) : new Uint16Array(0);
const a28 = RUN ? load(28, 'act', 'Underworld') : Buffer.alloc(0);

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
const LT = RUN ? readFileSync('/tmp/sw-uwp/entry.lty') : Buffer.alloc(0);   // ★套件门(2026-09-02):夹具在 /tmp,RUN=1 才读——防默认 sweep 收集期炸

(RUN ? it : it.skip)('HF entry state diff (UW output vs dump28 non-tower zones)', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t27[i]) ?? 0;
    st.flags[i] = a27[i] ? 1 : 0;
    st.wall[i] = w27[i];
    st.liquid[i] = l27[i];
    st.liquidType[i] = LT[i] === 1 ? 2 : LT[i] === 0 ? 1 : LT[i];
  }
  const rng = new RNG(rt.gs.seed);
  runUnderworldPass(st, rng, rt.gs);
  // HF 不可触区 = 塔可能区之外:粗略用 y<1000(hellTop 以上 UW 段也写过)不可靠,
  // 改为全图 act/typ 差并过滤「塔区」x∈[1040,3300]∩y∈[1000,1180]。简单起见:全图差,
  // 报告差格的 typ 分布与样例。
  let n = 0;
  const byTyp = new Map<string, number>();
  const ex: string[] = [];
  for (let y = 990; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const js = SHEET[st.type[i]] === -1 ? 30583 : SHEET[st.type[i]];
      if ((st.flags[i] !== 0) !== (a28[i] !== 0) || ((st.flags[i] !== 0) && js !== t28[i])) {
        n++;
        const k = `a${st.flags[i] ? 1 : 0}>${a28[i] ? 1 : 0} t${js}>${t28[i]}`;
        byTyp.set(k, (byTyp.get(k) ?? 0) + 1);
        if (ex.length < 12) ex.push(`(${x},${y}) a${st.flags[i] ? 1 : 0}>${a28[i] ? 1 : 0} t${js}>${t28[i]}`);
      }
    }
  }
  console.log('UW 输出 vs dump28 act/typ 差(y≥990):', n);
  console.log('分布:', [...byTyp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  console.log('样例:', ex.join(' '));
}, 480000);
