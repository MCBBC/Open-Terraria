// SW-FX52（2026-09-13）交互微债三笔——逐笔定谳 + 实修回归 + 变异证红。
// 台账来源：RB12c（453 骷髅商桶错配）/ FX48·A1（onBuffsFrame 死回调）/ RB12b P2 探针 C2（关包热栏右键）。
// 金标（1457 终值）：
//  - NPC.cs:5007 `if (Main.rand.Next(35)==0 && !ZoneShadowCandle && !waterTile && CountNPCS(453)==0)`
//    与 CountNPCS 本体 :90941-90951（遍历 Main.npc 全表——城镇 NPC 一体可见；
//    AnyNPCs(453) 全源零消费，唯一消费面就是 :5007 计数门）
//  - Main.cs:44042-44060 DrawBuffIcon 每帧跑：xN 计数经 BuffTextHandlers 逐帧求值
//    （:44053 → CachedProjectileCounterBuffTextHandler.ownedProjectileCounts 现算，
//    Terraria.DataStructures 同名.cs；注册 BuffID.cs:36+）+ TryGetBuffTime 时长
//  - Main.cs:44322-44387 GUIHotbarDrawInner：:44323-44326 playerInventory 早退（开包态
//    不进）；context 13 只 ItemSlot.Draw 不 Handle（:44381）；唯一交互 = mouseLeft
//    changeItem（:44357-44360）；悬停置 mouseInterface=true（:44355）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import {
  slotContext, planAlternateClick,
  CAN_FAVORITE_AT, CAN_SHARE_AT, CAN_LOADOUT_SHARE_AT,
} from '../src/ui/SlotActions';

const SRC = (p: string): string => readFileSync(join(dirname(__dirname), 'src', p), 'utf8');
const GAME_TS = SRC(join('core', 'Game.ts'));
const SPAWNER_TS = SRC(join('world', 'spawn', 'VanillaSpawner.ts'));
const UI_TS = SRC(join('ui', 'UI.ts'));
const MAIN_FLOW_TS = SRC('mainFlow.ts');

// ---------------------------------------------------------------- A. 453 骷髅商
// 洞穴主池夹具：rockLevel=200，落脚石面 y=315（> rockLevel 且 < h-190=410 → 洞穴段），
// 上方全净空；玩家 (200,300)。per-seed RNG（k*7919+13）双臂逐位可比——两臂在
// Next(35) 之前的掷流完全一致，唯一分歧点 = countNpc(453) 门。
function cavernWorld(): { w: World; sp: VanillaSpawner } {
  const w = new World(400, 600, 42, 'sw-fx52');
  w.groundLevel = 100;
  w.rockLevel = 200;
  const st = w.store;
  for (let x = 80; x < 320; x++) {
    for (let y = 315; y <= 318; y++) st.setTileSilent(x, y, 1 /* stone */);
  }
  return { w, sp: new VanillaSpawner(w) };
}

const PICK_SEEDS = 2600;
type SeedResult = Map<number, number | null>;   // seed → vanillaId（null=未出）

function runBatch(sp: VanillaSpawner, counts: Array<[number, number]> | null): SeedResult {
  sp.npcCounts = counts ? new Map(counts) : new Map();
  const out: SeedResult = new Map();
  for (let k = 0; k < PICK_SEEDS; k++) {
    const r = sp.spawn(200 * 16 + 8, 300 * 16, new RNG(k * 7919 + 13), 24, 14);
    out.set(k, r && r.vanillaId != null ? r.vanillaId : null);
  }
  return out;
}

describe('SW-FX52 A：453 骷髅商唯一门（NPC.cs:5007 CountNPCS 语义）', () => {
  it('A1 商人在场（注入 {453:1}）→ 整批零 453；无注入（场上无商）→ 453 可掷出', () => {
    const a = cavernWorld();
    const blocked = runBatch(a.sp, [[453, 1]]);
    const hits = [...blocked.values()].filter((v) => v === 453).length;
    expect(hits, '唯一门在场时必须整批吞掉 453（:5007 CountNPCS==0）').toBe(0);

    const b = cavernWorld();
    const open = runBatch(b.sp, null);
    const openHits = [...open.values()].filter((v) => v === 453).length;
    expect(openHits, '无商人时 1/35 支必须可达（正对照）').toBeGreaterThan(0);
  });

  it('A2 掷流分叉修复：{} 出 453 的种子在 {453:1} 下必须落空续掷（≠453,非 pass 终止）', () => {
    const sp = cavernWorld().sp;
    const open = runBatch(sp, null);
    const merchantSeeds = [...open.entries()].filter(([, v]) => v === 453).map(([k]) => k);
    expect(merchantSeeds.length).toBeGreaterThan(0);
    const blocked = runBatch(sp, [[453, 1]]);
    const diverged = merchantSeeds.filter((k) => blocked.get(k) !== 453);
    expect(diverged.length, '同种子被门吞后必须继续掷 Nymph(:5013)/后续支——不是整帧空转').toBe(
      merchantSeeds.length,
    );
  });

  it('A3 回退域：activeIds 含 453（enemy 桶假想态）+ 未注入计数 → Set 语义仍吞 453', () => {
    const sp = cavernWorld().sp;
    sp.activeIds = new Set([453]);
    const blocked = runBatch(sp, null);
    expect([...blocked.values()].filter((v) => v === 453).length).toBe(0);
  });

  it('A4 结构锁：spawner 唯一门走 countNpc(453)；Game 侧 453 入计数表（注入侧闭环）', () => {
    // 修后门（变异：回退 `!any(453)` → 本断言与 A1 同时红）
    expect(SPAWNER_TS).toContain(
      'if (N(35) && !this.waterTile && !this.shadowCandle && this.countNpc(453) === 0) return D(453);',
    );
    // Game 侧注入臂（npcs 桶扫描）：非绑 TownNPC 453 → moonCounts（RB12c 根因侧）
    expect(GAME_TS).toContain('if (tn.vanillaId === 453) moonCounts.set(453, (moonCounts.get(453) ?? 0) + 1);');
    // 注入点仍在 spawn() 调用之前（时序闭环）
    const inject = GAME_TS.indexOf('this.vanillaSpawner.npcCounts = moonCounts;');
    const call = GAME_TS.indexOf('const picked = this.vanillaSpawner.spawn(');
    expect(inject).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(inject);
  });
});

// ------------------------------------------------- B. onBuffsFrame 逐帧通道接线
// FX48/A1 定谳：Game.ts 声明（~:2527）+ mainFlow 赋值（ui.tickBuffLive）+ 全仓零调用点
// = 逐帧通道整断，图标生灭/随从 xN 计数（DrawBuffIcon 每帧语义,Main.cs:44042-44060）
// 退化 1Hz。修 = fixedUpdate 内 1Hz 整刷臂之前逐帧调用（UI 侧自带门控增量）。
describe('SW-FX52 B：onBuffsFrame 死回调接线', () => {
  it('B1 逐帧调用点存在且在 1Hz 整刷臂之前（fixedUpdate 同段）', () => {
    const frame = GAME_TS.indexOf('this.cb.onBuffsFrame?.();');
    const hz = GAME_TS.indexOf('if (this.tickCount % 60 === 0) this.cb.onBuffsChanged?.();');
    expect(frame, '变异：摘除逐帧调用 → 本红（通道重新断线）').toBeGreaterThan(0);
    expect(hz).toBeGreaterThan(frame);
    // 同段近邻（中间只有注释,防误挪到别的更新段）
    expect(hz - frame).toBeLessThan(600);
  });

  it('B2 声明-赋值-消费三点链完整（声明/注入/tickBuffLive 公有法）', () => {
    expect(GAME_TS).toContain('onBuffsFrame?: () => void;');
    expect(MAIN_FLOW_TS).toContain('onBuffsFrame: () => ui.tickBuffLive(),');
    expect(UI_TS).toContain('tickBuffLive(): void {');
  });
});

// ------------------------------------------- C. 关包热栏右键可达（RB12b C2 复核）
// 原版关包态快捷栏 = GUIHotbarDrawInner 专路（Main.cs:44322-44387）：context 13 只
// Draw 不 Handle，右键开包/换型/装备/拆半整面不可达；Alt/Shift/Ctrl 语义同样不可达
// （OverrideHover/OverrideLeftClick 只由 Handle 驱动）。RB12b 已落刀（UI.ts 右键支
// 关包早退门），本段 = 现状复核 + 残面守卫（四支原语门序 + context 13 三表排除 +
// 路由行为面）。
describe('SW-FX52 C：关包热栏右键不可达面（context 13）', () => {
  it('C1 slotContext：关包快捷栏 = 13；开包 = 0（GUIHotbarDrawInner 门 :44324）', () => {
    expect(slotContext('inv', 5, false)).toBe(13);
    expect(slotContext('inv', 0, false)).toBe(13);
    expect(slotContext('inv', 5, true)).toBe(0);
    expect(slotContext('inv', 0, true)).toBe(0);
  });

  it('C2 路由行为面：context 13 无任何 Alt/Shift/Ctrl 动作（planAlternateClick 全 null）', () => {
    const env = {
      context: 13, itemAir: false, favorited: false, isCoin: false,
      shopOpen: false, chestOpen: false, chestCanTake: false, canTakeToInventory: true,
    };
    expect(planAlternateClick({ ...env, controlDown: true, shiftDown: false })).toBeNull();
    expect(planAlternateClick({ ...env, controlDown: false, shiftDown: true })).toBeNull();
    expect(planAlternateClick({ ...env, controlDown: true, shiftDown: true })).toBeNull();
  });

  it('C3 三张 alt 语境表全部排除 13（收藏/分享/配装分享——变异：加 13 → 本红）', () => {
    expect(CAN_FAVORITE_AT).not.toContain(13);        // ItemSlot.cs:358-361 {0,1,2,32}
    expect(CAN_SHARE_AT).not.toContain(13);           // ItemSlot.cs:372+ canShareAt
    expect(CAN_LOADOUT_SHARE_AT).not.toContain(13);
  });

  it('C4 结构锁：右键支内关包早退门先于全部四支动作原语（开包/换型/装备/取件臂）', () => {
    const b2 = UI_TS.indexOf('if (e.button === 2) {');
    const gate = UI_TS.indexOf("if (!this.invPanel || this.invPanel.style.display !== 'block') return;");
    expect(b2).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThan(b2);
    // 四支原语调用点全部在门之后（变异：新原语插到门前 = 残面复发 → 红）
    // ★BJ157：第四原语 splitHalf → runPickupArm（拆半面整摘）
    const prims = [
      UI_TS.indexOf('this.tryOpenContainer(cur, i);'),
      UI_TS.indexOf('tryItemSwapVid(ITEM_DEFS[cur.id]?.vid ?? -1)'),   // ★方案 A 重锚(BJ265)
      UI_TS.indexOf('this.swapEquipItem(cur, where, i);'),
      UI_TS.indexOf('this.runPickupArm(where, i, cur);'),
    ];
    for (const p of prims) expect(p, '动作原语必须都在关包门之后').toBeGreaterThan(gate);
  });
});

