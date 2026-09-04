// IIII95：REMIX 修面回归「关键槽五点」仪（#0 地形 / #45 Wet_Jungle / #46 Jungle_Temple /
// #47 Hives / #105 Final_Cleanup——对被改 HiveSpiderPass+CaveWallsPass 的前后夹逼+两端锚）。
// 三模式（互斥；恒一测试跳过另二）：
//   A · DUMP：   SW_SPOT_CHAIN=g …            —— G2 八通道对拍（mile8 同口径、无 act-continue）
//   B · AB-WRT： SW_SPOT_ABW=/dir             —— 无 G2 桶（const 等）：当前树基线快照落盘
//                （须配 SW_SPOT_NOFIX=1 关掉本批两支新 remix 臂＝A 侧，目录充当回归基线）
//   C · AB-CMP： SW_SPOT_ABC=/dir             —— 默认树（臂在位＝B 侧）vs 基线快照逐字节
// 用法示例：
//   cd game && SW_MB_1457=1 SW_SPOT_CHAIN=g npx vitest run tools/_iii100spot.test.ts
//   cd game && SW_MB_1457=1 SW_SPOT_CHAIN=const SW_SPOT_NOFIX=1 SW_SPOT_ABW=/tmp/iii100-out/ab-const npx vitest run tools/_iii100spot.test.ts
//   cd game && SW_MB_1457=1 SW_SPOT_CHAIN=const SW_SPOT_ABC=/tmp/iii100-out/ab-const npx vitest run tools/_iii100spot.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';

interface ChainCfg { name: string; seed: string; evil: -1 | 0 | 1; flags?: Record<string, boolean>; w?: number; h?: number; g2?: string }
const HOME = process.env.HOME ?? '';
const C = (...p: string[]): string => `${HOME}/GoldenChains/${p.join('/')}`;
const CHAINS: Record<string, ChainCfg> = {
  g:         { name: 'g',         seed: '9293480',    evil: 0,  g2: C('golden-g') },
  s22222:    { name: 's22222',    seed: '22222',      evil: 1,  g2: C('gen2-s22222') },
  m:         { name: 'm',         seed: '20260811',   evil: 0,  w: 6400, h: 1800, g2: C('gen2-m') },
  // ★IIIII107b2（2026-09-04）：const 桶重产接居——endgame 权威桶 /tmp/rrrr-out/x86-const 与
  //   iii98 regen 拷贝双双 /tmp 灭失后,按 runbook §4 重产（seed=1321365005 + 官方
  //   serverconfig 键 seed_theconstant=1,i128-rig SW_DUMP_ALL 面）,72/72 sample md5 ≡
  //   cert-endgame TRUTH-MANIFEST['const']（中立性自证）→ 迁居 ~/GoldenChains/golden-const,
  //   本链由 AB 模式升格为 A·DUMP 八通道对拍（evil=-1=随机邪恶随种子,与 cert lane-params 一致）
  const:     { name: 'const',     seed: '1321365005', evil: -1, flags: { theConstant: true }, g2: C('golden-const') },
  ntb:       { name: 'ntb',       seed: '1372357239', evil: -1, flags: { notTheBees: true }, g2: C('gen2-ntb') },
  // ★IIIII97b：notraps/c12345 桶收养迁居（原直引 /tmp 灭失高危路径，照 fishmox §0-1
  //   前例迁 ~/GoldenChains；golden-notraps 含 pc2.txt sha256 9de78680…fdb，两桶
  //   五点 8 通道完备性迁移前实测通过）
  notraps:   { name: 'notraps',   seed: '1896728457', evil: 1,  flags: { noTraps: true }, g2: C('golden-notraps') },
  c12345:    { name: 'c12345',    seed: '12345',      evil: 1,  g2: C('gen2-12345') },
  // ★IIIII97b 笔误纠偏：认证配方=20260829/E1/skyblock（专用仪 _i46 实证 rc0；
  // IIII96b §④ 警示项落地——旧值 evil:0 为 spot 表笔误）
  // ★IIIII154 销账改锚：denyAll 世界 JS 侧不注册 LihzahrdTemple/Beehives/JungleShrines
  //   三个 reseed 标签（金标桶三 dump 文件其实在）→ 45/46/47 结构性不可达；空岛加型槽使
  //   JS 槽序 +1（断线陷阱清理=58、终清理=59）→ 旧 `i==58→dump105` 硬锚把 JS#58 对上
  //   桶#105=「T668>0×2/W41@(2169,218)」伪红（=桶自身 104→105 FinalCleanup 增量:668×2+
  //   画墙继承 41 格,_i46 专用仪 d:104/d:105 双零差在案）。pts=[0,105]+名锚化销账。
  skyblock:  { name: 'skyblock',  seed: '20260829',   evil: 1,  flags: { skyblock: true }, g2: C('golden-skyblock'), pts: [0, 105] },
  drunk:     { name: 'drunk',     seed: '51620200',   evil: -1, flags: { drunkWorld: true }, g2: C('golden-drunk') },
  celeb:     { name: 'celeb',     seed: '1999040562', evil: 0,  flags: { tenthAnniversary: true }, g2: C('golden-celeb') },
  toadstool: { name: 'toadstool', seed: '771002',     evil: 0,  flags: { surfaceIsMushrooms: true }, g2: C('golden-toadstool') },
  // ★IIIII96b：fishmox 桶由 /tmp/iii80-out/x86-fishmox 迁居 ~/GoldenChains/golden-fishmox
  fishmox:   { name: 'fishmox',   seed: '771003',     evil: 0,  flags: { noInfection: true }, g2: C('golden-fishmox') },
  // ★IIIII99e：FTW 链五点接入（G2=IIIII90b 迁址权威 ~/GoldenChains/golden-ftw）
  ftw:       { name: 'ftw',       seed: '1671560105', evil: 0,  flags: { getGoodWorld: true }, g2: C('golden-ftw') },
  // ★IIIII104：pumpkin/jagged 五点接入（配方=m8all.sh/jagged 章）
  // ★IIIII227：G2 迁居真身 ~/GoldenChains（runbook L60-61:原 /tmp/iii84-out、/tmp/iii80-out
  //   仅 symlink 已灭，照 IIII97b 桶收养前例改直引 HOME 真身）
  // ★IIIII110b（2026-09-04）配方勘误销账：桶=IIIII202 重产（i171-rig,无旗域 IIII163 定谳,
  //  x86 全 110 dump 254=0、active 指纹≡ctl171）——旧 flags:{halloweenGen:true} 是把 JS
  //  文本路由出的旗注进对拍=CXV c12345 EVIL 漂移同判例（伪红面：mile8 #86 起 20 行 +
  //  五点 #105 T165/T373 族「登记红」全部=旗级联伪影,旗关即归零,见 /tmp/iii140-out）。
  //  配方=runbook「无旗」原文：flags:{} 直注压掉 parseSeedChain 回退（cfg.seedFlags 非
  //  nullish 即短路文本路由）。如未来桶带 halloween 臂重产,再按新桶配方回填本行。
  pumpkin:   { name: 'pumpkin',   seed: 'pumpkinseason|20260904', evil: 0, flags: {}, g2: C('x86-i78-pumpkin') },
  jagged:    { name: 'jagged',    seed: '771005',     evil: 0,  flags: { digExtraHoles: true }, g2: C('x86-jagged') },
  // ★IIIII111c（2026-09-02）：涂装族五点接入（G2=IIII132 涂装桶 /tmp/iii132-out/paint；
  //  五点不含 pnt/pwal/cbt 三通道——漆/涂层全域对拍以 mile8 _iii81m8 SW_I81_PAINT=1 为准，
  //  invisibleplane/negativeinfinity 已 106 行满绿收官，xrayvision 同）
  // ★IIIII161（2026-09-04）：iii132 桶 /tmp 灭失（IIIII156 两红=环境债），改指 ~/GoldenChains/i106
  //  重产桶（配方可勘误式 1.1.1.0.<flag>|<base>⇒小世界/经典/腐化，与下行 seed/evil 参数恒等；
  //  run.log「Seed: xrayvision|106107, 4200×1200, Evil: 0」在桶自证）
  xrayvision: { name: 'xrayvision', seed: 'xrayvision|106107', evil: 0, g2: C('i106/x86-xrayvision') },
  monochrome: { name: 'monochrome', seed: 'monochrome|106108', evil: 0, g2: C('i106/x86-monochrome') },
  // ★IIIII134（2026-09-04）：waterpark/remix 五点接入（III134 批回归矩阵交办面;
  //   配方=runbook §1 golden-waterpark/golden-remix 行;remix G2=dumps 子目录布局）
  waterpark: { name: 'waterpark', seed: 'waterpark|20260905', evil: 0, flags: { extraLiquid: true }, g2: C('golden-waterpark') },
  remix:     { name: 'remix',     seed: '1138154190',       evil: -1, flags: { remix: true }, g2: C('golden-remix/dumps') },
  // ★IIIII101c（2026-09-04）：planetoids 五点接入——G2=LIX 旗标真值链 golden-planetoids
  //  （SW_FLAG_PLD 直注 rig 产;本批 stx-pld 复刻 pc 106/106 全等再证）;配方=runbook LIX 表行。
  planetoids: { name: 'planetoids', seed: 'planetoids|20260908', evil: 0, flags: { roundLandmasses: true }, g2: C('golden-planetoids') },
  // ★IIIII101g（2026-09-04）：sgis 五点接入——G2=golden-sgis（runbook §4 重产,i109 rig
  //  +SW_FLAG_SGIS 臂,seed=771001/E0;arm Enabled=True 落证+八通道 103 行全绿双证）。
  sgis: { name: 'sgis', seed: '771001', evil: 0, flags: { surfaceIsInSpace: true }, g2: C('golden-sgis') },
  // ★IIIII110b（2026-09-04）：arachnophobia 五点接入——G2=CXVII 秘种子迷你链桶
  //   mch3-arachno（i109 rig,seed='arachnophobia|20260904'/E0,配方=CXVII 章③;
  //   mile8 103/103 满绿认证桶）。旗面走种子文本路由（flags 缺省=不直注）。
  arachno: { name: 'arachno', seed: 'arachnophobia|20260904', evil: 0, g2: C('mch3-arachno') },
};

const KEY = process.env.SW_SPOT_CHAIN ?? '';
const cfg = CHAINS[KEY];
const RUN = !!cfg;
const ABW = process.env.SW_SPOT_ABW;
const ABC = process.env.SW_SPOT_ABC;
const NOFIX = process.env.SW_SPOT_NOFIX === '1';
/** A/B 写读侧快照文件名（含槽位名；NOFIX 基线只认 -nofix 文件前缀区分两侧） */
const SNAPSHOT_CHANS = ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;

if (NOFIX) {
  // A 侧环境哨兵：关掉本批新增的两支 remix 臂（HiveSpiderPass segCount/remix 加算与
  // CaveWallsPass 石墙分档），供 AB 基线拍摄。HiveSpiderPass/CaveWallsPass 各自读取。
  (globalThis as unknown as { __swSpNoFixArms?: boolean }).__swSpNoFixArms = true;
}

const SLOT_END_NAMES = new Map<number, string>([[0, '原版地形'], [58, '终清理']]);
const LABEL2DUMP = new Map<string, number>([
  ['LihzahrdTemple', 45], ['Beehives', 46], ['JungleShrines', 47],
]);
const N_POINTS = [0, 45, 46, 47, 105];
// ★IIIII154：denyAll 特形链点集覆盖（skyblock 45/46/47 标签点结构性不可达,见链表注）
const PTS = (cfg as unknown as { pts?: number[] } | undefined)?.pts ?? N_POINTS;

let DUMPNAME = new Map<number, string>();
{
  try {
    if (cfg?.g2) for (const f of readdirSync(cfg.g2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* ab/golden 模式无 g2 */ }
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const chansMissing = (idx: number): string[] => {
  const nm = DUMPNAME.get(idx);
  if (nm === undefined) return ['typ'];
  const pfx = `${cfg!.g2}/${String(idx).padStart(3, '0')}_${nm}`;
  if (!existsSync(`${pfx}.typ`)) return ['typ'];
  return (['act', 'wal', 'liq', 'half', 'slope', 'lty', 'inact'] as const)
    .filter((c) => !existsSync(`${pfx}.${c}`));
};

(RUN ? it : it.skip)(`five-key-slot parity chain=${KEY}${NOFIX ? '[A侧·noFix]' : ''}`, async () => {
  if (!cfg) throw new Error(`unknown SW_SPOT_CHAIN=${KEY}`);
  if ((ABW ? 1 : 0) + (ABC ? 1 : 0) > 1) throw new Error('ABW 与 ABC 互斥');
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const W = Number(process.env.SW_SPOT_W ?? cfg.w ?? 4200);
  const H = Number(process.env.SW_SPOT_H ?? cfg.h ?? 1200);
  const N = W * H;

  if (cfg.g2) {
    const miss = PTS.flatMap((i) => chansMissing(i).map((c) => `#${i}[${c}]`));
    if (miss.length) throw new Error(`${KEY}: G2 五点通道不全 ${miss.join(',')} (dir=${cfg.g2})`);
  }

  let store: TileStore | null = null;
  interface Row { idx: number; tag: string; bad: boolean; desc: string }
  const rows: Row[] = [];
  const seenIdx = new Set<number>();

  /** cmp vs G2 dump（mile8 全通道独立计数口径） */
  const cmpDump = (idx: number, tag: string): Row => {
    const nm = DUMPNAME.get(idx)!;
    const pfx = `${cfg!.g2}/${String(idx).padStart(3, '0')}_${nm}`;
    const xa = readFileSync(`${pfx}.act`); const xt = le16(`${pfx}.typ`);
    const xw = le16(`${pfx}.wal`); const xl = readFileSync(`${pfx}.liq`);
    const xhf = readFileSync(`${pfx}.half`); const xsl = readFileSync(`${pfx}.slope`);
    const xlt = readFileSync(`${pfx}.lty`); const xia = readFileSync(`${pfx}.inact`);
    const st = store!;
    const cnt = [0, 0, 0, 0, 0, 0, 0, 0];
    let fI = -1; const pairs = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { cnt[0]++; fI = fI < 0 ? i : fI; }
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) { cnt[1]++; fI = fI < 0 ? i : fI; const k = `T${vt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
      if (xw[i] !== st.wall[i]) { cnt[2]++; fI = fI < 0 ? i : fI; }
      if (xl[i] !== st.liquid[i]) { cnt[3]++; fI = fI < 0 ? i : fI; }
      if (xhf[i] !== st.half[i]) { cnt[4]++; fI = fI < 0 ? i : fI; }
      if (xsl[i] !== st.slope[i]) { cnt[5]++; fI = fI < 0 ? i : fI; }
      const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) { cnt[6]++; fI = fI < 0 ? i : fI; }
      const via = xia[i]! ? 1 : 0;
      const jia = (st.wire[i]! >>> 5) & 1;
      if (via !== jia) { cnt[7]++; fI = fI < 0 ? i : fI; }
    }
    const desc = `${cnt.map((v, k) => `${['A', 'T', 'W', 'L', 'Hf', 'Sl', 'Lt', 'Ia'][k]}=${String(v).padStart(6)}`).join(' ')}` +
      (cnt.some(Boolean) ? ` ✗ @(${fI % W},${(fI / W) | 0}) ${[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(' ')}` : ' ✓');
    console.log(`#${String(idx).padStart(3, '0')}_${nm} ← ${tag.padEnd(20)} ${desc}`);
    return { idx, tag, bad: cnt.some(Boolean), desc };
  };

  /** serialize/deserialize（_iii98tm 同构，仅八通道 + 八通道判定用 type 半字节无帧通道） */
  const serSt = (st: TileStore): Record<string, Uint8Array | Uint16Array> => {
    const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
    const out: Record<string, Uint8Array | Uint16Array> = {};
    for (const c of SNAPSHOT_CHANS) out[c] = rec[c];
    return out;
  };
  const writeSnap = (tagDir: string, slotName: string, idx: number): void => {
    const d = `${ABW}/${slotName.replace(/[^\w]/g, '_')}_${String(idx).padStart(3, '0')}${NOFIX ? '' : ''}`;
    mkdirSync(d, { recursive: true });
    const snap = serSt(store!);
    for (const c of Object.keys(snap)) writeFileSync(`${d}/${c}.bin`, Buffer.from(snap[c].buffer, snap[c].byteOffset, snap[c].byteLength));
    writeFileSync(`${d}/hdr.json`, JSON.stringify({ w: W, h: H }));
    console.log(`snap→ ${d}`);
  };
  const cmpSnap = (tagDir: string, slotName: string, idx: number): void => {
    const d = `${ABC}/${slotName.replace(/[^\w]/g, '_')}_${String(idx).padStart(3, '0')}`;
    if (!existsSync(`${d}/hdr.json`)) throw new Error(`${d}: AB 基线缺失`);
    const hdr = JSON.parse(readFileSync(`${d}/hdr.json`, 'utf8')) as { w: number; h: number };
    const snap = serSt(store!);
    let diffs = '';
    for (const c of Object.keys(snap)) {
      const cur = snap[c];
      const bytesPer = c === 'type' || c === 'wall' ? 2 : 1;
      const buf = readFileSync(`${d}/${c}.bin`);
      if (buf.length !== cur.length * bytesPer) throw new Error(`${d}/${c}: 尺寸漂移 ${buf.length}!=${cur.length * bytesPer}`);
      let n = 0, fI = -1;
      if (bytesPer === 2) {
        const ref = new Uint16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
        for (let i = 0; i < N; i++) if (ref[i] !== cur[i]) { n++; if (fI < 0) fI = i; }
      } else {
        for (let i = 0; i < N; i++) if (buf[i] !== cur[i]) { n++; if (fI < 0) fI = i; }
      }
      if (n) diffs += ` ${c}:${n}@(${fI % hdr.w},${(fI / hdr.w) | 0})`;
    }
    console.log(`#${String(idx).padStart(3, '0')} ← ${tagDir.padEnd(20)} ${diffs ? `✗ A/B 差${diffs}` : '✓ byte-identical'}`);
    rows.push({ idx, tag: slotName, bad: !!diffs, desc: diffs });
  };

  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  // ABW/ABC 显式给出时优先（即使链带 G2）——本批的跨车道免疫 A/B 通道
  const abMode = !!(ABW || ABC);
  // ABW 写侧：三个 reseed 锚点也照常拍快照（写模式无 G2 也可独立成立）
  RNGp.reseed = function (this: unknown, s: number) {
    if (store && ABW) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !seenIdx.has(idx)) {
            seenIdx.add(idx);
            writeSnap(ABW, lab, idx);
          }
          break;
        }
      }
      return oReseed.call(this, s);
    }
    if (store && !ABW && abMode) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !seenIdx.has(idx)) {
            seenIdx.add(idx);
            cmpSnap(lab, lab, idx);
          }
          break;
        }
      }
    } else if (store && !ABW) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !seenIdx.has(idx)) {
            seenIdx.add(idx);
            if (ABC) cmpSnap(lab, lab, idx);
            else if (cfg.g2) rows.push(cmpDump(idx, lab));
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: cfg.seed, evil: cfg.evil,
      seedFlags: cfg.flags,
      onWorldPartial: (w, i, pn) => {
        store = w.store as never as TileStore;
        // ★IIIII154 名锚化（仅 pts 覆盖链=skyblock）：空岛加型槽使 JS 槽序 +1
        //   （断线陷阱清理=58、终清理=59），旧 `i==58→dump105` 硬锚把 JS#58 对上桶#105
        //   =「T668>0×2/W41@(2169,218)」伪红（=桶自身 104→105 FinalCleanup 增量,
        //   _i46 专用仪 d:104/d:105 双零差在案）——改按槽名解析 dump 位。
        const ptsOverride = (cfg as unknown as { pts?: number[] } | undefined)?.pts;
        const nameIdx = ptsOverride
          ? (pn === '终清理' ? 105 : pn === '断线陷阱清理' ? 104 : undefined)
          : undefined;
        if (i === 0 || i === 58 || nameIdx !== undefined) {
          if (nameIdx === undefined && pn !== SLOT_END_NAMES.get(i)) {
            // D 特形桶旧硬锚记录（名锚化后 pts 链不再走此支）
            console.log(`[slot 命名差异] 槽末#${i} 实到「${pn}」（期望 ${SLOT_END_NAMES.get(i)}，记录不阻断）`);
          }
          const idx = nameIdx ?? (i === 0 ? 0 : 105);
          if (!seenIdx.has(idx)) {
            seenIdx.add(idx);
            if (ABC) cmpSnap('abcmp', pn, idx);
            else if (ABW) writeSnap(ABW, pn, idx);
            else if (cfg.g2) rows.push(cmpDump(idx, `槽末#${i}·${pn}`));
          }
        }
      },
    });
  } finally { RNGp.reseed = oReseed; }

  const missingPts = PTS.filter((i) => !seenIdx.has(i));
  if (missingPts.length) throw new Error(`${KEY}: 五点未全部取到,缺 ${missingPts}`);
  const bad = rows.filter((r) => r.bad);
  if (bad.length) throw new Error(`${KEY}: 五点出现差 → ${bad.map((r) => `#${r.idx}`).join(',')}${bad[0]?.desc ?? ''}`);
  console.log(`${KEY}: 五点全绿 ✓`);
}, 900_000);
