// 原版分帧金标硬闸门(2026-08-27):TileFrameCosmetic 全链移植的三层对账 + rig 对拍挂点。
// 形制对齐 npc-frame-golden:第 1/2 层运行时直读反编译源码(1457 树),零快照零腐烂;
// 第 3 层构图行为金标(当前值=移植链输出,rig 对拍后以 rig 值为准更新);
// 第 4 层 rig 逐位对拍(fixture 落盘即激活,变体归一契约见文件头注释)。
//
// ★对拍契约:原版分区懒分帧用 genRand 定变体(resetFrame:true→Next(0,3)),持久化到
//  tile.frameNumber;对拍必须按变体归一:(frameX - 18*frameNumber, frameY)。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import { vanillaFrameFor, setVanillaSolidTables, setVanillaFrameImportant, setVanillaVariantMap, invalidateVanillaFrameAt, invalidateVanillaFrameArea, VANILLA_FRAME_SETS } from '../src/render/VanillaFraming';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // 仓库根
const WORLDGEN_CS = `${ROOT}/Terarria1457/Terraria/WorldGen.cs`;
const PROGRAM_JSON = join(dirname(fileURLToPath(new URL(import.meta.url))), '../src/data/generated/tileframe-program.json');
const RIG_FIXTURE = join(dirname(fileURLToPath(new URL(import.meta.url))), 'tests/golden/vanilla-framing-ftw-region.json');

// vanilla solid/solidTop(行为金标的前置表;从反编译 Main.cs 提取,与 S.tileSolid 同源)
let _solidInit = false;
function ensureSolidTables(): void {
  if (_solidInit) return;
  _solidInit = true;
  const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
  const solid = new Array(800).fill(false);
  const solidTop = new Array(800).fill(false);
  // Main.tileSolid[N] = true; 逐行提取(数组逐条赋值形;SolidTop 同)
  for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
  for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
  setVanillaSolidTables(solid, solidTop);
}

// 构图助手:5×5 基座 baseType + 中心 1 格 probeType;返回中心帧(变体 0)
function frameOf(probeType: number, baseType: number): { fx: number; fy: number } {
  ensureSolidTables();
  const st = new TileStore(32, 32);
  for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) {
    const i = st.idx(x, y);
    st.type[i] = baseType; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  const ci = st.idx(12, 12);
  st.type[ci] = probeType; st.flags[ci] = 1; st.frameX[ci] = 0; st.frameY[ci] = 0;
  const r = vanillaFrameFor(st, 12, 12, st, 0, 200);
  return { fx: r.fx, fy: r.fy };
}
// 空气邻域变体:5×5 probeType 中挖掉中心上方(暴露顶边)
function frameExposedTop(probeType: number, baseType: number): { fx: number; fy: number } {
  ensureSolidTables();
  const st = new TileStore(32, 32);
  for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) {
    const i = st.idx(x, y);
    st.type[i] = baseType; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  {
    const i = st.idx(12, 11); st.flags[i] = 0; st.type[i] = 0;
  }
  const ci = st.idx(12, 12);
  st.type[ci] = probeType; st.flags[ci] = 1; st.frameX[ci] = 0; st.frameY[ci] = 0;
  const r = vanillaFrameFor(st, 12, 12, st, 0, 200);
  return { fx: r.fx, fy: r.fy };
}

// ★vanilla TileID 域(与回滚后链一致;重做对齐时随域契约一并调整)
const S = 53, C = 40, D = 0, ST = 1, CU = 7;

describe('原版分帧金标硬闸门(TileFrameCosmetic 全链移植)', () => {
  // ---------- 第 1 层:提取可复现(转译器 vs 反编译源 vs 入库程序 三方一致) ----------
  it('第1层·转译器重跑 === 入库 program.json(防手改/防源漂移)', () => {
    expect(existsSync(WORLDGEN_CS), '反编译树 Terarria1457 应存在').toBe(true);
    const tmp = mkdtempSync(join(tmpdir(), 'vf-golden-'));
    const out = join(tmp, 'program.json');
    execFileSync('node', ['--max-old-space-size=4096', 'tools/extract-tileframe-cosmetic.mjs', out], {
      cwd: join(ROOT, 'game'), stdio: 'pipe', timeout: 120000,
    });
    const fresh = JSON.parse(readFileSync(out, 'utf8'));
    const committed = JSON.parse(readFileSync(PROGRAM_JSON, 'utf8'));
    expect(fresh).toEqual(committed);
    // 结构统计硬闸(转译覆盖面:任一数字变化=链结构变了,必须显式更新金标)
    const kinds: Record<string, number> = {};
    const walk = (stmts: typeof committed.program) => {
      for (const st of stmts) {
        kinds[st.kind] = (kinds[st.kind] ?? 0) + 1;
        if (st.then) walk(st.then);
        if (st.else) walk(st.else);
        if (st.cases) for (const c of Object.values(st.cases)) walk(c);
      }
    };
    walk(committed.program);
    expect(kinds).toEqual({ if: 305, assign: 997, call: 121, switch: 132, break: 428 });
  });

  // ---------- 第 2 层:类型集合对账(直读 Main.cs/TileID.cs 赋值行) ----------
  it('第2层·tileMergeDirt 集合 === Main.cs 赋值全量', () => {
    const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
    const expectIds = new Set<number>();
    for (const mm of main.matchAll(/tileMergeDirt\[(\d+)\] = true/g)) expectIds.add(+mm[1]);
    const got = new Set<number>();
    VANILLA_FRAME_SETS.MERGE_DIRT.forEach((v, i) => { if (v) got.add(i); });
    const missing = [...expectIds].filter((x) => !got.has(x)).sort((a, b) => a - b);
    const extra = [...got].filter((x) => !expectIds.has(x)).sort((a, b) => a - b);
    expect(missing, `tileMergeDirt 缺员`).toEqual([]);
    expect(extra, `tileMergeDirt 多员`).toEqual([]);
  });

  it('第2层·tileBrick 集合 === Main.cs 赋值全量', () => {
    const main = readFileSync(`${ROOT}/Terarria1457/Terraria/Main.cs`, 'utf8');
    const expectIds = new Set<number>();
    for (const mm of main.matchAll(/tileBrick\[(\d+)\] = true/g)) expectIds.add(+mm[1]);
    const got = new Set<number>();
    VANILLA_FRAME_SETS.TILE_BRICK.forEach((v, i) => { if (v) got.add(i); });
    const missing = [...expectIds].filter((x) => !got.has(x)).sort((a, b) => a - b);
    const extra = [...got].filter((x) => !expectIds.has(x)).sort((a, b) => a - b);
    expect(missing, `tileBrick 缺员`).toEqual([]);
    expect(extra, `tileBrick 多员`).toEqual([]);
  });

  it('第2层·ChecksForMerge 集合 === TileID.cs Factory 全量', () => {
    const tid = readFileSync(`${ROOT}/Terarria1457/Terraria.ID/TileID.cs`, 'utf8');
    const lm = tid.match(/ChecksForMerge = Factory\.CreateBoolSet\(([^)]*)\)/);
    expect(lm, 'TileID.cs 应有 ChecksForMerge 定义').toBeTruthy();
    const expectIds = new Set<number>((lm![1].match(/\d+/g) ?? []).map(Number));
    const got = new Set<number>();
    VANILLA_FRAME_SETS.CHECKS_FOR_MERGE.forEach((v, i) => { if (v) got.add(i); });
    const missing = [...expectIds].filter((x) => !got.has(x)).sort((a, b) => a - b);
    const extra = [...got].filter((x) => !expectIds.has(x)).sort((a, b) => a - b);
    expect(missing, `ChecksForMerge 缺员`).toEqual([]);
    expect(extra, `ChecksForMerge 多员`).toEqual([]);
  });

  // ---------- 第 3 层:构图行为金标(值=移植链输出;rig 对拍后以 rig 为准) ----------
  it('第3层·基座全包围/边界构图帧(自然材质主族)', () => {
    ensureSolidTables();
    // [探针, 基座, 期望fx, 期望fy]——值 pin 当前移植输出;变体恒 0
    const cases: Array<[number, number, number, number, string]> = [
      [S, S, 18, 18, '沙全连内帧'],
      [C, C, 18, 18, '粘土全连内帧'],
      [D, D, 18, 18, '泥土全连内帧'],
      [ST, ST, 18, 18, '石全连内帧'],
      [S, C, 162, 54, '沙嵌粘土(异类全连→兜底梯帧)'],
      [C, S, 162, 54, '粘土嵌沙(异类全连→兜底梯帧)'],
      [ST, C, 162, 54, '石嵌粘土(异类全连→兜底梯帧)'],
      [CU, ST, 108, 198, '铜矿嵌石(矩阵段全-2案 f0,与粘土嵌泥土同族)'],
      // ★2026-08-28 再仲裁:正确域(vanillaIdOf 换算后)下粘土∉tileBrick → 兜底梯帧
      // (162,54);此前 (108,198) 系内部 id 直喂(54=玻璃归属)的错域伪值。rig 第4层
      // (真实世界 1932 格逐位)与正确域自洽。
      [C, D, 162, 54, '粘土嵌泥土(异类全连→兜底梯帧)'],
    ];
    for (const [probe, base, efx, efy, name] of cases) {
      const r = frameOf(probe, base);
      expect({ name, ...r }).toEqual({ name, fx: efx, fy: efy });
    }
  });

  it('第3层·暴露边/角构图帧(边缘帧族,含素材透明缺口形态)', () => {
    ensureSolidTables();
    // 顶边暴露:基座全连但正上方挖空 → T 形/顶边帧
    const cases: Array<[number, number, number, number, string]> = [
      [C, C, 18, 0, '粘土顶边暴露(T形顶)'],
      [S, S, 18, 0, '沙顶边暴露'],
    ];
    for (const [probe, base, efx, efy, name] of cases) {
      const r = frameExposedTop(probe, base);
      expect({ name, ...r }).toEqual({ name, fx: efx, fy: efy });
    }
    // 沙-粘土台阶(用户标注 3969,471 形态):沙的 E/S 为粘土
    {
      ensureSolidTables();
      const st = new TileStore(32, 32);
      for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) {
        const i = st.idx(x, y);
        st.type[i] = S; st.flags[i] = 1;
      }
      for (let y = 13; y <= 14; y++) for (let x = 10; x <= 14; x++) {
        const i = st.idx(x, y); st.type[i] = C;
      }
      for (let x = 13; x <= 14; x++) for (let y = 10; y <= 14; y++) {
        const i = st.idx(x, y); st.type[i] = C;
      }
      // 中心 (12,12):N/W 沙, E/S 粘土 → 台阶拐角
      const ci = st.idx(12, 12);
      const r = vanillaFrameFor(st, 12, 12, st, 0, 200);
      void ci;
      // 值 pin:移植链对「沙上台阶、右下粘土」的拐角输出
      expect({ name: '沙台接粘土拐角', fx: r.fx, fy: r.fy }).toEqual({ name: '沙台接粘土拐角', fx: 18, fy: 72 });
    }
  });

  // ---------- 第 5 层:失效契约(键写入/失效同公式 + 编辑后现场刷新) ----------
  // 血案 2026-08-28:写入键 j*st.w+i 与失效键 j*100000+i 公式错位 ⇒ 失效删空,
  // 挖掘后邻居帧永不刷新(用户实报)。四层金标全是静态正确性,本层专锁动态契约。
  it('第5层·失效契约:挖掘邻居后帧现场刷新/回填复原/区域失效(键公式同侧)', () => {
    ensureSolidTables();
    const st = new TileStore(32, 32);
    for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) {
      const i = st.idx(x, y);
      st.type[i] = S; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
    }
    const f0 = vanillaFrameFor(st, 12, 12, st, 0, 200);
    // 挖掉左邻 (11,12)
    const bi = st.idx(11, 12);
    st.type[bi] = 0; st.flags[bi] = 0;
    // 不失效 → 命中旧缓存(证明缓存确实在挡重算 = 本测试有判别力)
    const stale = vanillaFrameFor(st, 12, 12, st, 0, 200);
    expect([stale.fx, stale.fy]).toEqual([f0.fx, f0.fy]);
    // 生产失效路径 → 重算,帧必须变为左暴露族
    invalidateVanillaFrameAt(11, 12);
    const f1 = vanillaFrameFor(st, 12, 12, st, 0, 200);
    expect([f1.fx, f1.fy]).not.toEqual([f0.fx, f0.fy]);
    // 回填 + 失效 → 复原
    st.type[bi] = S; st.flags[bi] = 1;
    invalidateVanillaFrameAt(11, 12);
    const f2 = vanillaFrameFor(st, 12, 12, st, 0, 200);
    expect([f2.fx, f2.fy]).toEqual([f0.fx, f0.fy]);
    // 区域失效(silent 编辑路径:陨石/祭坛族走 markDirtyArea)
    st.type[bi] = 0; st.flags[bi] = 0;
    invalidateVanillaFrameArea(10, 11, 12, 13);
    const f3 = vanillaFrameFor(st, 12, 12, st, 0, 200);
    expect([f3.fx, f3.fy]).toEqual([f1.fx, f1.fy]);
  });

  // ---------- 第 4 层:rig 逐位对拍(compiled-1458 oracle 真世界倾倒) ----------
  // 契约:①非 FI 类型走全链——注入 dump 的 fn 为 num6,链输出 (fx,fy) 必须逐位等于 dump;
  //      ②FI 类型(火炬/树/桌椅等)帧存于存档且 TileFrameImportant 另有 RNG 消费,不在本链域;
  //      ③仙人掌 80=CactusFrame(SW 专属移植同域);④藤蔓经 CheckVines 门,在链内。
  // 数据:tests/golden/rig-ftw-frames.txt = compiled-1458 加载 FTW V2.wld 后
  //      SectionTileFrame(3940,460,3990,500) 的真值倾倒(SWFR 2 格式)。
  it('第4层·rig 逐位对拍:FTW 3940-3990×460-500 全格帧 === compiled-1458 oracle', () => {
    ensureSolidTables();
    const dumpText = readFileSync(join(dirname(fileURLToPath(new URL(import.meta.url))), 'golden/rig-ftw-frames.txt'), 'utf8');
    const fiList: number[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(new URL(import.meta.url))), 'golden/frameImportant.json'), 'utf8'));
    const fi = new Set(fiList);
    const dump: Array<{ x: number; y: number; active: number; type: number; fx: number; fy: number; half: number; slope: number; fn: number }> = [];
    for (const line of dumpText.split('\n')) {
      if (line.startsWith('#')) continue;
      const p2 = line.split(',');
      if (p2.length < 9) continue;
      dump.push({ x: +p2[0], y: +p2[1], active: +p2[2], type: +p2[3], fx: +p2[4], fy: +p2[5], half: +p2[6], slope: +p2[7], fn: +p2[8] });
    }
    expect(dump.length, 'rig 倾倒格数').toBe(2091);
    // ★布局必须来自真世界(dump 矩形外的邻居参与分类/协商; rig 是整分区分帧)
    const wldBin = atob(readFileSync('/Users/vinlic/Downloads/FTW V2.wld').toString('base64'));
    const wldBuf = new Uint8Array(wldBin.length);
    for (let k = 0; k < wldBin.length; k++) wldBuf[k] = wldBin.charCodeAt(k);
    const wld = parseWld(wldBuf);
    const st = new TileStore(wld.tilesWide, wld.tilesHigh);
    const N = wld.tilesWide * wld.tilesHigh;
    // 帧内存态:装载语义 = FI 类型保留存档帧,非 FI 全部置 -1(分区懒分帧前状态)
    // ★vanilla id → SW 内部 id(运行时 store 域;链内 vanillaIdOf 再换回 vanilla 域)
    const v2i = new Map<number, number>();
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const v = TILE_DEFS[i]?.vanilla;
      if (v && !v2i.has(v.sheet)) v2i.set(v.sheet, i);
    }
    const fiArr = new Array(800).fill(false);
    for (const t of fiList) fiArr[t] = true;
    setVanillaFrameImportant(fiArr);
    for (let i = 0; i < N; i++) {
      if (!wld.tiles.active[i]) continue;
      st.flags[i] = 1;
      st.type[i] = v2i.get(wld.tiles.type[i]) ?? 0;
      st.half[i] = wld.tiles.half[i];
      st.slope[i] = wld.tiles.slope[i];
      if (fiArr[wld.tiles.type[i]]) { st.frameX[i] = wld.tiles.frameX[i]; st.frameY[i] = wld.tiles.frameY[i]; }
      else { st.frameX[i] = -1; st.frameY[i] = -1; }
    }
    // 变体注入:rig 见证序(种子化 genRand)产出的 frameNumber 逐格供给(num6 通道)
    const vmap = new Map<number, number>();
    for (const d of dump) vmap.set(d.y * st.w + d.x, d.fn);
    setVanillaVariantMap(vmap);
    const bad: string[] = [];
    let checked = 0, skippedFI = 0, skippedInactive = 0;
    for (const d of dump) {
      if (!d.active) { skippedInactive++; continue; }
      if (fi.has(d.type) || d.type === 80) { skippedFI++; continue; }
      // num6 注入 = dump fn(变体外部供给;链内规则按 switch(num6) 选用);forceFresh:
      // 每格独立完整求值(忽略全局快照——快照由 hash 变体的深层求值写入会串变体)
      const r = vanillaFrameFor(st, d.x, d.y, st, d.fn, 200, true);
      checked++;
      if (r.fx !== d.fx || r.fy !== d.fy) {
        bad.push(`(${d.x},${d.y}) t${d.type} sw=${r.fx},${r.fy} rig=${d.fx},${d.fy} fn=${d.fn}`);
      }
    }
    expect(checked, '链域对拍格数应>0').toBeGreaterThan(1000);
    expect(bad, `逐位不一致 ${bad.length}/${checked} 格:\n${bad.slice(0, 25).join('\n')}`).toEqual([]);
    void skippedFI; void skippedInactive;
  });



});
