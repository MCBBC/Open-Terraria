// NPC 数值金标闸门:vanilla-npcs.json × Terarria1456 × Terarria1457 三方对账常驻化。
// 解析逻辑 = tools/recon-npc-1456-1457.mjs(库模式导入,与 CLI 同源——防"闸门与修复器
// 两套逻辑漂移")。三层:
//   ① CLASS A=0:json 与 1456 SetDefaults 零漂移(2026-08-21 已修 253 条 1405 旧值;
//     手改 json 或重跑旧提取器 extract-npcs.mjs[仍在读 1405] 会在此爆红)
//   ② CLASS B=0:1456→1457 SetDefaults/npcFrameCount 零数值变更(当前事实;若未来
//     1457 树更新出现差异,此处列出移植确认清单)
//   ③ 解析器结构护栏:块数/id 覆盖/锚点值(防反编译树变动后解析静默半坏——同
//     extract-itemcombat.mjs X-04 委托基数护栏教训)
// 注意:依赖仓库内 Terarria1456/、Terarria1457/ 反编译树(与 npc-frame-golden 同惯例)。
import { describe, expect, it } from 'vitest';
// @ts-expect-error 纯 JS 提取库(无类型声明)
import { recon } from '../tools/recon-npc-1456-1457.mjs';

const r = recon();

describe('NPC 数值三方对账金标(json × 1456 × 1457)', () => {
  it('① json 与 1456 SetDefaults 零漂移(CLASS A)', () => {
    expect(r.classA).toEqual([]);
  });

  it('② 1456→1457 SetDefaults/npcFrameCount 零数值变更(CLASS B)', () => {
    expect(r.classB).toEqual([]);
  });

  it('③a 解析器结构护栏:块数/id 覆盖不低于基线', () => {
    // 基线(2026-08-21):617 条件块 / 691 id 有属性 / 697 帧表 / json 696 条
    // 反编译树更新后块数只增不减(新 NPC=新块);跌破=解析器半坏(同 X-04 教训)
    expect(r.coverage.blocks56).toBeGreaterThanOrEqual(617);
    expect(r.coverage.ids56).toBeGreaterThanOrEqual(690);
    expect(r.coverage.frames).toBeGreaterThanOrEqual(697);
    expect(r.coverage.jsonEntries).toBeGreaterThanOrEqual(696);
    // 未解析条件/非字面量赋值是已知白名单(纹理加载门/catchItem 公式),超限=新形态未适配
    expect(r.coverage.unparsedConds).toBeLessThanOrEqual(4);
    expect(r.coverage.unparsedAssigns).toBeLessThanOrEqual(16);
  });

  it('③b 锚点值(已知正确值,防解析语义漂移)', () => {
    const g = (id: number, k: string) => (r.results56[id] ?? {})[k];
    expect(g(1, 'lifeMax')).toBe(25);       // 蓝史莱姆
    expect(g(16, 'lifeMax')).toBe(90);      // 恶魔之眼(1456 终值,1405 旧 60)
    expect(g(454, 'damage')).toBe(100);     // 幻影龙头
    expect(g(525, 'lifeMax')).toBe(250);    // 邪恶食尸鬼(公共180+case70)
    expect(g(527, 'knockBackResist')).toBeCloseTo(0.4, 6); // 0.6-0.2 浮点
    expect(g(68, 'damage')).toBe(9999);     // 地牢守护者(1405 旧 1000)
  });
});
