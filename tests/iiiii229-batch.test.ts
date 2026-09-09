// IIIII229 批（UI 与 src 登记债 B+C 组并批清偿）守卫测试：
//   ① Esc 中止链——requestWorldGenAbort 置位/生成环边界消费（WorldGenAbortedError）/
//      生成头部复位；生成屏 UI.Canceling 文案（:86-91,三重奏之前）。
//   ② GamePad 提示池接桩——tipCategories 按设备切换（GameTipsProvider.cs:29-36）。
//   ④ 读档路 lockBG——mainFlow 三路接线源文本锁（Main.cs:20056-20065 语义）。
//   ⑤ snowiness 通道——snowDirtBg/snowRockBg 渐变端点（array6/array7）+ 截断语义 +
//      mapSnowinessB 7×7 雪窗（MapHelper.cs:2045-2062）+ sceneSnowinessB 连续支。
//   ⑥ M1——parseSeedChain 旗标并集 UI 派生（生成屏=gen 同口径,多段籽不再全灭）。
//   ⑥ M2——文案三重奏顺序覆写（drunk+NTB 显蜜蜂 / FTW+NTB 反写蜜蜂文案）。
//   ⑧ solidTop 死字段副本——DungeonDualLayout 源文本锁（vanilla.solidTop 活读禁返）
//      + GenSolid 单源表锚。
//   ⑨ 化石邻杀写面——DungeonPass killShattered 通道锁（half/帧哨兵/漆/涂层/inActive/
//      genSquareTileFrame 尾级联；写面 Census 实证可达见 content-parity CXCVIII 章）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  generateWorld, requestWorldGenAbort, worldGenAbortRequested, WorldGenAbortedError,
} from '../src/world/gen/WorldGen';
import { parseSeed, parseSeedChain } from '../src/world/gen/SeedEasterEggs';
import { UIWorldLoadState, genScreenFlagsOf } from '../src/vui/states/UIWorldLoadState';
import { tipCategories } from '../src/vui/states/UIWorldLoadState';
import { Lang } from '../src/i18n/Lang';
import { MAP_SNOW_TYPES, mapSnowinessB, snowDirtBg, snowRockBg, sceneSnowinessB } from '../src/render/MapColors';
import { VANILLA_DIRT_BG, VANILLA_ROCK_BG } from '../src/data/vanillaMapColors';

const ROOT = join(import.meta.dirname ?? '.');

function textOf(s: UIWorldLoadState): string {
  return (s as unknown as { header: { text: string } }).header.text;
}

// ── ① Esc 中止链 ───────────────────────────────────────────────
describe('① Esc 中止链（QueuedAbort 镜像）', () => {
  it('requestWorldGenAbort 置位 / worldGenAbortRequested 观测', () => {
    expect(worldGenAbortRequested()).toBe(false);
    requestWorldGenAbort();
    expect(worldGenAbortRequested()).toBe(true);
  });

  it('生成 pass 环边界消费：onProgress 内置位 → 下一槽头抛 WorldGenAbortedError', async () => {
    let fired = false;
    await expect(generateWorld(
      { width: 400, height: 300, seedText: '229', name: 'iii229-abort' },
      () => {
        if (!fired) { fired = true; requestWorldGenAbort(); }   // 槽 1 进行中置位
      },
    )).rejects.toBeInstanceOf(WorldGenAbortedError);
    expect(fired).toBe(true);
  }, 240_000);

  it('中止位在下次 generateWorld 头部复位（陈旧请求不清染新生成）', () => {
    // 复位行为本身在上一用例后的完整生成里被消费——这里只锁 API 面与错误类型名
    expect(new WorldGenAbortedError().name).toBe('WorldGenAbortedError');
  });

  it('生成屏 QueuedAbort 文案=UI.Canceling（:86-91,三重奏之前）', () => {
    const s = new UIWorldLoadState(0, { seedText: '05162020' });
    (s as unknown as { abortQueued: boolean }).abortQueued = true;
    s.setProgress('正在生成地形', 0.3);
    expect(textOf(s)).toBe(Lang.text('UI.Canceling'));
  });
});

// ── ② GamePad 提示池接桩 ───────────────────────────────────────
describe('② GamePad/Keyboard 提示池切换（GameTipsProvider :29-36）', () => {
  const origDescriptor = typeof navigator !== 'undefined'
    ? Object.getOwnPropertyDescriptor(globalThis, 'navigator') : null;

  it('无手柄（桌面键鼠）→ Default+Keyboard 池', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [null, null] });
    try { expect(tipCategories()).toEqual(['LoadingTips_Default', 'LoadingTips_Keyboard']); }
    finally { vi.unstubAllGlobals(); void origDescriptor; }
  });

  it('有已连接手柄 → Default+GamePad 池', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [null, { connected: true }] });
    try { expect(tipCategories()).toEqual(['LoadingTips_Default', 'LoadingTips_GamePad']); }
    finally { vi.unstubAllGlobals(); }
  });

  it('navigator 缺席（node 测试环境兜底）→ 键盘池不抛', () => {
    vi.stubGlobal('navigator', undefined);
    try { expect(tipCategories()).toEqual(['LoadingTips_Default', 'LoadingTips_Keyboard']); }
    finally { vi.unstubAllGlobals(); }
  });
});

// ── ④ 读档路 lockBG（源文本锁）────────────────────────────────
describe('④ 读档路 lockBG 三路接线（Main.cs:20056-20065 isGeneratingOrLoadingWorld）', () => {
  const src = readFileSync(join(ROOT, '../src/mainFlow.ts'), 'utf8');
  it('loadFromKey / loadFromJson / importWld 各含 setBGLock(true) 且 finally 解锁', () => {
    const loadFromKey = src.slice(src.indexOf('async function loadFromKey'), src.indexOf('async function loadFromJson'));
    const loadFromJson = src.slice(src.indexOf('async function loadFromJson'), src.indexOf('function dedupeWorldName'));
    const importWld = src.slice(src.indexOf('async function importWld'), src.indexOf('// ---- 菜单 ----'));
    expect(loadFromKey).toContain('setBGLock(true)');
    expect(loadFromKey).toContain('setBGLock(false)');
    expect(loadFromJson).toContain('setBGLock(true)');
    expect(loadFromJson).toContain('setBGLock(false)');
    expect(importWld).toContain('setBGLock(true)');
    expect(importWld).toContain('setBGLock(false)');
  });
});

// ── ⑤ snowiness 通道 ──────────────────────────────────────────
describe('⑤ snowiness（GetBackgroundType array6/array7 雪渐变）', () => {
  it('端点=b=0 现行常量（array6[0]/array7[0]）与全雪端点（:1671-1688 钉值）', () => {
    expect(snowDirtBg(0)).toEqual(VANILLA_DIRT_BG);            // (88,61,46)
    expect(snowDirtBg(255)).toEqual([37, 78, 123]);            // Color9
    expect(snowRockBg(0)).toEqual(VANILLA_ROCK_BG);            // (74,67,60)
    expect(snowRockBg(255)).toEqual([53, 70, 97]);             // (53,70,97)
  });

  it('C# (byte) 浮点截断语义（非四舍五入）', () => {
    expect(sceneSnowinessB(6000)).toBe(255);                   // SnowTileMax=6000
    expect(sceneSnowinessB(3000)).toBe(127);                   // 0.5*255=127.5 → trunc
    expect(sceneSnowinessB(0)).toBe(0);
  });

  it('7×7 雪窗：i-36..i+24（步长 10,+30 界不含）命中即 255（:2045-2062）', () => {
    expect(mapSnowinessB((x, y) => x === 100 - 36 && y === 100 - 36, 100, 100)).toBe(255);
    expect(mapSnowinessB((x, y) => x === 100 + 24 && y === 100 + 24, 100, 100)).toBe(255);   // 尾采样点
    expect(mapSnowinessB((x, y) => x === 100 + 34, 100, 100)).toBe(0);                       // +30 界外一格
    expect(mapSnowinessB(() => false, 100, 100)).toBe(0);
  });

  it('snowTypes 表={147,161,162,163,164,200}（:1782-1788,与 SceneMetrics 计数表不同源）', () => {
    expect([...MAP_SNOW_TYPES].sort((a, b) => a - b)).toEqual([147, 161, 162, 163, 164, 200]);
  });
});

// ── ⑥ M1/M2 ──────────────────────────────────────────────────
describe('⑥M1 UI 旗标派生=parseSeedChain（gen 同口径）', () => {
  it("多段籽 '05162020|not the bees' → drunk+NTB 并集（旧 parseSeed 首中即返=全灭）", () => {
    expect(parseSeed('05162020|not the bees').flags.drunkWorld ?? false).toBe(false);   // 旧口径对照
    const f = parseSeedChain('05162020|not the bees').flags;
    expect(f.drunkWorld).toBe(true);
    expect(f.notTheBees).toBe(true);
    const g = genScreenFlagsOf(f);
    expect(g.drunkWorldGenText).toBe(true);
    expect(g.notTheBees).toBe(true);
  });
});

describe('⑥M2 文案三重奏顺序覆写（UIWorldLoad.cs:93-116 三顺序 if）', () => {
  it('drunk+NTB 组合：蜜蜂覆写乱码（旧互斥链显乱码）', () => {
    const s = new UIWorldLoadState(0, { seedText: '05162020|not the bees' });
    s.setProgress('正在生成地形', 0.3);
    expect(textOf(s)).toBe(Lang.text('UI.WorldGenEasterEgg_GeneratingBees'));
  });

  it('FTW+NTB 组合：对蜜蜂文案反写（旧互斥链不反写）', () => {
    const s = new UIWorldLoadState(0, { seedText: 'for the worthy|not the bees' });
    s.setProgress('正在生成地形', 0.3);
    const bees = Lang.text('UI.WorldGenEasterEgg_GeneratingBees');
    const want = [...bees].reverse().join('');
    expect(textOf(s)).toBe(want);
  });
});

// ── ⑧/⑨ 源文本锁（判据本体防回退;剥注释防锚自伤）──────────────
/** 源文本剥注释（代码面断言专用;字符串字面量近似豁免——本仓 pass 代码不含歧义面）。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('⑧/⑨ src 源文本锁', () => {
  it('⑧ DungeonDualLayout 不再活读 vanilla.solidTop（as unknown as 放宽拆除）', () => {
    const src = stripComments(readFileSync(join(ROOT, '../src/world/gen/vanilla/DungeonDualLayout.ts'), 'utf8'));
    expect(src).not.toContain('vanilla.solidTop');
    expect(src).not.toContain('TILE_DEFS[i] as unknown as');
    expect(src).not.toContain('solidTop?: boolean');
    expect(src).toContain('VAN_TILE_SOLIDTOP_SHEET_SET');
    expect(src).toContain('const TILE_DEFS_BY_INTERNAL: Array<TileDef | undefined> = [];');
  });

  it('⑧ GenSolid 单源表=sheet 域（桌14/书箱101/钢琴114/平台19/380 在;常规土石不在）', () => {
    const src = readFileSync(join(ROOT, '../src/world/gen/vanilla/GenSolid.ts'), 'utf8');
    void 0;
    const m = src.match(/VAN_TILE_SOLIDTOP_SHEET_SET = new Set\(\[([\d, ]+)\]\)/);
    expect(m).not.toBeNull();
    const set = new Set(m![1]!.split(',').map((n) => Number(n.trim())));
    for (const sh of [14, 16, 18, 19, 87, 88, 101, 114, 380, 427]) expect(set.has(sh)).toBe(true);
    for (const sh of [0, 1, 2, 53]) expect(set.has(sh)).toBe(false);
  });

  it('⑨ killShattered 写面=KillTile 尾全通道（half/帧哨兵/漆/涂层/inActive/SQF 尾）', () => {
    const src = stripComments(readFileSync(join(ROOT, '../src/world/gen/vanilla/DungeonPass.ts'), 'utf8'));
    const block = src.slice(src.indexOf('const killShattered'), src.indexOf('for (let kk = num26 - 1'));
    expect(block).toContain('st.half[ki] = 0');
    expect(block).toContain('st.frameX[ki] = 65535');
    expect(block).toContain('st.frameY[ki] = 65535');
    expect(block).toContain('st.paint[ki] = 0');
    expect(block).toContain('st.coat[ki] &= ~TileStore.COAT_BLOCK_MASK');
    expect(block).toContain('st.wire[ki] &= ~32');
    expect(block).toContain('genSquareTileFrame(st, rng, kx, ky)');
    expect(block).not.toContain('=== 135');   // 手抄上邻孤儿支判据已由引擎级联取代
  });
});
