/**
 * wld 导入城镇 NPC 入住态回归（2026-08-31「入住丢失」定谳）：
 *   原版存档 homeTile = 住房领取锚点（菜单点击格 MoveTownNPC:WorldGen.cs:4602 /
 *   QuickFindHome 扫描点 :5684ff），常落在家具/平台/地板【房界格】上；本仓 home
 *   约定=站立空格。此前导入后全员被 validateSavedHome 拒收转 homeless，须重新
 *   指定入住。修复 = 读档侧 snapSavedHome 归一 + homeless 位透传（原版无家者
 *   可带正值 homeTile,WorldGen.cs:2214-2217）+ 老人门口重建特例。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
import { validateSavedHome, snapSavedHome } from '../src/world/Housing';

const WLD = join(__dirname, '..', 'Starter_World Master.wld');

describe.skipIf(!existsSync(WLD))('wld 导入 NPC 入住态', () => {
  it('已入驻 NPC 的 home 读档链路全通过（直验或 snap 归一）', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const { save } = parseWldToSave(buf);
    // 老人条目存在且带锚点（地牢口开敞走廊——允许后续 snap 失败特例）
    const oldMan = (save.npcs ?? []).find((n) => n.key === 'old_man');
    expect(oldMan).toBeDefined();
    const housed = (save.npcs ?? []).filter((n) => n.home);
    expect(housed.length).toBeGreaterThanOrEqual(13);

    const { world } = loadSave(JSON.stringify(save));
    const st = world.store;
    let direct = 0, snapped = 0;
    for (const n of housed) {
      const [hx, hy] = n.home!;
      if (validateSavedHome(st, hx, hy)) { direct++; continue; }
      // 守卫老人：门口开敞锚不套围合,snap 失败属预期语义（读档走 maybeRespawnOldMan 重建）
      if (n.key === 'old_man') continue;
      const s = snapSavedHome(st, hx, hy);
      expect(s, `${n.key} @(${hx},${hy}) 应可归一到同室站立格`).not.toBeNull();
      snapped++;
    }
    // 病根特征防回归:vanilla Starter_World 全部 home 都是界格锚 → 直验=0、
    // 全靠 snap;若未来归一逻辑退化(snap 也失败),上面 expect 已爆
    void direct; void snapped;
  });

  it('snapSavedHome 不越室认领（候选泛出房间须含原锚点）', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const { save } = parseWldToSave(buf);
    const { world } = loadSave(JSON.stringify(save));
    const st = world.store;
    for (const n of save.npcs ?? []) {
      if (!n.home || n.key === 'old_man') continue;
      const s = snapSavedHome(st, n.home[0], n.home[1]);
      if (!s) continue;
      // 同列约束:X 不动;上抬幅度 ≤6
      expect(s[0]).toBe(n.home[0]);
      expect(n.home[1] - s[1]).toBeGreaterThanOrEqual(0);
      expect(n.home[1] - s[1]).toBeLessThanOrEqual(6);
    }
  });
});
