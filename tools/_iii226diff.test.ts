// IIII226 批取证仪①（源=_iii220diff+_iii220dm 合并改锚）：graveyard #97 Micro_Biomes
// 槽段取证——JS 096(蜂巢幼虫)/097(微群系) 两槽末 10 通道落盘 + pass97 段账（__swSeg）
// + 轨历史 TH/P1/P2（TrackPass 探针）。★跨链复测已证 GFB 三刀对 graveyard 零级联
// （m8-baseline.log 与 IIII221 移交态逐位恒等），本仪为纯 G2 dump 取证三步法第①步。
// 用法: cd game && SW_I226=1 npx vitest run tools/_iii226diff.test.ts
// 产物: /tmp/iii226-out/{js096,js097}/*.{typ,typj,act,wal,liq,lty,half,slope,inact,frx,fry,wir,ghj}
//       /tmp/iii226-out/{roll-account.txt,js-dmlog226.txt}
import { it } from 'vitest';
import { writeFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';

const RUN = process.env.SW_I226 === '1';
const OUT = process.env.SW_I226_OUT ?? '/tmp/iii226-out';
const SEED = process.env.SW_I226_SEED ?? 'nightofthelivingdead|20260903';

(RUN ? it : it.skip)('iii226 grv slot 96/97 dump + roll account + track hist', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { __setTrackHistProbe, __setTrackColProbe, __setTrackDraws } =
    await import('../src/world/gen/vanilla/TrackPass');
  const W = 4200, H = 1200, N = W * H;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }

  mkdirSync(`${OUT}/js096`, { recursive: true });
  mkdirSync(`${OUT}/js097`, { recursive: true });
  rmSync(`${OUT}/roll-account.txt`, { force: true });
  const log = (s: string) => appendFileSync(`${OUT}/roll-account.txt`, s + '\n');
  rmSync(`${OUT}/js-dmlog226.txt`, { force: true });
  const dlog = (s: string) => appendFileSync(`${OUT}/js-dmlog226.txt`, s + '\n');

  g.__swSeg = (name: unknown, detail?: unknown) => {
    const n = String(name);
    if (/^(passStart|deadCands|deadCount|DMPICK|DMPLACE|CHEST|CAND|GATE|ADDED|iceCount|118TI|swordAttempts|STRY|SOK|campCount|CAMPPRE|CAMP|mbMine|trapCount|MINEPRE|MINEDONE|mbTree|treeCount|MAHOGPRE|MAHOG|mbTrack|longTrackCount|LTRK|stdTrackCount|STRK|mbLavaS|lavaJ|tAtt|lavaOk|mbEnd|mShaft|mB0pre|mB0post|mB1pre|mB1post|mTop1pre|mTop1post|mTop2pre|mTop2post|mLeafPre|mLeafPost|mRoots|mChestPre|mChestPost|mOk|CScircleRaw|CS1circleFail|CS2dims|CS3canFail|MS1solid|MS2wall|MS3rl|MS4|MS5shape|MS6ratioFail|MS7canFail|MS8|MS9killFail|SWDS|DRT|BFR|BCHK|EXPL)/.test(n)) {
      log(`SEG ${n} ${detail ?? ''} rc=${rollN}`);
      dlog(`SEG ${n} ${detail ?? ''} rc=${rollN}`);
    }
  };

  __setTrackHistProbe((tag, hist, len, dir, ox, oy) => {
    if (tag === 'TPFS') {
      dlog(`TPFS ${ox},${oy} rc=${rollN}`);
      return;
    }
    dlog(`${tag} len=${len} rc=${rollN} dir=${dir} origin=${ox},${oy}`);
    let buf = '';
    for (let i = 0; i < len; i++) {
      const c = hist[i]!;
      buf += `${i}:${c.x},${c.y},${c.slope},${c.mode};`;
      if ((i & 15) === 15) {
        dlog(`TH ${buf}`);
        buf = '';
      }
    }
    if (buf.length > 0) dlog(`TH ${buf}`);
  });
  __setTrackColProbe((loop, k, x, y, ph, rc) => {
    dlog(`P${loop} ${k} rc=${rc} ph${ph} @${x},${y}`);
  });

  let rollN = 0;
  const oRoll = g.__swOnRoll as ((v: number) => void) | undefined;
  g.__swOnRoll = (v: number) => { rollN++; oRoll?.(v); };
  __setTrackDraws(() => rollN);

  let rollsAt96 = -1;
  const dump = (dir: string, st: {
    type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
    wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array;
    slope: Uint8Array; wire: Uint8Array;
  }) => {
    const typ = new Uint16Array(N);
    const typj = new Uint16Array(N);
    const ghj = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      const t = st.type[i]!;
      typj[i] = t;
      const sh = SHEET[t] ?? -1;
      typ[i] = sh >= 0 ? sh : 9999;
      ghj[i] = (st.flags[i]! & 1) ? 0 : typ[i]!;
    }
    const act = new Uint8Array(N), wal = new Uint16Array(N), liq = new Uint8Array(N);
    const lty = new Uint8Array(N), half = new Uint8Array(N), slope = new Uint8Array(N);
    const inact = new Uint8Array(N), frx = new Uint16Array(N), fry = new Uint16Array(N);
    const wir = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      act[i] = st.flags[i]! & 1;
      wal[i] = st.wall[i]!;
      liq[i] = st.liquid[i]!;
      lty[i] = st.liquid[i]! > 0 ? (st.liquidType[i]! > 0 ? st.liquidType[i]! - 1 : 0) : 0;
      half[i] = st.half[i]!;
      slope[i] = st.slope[i]!;
      inact[i] = (st.wire[i]! >>> 5) & 1;
      frx[i] = st.frameX[i]!;
      fry[i] = st.frameY[i]!;
      wir[i] = st.wire[i]! & 63;
    }
    const w = (n: string, a: Uint8Array | Uint16Array) =>
      writeFileSync(`${dir}/${n}`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    w('typ', typ); w('typj', typj); w('act', act); w('wal', wal); w('liq', liq);
    w('lty', lty); w('half', half); w('slope', slope); w('inact', inact);
    w('frx', frx); w('fry', fry); w('wir', wir); w('ghj', ghj);
  };

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { graveyardBloodmoonStart: true },
      onWorldPartial: (w2, _i, name) => {
        if (name === '蜂巢幼虫') {
          dump(`${OUT}/js096`, w2.store as never);
          rollsAt96 = rollN;
          log(`slot96-end rolls=${rollN}`);
        } else if (name === '微群系') {
          dump(`${OUT}/js097`, w2.store as never);
          log(`slot97-end rolls=${rollN} pass97Rolls=${rollN - rollsAt96}`);
        }
      },
    });
  } finally {
    g.__swSeg = undefined;
    __setTrackHistProbe(undefined);
    __setTrackColProbe(undefined);
    g.__swOnRoll = oRoll;
    __setTrackDraws(undefined);
    log(`done rolls=${rollN}`);
  }
});
