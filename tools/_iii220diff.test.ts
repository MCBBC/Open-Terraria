// IIII220 批取证仪①：GFB #97 Micro_Biomes 槽段取证——JS 096(蜂巢幼虫)/097(微群系)
// 两槽末 10 通道落盘 + pass97 掷流账（__swOnRoll 全局钩跨槽计数）+ 段账（__swSeg）。
// 判例：XCIII（IIII218）#90 纯 G2 dump 取证法；IIIII209 三账递进定罪法。
// 用法：cd game && SW_I220=1 npx vitest run tools/_iii220diff.test.ts
// 产物：/tmp/iii220-out/{js096,js097}/*.{typ,act,wal,liq,lty,half,slope,inact,frx,fry,wir}
//       /tmp/iii220-out/roll-account.txt（段账+掷流账）
import { it } from 'vitest';
import { writeFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I220 === '1';
const OUT = process.env.SW_I220_OUT ?? '/tmp/iii220-out';
const SEED = process.env.SW_I220_SEED ?? '9293480';
const G2 = process.env.SW_I220_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = Number(process.env.SW_I220_W ?? 4200), H = Number(process.env.SW_I220_H ?? 1200);
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iii220 slot 96/97 dump + roll account', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  mkdirSync(`${OUT}/js096`, { recursive: true });
  mkdirSync(`${OUT}/js097`, { recursive: true });
  rmSync(`${OUT}/roll-account.txt`, { force: true });
  const log = (s: string) => appendFileSync(`${OUT}/roll-account.txt`, s + '\n');

  let rollN = 0;
  const oRoll = g.__swOnRoll as ((v: number) => void) | undefined;
  g.__swOnRoll = (v: number) => { rollN++; oRoll?.(v); };
  // 段账：微群系 pass 的 segProbe 落盘（含 rc=mbDraws()）
  const oSeg = g.__swSeg as ((name: string, d?: unknown) => void) | undefined;
  g.__swSeg = (name: string, detail?: unknown) => {
    if (/^(passStart|deadCands|deadCount|DMPICK|DMPLACE|mbThin|iceCount|118TI|swordAttempts|STRY|SOK|mbSword|campCount|CAMPPRE|CAMP|mbMine|trapCount|MINEPRE|MINEDONE|mbTree|treeCount|MAHOGPRE|MAHOG|mbTrack|longTrackCount|LTRK|stdTrackCount|STRK|mbLavaS|lavaJ|tAtt|lavaOk|mbEnd)/.test(name)) {
      log(`SEG ${name} ${detail ?? ''} rc=${rollN}`);
    }
    oSeg?.(name, detail);
  };

  let rollsAt96 = -1, rollsAt97 = -1;
  const dump = (dir: string, st: {
    type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
    wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array;
    slope: Uint8Array; wire: Uint8Array;
  }) => {
    const typ = new Uint16Array(N);
    const typj = new Uint16Array(N);
    const ghj = new Uint16Array(N);   // ghost 面（非活性残留 JS id——对 mile8 Gh 口径的原版侧等价）
    for (let i = 0; i < N; i++) {
      const t = st.type[i]!;
      typj[i] = t;
      const sh = SHEET[t] ?? -1;
      typ[i] = sh >= 0 ? sh : 9999;
    }
    const act = new Uint8Array(N), wal = new Uint16Array(N), liq = new Uint8Array(N);
    const lty = new Uint8Array(N), half = new Uint8Array(N), slope = new Uint8Array(N);
    const inact = new Uint8Array(N), frx = new Uint16Array(N), fry = new Uint16Array(N);
    const wir = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      act[i] = st.flags[i]! & 1;
      wal[i] = st.wall[i]!;
      liq[i] = st.liquid[i]!;
      // JS liquidType=原版+1 基 → 落盘转回原版 0 基（仅 liquid>0 有效，0 一律 0）
      lty[i] = st.liquid[i]! > 0 ? (st.liquidType[i]! > 0 ? st.liquidType[i]! - 1 : 0) : 0;
      half[i] = st.half[i]!;
      slope[i] = st.slope[i]!;
      inact[i] = (st.wire[i]! >>> 5) & 1;
      frx[i] = st.frameX[i]!;
      fry[i] = st.frameY[i]!;
      wir[i] = st.wire[i]! & 63;
      // ghost：非活性残留（原版语义：active()==false 时 Tile.type 缺省 0，但本仓
      // store 保留原 type——按 mile8 Gh 口径原版侧 va=0 时 vg=c.typ（x86 dump 直读），
      // JS 侧 ghj 仅作对照，不入裁决）
      ghj[i] = act[i] ? 0 : typ[i]!;
    }
    const w = (n: string, a: Uint8Array | Uint16Array) =>
      writeFileSync(`${dir}/${n}`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    w('typ', typ); w('typj', typj); w('act', act); w('wal', wal); w('liq', liq);
    w('lty', lty); w('half', half); w('slope', slope); w('inact', inact);
    w('frx', frx); w('fry', fry); w('wir', wir); w('ghj', ghj);
  };

  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: (w2, _i, name) => {
      if (name === '蜂巢幼虫') {
        dump(`${OUT}/js096`, w2.store as never);
        rollsAt96 = rollN;
        log(`slot96-end rolls=${rollN}`);
      } else if (name === '微群系') {
        dump(`${OUT}/js097`, w2.store as never);
        rollsAt97 = rollN;
        log(`slot97-end rolls=${rollN} pass97Rolls=${rollN - rollsAt96}`);
        log(`G2 pc.txt P|97|R 参考=1272854（+段账/尾 RandNext 口径差另行判读）`);
      }
    },
  });
  g.__swOnRoll = oRoll;
  g.__swSeg = oSeg;
  log(`done rolls=${rollN}`);
  void G2;
});
