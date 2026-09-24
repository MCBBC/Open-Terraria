// BJ332 2026-09-24【生命体分析仪 critters 桶载体勘误——661 七彩草蛉不显示实报落刀】
// 定谳（反编译 1457 直读）：
// 【原版机制】Main.cs:47764-47796：accCritterGuide 行每 15t 扫 Main.npc 全表，
//   判定 = active && rarity>num12（严格 > 择优）&& dist(Center)<1300px——
//   **无屏幕内/外条件**（任务书猜想被亲读否决）、无 friendly/critter 排除门；
//   命中 → GivenOrTypeName（:47796），未命中 → GameUI.NoRareCreatures。
// 【数据面】661 rarity=4（NPC.cs:17383-17397 块内 :17397）——本仓 NPC_RARITY
//   （BJ135 重提链）已有 661=4，数据面无病。
// 【病灶·载体错误】InfoAccsLayer.tick 的 critters 桶映射旧写 `c.def?.npc ?? null`——
//   引用 2026-08-17 已退役的旧 CritterDef 形状（critters.ts 头注：Critter 类终删）。
//   现役 critters 桶成员是 Enemy（Game.ts spawnNpcByVanilla `vanilla?.critter` →
//   critters 桶），身份域 = Enemy.vanillaId（Enemy.ts:491）；EnemyDef（enemies.ts
//   :5-37）无 npc 字段 → 恒 undefined → vanillaId=null → rarityOf(null)=0 →
//   **critters 桶 99 型小动物对分析仪全盲**。661（CountsAsCritter 成员，
//   NPCID.cs:4829）落 critters 桶即实报根因。原版无 critter 分桶——全表一扫。
// 【普查】NPC_RARITY(79 型) ∩ critter 旗(99 型) = 20 型稀有小动物同病：
//   374 松露虫(4)/442-448/539 金系(3)/583-585 仙女(2)/592/593 金金鱼(3)/
//   601 金蜻蜓(3)/605 金瓢虫(3)/613 金水黾(3)/627 金海马(3)/661 七彩草蛉(4)/
//   687 神秘青蛙(2)。GOLD_CRITTERS 金染面（InfoAccs.ts）与原版
//   GoldCrittersCollection（NPCID.cs:4452-4456）逐值核对已同相（此前批）。
// 【BJ73 姊妹案】同型静默漏报：幻影字段/退役形状喂池 → 谓词失明。变异接缝：
//   把 InfoAccsLayer.ts critters 桶映射改回 `c.def?.npc ?? null` → 本组全红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { InfoAccsLayer } from '../src/render/InfoAccsLayer';
import { npcRarityOf } from '../src/data/vanillaNpcs';
import { NPC_NAME_BY_ID } from '../src/i18n/idNames.generated';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NPCS_JSON = path.resolve(HERE, '../public/sprites/vanilla-npcs.json');

function makePlayer() {
  return {
    accThirdEyeCounter: 0, accCritterGuideCounter: 0,
    accThirdEyeNumber: 0, accCritterGuideText: null as string | null,
    accCritterGuideVid: null as number | null,
    speedSlice: new Float32Array(60), vx: 0, vy: 0,
  };
}

/** critter 实体池条目（=现役 Enemy 形状投影,vanillaId 为身份域） */
function critter(vid: number, cx: number, cy = 0, dead = false) {
  return { x: cx, y: cy, w: 10, h: 10, cx, cy, dead, vanillaId: vid as number | null };
}

const GATES = { accThirdEye: false, accCritterGuide: true, accStopwatch: false };
/** 名域桩（l10n 运行时不入测试;真实链 Lang.npcName→NPC_NAME_BY_ID→NPCName.* 由
 *  fx56-critter-hover-name 承载,此处只判别池/谓词/择优/距离门——BJ122 桩先例） */
const nameOf661 = (vid: number | null) => (vid === 661 ? '七彩草蛉' : null);

describe('BJ332 生命体分析仪：critters 桶载体勘误（661 七彩草蛉实报）', () => {
  it('661 落 critters 桶（vanilla-npcs.json critter 旗）且 rarity=4（NPC.cs:17397）', () => {
    const j = JSON.parse(readFileSync(NPCS_JSON, 'utf8'));
    const arr: Array<Record<string, unknown>> = Array.isArray(j) ? j : Object.values(j);
    const e661 = arr.find((x) => x && x.id === 661) as { critter?: boolean } | undefined;
    expect(e661?.critter).toBe(true);   // 路由面：spawnNpcByVanilla → critters 桶
    expect(npcRarityOf(661)).toBe(4);   // 数据面：BJ135 重提链，NPC.cs:17397
    expect(NPC_NAME_BY_ID[661]).toBe('EmpressButterfly'); // 名域链首环
  }, 60000);

  it('critters 桶入池（真 vanillaId 域）：661 在 1300px 内可见', () => {
    const layer = new InfoAccsLayer();
    const player = makePlayer();
    layer.tick(player, [], [critter(661, 600)], [], 0, 0, () => false,
      npcRarityOf, nameOf661, (vx) => Math.abs(vx), GATES);
    expect(player.accCritterGuideText).toBe('七彩草蛉');
    expect(player.accCritterGuideVid).toBe(661);
  }, 60000);

  it('距离门 <1300px（Main.cs:47778）与死体门（active）', () => {
    const layer = new InfoAccsLayer();
    const player = makePlayer();
    // 1400px ≥ 1300 → 不可见（原版 Length() < 1300f 严格小于）
    layer.tick(player, [], [critter(661, 1400)], [], 0, 0, () => false,
      npcRarityOf, nameOf661, (vx) => Math.abs(vx), GATES);
    expect(player.accCritterGuideText).toBeNull();
    // 死体 → 不可见
    const layer2 = new InfoAccsLayer();
    const player2 = makePlayer();
    layer2.tick(player2, [], [critter(661, 600, 0, true)], [], 0, 0, () => false,
      npcRarityOf, nameOf661, (vx) => Math.abs(vx), GATES);
    expect(player2.accCritterGuideText).toBeNull();
  }, 60000);

  it('择优（原版严格 >）：661(r4) 胜金系(r3)；平局先扫到者胜', () => {
    const layer = new InfoAccsLayer();
    const player = makePlayer();
    layer.tick(player, [], [critter(539, 100), critter(661, 200)], [], 0, 0, () => false,
      npcRarityOf, nameOf661, (vx) => Math.abs(vx), GATES);
    expect(player.accCritterGuideVid).toBe(661);   // r4 > r3
    // 平局：同为 r3（金松鼠 539 / 金海马 627）→ 先扫到者胜（Main.cs:47780 无等距解析）
    const layer2 = new InfoAccsLayer();
    const player2 = makePlayer();
    layer2.tick(player2, [], [critter(627, 100), critter(539, 200)], [], 0, 0, () => false,
      npcRarityOf, (vid) => (vid ? `名${vid}` : null), (vx) => Math.abs(vx), GATES);
    expect(player2.accCritterGuideVid).toBe(627);
  }, 60000);

  it('稀有族普查表（时代守卫）：NPC_RARITY ∩ critter 旗 = 20 型，全族 Analyzer 可见面', () => {
    const j = JSON.parse(readFileSync(NPCS_JSON, 'utf8'));
    const arr: Array<Record<string, unknown>> = Array.isArray(j) ? j : Object.values(j);
    const critterIds = new Set(arr.filter((x) => x && x.critter).map((x) => x.id as number));
    // 金标 20 型（SetDefaults 直读值；BJ135 表 ∩ NPCID.cs:4829 CountsAsCritter）
    const EXPECTED: Array<[number, number]> = [
      [374, 4],                                            // 松露虫
      [442, 3], [443, 3], [444, 3], [445, 3], [446, 3], [447, 3], [448, 3], [539, 3], // 金系
      [583, 2], [584, 2], [585, 2],                        // 三色仙女
      [592, 3], [593, 3],                                  // 金金鱼
      [601, 3], [605, 3], [613, 3], [627, 3],              // 金蜻蜓/金瓢虫/金水黾/金海马
      [661, 4],                                            // 七彩草蛉
      [687, 2],                                            // 神秘青蛙
    ];
    const got: Array<[number, number]> = EXPECTED.filter(([id]) => critterIds.has(id));
    expect(got).toEqual(EXPECTED);   // 全员落 critters 桶（受旧载体病全盲的群体）
    for (const [id, r] of EXPECTED) expect(npcRarityOf(id)).toBe(r);
    // 新增稀有 critter 会在此爆红：须先核原版 SetDefaults/CountsAsCritter 再扩表
    const extra = [...critterIds].filter((id) => npcRarityOf(id) > 0)
      .filter((id) => !EXPECTED.some(([e]) => e === id));
    expect(extra).toEqual([]);
  }, 60000);
});
