// IIII55 批·分解仪 v2：把两侧 attempt 日志在【双状态×双谓词】网格上离线重放。
//   状态：J=JS 蜘蛛前快照(snap-pre.bin, sheet 域)/ X=x86 dump062(vanilla 原始域)
//   谓词：P_van=原版 Main.SetupTileAttribute 表(tileSolid∧!tileSolidTop∧!half∧slope0∧!inActive)
//         P_js =HiveSpiderPass.countTiles.solidTile 精确复刻(genSolidType∧!def.platform∧…)
// 指标：
//   A. oracle 校验——P_van(X)≡[SP]count、P_js(J)≡cand.log count（命中即建模正确）
//   B. Δpred=count(X,P_js)-count(X,P_van)：同状态换谓词>0 ⇒ JS 把可淹格当实心；<0 反之
//      ——**谓词级 bug 探测器，与上游状态债完全正交**
//   C. Δstate=count(J,P_van)-count(X,P_van)：同一原版谓词喂两边状态的差=上游债传导量
//   D. sheet→platform 缺口表：world 内出现的 sheet 中 JS 当实心而原版非实心（或反之）
// 用法: SW_I55B=1 npx vitest run tools/_i55b.test.ts [SW_I55B_M=全量]
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { genSolidType } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I55B === '1';
const OUT = '/tmp/iii55-out';
const W = 4200, H = 1200, N = W * H;
const MALL = process.env.SW_I55B_M === undefined;

// —— 原版表 + SpiderCaves 时点的生成期翻转补丁（GenSolid 时间线核实）
const vt = RUN ? JSON.parse(readFileSync(`${OUT}/van-tables.json`, 'utf8')) as { solid: number[]; top: number[] } : { solid: [] as number[], top: [] as number[] };   // ★套件门:RUN=0 不读夹具
const V_SOLID = new Uint8Array(1024);
const V_TOP = new Uint8Array(1024);
for (const s of vt.solid) V_SOLID[s] = 1;
for (const s of vt.top) V_TOP[s] = 1;
// ★翻转补丁（1458 行号锚）：
//   192 LivingTrees 尾 cs:15789 / 481-483 DungeonCrawler.cs:344 / 484 DesertBiome cs:12537
//   225 LifeCrystals 尾 cs:16944（FTW 无 notTheBees 臂）/ 226+162+190 UndergroundHouses 尾 cs:17220-23
//   （162 后来只在 BeeLarva 21047 才回 true）/ 137、191 已还原 true。
//   ★翻转集合不再全局硬编码——见下方校准矩阵 zeroSetVan 逐配置处理

interface State {
  act: Uint8Array; typ: Uint16Array; wal: Uint16Array; liq: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
}
function u8Of(b: Buffer): Uint8Array { const c = new Uint8Array(b.length); c.set(b); return c; }
function u16Of(b: Buffer): Uint16Array { const c = new Uint8Array(b.length); c.set(b); return new Uint16Array(c.buffer); }
function readSnap(path: string): State {
  const b = readFileSync(path);
  return {
    act: new Uint8Array(u8Of(b.subarray(0, N))),
    typ: new Uint16Array(u16Of(b.subarray(N, 3 * N)).buffer.slice(0)),
    wal: new Uint16Array(u16Of(b.subarray(3 * N, 5 * N)).buffer.slice(0)),
    liq: new Uint8Array(u8Of(b.subarray(5 * N, 6 * N))),
    hf: new Uint8Array(u8Of(b.subarray(6 * N, 7 * N))),
    sl: new Uint8Array(u8Of(b.subarray(7 * N, 8 * N))),
    lt: new Uint8Array(u8Of(b.subarray(8 * N, 9 * N))),
    ia: new Uint8Array(u8Of(b.subarray(9 * N, 10 * N))),
  };
}
function loadX86(num: string): State {
  const pre = `/tmp/iii44-out/x86-ftw/${num}`;
  return {
    act: u8Of(readFileSync(`${pre}.act`)),
    typ: new Uint16Array(u16Of(readFileSync(`${pre}.typ`)).buffer.slice(0)),
    wal: new Uint16Array(u16Of(readFileSync(`${pre}.wal`)).buffer.slice(0)),
    liq: u8Of(readFileSync(`${pre}.liq`)),
    hf: u8Of(readFileSync(`${pre}.half`)),
    sl: u8Of(readFileSync(`${pre}.slope`)),
    lt: u8Of(readFileSync(`${pre}.lty`)),
    ia: u8Of(readFileSync(`${pre}.inact`)),
  };
}

/** 泛型 nextCount 复刻（cs:9505-9600）：显式栈逆序压栈=递归 pre-order；shroom 全次数 */
function flood(
  st: State, sx: number, sy: number,
  isSolidAt: (i: number) => boolean,
  maxTile: number,
  cfg: { ltShimmer: number; registerAlways: boolean },
): { count: number; shroom: number } {
  let count = 0, shroom = 0;
  const counted = new Uint8Array(N);
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const cy = stack.pop()!, cx = stack.pop()!;
    if (count >= maxTile) continue;
    if (cx <= 1 || cx >= W - 1 || cy <= 1 || cy >= H - 1) { count = maxTile; continue; }
    const i = cy * W + cx;
    if (counted[i]) continue;
    if (st.wal[i] === 244) { count = maxTile; continue; }
    if (st.liq[i] > 0 && st.lt[i] === cfg.ltShimmer) { count = maxTile; continue; }
    if (st.wal[i] !== 0) { count = maxTile; continue; }
    if (st.act[i]) { if (st.typ[i] === 70) shroom++; }
    if (!isSolidAt(i)) {
      counted[i] = 1;
      count++;
      stack.push(cx, cy + 1, cx, cy - 1, cx + 1, cy, cx - 1, cy);
    } else if (cfg.registerAlways) {
      counted[i] = 1;
    }
  }
  return { count, shroom };
}

// sheet→代表内部id（验证同 sheet 的 (solid,platform) 组合唯一性并报告缺口）
const INTERNAL_BY_SHEET = new Map<number, number>();
const comboBySheet = new Map<number, string>();
let conflictSheets = 0;
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  if (!d || typeof d.vanilla?.sheet !== 'number') continue;
  const s: number = d.vanilla.sheet!;
  if (!INTERNAL_BY_SHEET.has(s)) INTERNAL_BY_SHEET.set(s, i);
  const combo = `${!!d.solid}|${!!d.platform}`;
  if (comboBySheet.has(s)) {
    if (comboBySheet.get(s) !== combo) conflictSheets++;
  } else comboBySheet.set(s, combo);
}

/** P_van(泛化到任意 sheet-域 state)：vanilla SolidTile(int,int) 语义 */
function makePredVan(st: State): (i: number) => boolean {
  return (i: number): boolean => {
    if (!st.act[i]) return false;
    const t = st.typ[i];
    if (t >= 1024 || !V_SOLID[t]) return false;
    if (V_TOP[t]) return false;
    return !st.hf[i] && st.sl[i] === 0 && !st.ia[i];
  };
}
/** P_js：HiveSpiderPass.countTiles.solidTile 复刻（内部 id 经 sheet 映射） */
function makePredJs(st: State): (i: number) => boolean {
  const internalCache = new Int32Array(N).fill(-1);
  return (i: number): boolean => {
    if (!st.act[i]) return false;
    let internal = internalCache[i];
    if (internal < 0) {
      internal = INTERNAL_BY_SHEET.get(st.typ[i]) ?? -999;
      internalCache[i] = internal;
    }
    if (internal < 0) return false;
    const d = TILE_DEFS[internal];
    if (!d) return false;
    return !!genSolidType(internal) && !d.platform && !st.hf[i] && st.sl[i] === 0 && !st.ia[i];
  };
}

(RUN ? it : it.skip)('IIII55b attempt-level decomposition', async () => {
  const J = readSnap(`${OUT}/snap-pre.bin`);
  const X = loadX86('062_Water_Chests');
  console.log(`same-sheet property conflicts: ${conflictSheets}`);

  // —— 加载 attempt 流
  interface att { n: number; t: number; x: number; y: number; c: number; s: number }
  const parseLog = (src: string, prefix: string): att[] => {
    const arr: att[] = [];
    for (const ln of src.split('\n')) {
      if (!ln.startsWith(prefix)) continue;
      const p = ln.slice(prefix.length).trim().split(',');
      if (p.length < 6) continue;
      const v = p.map(Number);
      if (v.some(Number.isNaN)) continue;
      arr.push({ n: v[0], t: v[1], x: v[2], y: v[3], c: v[4], s: v[5] });
    }
    return arr;
  };
  // x86 [SP] 行是 (i,num5,x,y,count,shroom)；cand.log 是 (n,t,x,y,c,s)
  const vanAttRaw: Array<[number, number, number, number, number, number]> = [];
  for (const ln of readFileSync('/tmp/iii55-out/run.log', 'utf8').split('\n')) {
    if (!ln.startsWith('[SP]')) continue;
    vanAttRaw.push(ln.slice(4).trim().split(',').map(Number) as [number, number, number, number, number, number]);
  }
  const jsAtt = parseLog(readFileSync(`${OUT}/spider-cand.log`, 'utf8'), '');
  console.log(`attempts: van=${vanAttRaw.length} js=${jsAtt.length}`);

  const pvX = makePredVan(X);
  const pvJ = makePredVan(J);
  const pjX = makePredJs(X);
  const pjJ = makePredJs(J);

  const M = MALL ? Math.max(vanAttRaw.length, jsAtt.length) : Number(process.env.SW_I55B_M);

  // —— A0. 谓词校准矩阵（前 800 attempt）:候选语义旋钮组合各自 oracle 命中率
  // ★有效校准窗 = 首次接受巢的全部尝试（含接受行本体；其后世界即被本 pass 改写）
  let firstAccOrd = -1;
  {
    const lastOrdOfNest = new Map<number, number>();
    let niScan = -1;
    vanAttRaw.forEach((r, k) => { if (r[0] !== niScan) niScan = r[0]; lastOrdOfNest.set(r[0], k); });
    const snds: number[] = [];
    for (const ln of readFileSync('/tmp/iii55-out/run.log', 'utf8').split('\n')) {
      if (!ln.startsWith('[SND]')) continue;
      snds.push(Number(ln.trim().split(',')[2]));
    }
    for (let i = 0; i < snds.length; i++) {
      if (snds[i] === 1) { firstAccOrd = lastOrdOfNest.get(i) ?? -1; break; }
    }
    if (firstAccOrd < 0) firstAccOrd = vanAttRaw.length - 1;
  }
  console.log(`pristine window: ordinals 0..${firstAccOrd}`);
  const CALN = Math.min(firstAccOrd+1, vanAttRaw.length);
  interface Cfg { name: string; ltShimmerX: number; ltShimmerJ: number; registerAlwaysVan: boolean; registerAlwaysJs: boolean; zeroSetVan: number[]; keepSolidSetVan: number[] }
  const cfgs: Cfg[] = [
    { name: 'base(lt3/lt4+flip)', ltShimmerX: 3, ltShimmerJ: 4, registerAlwaysVan: false, registerAlwaysJs: false, zeroSetVan: [192, 481, 482, 483, 484, 225, 226, 162, 190, 56, 379], keepSolidSetVan: [] },
    { name: 'base+regAlways', ltShimmerX: 3, ltShimmerJ: 4, registerAlwaysVan: true, registerAlwaysJs: true, zeroSetVan: [192, 481, 482, 483, 484, 225, 226, 162, 190, 56, 379], keepSolidSetVan: [] },
    { name: 'no-flip-225', ltShimmerX: 3, ltShimmerJ: 4, registerAlwaysVan: false, registerAlwaysJs: false, zeroSetVan: [192, 481, 482, 483, 484, 226, 162, 190, 56, 379], keepSolidSetVan: [] },
    { name: 'nozero56', ltShimmerX: 3, ltShimmerJ: 4, registerAlwaysVan: false, registerAlwaysJs: false, zeroSetVan: [192, 481, 482, 483, 484, 225, 226, 162, 190, 379], keepSolidSetVan: [] },
    { name: 'allkeep(no flips)', ltShimmerX: 3, ltShimmerJ: 4, registerAlwaysVan: false, registerAlwaysJs: false, zeroSetVan: [], keepSolidSetVan: [] },
    { name: 'shim4/4', ltShimmerX: 4, ltShimmerJ: 4, registerAlwaysVan: false, registerAlwaysJs: false, zeroSetVan: [192, 481, 482, 483, 484, 225, 226, 162, 190, 56, 379], keepSolidSetVan: [] },
    { name: 'base+TOP-only-solid-dir', ltShimmerX: 3, ltShimmerJ: 4, registerAlwaysVan: false, registerAlwaysJs: false, zeroSetVan: [192, 481, 482, 483, 484, 225, 226, 162, 190, 56, 379], keepSolidSetVan: [19] },
  ];
  console.log('== A0 calibration matrix (oracle hit-rate over first', CALN, ') ==');
  const bestName = { score: -1, cfg: '' as string };
  for (const cf of cfgs) {
    for (const s of [192, 481, 482, 483, 484, 225, 226, 162, 190, 56, 379]) V_SOLID[s] = 1;   // 重置到未翻转
    for (const s of vt.solid) V_SOLID[s] = 1;
    V_SOLID.fill(0); for (const s of vt.solid) V_SOLID[s] = 1;
    for (const s of cf.zeroSetVan) V_SOLID[s] = 0;
    for (const s of cf.keepSolidSetVan) V_SOLID[s] = 1;
    let mvn = 0, mjs = 0;
    for (let k = 0; k < CALN; k++) {
      const [, , x, y, cv, sv] = vanAttRaw[k]!;
      const r = flood(X, x, y, pvX, 3500, { ltShimmer: cf.ltShimmerX, registerAlways: cf.registerAlwaysVan });
      if (r.count === cv && r.shroom === sv) mvn++;
      else if (mvn >= CALN - k) break;
    }
    const calJ = Math.min(CALN, jsAtt.length);
    let jhit = 0;
    for (let k = 0; k < calJ; k++) {
      const { n, t, x, y, c, s } = jsAtt[k]!;
      const r = flood(J, x, y, pjJ, 3500, { ltShimmer: cf.ltShimmerJ, registerAlways: cf.registerAlwaysJs });
      if (r.count === c && r.shroom === s) jhit++;
      else if (jhit + (calJ - k) <= mvn) break;
    }
    console.log(`   ${cf.name.padEnd(28)} van ${mvn}/${CALN}  js ${jhit}/${calJ}`);
    const sc = mvn * 10000 + jhit;
    if (sc > bestName.score) { bestName.score = sc; bestName.cfg = cf.name; }
  }
  console.log(`best=${bestName.cfg}`);
  // 取最优配置重新构建固定参数
  let chosen = cfgs.find((c) => c.name === bestName.cfg)!;
  const vanFloodCfg = () => ({ ltShimmer: chosen.ltShimmerX, registerAlways: chosen.registerAlwaysVan });
  const jVanFloodCfg = () => ({ ltShimmer: chosen.ltShimmerJ, registerAlways: chosen.registerAlwaysVan });
  const xJsFloodCfg = () => ({ ltShimmer: chosen.ltShimmerX, registerAlways: chosen.registerAlwaysJs });
  // 将所选翻转集落到 V_SOLID
  for (const s of vt.solid) V_SOLID[s] = 1;
  V_SOLID.fill(0); for (const s of vt.solid) V_SOLID[s] = 1;
  for (const s of chosen.zeroSetVan) V_SOLID[s] = 0;
  for (const s of chosen.keepSolidSetVan) V_SOLID[s] = 1;

  // —— A-. 原点谓词布尔校验（want==0 ⟺ 原版判原点 SOLID；0<want<3500 ⇒ 非实心）
  //   ★只取【未进行任何改写的判读】：
  //     · 干净窗内（首接受前）
  //     · 排除 retry 循环里 shroomCount>1 强制 num6=0 的伪行（显示值≠洪泛真值）
  {
    let solid0m = 0, solid0mm = 0, non0m = 0, non0mm = 0;
    const wrong: string[] = [];
    for (let k = 0; k <= Math.min(firstAccOrd, vanAttRaw.length - 1); k++) {
      const [ni, n5, x, y, cv, sv] = vanAttRaw[k]!;
      if (cv >= 3500) continue;
      if (n5 > 0 && sv > 1) continue;              // shroom 强制行——判据失效
      const i0 = y * W + x;
      const mine = pvX(i0);
      const expectSolid = cv === 0;
      let ok2: boolean, tag: string;
      if (expectSolid) { ok2 = mine; if (mine) solid0m++; else solid0mm++; tag = 'want=solid got=nonsolid'; }
      else { ok2 = !mine; if (!mine) non0m++; else non0mm++; tag = 'want=nonsolid got=solid'; }
      if (!ok2 && wrong.length < 40) wrong.push(`k#${k} n${ni}.${n5} (${x},${y}) t=${X.typ[i0]} act=${X.act[i0]} hf=${X.hf[i0]} sl=${X.sl[i0]} wal=${X.wal[i0]} liq=${X.liq[i0]} lt=${X.lt[i0]} ia=${X.ia[i0]} ${tag} cnt=${cv}`);
    }
    console.log(`origin-solid verdict(pristine): agree(solid)${solid0m} miss${solid0mm} | agree(nonsolid)${non0m} miss${non0mm}`);
    for (const w of wrong) console.log('   ', w);
  }

  // —— A. oracle 校验
  let oMatch = 0, oMiss = 0;
  const vMisses: string[] = [];
  const missSheets = new Map<number, number>();
  for (let k = 0; k < Math.min(M, vanAttRaw.length); k++) {
    const [, , x, y, cv, sv] = vanAttRaw[k]!;
    const r = flood(X, x, y, pvX, 3500, { ltShimmer: chosen.ltShimmerX, registerAlways: chosen.registerAlwaysVan });
    if (r.count === cv && r.shroom === sv) oMatch++;
    else {
      oMiss++;
      if (vMisses.length < 40) {
        vMisses.push(`t#${k} (${x},${y}) got=${r.count}/${r.shroom} want=${cv}/${sv} Δ=${r.count - cv}`);
        const i0 = y * W + x;
        missSheets.set(X.typ[i0], (missSheets.get(X.typ[i0]) ?? 0) + 1);
      }
    }
  }
  console.log(`oracle P_van/X: match=${oMatch} miss=${oMiss}`);
  for (const m of vMisses) console.log('   ', m);
  if (oMiss > 0) console.log('   miss-origin sheets:', [...missSheets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

  let jMatch = 0, jMiss = 0;
  const jMisses: string[] = [];
  for (let k = 0; k < Math.min(M, jsAtt.length); k++) {
    const { n, t, x, y, c, s } = jsAtt[k]!;
    const r = flood(J, x, y, pjJ, 3500, { ltShimmer: chosen.ltShimmerJ, registerAlways: chosen.registerAlwaysJs });
    if (r.count === c && r.shroom === s) jMatch++;
    else { jMiss++; if (jMisses.length < 24) jMisses.push(`#n${n}.${t} (${x},${y}) got=${r.count}/${r.shroom} want=${c}/${s}`); }
  }
  console.log(`oracle P_js/J: match=${jMatch} miss=${jMiss}`);
  for (const m of jMisses) console.log('   ', m);

  // —— B/C 分解统计
  const dpredHist = new Map<number, number>();
  const dstateHist = new Map<number, number>();
  let flipAcceptLoss = 0, flipAcceptGain = 0;   // 仅因谓词造成的 accept 判定翻转方向计数
    let shown = 0;
  for (let k = 0; k < Math.min(M, vanAttRaw.length); k++) {
    const [, , x, y, cv, sv] = vanAttRaw[k]!;
    const rv = flood(X, x, y, pvX, 3500, vanFloodCfg());
    const rpx = flood(X, x, y, pjX, 3500, xJsFloodCfg());
    const rj = flood(J, x, y, pvJ, 3500, jVanFloodCfg());
    const dp = rpx.count - rv.count;
    const ds = rj.count - rv.count;
    void sv; void cv;
    dpredHist.set(dp, (dpredHist.get(dp) ?? 0) + 1);
    dstateHist.set(ds, (dstateHist.get(ds) ?? 0) + 1);
    const accV = rv.count >= 500 && rv.count < 3500 ? 1 : 0;
    const accP = rpx.count >= 500 && rpx.count < 3500 ? 1 : 0;
    if (accV && !accP) flipAcceptLoss++;
    if (!accV && accP) flipAcceptGain++;
    if (dp !== 0 && shown < 200) shown++;
  }
  const top = (h: Map<number, number>) => [...h.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([d, c]) => `${d > 0 ? '+' : ''}${d}×${c}`).join(' ');
  console.log(`Δpred(X) top: ${top(dpredHist)} | nonzero=${[...dpredHist].filter(([d]) => d !== 0).reduce((s, [, c]) => s + c, 0)}/${Math.min(M, vanAttRaw.length)}`);
  console.log(`Δstate(J-X) top: ${top(dstateHist)} | nonzero=${[...dstateHist].filter(([d]) => d !== 0).reduce((s, [, c]) => s + c, 0)}`);
  console.log(`predicate-only accept flips: loss(=JS会拒而vanilla收) ${flipAcceptLoss} / gain ${flipAcceptGain}`);

  // —— D. sheet 语义映射表缺口（JS 实心↔vanilla 非实心 或反向），限世界内出现过的 sheet
  const present = new Set<number>();
  for (let i = 0; i < N; i++) if (X.act[i] || J.act[i]) present.add(X.typ[i]!);
  const gaps: Array<{ sheet: number; jsSolid: boolean; jsPlat: boolean; vanSolid: boolean; vanTop: boolean; cnt: number }> = [];
  const cellCnt = new Map<number, number>();
  for (let i = 0; i < N; i++) { const t = X.typ[i]!; if (X.act[i]) cellCnt.set(t, (cellCnt.get(t) ?? 0) + 1); }
  for (const s of present) {
    if (s >= 1024 || s === 0) continue;
    const internal = INTERNAL_BY_SHEET.get(s);
    const d = internal !== undefined ? TILE_DEFS[internal] : undefined;
    const jsSolidLike = !!genSolidTypeInternalApprox(d);
    const jsPlat = !!d?.platform;
    const vs = !!V_SOLID[s], vtp = !!V_TOP[s];
    // JS-solidTile 认“实心”＝ genSolidType ∧ !platform；vanilla＝ V_SOLID ∧ !V_TOP
    const jsBlocks = jsSolidLike && !jsPlat;
    const vanBlocks = vs && !vtp;
    if (jsBlocks !== vanBlocks) gaps.push({ sheet: s, jsSolid: jsSolidLike, jsPlat, vanSolid: vs, vanTop: vtp, cnt: cellCnt.get(s) ?? 0 });
  }
  gaps.sort((a, b) => (b.cnt) - (a.cnt));
  console.log(`实心语义映射缺口(sheet,x86出现格数): ${gaps.map((g) => `{${g.sheet}:js(${g.jsSolid ? 1 : 0},${g.jsPlat ? 1 : 0}) van(${g.vanSolid ? 1 : 0},${g.vanTop ? 1 : 0}) n=${g.cnt}}`).join(' ') || '无'}`);
  writeFileSync(`${OUT}/i55b-report.json`, JSON.stringify({
    oracle: { oMatch, oMiss, jMatch, jMiss }, dpred: top(dpredHist), dstate: top(dstateHist),
    flipAcceptLoss, flipAcceptGain, gaps,
  }, null, 1));
}, 600_000);

/** 近似 genSolidType(内部id) —— 与主程序 genSolidType 一致：overrides 不涉（重放环境无写）*/
function genSolidTypeInternalApprox(d: { solid?: boolean; vanilla?: { sheet?: number } } | undefined): boolean {
  if (!d) return false;
  return !!d.solid;
}
