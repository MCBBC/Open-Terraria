// TerrainPass 位级金标：我们的 Reset 掷骰 + Terrain pass 输出
// ↔ C# terrain-oracle（反射真·Terraria.exe 的 UnifiedRandom + 1456 源码逐行转写）。
// 金标生成：dotnet run tools/golden/terrain-oracle.cs <seedInt> <evil> <out.json>
// 旁证：9293480 金标 oracle worldSurface=337 与原版 .wld 头 groundLevel=337 精确一致。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';

const read = (f: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./golden/${f}`, import.meta.url)), 'utf8'));

describe('Terrain oracle 位级对账（C# 转写 ← 反射真二进制）', () => {
  it('种子 9293480 腐化：常量 + 逐列地表全等', () => {
    const o = read('terrain-9293480.json');
    const { gs, surface } = runResetAndTerrain({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    expect(gs.jungleX).toBe(o.jungleX);
    expect(gs.dungeonX).toBe(o.dungeonX);
    expect(gs.snowOriginLeft).toBe(o.snowL);
    expect(gs.snowOriginRight).toBe(o.snowR);
    expect(gs.beachLeftEnd).toBe(o.leftBeachEnd);
    expect(gs.beachRightStart).toBe(o.rightBeachStart);
    expect(gs.dungeonLocation).toBe(o.dungeonLocation);
    expect(gs.worldSurface).toBe(o.worldSurface);
    expect(gs.rockLevel).toBe(o.rockLayer);
    expect(gs.waterLine).toBe(o.waterLine);
    expect(gs.lavaLine).toBe(o.lavaLine);
    // 逐列（Int32Array ↔ number[]）
    expect(Array.from(surface)).toEqual(o.surf);
  });

  it('种子 SandboxWorld(Crc32=1511931452) 猩红：常量 + 逐列地表全等', () => {
    const o = read('terrain-SandboxWorld.json');
    const { gs, surface } = runResetAndTerrain({ width: 4200, height: 1200, seedText: 'SandboxWorld', evil: 1 });
    expect(gs.jungleX).toBe(o.jungleX);
    expect(gs.dungeonX).toBe(o.dungeonX);
    expect(gs.beachLeftEnd).toBe(o.leftBeachEnd);
    expect(gs.beachRightStart).toBe(o.rightBeachStart);
    expect(gs.dungeonLocation).toBe(o.dungeonLocation);
    expect(gs.worldSurface).toBe(o.worldSurface);
    expect(gs.rockLevel).toBe(o.rockLayer);
    expect(gs.waterLine).toBe(o.waterLine);
    expect(gs.lavaLine).toBe(o.lavaLine);
    expect(Array.from(surface)).toEqual(o.surf);
  });
});
