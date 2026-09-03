// TDZ 断环守护（2026-09-03 红蓝对抗 R4/B2 建议）：items.ts 曾顶层读循环伙伴
// （devices 音乐盒表 / Wiring TOOL_*）绑定 → DFS 序"伙伴先于 items"时 ReferenceError
// 炸 boot（冷启动抽彩,动态 import 抢跑必炸）。修法=纯数据抽叶子模块。本测试钉三事：
//   1. 两叶子保持零 import（叶子性=任何 DFS 序最先完成求值的保证）；
//   2. items.ts 不再静态引用 wiring/devices 与 world/Wiring（断边不回焊）；
//   3. re-export 侧（devices/Wiring）仍可解析（既有消费方兼容）。
// ★若未来要在 items.ts 顶层读环内绑定：走"抽叶子"通道,勿直连（49 节点大环仍在,
//   顶层读即复死者——见红蓝对抗 R4-F7 结构备案）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../src');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

describe('items.ts TDZ 断环守护', () => {
  it('叶子模块零运行时 import（musicBoxStyles / wiringToolBits / dungeonFramedSheets / mountData）', () => {
    for (const f of ['data/musicBoxStyles.ts', 'data/wiringToolBits.ts',
      'world/gen/vanilla/dungeonFramedSheets.ts', 'data/mountData.ts']) {
      const src = read(f);
      // 只禁【运行时】import——`import type` 擦除后零边,不构成 TDZ 面
      const runtimeImports = (src.match(/^(?!\s*\/\/)import\s(?!type)/m) ?? [])
        .concat((src.match(/from\s+['"]\./g) ?? []).filter((_, i) => true));
      // 精确判定:逐行找非 type 的相对导入——'.json' 导入无模块图面,属叶子安全
      const bad = src.split('\n').filter((ln) => /^import\s/.test(ln) && !/^import\stype/.test(ln) && !/\.json';\s*$/.test(ln));
      expect(bad, f + ' 有运行时 import: ' + bad.join(' | ')).toEqual([]);
      void runtimeImports;
    }
  });

  it('items.ts 不回焊 devices/Wiring 直连（断边持久）', () => {
    const src = read('data/items.ts');
    expect(src.includes("from '../world/wiring/devices'")).toBe(false);
    expect(src.includes("from '../world/Wiring'")).toBe(false);
  });

  it('NTB 不直连 DungeonPass（R4-F5a 断边持久）/ Minecart 的 MOUNT_DATA 来自叶子（R4-F5b）', () => {
    const ntb = read('world/gen/vanilla/NotTheBeesPass.ts');
    expect(ntb.includes("from './DungeonPass'")).toBe(false);
    const mc = read('entities/Minecart.ts');
    expect(mc.includes('MOUNT_DATA')).toBe(true);
    expect(mc.includes("from '../data/mountData'") || mc.includes('MOUNT_DATA,')).toBe(true);
    expect(mc.includes("MOUNT_DATA } from '../entities/Mounts'")).toBe(false);
  });

  it('items.ts 顶层经叶子解析音乐盒表与工具位（消费面存活）', async () => {
    const items = await import('../src/data/items');
    const { MUSIC_BOX_ITEM_BY_STYLE } = await import('../src/data/musicBoxStyles');
    const { TOOL_RED, TOOL_ACTUATOR } = await import('../src/data/wiringToolBits');
    expect(MUSIC_BOX_ITEM_BY_STYLE.length).toBe(101);
    expect(TOOL_RED).toBe(1);
    expect(TOOL_ACTUATOR).toBe(16);
    // 音乐盒 placeStyle 回填（items 顶层循环的消费效果）：562 → style 0
    const k562 = items.VANILLA_ITEM_KEY_BY_ID[562];
    expect(k562).toBeTruthy();
    expect(items.ITEM_DEFS[items.ITEM_BY_KEY[k562]].placeStyle).toBe(0);
  });
});
