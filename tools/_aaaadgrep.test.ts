// AAAA 批：s12345 地牢债隔离重放裁决。
//  · SW_AAA_DGCAP=1：JS 全管线跑 seed 12345，捕获 ▶Dungeon 输入态（gs v8 + 全通道）
//    落 /tmp/aaaa-12345-cap/，并与 oracle slush 六通道（/tmp/aaaa-oracle/s12345-slush.*）
//    对拍：差格数 + y 分带直方图 + 前若干差格坐标（定位上游债务是否波及地牢区）。
//  · SW_AAA_DGREP=1：oracle slush 六通道 + JS 捕获的帧/线/漆重建 store →
//    runDungeonPass 重放 → 与 oracle chain2（/tmp/aaaa-oracle/s12345-chain2.json）
//    的 dungeonL..dungeon 17 段对拍；SW_AAA_DGREP_SEG=1 时逐段 rolls/fnv 对拍
//    （oracle DGFLOWSEC：L233 E428 PD428 Pi3661 S7385 D7676 W7721 P7748 C8000
//     B117462 G117962 I141261 T142178 F173951 Pa175719 Ba179633 END179633）。
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { serialize as v8Serialize, deserialize as v8Deserialize } from 'node:v8';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200, N = W * H;
const CAP = '/tmp/aaaa-12345-cap';
const O = '/tmp/aaaa-oracle';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (s !== undefined && !REV.has(s)) REV.set(s, i);
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const SEED = process.env.SW_AAA_SEED ?? '12345';
const EVIL = (process.env.SW_AAA_EVIL === '0' ? 0 : 1) as 0 | 1;

// oracle 六通道（slush 末态 = Dungeon 输入，vanilla 真值）
const oTyp = le16(`${O}/s12345-slush.typ`), oAct = readFileSync(`${O}/s12345-slush.act`);
const oWal = le16(`${O}/s12345-slush.wal`), oLiq = readFileSync(`${O}/s12345-slush.liq`);
const oHalf = readFileSync(`${O}/s12345-slush.half`), oSlope = readFileSync(`${O}/s12345-slush.slope`);

// ================= Mode A：JS ▶Dungeon 输入捕获 + 对拍 =================
if (process.env.SW_AAA_DGCAP === '1') {
  it('capture JS Dungeon input for 12345 + cmp oracle slush', async () => {
    mkdirSync(CAP, { recursive: true });
    let liveStore: TileStore | null = null;
    let capDone = false;
    class Ab extends Error { constructor(m: string) { super(m); } }
    const RNGp = RNG.prototype as unknown as Record<string, unknown>;
    const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
    RNGp.reseed = function (this: unknown, s: number) {
      const st = liveStore;
      if (st && !capDone) {
        const stack = new Error().stack ?? '';
        for (const line of stack.split('\n')) {
          const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
          if (m && !m[1].includes('/core/rng') && !m[1].includes('_aaaadgrep')) {
            if (m[1].endsWith('/WorldGen.ts')) {
              // WorldGen.ts 管线 reseed = pass 头重播；判定下一个 pass 名
              const src = readFileSync(m[1], 'utf8').split('\n');
              for (let l = Number(m[2]); l < Number(m[2]) + 8 && l < src.length; l++) {
                if (/runDungeonPass/.test(src[l] ?? '')) {
                  capDone = true;
                  writeFileSync(`${CAP}/gs.bin`, v8Serialize(lastGenState()));
                  const wr = (name: string, a: Uint8Array | Uint16Array) => {
                    writeFileSync(`${CAP}/${name}`, Buffer.from(a.buffer, a.byteOffset, a.byteLength).slice());
                  };
                  wr('in.type', st.type); wr('in.flags', st.flags); wr('in.wall', st.wall);
                  wr('in.liquid', st.liquid); wr('in.liquidType', st.liquidType);
                  wr('in.half', st.half); wr('in.slope', st.slope); wr('in.wire', st.wire);
                  wr('in.paint', st.paint); wr('in.frameX', st.frameX); wr('in.frameY', st.frameY);
                  console.log('captured ▶Dungeon input');
                  break;
                }
              }
            }
            break;
          }
        }
      }
      return oReseed.call(this, s);
    };
    const t0 = Date.now();
    try {
      await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL, onWorldPartial: (w) => { liveStore = w.store as never as TileStore; } });
    } catch (e) {
      if (!(e instanceof Ab)) { RNGp.reseed = oReseed; throw e; }
    } finally { RNGp.reseed = oReseed; }
    console.log(`gen ${((Date.now() - t0) / 1000).toFixed(0)}s capDone=${capDone}`);
    if (!capDone) throw new Error('未捕获到 ▶Dungeon');
    // ---- 对拍 oracle slush 六通道 ----
    const jType = new Uint16Array(N), jAct = new Uint8Array(N);
    const capType = new Uint16Array(N), capFlags = new Uint8Array(N);
    {
      const bT = readFileSync(`${CAP}/in.type`); const capTyp = new Uint16Array(bT.buffer, bT.byteOffset, bT.length >> 1);
      const capFlg = readFileSync(`${CAP}/in.flags`);
      for (let i = 0; i < N; i++) { capType[i] = capTyp[i]!; capFlags[i] = capFlg[i]!; }
    }
    for (let i = 0; i < N; i++) {
      jAct[i] = capFlags[i]! & 1;
      jType[i] = jAct[i] ? (SHEET[capType[i]!] ?? 0x7777) : 0;
    }
    const capW = le16(`${CAP}/in.wall`);
    const capLiq = readFileSync(`${CAP}/in.liquid`);
    const capHalf = readFileSync(`${CAP}/in.half`);
    const capSlope = readFileSync(`${CAP}/in.slope`);
    let dT = 0, dA = 0, dW = 0, dL = 0, dH = 0, dS = 0;
    const yHist = new Uint32Array(12);   // 100 行一桶
    const samples: string[] = [];
    for (let i = 0; i < N; i++) {
      const y = (i / W) | 0;
      let d = false;
      if (oAct[i] !== jAct[i]) { dA++; d = true; }
      if (oTyp[i] !== jType[i]) { dT++; d = true; }
      if (oWal[i] !== capW[i]) { dW++; d = true; }
      if (oLiq[i] !== capLiq[i]) { dL++; d = true; }
      if (oHalf[i] !== capHalf[i]) { dH++; d = true; }
      if (oSlope[i] !== capSlope[i]) { dS++; d = true; }
      if (d) {
        yHist[Math.min(11, (y / 100) | 0)]++;
        if (samples.length < 30) {
          samples.push(`(${i % W},${y}) act${oAct[i]}/${jAct[i]} typ${oTyp[i]}/${jType[i]} wal${oWal[i]}/${capW[i]} liq${oLiq[i]}/${capLiq[i]}`);
        }
      }
    }
    console.log(`JS输入 vs oracle slush: typ=${dT} act=${dA} wal=${dW} liq=${dL} half=${dH} slope=${dS}`);
    console.log(`y 分带(×100行): ${Array.from(yHist).join(',')}`);
    console.log(samples.join('\n'));
  }, 900_000);
}

// ================= Mode B：oracle 输入 → JS DungeonPass 重放 → 17 段对拍 =================
if (process.env.SW_AAA_DGREP === '1') {
  it('isolated DungeonPass replay from oracle slush state', () => {
    const chain = JSON.parse(readFileSync(`${O}/s12345-chain2.json`, 'utf8')) as { checkpoints: string[] };
    const gold = new Map<string, string>();
    const goldWall = new Map<string, string>();
    for (const line of chain.checkpoints) {
      const [name, typ, act, wal, liq] = line.split(/[| ]+/);
      if (name.startsWith('dungeon')) { gold.set(name, `${typ} ${act} ${liq}`); goldWall.set(name, wal); }
    }
    // oracle 六通道 + liquidType/帧线漆借 JS 捕获
    const capLty = readFileSync(`${CAP}/in.liquidType`);
    const st = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      st.flags[i] = oAct[i] ? 1 : 0;
      st.type[i] = oAct[i] ? (REV.get(oTyp[i]!) ?? 0) : 0;
      st.wall[i] = oWal[i]!;
      st.liquid[i] = oLiq[i]!;
      st.liquidType[i] = oLiq[i]! > 0 ? capLty[i]! : 0;
      st.half[i] = oHalf[i]!;
      st.slope[i] = oSlope[i]!;
    }
    st.wire.set(readFileSync(`${CAP}/in.wire`));
    st.paint.set(readFileSync(`${CAP}/in.paint`));
    st.frameX.set(le16(`${CAP}/in.frameX`));
    st.frameY.set(le16(`${CAP}/in.frameY`));
    const gs = v8Deserialize(readFileSync(`${CAP}/gs.bin`)) as GenState;
    console.log(`gs: dungeonLocation=${(gs as unknown as Record<string, number>).dungeonLocation} side=${(gs as unknown as Record<string, number>).dungeonSide} theme=${(gs as unknown as Record<string, number>).dungeonTheme} entSeed=${(gs as unknown as Record<string, number>).dungeonEntSeed} A=${(gs as unknown as Record<string, number>).dungeonEntA} B=${(gs as unknown as Record<string, number>).dungeonEntB}`);
    const chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }> = [];
    let rolls = 0;
    const rng2 = new RNG((gs as unknown as Record<string, number>).seed);
    const rAny = rng2 as unknown as Record<string, unknown>;
    const oInt = rAny.int as (...a: number[]) => number;
    const oNextInt = rAny.nextInt as (...a: number[]) => number;
    const oNext = rAny.next as () => number;
    rAny.int = (...a: number[]) => { rolls++; return oInt.apply(rng2, a); };
    rAny.nextInt = (...a: number[]) => { rolls++; return oNextInt.apply(rng2, a); };
    rAny.next = (...a: number[]) => { rolls++; return oNext.apply(rng2, a); };
    const fnvState = (): string => {
      const ur = (rng2 as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
      let fh = 0x811c9dc5;
      for (let q = 0; q < 56; q++) {
        const v = ur.seedArray[q]! >>> 0;
        for (let s = 0; s < 32; s += 8) fh = Math.imul(fh ^ ((v >>> s) & 0xff), 16777619) >>> 0;
      }
      const u = ur.inext >>> 0;
      for (let s = 0; s < 32; s += 8) fh = Math.imul(fh ^ ((u >>> s) & 0xff), 16777619) >>> 0;
      return (fh >>> 0).toString(16).padStart(8, '0');
    };
    const fnv16 = (a: Uint16Array): string => { let h = 0x811c9dc5; for (let k = 0; k < N; k++) { const v = a[k]!; h = Math.imul(h ^ (v & 0xff), 16777619) >>> 0; h = Math.imul(h ^ (v >>> 8), 16777619) >>> 0; } return (h >>> 0).toString(16).padStart(8, '0'); };
    const fnv8 = (a: Uint8Array): string => { let h = 0x811c9dc5; for (let k = 0; k < N; k++) { const v = a[k]!; h = Math.imul(h ^ v, 16777619) >>> 0; h = Math.imul(h, 16777619) >>> 0; } return (h >>> 0).toString(16).padStart(8, '0'); };
    const mapped = new Uint16Array(N), actB = new Uint8Array(N);
    const snapFn = (name: string): void => {
      for (let i = 0; i < N; i++) {
        const a = st.flags[i]! & 1;
        actB[i] = a;
        mapped[i] = a ? (SHEET[st.type[i]!] ?? 0x7777) : 0;
      }
      const tri = `${fnv16(mapped)} ${fnv8(actB)} ${fnv8(st.liquid)}`;
      const wl = fnv16(st.wall);
      const g = gold.get(name);
      const ok = g === tri && goldWall.get(name) === wl;
      if (process.env.SW_AAA_DGREP_SEG) {
        console.log(`${ok ? '✓' : '✗'} ${name} rolls=${rolls} fnv=${fnvState()} ${ok ? '' : `\n   g=${g} ${goldWall.get(name)}\n   j=${tri} ${wl}`}`);
      } else {
        console.log(`${ok ? '✓' : `✗ ${name} g=${g} ${goldWall.get(name)} j=${tri} ${wl}`}`);
      }
    };
    const t0 = Date.now();
    runDungeonPass(st, rng2, gs, chests as never, snapFn);
    console.log(`replay ${((Date.now() - t0) / 1000).toFixed(0)}s rolls=${rolls} fnv=${fnvState()}`);
  }, 900_000);
}
