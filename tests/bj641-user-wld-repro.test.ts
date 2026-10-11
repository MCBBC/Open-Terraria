// ★BJ641（2026-10-11）用户世界档复现：提炼机通电不提炼。
// 物证：用户 .wld（十周年纪念种子(2).wld v325, 4200×1200）+ debug-report
//（bundle index-B7g46vVh.js, tile(3910,285)）。
// wld 实测（tools/_bj641-wld-evidence.test.ts）：
//   提炼机 3×3 @ (3912..3914, 283..285) → 锚 (3912,283)；计时器 (3911,286) frameX=0
//   （1s 档）红线直连（3911,285→3912,285 竖段 3912,283/284/285）；箱段锚 @(3912,280)
//   箱内有货：vid1103 雪泥×72 / vid424 泥沙×268 / vid3347 沙漠化石×130（均 mode0/1 可提炼）。
//   ★扫描窗 [ax-2..ax+5]×[ay-2..ay+5]（Wiring.cs:2603-2610 num=3/num2=3/num3=2）=
//   x[3910..3917] y[281..288]：箱锚 y=280 = ay-3 —— 【差一行出窗】。
//   原版同判：tile 219 无 tileSolid/tileSolidTop（Main.cs 全树无 [219] 置真）=非固体，
//   机器正上方箱只能悬空在支撑块上（本档支撑块 3912,282 带线）→ 箱锚恒 ≤ ay-3 出窗。
// debug-report 交叉锚：wiring.mech=[(3911,286,t=17979)=计时器 18000 拍面,(3912,283,
//   t=39)=提炼机 60t 冷却 21t 前刚重登记]——真机 HitWire→case219→checkMech 全链在
//   发（60t 节拍），pull 每 60t 被调但窗内无箱 → 零产出。
// 本文件：①用用户真档全量导入复现症状（零产出=1:1）；②反事实（箱锚下移一行入窗）
//   提炼命中——证唯一断环=箱锚出窗，链上其余全通。原版同构（非 SW 缺陷）→ 零生产码改动。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { Game } from '../src/core/Game';
import { Wiring } from '../src/world/Wiring';
import { deviceTable, type DeviceCtx } from '../src/world/wiring/devices';
import { findExtractinatorChest } from '../src/world/Extractinator';
import { ITEM_DEFS } from '../src/data/items';

const WLD = '/Users/vinlic/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-10/十周年纪念种子(2).wld';
const EXT_ANCHOR = { x: 3912, y: 283 };   // wld 实测提炼机锚
const TIMER = { x: 3911, y: 286 };        // wld 实测计时器（frameX=0 = 1s 档）
const CHEST = { x: 3912, y: 280 };        // wld 实测箱锚（载雪泥/泥沙/化石）

/** 用户真档全量导入（真 store/wire/chest 域）+ 真 extractinatorPullImpl 桥 */
function loadUserWorld() {
  const buf = readFileSync(WLD);
  const { save } = parseWldToSave(new Uint8Array(buf));
  const { world } = loadSaveData(JSON.parse(JSON.stringify(save)));
  return world;
}

/** 真 Game.extractinatorPullImpl 经窄视图 fake this 接线（BJ607 判例：0 处 new Game()） */
function makeRig(world: ReturnType<typeof loadUserWorld>) {
  const w = new Wiring(world.store);
  const fakeThis = { world, openChestRef: null } as unknown as Record<string, unknown>;
  const proto = Game.prototype as unknown as Record<string, unknown>;
  const pullImpl = proto.extractinatorPullImpl as (
    this: unknown, ax: number, ay: number, blockType: number,
  ) => { itemType: number; stack: number } | null;
  const pulls: Array<{ ax: number; ay: number; sheet: number; hit: boolean; dropVid: number }> = [];
  const drops: Array<{ vid: number; stack: number }> = [];
  const ctx = {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: () => {}, countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    areaEmpty: () => true, announce: () => {}, toggleParty: () => {},
    extractinatorPull: (ax: number, ay: number, sheet: number) => {
      const chest = findExtractinatorChest(world.chests, ax, ay);
      const out = pullImpl.call(fakeThis, ax, ay, sheet);
      pulls.push({ ax, ay, sheet, hit: !!chest, dropVid: out?.itemType ?? -1 });
      return out;
    },
    dropItemStack: (vid: number, stack: number) => drops.push({ vid, stack }),
  } as unknown as DeviceCtx;
  w.device = (ww, sheet, x, y) => deviceTable(ww, ctx, sheet, x, y);
  return { world, w, pulls, drops };
}

describe('BJ641 用户世界档复现（真档导入）', () => {
  it('①真档域对账：箱锚/箱内容/线/计时器与 wld 直读一致', () => {
    const world = loadUserWorld();
    const st = world.store;
    // 提炼机 9 格
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      expect(st.get(EXT_ANCHOR.x + dx, EXT_ANCHOR.y + dy)).toBeGreaterThan(0);
    }
    // 计时器 1s 档（frameX=0）
    const ti = st.idx(TIMER.x, TIMER.y);
    expect(st.frameX[ti]).toBe(0);
    // 红线：计时器→(3911,285)→(3912,285)→机内三格
    expect(st.wire[st.idx(3911, 285)] & 1).toBe(1);
    expect(st.wire[st.idx(3912, 285)] & 1).toBe(1);
    expect(st.wire[st.idx(3912, 283)] & 1).toBe(1);
    // 箱锚 + 内容 vid（内部 id 经 ITEM_DEFS.vid 桥回原版）
    const chest = world.chests.find((c) => c.x === CHEST.x && c.y === CHEST.y);
    expect(chest).toBeDefined();
    const vids = chest!.items.filter(Boolean).map((it) => ITEM_DEFS[it!.id]?.vid ?? -1);
    expect(vids).toContain(1103);   // 雪泥（可提炼 mode0）
    expect(vids).toContain(424);    // 泥沙（可提炼 mode0）
    expect(vids).toContain(3347);   // 沙漠化石（可提炼 mode1）
    // ★窗判（原版 Wiring.cs:2603-2610）：箱锚 y=280 < ay-2=281 —— 差一行出窗
    expect(chest!.y).toBe(EXT_ANCHOR.y - 3);
    expect(findExtractinatorChest(world.chests, EXT_ANCHOR.x, EXT_ANCHOR.y)).toBeUndefined();
  });

  it('②真档复现症状：开 1s 计时器 250t —— pull 每 60t 被调、窗内零箱、零产出（=用户「无法提炼」）', () => {
    const { world, w, pulls, drops } = makeRig(loadUserWorld());
    w.hitSwitch(TIMER.x, TIMER.y);   // 用户在真机上的开计时器动作（frameY 0→18 + 18000 拍面）
    for (let t = 1; t <= 250; t++) w.updateMech();
    // pull 全部被调（链在发）、锚点/块型正确
    expect(pulls.length).toBeGreaterThanOrEqual(3);
    expect(pulls.every((p) => p.ax === EXT_ANCHOR.x && p.ay === EXT_ANCHOR.y && p.sheet === 219)).toBe(true);
    // ★零箱命中 → 零产出（真机 debug-report 同相：mech 拍面在、无掉落）
    expect(pulls.every((p) => !p.hit)).toBe(true);
    expect(drops).toHaveLength(0);
  });

  it('③反事实：箱锚下移一行入窗（y280→281）——同档全链提炼命中,证唯一断环=箱锚出窗', () => {
    const world = loadUserWorld();
    const chest = world.chests.find((c) => c.x === CHEST.x && c.y === CHEST.y)!;
    chest.y = CHEST.y + 1;   // 反事实：箱贴机下移一行（锚=ay-2=281 入窗）
    const stackBefore = chest.items.reduce((s, it) => s + (it?.stack ?? 0), 0);
    const { w, pulls, drops } = makeRig(world);
    w.hitSwitch(TIMER.x, TIMER.y);
    for (let t = 1; t <= 130; t++) w.updateMech();
    expect(pulls.length).toBe(2);                                  // 60/120 两拍
    expect(pulls.every((p) => p.hit)).toBe(true);                  // 窗内箱命中
    expect(drops.length).toBe(2);                                  // 每拍 1 产出
    expect(drops.every((d) => d.vid > 0)).toBe(true);
    // 消耗对账：两发各扣 1（自后向前首格可提炼物——1103/424/3347 族）
    const stackAfter = chest.items.reduce((s, it) => s + (it?.stack ?? 0), 0);
    expect(stackBefore - stackAfter).toBe(2);
  });
});
