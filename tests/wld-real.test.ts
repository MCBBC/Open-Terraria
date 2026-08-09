import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWld } from '../src/wld/WldParser';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';

const WLD = join(__dirname, '..', 'Starter_World Master.wld');

describe('真实 .wld 地图导入（用户提供）', () => {
  it.skipIf(!existsSync(WLD))('解析 Starter_World Master.wld', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const wld = parseWld(buf);
    console.log('wld:', wld.title, wld.version, `${wld.tilesWide}x${wld.tilesHigh}`, 'chests:', wld.chests.length, 'npcs:', wld.npcs.length);
    expect(wld.version).toBeGreaterThanOrEqual(210);
    expect(wld.tilesWide).toBeGreaterThan(100);
    expect(wld.tilesHigh).toBeGreaterThan(100);
    // tile 数据抽查：地表上方是空气、地下有实心块
    const t = wld.tiles;
    let solid = 0, empty = 0;
    for (let i = 0; i < t.active.length; i += 997) {
      if (t.active[i]) solid++;
      else empty++;
    }
    expect(solid + empty).toBeGreaterThan(100);

    // 完整导入链路
    const { save, seedText, gameMode } = parseWldToSave(buf);
    const { world } = loadSave(JSON.stringify(save));
    expect(world.w).toBe(wld.tilesWide);
    expect(world.chests.length).toBe(wld.chests.length);
    // 槽位登记元数据（WldParser gameMode / wld seed 原文）
    expect(typeof seedText).toBe('string');
    expect(gameMode).toBeGreaterThanOrEqual(0);

    // ---- 方向性校验（防转置/面条 bug 回归）----
    // 1) 出生点所在列：地面线以上应几乎全是空气
    const st = world.store;
    const gl = Math.floor(wld.groundLevel);
    let air = 0, total = 0;
    for (let y = 0; y < gl; y++) {
      total++;
      if (!st.isActive(wld.spawnX, y)) air++;
    }
    // 出生列地面线以上以空气为主（允许树冠/空岛等少量实心）
    expect(air / Math.max(1, total)).toBeGreaterThan(0.75);
    // 2) 地表应近似水平且不在天顶：20 列的首个实心 tile 应聚集在中位数 ±150 内
    //    （groundLevel 是土层线，真实地表在其上方；空岛列会明显偏小，属合法）
    const firsts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const x = Math.floor((i + 0.5) * wld.tilesWide / 20);
      let first = -1;
      for (let y = 0; y < wld.tilesHigh; y++) {
        if (st.isActive(x, y)) { first = y; break; }
      }
      firsts.push(first);
    }
    // 面条 bug 的特征是天空从 y≈0 就实心
    for (const f of firsts) expect(f).toBeGreaterThan(50);
    const sorted = [...firsts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const near = firsts.filter((f) => Math.abs(f - median) <= 150).length;
    expect(near).toBeGreaterThanOrEqual(12);
    // 3) 深层应大部分是实心（洞穴比例 < 60%）
    let solidDeep = 0, deepTotal = 0;
    for (let i = 0; i < 5000; i++) {
      const x = (i * 7919) % wld.tilesWide;
      const y = wld.tilesHigh - 1 - ((i * 104729) % Math.floor(wld.tilesHigh * 0.3));
      deepTotal++;
      if (st.isActive(x, y)) solidDeep++;
    }
    expect(solidDeep / deepTotal).toBeGreaterThan(0.4);
  });
});
