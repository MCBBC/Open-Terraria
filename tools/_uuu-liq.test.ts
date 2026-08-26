// 一次性诊断（UUUUUUU 批 2026-08-26）：液体域定罪——g 链 #98 Settle_Liquids_Again
// 窗口内 per-UpdateLiquid 液态指纹 + 掷流对拍（TTT 批 rig 窗口掷流仪配方延续）。
// 每次 LiquidSim.updateLiquid() 尾部对活动液体表 liquids[0..numLiquid) 逐条打包
// 14 字节（x:i16le y:i16le delay:i32le kill:i32le 该格液量:u8 液型:u8 vanilla 0 基）
// 做 FNV-1a——与 x86 rig JJHook.OnUpdateLiquid 同布局同序（SW_LIQLOG）。
// 窗口=onWorldPartial(49)→(50)（槽 49 末开窗、槽 50 末关窗=pass #98 全程）。
// SW_UUU_DUMP_AT=<iter> 时在该迭代后写全量液表文本 + 世界通道 dump 到 SW_UUU_DUMP_DIR。
// 用法：cd game && SW_UUU=1 SW_M8_SEED=9293480 npx vitest run tools/_uuu-liq.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';

/** 内部 tile id → vanilla sheet id（typ 通道对齐 x86 dump） */
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[q] = s;
}

const RUN = process.env.SW_UUU === '1';
const SEED = process.env.SW_M8_SEED ?? '9293480';
const EVIL = process.env.SW_M8_EVIL !== undefined ? Number(process.env.SW_M8_EVIL) : 0;
const OUT = process.env.SW_UUU_OUT ?? '/tmp/uuu-out/jsliq-g.txt';
const ROLLOUT = process.env.SW_UUU_ROLL ?? '/tmp/uuu-out/jsroll-g2.txt';
const DUMP_AT = Number(process.env.SW_UUU_DUMP_AT ?? 0);
const DUMP_DIR = process.env.SW_UUU_DUMP_DIR ?? '/tmp/uuu-out/liqdump-js';
// 事件窗（迭代区间）：与 x86 SW_LIQOPS 同语义——该迭代体内 addWater 注册成功 /
// delWater 入口事件流（首分歧事件定位用）
const OPS_FROM = Number(process.env.SW_UUU_OPS?.split('-')[0] ?? 0);
const OPS_TO = Number(process.env.SW_UUU_OPS?.split('-')[1] ?? 0);
const OPS_OUT = process.env.SW_UUU_OPS_PATH ?? '/tmp/uuu-out/liqops-js.txt';

(RUN ? it : it.skip)('liquid FNV probe (window slot49->50)', async () => {
  let active = false;
  let liqIter = 0;
  const rolls: number[] = [];
  const lines: string[] = [];

  // 掷流记录（internalSample 原始样本，与 rig OnRoll 口径一致：主实例全部样本）
  const urp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = urp.internalSample as (this: unknown) => number;
  urp.internalSample = function (this: unknown) {
    const v = oIS.call(this);
    if (active) rolls.push(v);
    return v;
  };

  // FNV-1a over entry table，布局=x86 JJHook.OnUpdateLiquid
  const buf = new ArrayBuffer(25000 * 14);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  function fnvEntries(sim: LiquidSim): string {
    const s = (sim as unknown as { liquids: Array<{ x: number; y: number; delay: number; kill: number }>; numLiquid: number; world: { store: { w: number; liquid: Uint8Array; liquidType: Uint8Array } } });
    const nl = s.numLiquid;
    const st = s.world.store;
    for (let k = 0; k < nl; k++) {
      const e = s.liquids[k]!;
      const o = k * 14;
      dv.setInt16(o, e.x, true);
      dv.setInt16(o + 2, e.y, true);
      dv.setInt32(o + 4, e.delay | 0, true);
      dv.setInt32(o + 8, e.kill | 0, true);
      const ti = e.y * st.w + e.x;
      u8[o + 12] = st.liquid[ti]!;
      u8[o + 13] = st.liquidType[ti]! - 1;
    }
    let h = 2166136261;
    for (let b = 0; b < nl * 14; b++) {
      h ^= u8[b]!;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  const lproto = LiquidSim.prototype as unknown as Record<string, unknown>;
  const oUpd = lproto.updateLiquid as (this: LiquidSim) => void;
  // 事件流：addWater 成功注册（numLiquid 增）记 A；delWater 入口记 D。
  // 与 C# 钩位等价：OpAdd 在 numLiquid++ 处（单次调用至多一事件）、OpDel 在函数体首
  // （先于其内部唤醒 AddWater）——JS 先记 D 再调原体、A 在返回后记，序一致
  let opsOn = false;
  let opsN = 0;
  const opsLines: string[] = [];
  // 正在处理条目上下文（与 rig JJHook.SetCur 同位：update() 体首）
  let curX = -1, curY = -1, curD = -1;
  if (OPS_FROM > 0) {
    const oUpdE = lproto.update as unknown as (this: LiquidSim, e: { x: number; y: number; delay: number }) => void;
    lproto.update = function (this: LiquidSim, e: { x: number; y: number; delay: number }) {
      curX = e.x; curY = e.y; curD = e.delay;
      return (oUpdE as (this: LiquidSim, e: { x: number; y: number; delay: number }) => void).call(this, e);
    } as never;
    const oAdd = lproto.addWater as (this: LiquidSim, x: number, y: number) => void;
    lproto.addWater = function (this: LiquidSim & { numLiquid: number }, x: number, y: number) {
      const nl = this.numLiquid;
      oAdd.call(this, x, y);
      if (opsOn && this.numLiquid > nl) {
        opsN++;
        opsLines.push(`A ${opsN} ${x} ${y} @${curX},${curY} d${curD}`);
      }
    };
    const oDel = lproto.delWater as unknown as (this: LiquidSim, i: number) => void;
    lproto.delWater = function (this: LiquidSim, i: number) {
      if (opsOn) {
        opsN++;
        opsLines.push(`D ${opsN} ${i}`);
      }
      (oDel as (this: LiquidSim, i: number) => void).call(this, i);
    };
  }
  lproto.updateLiquid = function (this: LiquidSim) {
    // 窗沿驱动：本调用属【下个】迭代 → 进入前若 liqIter+1∈[FROM..TO] 开窗，
    // 结束后若已出窗则关窗落盘（与 rig「迭代尾切换下一迭代窗」语义一致）
    if (OPS_FROM > 0 && active && !opsOn && liqIter + 1 >= OPS_FROM && liqIter + 1 <= OPS_TO) {
      opsOn = true;
      opsN = 0;
      opsLines.length = 0;
    }
    const r = oUpd.call(this);
    if (active) {
      liqIter++;
      if (opsOn && liqIter >= OPS_TO) {
        opsOn = false;
        writeFileSync(OPS_OUT, opsLines.join('\n'));
        console.log(`[uuu] ops iters ${OPS_FROM}-${OPS_TO}: ${opsLines.length} events -> ${OPS_OUT}`);
      }
      const s = this as unknown as { numLiquid: number; bufCount: number };
      lines.push(`I ${liqIter} ${s.numLiquid} ${s.bufCount} ${fnvEntries(this)}`);
      if (DUMP_AT > 0 && liqIter === DUMP_AT) dumpState(this, liqIter);
    }
    return r;
  };

  function dumpState(sim: LiquidSim, iter: number) {
    mkdirSync(DUMP_DIR, { recursive: true });
    // 全量可续跑状态（UUU 批回放基座）：store 大数组走 .bin，液体表/计数器/LUT 走 meta.json
    const s2 = sim as unknown as {
      liquids: Array<{ x: number; y: number; delay: number; kill: number }>; numLiquid: number; bufCount: number;
      checking: Uint8Array; skip: Uint8Array; cycles: number; curMaxLiquid: number;
      wetCounter: number; quickSettle: boolean; quickFall: boolean; stuckCount: number; stuckAmount: number; stuck: boolean;
      solidNP: Uint8Array; solidFull: Uint8Array; world: { store: Record<string, Uint16Array | Uint8Array> & { w: number; h: number } };
      genWaterLine?: number; dungeonWaterExempt?: unknown; shimmerCenter?: unknown; generatingWorld?: boolean;
      waterDeathIds?: Set<number>; lavaDeathIds?: Set<number>;
    };
    const st = s2.world.store;
    const bin = (name: string, arr: Uint8Array | Uint16Array) => writeFileSync(`${DUMP_DIR}/${name}.bin`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    const meta = {
      iter,
      w: st.w, h: st.h,
      numLiquid: s2.numLiquid, bufCount: s2.bufCount,
      liquids: s2.liquids.slice(0, s2.numLiquid).map((e) => [e.x, e.y, e.kill, e.delay]),
      cycles: s2.cycles, curMaxLiquid: s2.curMaxLiquid, wetCounter: s2.wetCounter,
      quickSettle: s2.quickSettle, quickFall: s2.quickFall,
      stuckCount: s2.stuckCount, stuckAmount: s2.stuckAmount, stuck: s2.stuck,
      solidNP: Array.from(s2.solidNP), solidFull: Array.from(s2.solidFull),
      genWaterLine: s2.genWaterLine, hasDungeonExempt: !!s2.dungeonWaterExempt, shimmerCenter: s2.shimmerCenter ?? null,
      generatingWorld: s2.generatingWorld,
    };
    writeFileSync(`${DUMP_DIR}/meta.json`, JSON.stringify(meta));
    const b64 = (name: string, set: Set<number>) => writeFileSync(`${DUMP_DIR}/${name}.json`, JSON.stringify([...set]));
    if (s2.waterDeathIds) b64('waterDeath', s2.waterDeathIds as Set<number>);
    if (s2.lavaDeathIds) b64('lavaDeath', s2.lavaDeathIds as Set<number>);
    bin('type', st.type as Uint16Array);
    bin('flags', st.flags as Uint8Array);
    bin('wall', st.wall as Uint16Array);
    bin('liquid', st.liquid as Uint8Array);
    bin('liquidType', st.liquidType as Uint8Array);
    bin('half', st.half as Uint8Array);
    bin('slope', st.slope as Uint8Array);
    bin('wire', st.wire as Uint8Array);
    bin('frameX', st.frameX as Uint16Array);
    bin('frameY', st.frameY as Uint16Array);
    bin('checking', s2.checking);
    bin('skip', s2.skip);
    console.log(`[uuu] js FULL resume dump @${iter} -> ${DUMP_DIR}`);
  }

  function dumpChannels(sim: LiquidSim, iter: number) {
    mkdirSync(DUMP_DIR, { recursive: true });
    const s = sim as unknown as { liquids: Array<{ x: number; y: number; delay: number; kill: number }>; numLiquid: number; world: { store: Record<string, Uint16Array | Uint8Array> & { w: number; h: number } } };
    const st = s.world.store;
    let txt = '# x y delay kill amt lty\n';
    for (let k = 0; k < s.numLiquid; k++) {
      const e = s.liquids[k]!;
      const ti = e.y * st.w + e.x;
      txt += `${e.x} ${e.y} ${e.delay} ${e.kill} ${st.liquid[ti]} ${(st.liquidType[ti] as number) - 1}\n`;
    }
    writeFileSync(`${DUMP_DIR}/entries-${iter}.txt`, txt);
    const n = st.w * st.h;
    // 通道布局与 x86 JJHook.DumpLiquidState 对齐：typ=u16 vanilla sheet id（活性才写）、
    // act=flags&1、wal=u16、liq=u8、lty=vanilla 0 基、inact=wire bit5
    const typ = new Uint16Array(n);
    const act = new Uint8Array(n);
    const wal = new Uint16Array(n);
    const liq = new Uint8Array(n);
    const lt = new Uint8Array(n);
    const ia = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const ja = (st.flags[i] as number) & 1;
      act[i] = ja;
      wal[i] = st.wall[i] as number;
      liq[i] = st.liquid[i] as number;
      typ[i] = ja ? (SHEET_OF[st.type[i] as number] >= 0 ? SHEET_OF[st.type[i] as number] : 9999) : 0;
      lt[i] = liq[i]! > 0 ? (st.liquidType[i] as number) - 1 : 0;
      ia[i] = ((st.wire[i] as number) >>> 5) & 1;
    }
    const pack = (name: string, arr: Uint8Array | Uint16Array) => writeFileSync(`${DUMP_DIR}/K.${name}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    pack('typ', typ);
    pack('act', act);
    pack('wal', wal);
    pack('liq', liq);
    pack('lty', lt);
    pack('inact', ia);
    console.log(`[uuu] js liqdump @${iter} -> ${DUMP_DIR}`);
  }

  const t0 = Date.now();
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    }, (name) => {
      // ★窗口按槽名驱动（执行序随 SW_MB_1457 换位：1457 序 micro→settle2，
      //   1456 序 settle2 在前——TTT 事故「任何生成期探针必带 SW_MB_1457」同源坑）。
      //   onProgress 在槽体执行【前】回调：'二次沉降' 开窗、下一槽关窗。
      if (name === '二次沉降' && !active) {
        active = true;
        liqIter = 0;
      } else if (active && name !== '二次沉降') {
        active = false;
        writeFileSync(OUT, `---START\n${lines.join('\n')}\n---END ${name}\n`);
        writeFileSync(ROLLOUT, rolls.join('\n'));
      }
    });
  } finally {
    urp.internalSample = oIS;
    lproto.updateLiquid = oUpd;
  }
  void RNG;
  console.log(`[uuu] liq lines=${lines.length} rolls=${rolls.length} done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
