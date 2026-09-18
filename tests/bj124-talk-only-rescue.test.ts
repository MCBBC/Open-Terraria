// BJ124 2026-09-18【用户拍板方案 A 落刀：摘触碰解救臂 + 摘解救自创音尘】
// 定谳（1457=1458 直读，同行同文零漂移）：
// 【①解救唯一触发源 = talk 交互】Main.HoverOverNPCs（Main.cs:43781 bound 族名单
//   townNPC‖105/106/123/354/376/579/453/589 + :43805-43812 右键 talkNPC!=i &&
//   !tileInteractionHappened → SetTalkNPC(i)+GetChat+PlaySound(24)）→ 下一拍
//   NPC.AI aiStyle0 头（NPC.cs:19874-19912 player.talkNPC==whoAmI）→
//   AI_000_TransformBoundNPC（:45371-45381 Transform+UpdateSavedStates）——
//   无"玩家接触即转正"路径。触碰臂（boundTouchCheck,Game 15t AABB 扫描）=
//   spawn-parity-gaps.md 登记的 UX 近似，随方案 A 拍板整摘。
//   685 抖箱支=特例保留（Main.cs:43759-43772 TryFreeingElderSlime 金钥匙 327 消耗
//   +TransformElderSlime+PlaySound(22)，无 SetTalkNPC）；534 税务官不在 :43781
//   名单——唯净化粉链（Projectile.cs:14794-14810 Damage_TryUsingPowders →
//   Transform(441)），talk 面不解救。
// 【②解救零音零尘】TransformVisuals（NPC.cs:81788-81851）配对表仅 158/159、478/479、
//   406/405、428/427、427/426——对全部解救配对（105→107/106→108/123→124/354→353/
//   376→369/579→550/589→588/534→441）无任何 dust/gore/SoundEngine 支；自创
//   NPC_Hit_1 音+绿粒子（freeBoundNpc/wakeBoundEnemyNpc）与 NPC_Killed_1 音+尘雾
//   （applyPowder 534 支）已摘。685 抖箱特例保留原版 PlaySound(22)=Unlock。
// 本测试锁：贴近不解救（talk 须悬停）/ talk 触发解救 / 685 金钥匙特例（有钥解锁音+
// 解救、无钥 toast 不解救）/ 534 唯净化粉 / 376 敌怪桶解救零音零尘 / 结构锁。
// 变异接缝见各 it 注。
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { TownNPC } from '../src/entities/TownNPC';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';
import { TILE } from '../src/core/constants';

beforeAll(() => {
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});

type AnyGame = Record<string, any>;

/** Game 原型桩（bound-rescue-dialog 同式） */
function makeRig(key: string, opts: { hover?: boolean; hasKey?: boolean } = {}) {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  const npc = new TownNPC(key, 100 * TILE, 98 * TILE);
  npc.bound = true;
  g.player = { dead: false, buffs: { has: () => false } };
  g.smartInteractNpcId = -1;
  g.dialogNpc = null;
  g.entities = { enemies: [], npcs: [npc] };
  g.worldRegionIntersects = () => true;
  g.npcHoverHit = () => opts.hover ?? true;
  g.world = { flags: {} as Record<string, boolean> };
  g.consumeVanillaItem = vi.fn(() => opts.hasKey ?? true);
  g.cb = { onToast: vi.fn() };
  g.newText = vi.fn();
  g.spawnParticles = vi.fn();
  g.playSfxFiles = vi.fn();
  g.checkAchievementRealEstateAndTownSlimes = vi.fn();
  const dialogs: Array<{ npc: unknown; chat?: string }> = [];
  g.openNpcDialog = (n: unknown, chat?: string) => { dialogs.push({ npc: n, chat }); };
  return { g, npc, dialogs };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BJ124-① 触碰不再解救（解救唯一触发源=talk）', () => {
  it('贴近不解救：玩家 AABB 与 bound NPC 全重叠、鼠标不悬停、无智能候选 → talk 面不解救', () => {
    // 触碰臂旧语义 = 玩家盒与 bound NPC 盒相交即 freeBoundNpc（无悬停要求）；
    // 摘除后近身但不悬停/不智能候选 → talkToNearbyNpc false、bound 保持。
    // 变异①：talk bound 支摘悬停门（!npcHoverHit&&smartId!==id continue 删）→ 本组红
    const r = makeRig('goblin_tinkerer', { hover: false });
    expect((r.g as AnyGame).talkToNearbyNpc(500 * TILE, 500 * TILE)).toBe(false);
    expect(r.npc.bound).toBe(true);                       // 近身≠解救（原版无接触路径）
    expect(r.g.spawnParticles).not.toHaveBeenCalled();
    expect(r.g.playSfxFiles).not.toHaveBeenCalled();
    expect(r.g.checkAchievementRealEstateAndTownSlimes).not.toHaveBeenCalled();
  }, 60000);

  it('talk 触发解救（正控制）：同 rig 悬停命中 → 解救+一体对话', () => {
    const r = makeRig('goblin_tinkerer', { hover: true });
    expect((r.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE)).toBe(true);
    expect(r.npc.bound).toBe(false);
    expect(r.dialogs.length).toBe(1);
    expect((r.g.world.flags as Record<string, boolean>).savedGoblin).toBe(true);
  }, 60000);

  it('结构锁：触碰臂已整摘（boundTouchCheck 定义与调用点均不在 Game.ts）', () => {
    // 变异②：回接 `this.boundTouchCheck()` 调用或恢复 private boundTouchCheck 定义 → 本组红
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/this\.boundTouchCheck\(\)/);
    expect(src).not.toMatch(/private boundTouchCheck\(/);
    expect(src).not.toMatch(/% 15 === 0\) this\.boundTouchCheck/);
  }, 60000);
});

describe('BJ124-① 685 抖箱特例保留（金钥匙门 + 原版 Unlock 音）', () => {
  it('有金钥匙：talk 解救 + PlaySound(22)=Unlock（Main.cs:43771）+ 不开对话', () => {
    // 变异③：摘 685 unlock 音支 → playSfxFiles 调用断言红
    const r = makeRig('town_slime_old', { hasKey: true });
    expect((r.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE)).toBe(true);
    expect(r.npc.bound).toBe(false);
    expect((r.g.world.flags as Record<string, boolean>).unlockedSlimeOldSpawn).toBe(true);
    expect((r.g.playSfxFiles as ReturnType<typeof vi.fn>).mock.calls).toEqual([[['unlock'], 1]]);
    expect(r.dialogs.length).toBe(0);                     // 无 SetTalkNPC（Main.cs:43759-43772）
    expect(r.g.consumeVanillaItem).toHaveBeenCalledWith(327);   // 金钥匙 327 消耗
  }, 60000);

  it('无金钥匙：toast 不解救（TryFreeingElderSlime false 同相）、零音', () => {
    const r = makeRig('town_slime_old', { hasKey: false });
    expect((r.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE)).toBe(true);   // 点击被消费（原版同相）
    expect(r.npc.bound).toBe(true);                       // 未解救
    expect((r.g.world.flags as Record<string, boolean>).unlockedSlimeOldSpawn).toBeUndefined();
    expect(r.g.playSfxFiles).not.toHaveBeenCalled();
    expect((r.g.cb.onToast as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  }, 60000);
});

describe('BJ124-① 534 税务官 = 唯净化粉链（talk 面不解救）', () => {
  it('bound tax_collector + talk → 不解救不开对话（Main.cs:43781 名单无 534）', () => {
    // 变异④：摘 talk bound 支 tax_collector 跳过门 → 本组红
    const r = makeRig('tax_collector');
    expect((r.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE)).toBe(false);
    expect(r.npc.bound).toBe(true);
    expect(r.dialogs.length).toBe(0);
    expect(r.g.spawnParticles).not.toHaveBeenCalled();
    expect(r.g.playSfxFiles).not.toHaveBeenCalled();
  }, 60000);
});

describe('BJ124-② 解救零音零尘（TransformVisuals NPC.cs:81788-81851 无解救配对支）', () => {
  it('376 敌怪桶解救（wakeBoundEnemyNpc）：零尘零自创音,开话音走 openNpcDialog', () => {
    // 变异⑤：复辟 wakeBoundEnemyNpc 内 NPC_Hit_1+绿粒子 → 本组红
    const g = Object.create(Game.prototype) as unknown as AnyGame;
    const e = { maxHp: 100, hp: 50, x: 99 * TILE, y: 90 * TILE, w: 20, h: 42, cx: 99 * TILE + 10, dead: false };
    g.entities = { enemies: [e], npcs: [], nextId: 1, add: vi.fn() };
    g.world = { flags: {} as Record<string, boolean> };
    g.player = { dead: false, buffs: { has: () => false } };
    g.newText = vi.fn();
    g.spawnParticles = vi.fn();
    g.playSfxFiles = vi.fn();
    g.checkAchievementRealEstateAndTownSlimes = vi.fn();
    const dialogs: Array<{ chat?: string }> = [];
    g.openNpcDialog = (_n: unknown, chat?: string) => { dialogs.push({ chat }); };
    vi.spyOn(Math, 'random').mockReturnValue(0);          // 档首 dialog353
    (g as unknown as { wakeBoundEnemyNpc: (e: unknown, k: string) => void })
      .wakeBoundEnemyNpc(e, 'angler');
    expect((e as { dead: boolean }).dead).toBe(true);
    expect((g.world.flags as Record<string, boolean>).savedAngler).toBe(true);
    expect(g.spawnParticles).not.toHaveBeenCalled();      // 零尘（自创绿粒子已摘）
    expect(g.playSfxFiles).not.toHaveBeenCalled();        // 零自创音（NPC_Hit_1 已摘）
    expect(dialogs.length).toBe(1);                       // 开话面保留（chat 音=原版 24 位）
    expect(dialogs[0].chat).toBe(Lang.text('LegacyDialog.353'));
  }, 60000);

  it('结构锁：解救面自创音尘已摘（Game.ts 无 #9AE85A 绿粒子色）', () => {
    // 变异⑥：复辟 '#9AE85A' 粒子 → 本组红
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('#9AE85A');
  }, 60000);
});

// ★拍板#2A/#3A（2026-09-18）：685 抖箱编排粒子【本地发射半边】补齐 + NPC.Rescued
// 自创蓝字聊天行摘除。定谳锚：TransformElderSlime（NPC.cs:19172-19194）——
// Transform(679):19185 → BroadcastParticleSpawn(TownSlimeTransform,
// {PositionInWorld=nPC.Center,MovementVector=Zero,UniqueInfoPiece=2}):19186-19193;
// 变体分派 ParticleOrchestrator.cs:2411-2421（0=Nerdy :2582/1=Copper :2591/2=Elder
// :2564）——685 解救【恒 Elder,无变体判别面】。解救链四路均无聊天/浮字面
// （talk=AI_000_TransformBoundNPC :45371-45381 / 685=仅粒子+Unlock 音 /
// 534=Projectile.cs:14801 静默 / 686=气球爆裂）。
describe('拍板#2A/#3A：685 本地发射半边 + NPC.Rescued 浮字摘除', () => {
  it('685 解救本地发射：Elder 档 d43×30@实体中心 + gore 升腾层×8 + module8 上行 uniqueInfo=2', () => {
    // 变异⑦：摘 townSlimeTransformFx 本地直生支 → dust/particles 断言红
    // 变异⑧：kind 错换 0（Nerdy=d4×60）或 1（Copper=d43×40 无 gore 层）→ 30×d43+8 断言红
    // 变异⑨：摘 broadcastParticleOrchestra 上行或 uniqueInfo≠2 → orch 断言红
    const r = makeRig('town_slime_old', { hasKey: true });
    const dust: unknown[][] = [];
    (r.g as AnyGame).spawnDust = (...a: unknown[]) => { dust.push(a); return undefined; };
    const parts0 = (r.g.spawnParticles as ReturnType<typeof vi.fn>).mock.calls.length;
    const orch: unknown[][] = [];
    (r.g as AnyGame).net = { mySlot: 0, sendParticleOrchestra: (...a: unknown[]) => { orch.push(a); } };
    (r.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(r.npc.bound).toBe(false);
    expect(dust.length).toBe(30);                         // Elder 档=30 发（orchestraFx townSlimeTransformFx kind2）
    for (const a of dust) {
      expect(a[4]).toBe(43);                              // d43（Nerdy=4×60/Copper=43×40 都不满足 30×43）
      // 锚=nPC.Center±circ(rng,20) 盘散（orchestraFx Elder :2564 区 c=circ(rng,20)）
      expect(Math.hypot((a[0] as number) - r.npc.cx, (a[1] as number) - r.npc.cy)).toBeLessThanOrEqual(20 + 1e-9);
    }
    expect((r.g.spawnParticles as ReturnType<typeof vi.fn>).mock.calls.length - parts0).toBe(8);
    expect(orch.length).toBe(1);                          // 联机他端经 netApplyParticleOrchestra 复放
    expect(orch[0][0]).toBe(26);                          // ParticleOrchestraType.TownSlimeTransform
    expect(orch[0][1]).toMatchObject({
      posX: r.npc.cx, posY: r.npc.cy, moveX: 0, moveY: 0, uniqueInfo: 2,   // MovementVector=Zero
    });
  }, 60000);

  it('685 无钥不解救 → 零发射（consume 门先于发射,原版 TryFreeingElderSlime false 同相）', () => {
    const r = makeRig('town_slime_old', { hasKey: false });
    (r.g as AnyGame).spawnDust = vi.fn();
    (r.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
    expect(r.npc.bound).toBe(true);
    expect((r.g as AnyGame).spawnDust).not.toHaveBeenCalled();
    expect(r.g.spawnParticles).not.toHaveBeenCalled();
  }, 60000);

  it('拍板#3A：解救面零聊天行——freeBoundNpc 零 newText + Game.ts 无 NPC.Rescued 消费', () => {
    // 变异⑩：复辟 newText(Lang.text('Mods.SandboxWorld.NPC.Rescued'...)) → 本组红
    //（原版解救链四路均无 CombatText/BroadcastChatMessage 面;反馈=唤醒语对话/
    //  685 Unlock 音;安家公告=HasArrived WorldGen.cs:5123 已由安家链单独承接）
    for (const key of ['goblin_tinkerer', 'town_slime_old']) {
      const r = makeRig(key, { hasKey: true });
      (r.g as AnyGame).talkToNearbyNpc(100 * TILE, 98 * TILE);
      expect(r.npc.bound).toBe(false);
      expect(r.g.newText).not.toHaveBeenCalled();
    }
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(src).not.toContain("Lang.text('Mods.SandboxWorld.NPC.Rescued'");
  }, 60000);
});
