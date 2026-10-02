/**
 * ★BJ432 2026-10-02 用户实报定谳回归锁「还没有救发型师就发生自动入住了」。
 *
 * 定谳（机制级，反编译 1457 直读；1458 同行同文零漂移）：
 *   【原版解救全链】WebbedStylist 354 = friendly【非 townNPC】独立型
 *   （SetDefaults NPC.cs:13530-13540, aiStyle=0/scale 0.9/rarity 1），地下蛛网墙 62
 *   生成门 `!savedStylist && !AnyNPCs(354)`（NPC.cs:1666-1671，本仓 VanillaSpawner
 *   已 1:1）；解救触发面 = 玩家【对话】talkNPC==whoAmI（NPC.AI aiStyle0 头段
 *   :19877-19901 → AI_000_TransformBoundNPC(i,353) :45371-45381 = Transform(353)
 *   + AI_007_TownEntities_UpdateSavedStates（case 353 → savedStylist=true
 *   :53503-53505）+ SetTalkNPC）——无触碰/切割蛛网解救面；转正 353 townNPC
 *   homeless=true（Transform 尾 :81964-81968）→ 入住链。
 *   【到达门唯一性】Main.cs:66804-66806 `if (NPC.savedStylist && num22 < 1)
 *   townNPCCanSpawn[353]`（优先链 :67005 同门）——savedStylist 置位面仅两处：
 *   解救（:53504）+ noSpiderCaves 变体（WorldGen.cs:688-691，本仓
 *   SecretSeedDoEndsPass 同键已接）。原版【不存在】无解救的理发师到达路。
 *   【误触发层】Game.townNpcSpawnAllowed 'stylist' case 旧门误并 178 蒸汽朋克人
 *   到达门 ((tenth&&!getGood)||downedMechBossAny, Main.cs:66837-66840
 *   `townNPCCanSpawn[178]`，178=Steampunker NPCID.cs:11427)——注释自引 [178]
 *   却接给理发师（IIIII224 章号亦系误标：该批实为 ddual 座2 世界生成定谳）→
 *   杀任一机械 Boss（125/126/127/134）未救即自动到达入住 = 用户实报。
 *   【其余入住通路无涉】被缚态在本仓 = TownNPC.bound（home=null），入驻轮①/①''
 *   /流浪锁与近链迁入均显式排 bound（Housing.pickHomelessMover/
 *   pickPrioritizedTownNPCType）——纯函数层另行锁定。
 * 本文件锁：到达门唯一（未救不入住/解救后到达）/蒸汽朋克人门原位保留/
 * 解救旗单源/354 生成门/noSpiderCaves 直通臂/bound 不迁。
 * 变异接缝：stylist 门并回任一 downed_1xxx/tenthAnniversary 支 → T1/T2 组爆红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { pickHomelessMover, pickPrioritizedTownNPCType } from '../src/world/Housing';

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** townNpcSpawnAllowed 最小桩（'stylist'/'steampunker' 两 case 只读 world.flags/
 *  seedFlags——Game 无 DOM 不可整体构造，同 bj122 Object.create(Game.prototype) 家族） */
function spawnAllowedWith(flags: Record<string, boolean>, seedFlags: Record<string, boolean> = {}) {
  const self = Object.create(Game.prototype) as unknown as {
    world: { flags: Record<string, boolean>; seedFlags: Record<string, boolean> };
    townNpcSpawnAllowed(key: string): boolean;
  };
  self.world = { flags, seedFlags };
  return (key: string) => self.townNpcSpawnAllowed(key);
}

describe('BJ432 到达门唯一性：stylist = savedStylist 旗单门（Main.cs:66804-66806）', () => {
  it('未救不入住：机械 Boss 全败 + 十周年直通 → 仍 false（旧误并门三支全数反例）', () => {
    const allow = spawnAllowedWith({
      downed_125: true, downed_126: true, downed_127: true, downed_134: true,
    }, { tenthAnniversary: true });
    expect(allow('stylist')).toBe(false);
  });

  it('单因反例：任一旧门支在场（downed_134 / tenthAnniversary）各自恒 false', () => {
    expect(spawnAllowedWith({ downed_134: true })('stylist')).toBe(false);
    expect(spawnAllowedWith({}, { tenthAnniversary: true })('stylist')).toBe(false);
  });

  it('解救后到达：flags.savedStylist=true → true（永久重生臂,死亡后可再到达）', () => {
    expect(spawnAllowedWith({ savedStylist: true })('stylist')).toBe(true);
  });

  it('对照组：蒸汽朋克人 178 门原位保留（Main.cs:66837-66840）——同桩 downed/tenth 照常放行', () => {
    expect(spawnAllowedWith({ downed_134: true })('steampunker')).toBe(true);
    expect(spawnAllowedWith({}, { tenthAnniversary: true })('steampunker')).toBe(true);
    expect(spawnAllowedWith({})('steampunker')).toBe(false);
  });
});

describe('BJ432 被缚态不入住：bound 排除面（本仓 bound=vanilla 非 townNPC 独立型）', () => {
  it('近链迁入候选 pickHomelessMover：bound 理发师（353 键,home=null）不可迁', () => {
    const mover = pickHomelessMover([{
      key: 'stylist', npcId: 353, bound: true, home: null,
      lookForHomeTimeout: 0, ref: { tag: 'webbed' },
    }], 353);
    expect(mover).toBeNull();
  });

  it('优先型锁 pickPrioritizedTownNPCType：bound homeless 353 不持锁（非 townNPC 同形）', () => {
    expect(pickPrioritizedTownNPCType([{ npcId: 353, homeless: true, bound: true, dead: false }])).toBe(-1);
    // 同型获救态（bound=false,homeless）持锁——解救链语义对照
    expect(pickPrioritizedTownNPCType([{ npcId: 353, homeless: true, bound: false, dead: false }])).toBe(353);
  });
});

describe('BJ432 源码自包含块钉死（Game 无 DOM 不可构造,T4 同族备案）', () => {
  const src = readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');

  // 域锚：townNpcSpawnAllowed 函数体（"case 'stylist':" 全仓有两处——8058 对话域/
  //  36324 入驻门域；须锚入住域,否则块扫描跨函数误中 downed_1xxx）
  const fnStart = src.indexOf('private townNpcSpawnAllowed');
  const fnSrc = src.slice(fnStart, src.indexOf('private updateTownNpcArrival', fnStart));

  function caseBlock(caseKey: string, nextKey: string): string {
    const start = fnSrc.indexOf(`case '${caseKey}':`);
    expect(start, `case '${caseKey}' 缺位`).toBeGreaterThan(-1);
    const end = fnSrc.indexOf(`case '${nextKey}':`, start);
    expect(end, `case '${nextKey}' 缺位`).toBeGreaterThan(start);
    return fnSrc.slice(start, end);
  }

  it("case 'stylist' 块零蒸汽朋克门支：不含 downed_1xxx / tenthAnniversary", () => {
    const block = caseBlock('stylist', 'tax_collector');
    expect(block).toContain("flags['savedStylist']");
    expect(block).not.toMatch(/downed_1/);
    expect(block).not.toContain('tenthAnniversary');
  });

  it("case 'steampunker' 块保有其门（防整批误删,178 门唯一归属）", () => {
    const block = caseBlock('steampunker', 'witch_doctor');
    for (const f of ['downed_125', 'downed_126', 'downed_127', 'downed_134', 'tenthAnniversary']) {
      expect(block).toContain(f);
    }
  });

  it('解救旗单源：SAVED_FLAG_BY_KEY.stylist=savedStylist（freeBoundNpc/wakeBoundEnemyNpc 共用,BJ71 族防双轨漂移）', () => {
    // 静态私有经字面量元素访问（TS 可见性豁免通道,同族先例 Object.create 桩）
    const table = (Game as unknown as { SAVED_FLAG_BY_KEY: Record<string, string> }).SAVED_FLAG_BY_KEY;
    expect(table.stylist).toBe('savedStylist');
  });

  it('354 生成门保真（VanillaSpawner NPC.cs:1666-1671）：!savedStylist && !any(354) 双门在位', () => {
    const sp = readFileSync(join(GAME_ROOT, 'src/world/spawn/VanillaSpawner.ts'), 'utf8');
    expect(sp).toContain("&& !this.world.flags['savedStylist'] && !any(354)) return D(354)");
  });

  it('noSpiderCaves 直通臂（WorldGen.cs:688-691,唯一无解救置位面）在位', () => {
    const pass = readFileSync(join(GAME_ROOT, 'src/world/gen/vanilla/SecretSeedDoEndsPass.ts'), 'utf8');
    expect(pass).toMatch(/if \(noSpiderCavesActuallyNoSpiderCaves\(F\)\)\s*\{\s*world\.flags\.savedStylist = true;/);
  });
});
