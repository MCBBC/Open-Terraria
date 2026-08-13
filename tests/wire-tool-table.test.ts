// 电路工具 wireTool 登记表回归(§8 销核):此前 items.ts 该段是空壳注释,
// Game.ts 三处守卫(使用派发/显示导线/R 键切模式)全在等这张表——整族死路径。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR } from '../src/world/Wiring';

describe('电路工具 wireTool 登记(WIRE_TOOL_TABLE)', () => {
  const wtOf = (vid: number) => {
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    return key ? ITEM_DEFS[ITEM_BY_KEY[key]]?.wireTool : undefined;
  };
  it('四色扳手各放各色掩码', () => {
    expect(wtOf(509)?.place).toBe(TOOL_RED);
    expect(wtOf(850)?.place).toBe(TOOL_BLUE);
    expect(wtOf(851)?.place).toBe(TOOL_GREEN);
    expect(wtOf(3612)?.place).toBe(TOOL_YELLOW);
  });
  it('剪线钳 510 = cutter;致动魔杖 3620 = rod;蓝图 3611 = grand', () => {
    expect(wtOf(510)?.cutter).toBe(true);
    expect(wtOf(3620)?.rod).toBe(true);
    expect(wtOf(3611)?.grand).toBe(true);
  });
  it('致动器 849 = 单放 TOOL_ACTUATOR;五彩扳手 3625 = 载体掩码(运行时按模式覆写)', () => {
    expect(wtOf(849)?.place).toBe(TOOL_ACTUATOR);
    const mc = wtOf(3625)?.place ?? 0;
    expect(mc & (TOOL_RED | TOOL_GREEN | TOOL_BLUE | TOOL_YELLOW)).toBe(TOOL_RED | TOOL_GREEN | TOOL_BLUE | TOOL_YELLOW);
  });
  it('电线 530 非工具(纯消耗材料)', () => {
    expect(wtOf(530)).toBeUndefined();
  });
});
