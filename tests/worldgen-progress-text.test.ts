// 创建世界进度文案对齐回归:worldgenKeys 映射表 = 原版 WorldGen.cs
// AddGenerationPass↔progress.Message 权威配对(2026-08-13 awk 全量提取)。
// 此前 5 处错值(液体 27→19/地狱屋 36→30/表面 89→37/地表装饰 37→34/清浮空随改名)
// 且 30+ 槽缺映射显示自造中文。
import { describe, it, expect } from 'vitest';
import { worldgenProgressKey, worldgenProgressStringKey } from '../src/i18n/worldgenKeys';
import { Lang } from '../src/i18n/Lang';

/** 管线实际槽名(与 WorldGen.ts passes 数组保持同步的影子清单;改名时需同步) */
const SLOTS = [
  '原版地形', '沙丘', '洞穴', '生物群系', '液体', '引力沙', '微光', '清理', '结构',
  '水体沉降', '沙上清水', '绿洲', '海滩装饰', '半砖平滑', '瀑布唇缘', '薄冰', '洞穴墙变体',
  '生命水晶', '地狱屋', '地狱箱', '宝石洞', '苔藓', '洞穴墙', '瓦罐', '地狱熔炉', '矿骨堆',
  '表面', '地表矿石', '倒木水景', '地表装饰', '出生点', '草墙', '向日葵', '栽树', '炼金草药',
  '染料植物', '蛛网蜂巢', '地表植物', '丛林植物P2', '藤蔓', '地表花', '地表蘑菇', '宝石系统',
  '长苔藓', '丛林墙', '蜂巢幼虫', '仙人掌珊瑚', '瓦片清理', '蜥蜴祭坛', '微群系', '水生植物',
  '钟乳石宝石树', '断线陷阱清理', '终清理',
];

describe('创建世界进度文案(原版 gen 键对齐)', () => {
  it('管线全部槽有映射(数字或字符串键,零自造中文漏网)', () => {
    const missing = SLOTS.filter((s) => worldgenProgressKey[s] === undefined && worldgenProgressStringKey[s] === undefined);
    expect(missing).toEqual([]);
  });

  it('5 处历史错值已按原版配对修正', () => {
    expect(worldgenProgressKey['液体']).toBe(19);       // Lakes=gen19 正在添加水体(非 27 沉降)
    expect(worldgenProgressKey['地狱屋']).toBe(30);     // UndergroundHouses=30 隐藏宝藏(非 36 熔炉)
    expect(worldgenProgressKey['表面']).toBe(37);       // SpreadingGrass=37 铺草(非 89 放置物体)
    expect(worldgenProgressKey['地表装饰']).toBe(34);   // Traps=34 放置机关(非 37 铺草)
    expect(worldgenProgressKey['水体沉降']).toBe(27);   // SettleLiquids=27 安置液体
  });

  it('代表性槽取原版文案(lang 未加载时回退键路径不崩)', () => {
    const out = Lang.worldgenText('栽树');
    // 未 init 时 getTextValue 回退键本身或原文案(勿抛异常);加载后为原版文本
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('字符串键表(1.4 新增 pass)正确', () => {
    expect(worldgenProgressStringKey['绿洲']).toBe('WorldGeneration.Oasis');
    expect(worldgenProgressStringKey['钟乳石宝石树']).toBe('WorldGeneration.Speleothems');
    expect(worldgenProgressStringKey['长苔藓']).toBe('WorldGeneration.LongMoss');
  });
});
