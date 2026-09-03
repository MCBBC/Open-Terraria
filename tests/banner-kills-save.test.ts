// 旗帜击杀计数存档持久化（2026-09-03 清偿）：
//   原版 BannerSystem.killCount = int[293] 静态表（BannerSystem.cs:34），随世界存档：
//   WorldFile.cs:1347 `BannerSystem.Save(writer)`（i16 n=293 + n×i32；v≥289 再
//   i16 m=293 + m×u16 claimableBanners）↔ :2210 `BannerSystem.Load(reader, version)`
//   （v<109 旧档无此段）。
//   本仓自有 JSON 存档：SaveData.bannerKills（serialize.ts:481）↔ loadSaveData 回填
//   world.bannerKills（SaveFile.ts apply,旧档缺段守卫=空表）。
//   .wld 导入面：WldParser banner 段（曾读位即弃 → 原版世界导入旗计数清零）→
//   WldImport 顶层 bannerKills → 同一 loadSaveData 接缝。
import { describe, it, expect } from 'vitest';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseWld } from '../src/wld/WldParser';

describe('bannerKills 存档持久化（BannerSystem.killCount）', () => {
  it('存→读→计数一致（多键多值往返）', () => {
    const world = new World(64, 32, 42, '测试');
    world.bannerKills = { 5: 42, 87: 1, 292: 999 };
    const player = new Player(100, 100, new Inventory());
    const back = loadSave(saveGame(world, player, 0));
    expect(back.world.bannerKills).toEqual({ 5: 42, 87: 1, 292: 999 });
  });

  it('旧档无该字段 → 缺省空表不炸（读档后旗帜计数从空开始）', () => {
    const world = new World(64, 32, 42, '测试');
    world.bannerKills = { 13: 7 };
    const player = new Player(100, 100, new Inventory());
    const data = JSON.parse(saveGame(world, player, 0)) as Record<string, unknown>;
    delete data.bannerKills;                     // 模拟本批之前的旧档
    const back = loadSave(JSON.stringify(data));
    expect(back.world.bannerKills).toEqual({});
  });

  it('.wld 金标导入：banner 段解码（键=旗种 1-292、值=正整数；WorldFile v≥289 形）', () => {
    // 金标 = 原版 1.4.5.6 Steam 版小世界（v319 ≥ 289,claimable 段在 killCount 之后,
    // 须正确跳过否则后续字段全错位——fastForwardTimeToDawn 断言兜底验证段界）
    const GOLDEN = fileURLToPath(new URL('./golden/wld/12345世界.wld', import.meta.url));
    const wld = parseWld(new Uint8Array(readFileSync(GOLDEN)));
    for (const [k, v] of Object.entries(wld.bannerKills)) {
      const banner = Number(k);
      expect(banner).toBeGreaterThanOrEqual(1);   // 下标 0 恒 0 不落表（BannerSystem 域 1-292）
      expect(banner).toBeLessThanOrEqual(292);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);               // 仅非零项落表
    }
    // claimable 段被正确消费的段界证据：banner 段之后的快进旗仍解析成功
    expect(typeof wld.fastForwardTimeToDawn).toBe('boolean');
    expect(wld.version).toBeGreaterThan(289);
  });
});
