// 临时探针：地牢开关→灯笼（sheet 42）连线后右键不亮——复现调试报告场景
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { attachDevices } from '../src/world/wiring/devices';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

describe('多格块帧翻转锚点（flipBlock 归一化，调试报告 2026-08-17 修复）', () => {
  it('同列红线：灯(30,50/51) fx=18 ← 线 ← 开关(30,60)，hitSwitch 后灯应变亮', () => {
    const w = new World(60, 120, 7, 'lantern-probe');
    const st = w.store;
    const LANTERN = TILE_BY_KEY['lantern']!;
    const SWITCH = TILE_BY_KEY['v_136_switch']!;
    // 灯 1×2（样式 1：fy=36/54，灭档 fx=18 —— 与报告一致）
    st.setTileSilent(30, 50, LANTERN); st.frameY[st.idx(30, 50)] = 36; st.frameX[st.idx(30, 50)] = 18;
    st.setTileSilent(30, 51, LANTERN); st.frameY[st.idx(30, 51)] = 54; st.frameX[st.idx(30, 51)] = 18;
    // 开关
    st.setTileSilent(30, 60, SWITCH);
    // 红线：列 30，y=50..60 全铺（含开关格与灯两格）
    for (let y = 50; y <= 60; y++) st.wire[st.idx(30, y)] |= TileStore.WIRE_RED;

    const wiring = new Wiring(st);
    attachDevices(wiring, { worldSurface: 100 } as never);
    wiring.hitSwitch(30, 60);
    // 开关翻转
    expect(st.frameY[st.idx(30, 60)] % 36).toBe(18);
    // 灯两格 fx 18→0（亮档）
    expect(st.frameX[st.idx(30, 50)]).toBe(0);
    expect(st.frameX[st.idx(30, 51)]).toBe(0);
  });

  it('对照：只有灯格无线、线止于灯下一格（旧理解），hitSwitch 不应翻转', () => {
    const w = new World(60, 120, 7, 'lantern-probe2');
    const st = w.store;
    const LANTERN = TILE_BY_KEY['lantern']!;
    const SWITCH = TILE_BY_KEY['v_136_switch']!;
    st.setTileSilent(30, 50, LANTERN); st.frameX[st.idx(30, 50)] = 18;
    st.setTileSilent(30, 51, LANTERN); st.frameX[st.idx(30, 51)] = 18;
    st.setTileSilent(30, 60, SWITCH);
    for (let y = 52; y <= 60; y++) st.wire[st.idx(30, y)] |= TileStore.WIRE_RED;
    const wiring = new Wiring(st);
    attachDevices(wiring, { worldSurface: 100 } as never);
    wiring.hitSwitch(30, 60);
    expect(st.frameX[st.idx(30, 50)]).toBe(18);   // 线没到灯 → 不翻
  });
});

