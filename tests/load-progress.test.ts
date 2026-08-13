// 读档进度文案回归(对齐原版 WorldFile.cs:loadProgressLabel):
// tiles=gen[51] "正在加载世界数据: X%" 按列(:2514);settle=gen[27] 收敛比例 50-100%(:762)。
// 逻辑在 mainFlow 闭包内不可直测——此处测同公式的独立复刻 + loadSaveData 进度回调语义。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { saveGame, loadSaveData } from '../src/save/SaveFile';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

/** 与 mainFlow.loadProgressLabel 同公式(单一事实源风险:若改文案公式需同步) */
function label(phase: string, p: number): string {
  if (phase === 'tiles') return `LOADING ${Math.min(100, Math.floor(p * 100) + 1)}%`;
  if (phase === 'settle') return `SETTLING ${Math.min(100, Math.floor(50 + p * 50))}%`;
  return 'READING';
}

describe('读档进度(原版 WorldFile 序列)', () => {
  it('loadSaveData onTilesProgress:单调不减、末值=100%、首段即有回调', () => {
    const world = new World(80, 40, 42, 'p');
    const st = world.store;
    for (let x = 10; x < 70; x++) for (let y = 20; y < 36; y++) st.setTileSilent(x, y, 2);
    st.setLiquid(20, 30, 255, 1);
    const player = new Player(100, 100, new Inventory());
    const json = saveGame(world, player, 0);
    const ps: number[] = [];
    loadSaveData(JSON.parse(json), (p) => ps.push(p));
    expect(ps.length).toBeGreaterThan(0);
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThanOrEqual(ps[i - 1] - 1e-9);
    expect(ps[ps.length - 1]).toBeCloseTo(1, 5);
  });

  it('gen[51] 按列百分比:mid=50% → 51%(原版 :2518 num*100+1)', () => {
    expect(label('tiles', 0)).toBe('LOADING 1%');
    expect(label('tiles', 0.5)).toBe('LOADING 51%');
    expect(label('tiles', 1)).toBe('LOADING 100%');   // 钳制(末格 +1 超 100)
  });

  it('gen[27] 收敛比例 50-100%(原版 :762 num7*100/2+50)', () => {
    expect(label('settle', 0)).toBe('SETTLING 50%');
    expect(label('settle', 0.5)).toBe('SETTLING 75%');
    expect(label('settle', 1)).toBe('SETTLING 100%');
  });

  it('其他阶段=LoadingSave 占位', () => {
    expect(label('parse', 0.3)).toBe('READING');
  });
});
