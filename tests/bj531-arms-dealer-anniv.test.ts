/**
 * ★BJ531 2026-10-06 用户实报定谳回归锁「十周年种子世界的军火商一直没来，背包里有
 * 子弹——入住条件应满足」。
 *
 * 定谳（机制级，反编译 1457 直读）：
 *   【原版入住链】军火商 19 到达门 = NPC.SpawnAllowed_ArmsDealer（NPC.cs:7119-7124）：
 *   unlockedArmsDealerSpawn（到访一次永久置位，WorldGen.cs:5516 随存档）或 任意 active
 *   玩家 inventory[0..57]（50 背包+4 钱币+4 弹药，NPC.cs:7131 `j < 58`）存在
 *   `item.stack > 0 && (item.ammo == AmmoID.Bullet || item.useAmmo == AmmoID.Bullet)`
 *   （NPC.cs:7135）。消费链：Main.cs:66752 flag2 → townNPCCanSpawn[19]
 *   （Main.cs:66786-66789）+ num42 优先链第 4 位（Main.cs:66953-66956
 *   `((num42==0)&flag2)&&num5<1`）。无房特殊门（CheckSpecialTownNPCSpawningConditions
 *   WorldGen.cs:4890-4918 仅 160 松露人）。
 *   【★AmmoID.Bullet=97】1.4.5 把 AmmoID 编号并入物品 id 域（Terraria.ID/AmmoID.cs:122
 *   `public static int Bullet = 97`；Gel=23/Arrow=40/Coin=71 本就同域）。SetDefaults
 *   终值：97 火枪子弹 `ammo = AmmoID.Bullet`（Item.cs:2516-2527，shoot=14=弹幕 id）、
 *   98 迷你鲨 `useAmmo = AmmoID.Bullet`（Item.cs:2528-2541）、534 霰弹枪 useAmmo=97、
 *   278 银子弹 ammo=97——持枪与持弹都算（原版本相，与 Wiki「持有任何子弹或使用子弹
 *   的武器」一致）。
 *   【病灶】本仓 Game.ts:554 旧 `const AMMO_BULLET = 14` = 1.4.5 前旧编号陈值
 *   （14 在 1457 弹域无对应物），与 vanilla-itemcombat.json（提取器写 Item.cs
 *   SetDefaults 终值 ammo/useAmmo=97）永不等 → SpawnAllowed_ArmsDealer 子弹扫描恒假
 *   → 军火商在【任何】世界都无法经弹药门入住（仅 unlockedArmsDealerSpawn 随档可救）；
 *   十周年种子为用户所见面。同 case 补 `stack > 0` 门（NPC.cs:7135，本仓漏）。
 *   【十周年交互定谳】celebrationmk10 与 19 到达门【零交互】：候选块/优先链里
 *   tenthAnniversaryWorld 分支仅两处——178 蒸汽朋克人（世界生成开局自带 homeless，
 *   WorldGen.cs:19895-19907 "SteampunkerNames.Whitney"；候选支 Main.cs:66837-66840
 *   `((tenthAnniversaryWorld && !getGoodWorld) || downedMechBossAny) && num15 < 1`）
 *   与 663 公主 flag9 直通臂（Main.cs:66928-66931）。开局 NPC 族=向导 22/蒸汽朋克人
 *   178/公主 663/派对女孩 208/兔 656（WorldGen.cs:19855-19985），无军火商——19 照常
 *   走弹药门入住。故落刀=①常量 97 正钉②stack 门补齐，非旗分支问题（BJ432 门误并
 *   同族形态防复发锚：'arms_dealer' case 不得并入手十周年/机械 Boss 支）。
 * 本文件锁：谓词功能面（弹药/持枪/扫描面 58 格/stack 门/unlock 旗）/十周年面
 * （直通不涉 19、开局族面）/数据表钉值（97/98/534/278/23/51）/源码自包含块
 * （AMMO_BULLET=97、case 无十周年支、ARRIVE_UNLOCK_FLAG 回路）。
 * 变异接缝：AMMO_BULLET 97→14（旧值回归）→ T1-T4/T7 爆红；stack 门拆除 → T5 爆红；
 * case 并入十周年支 → T6b/源码锚爆红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { ITEM_DEFS } from '../src/data/items';
import { itemCombat } from '../src/data/vanillaItemCombat';

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** vi_<vid> 稳定 id 反查内部 def 下标（ITEM_DEFS[id].vid，方案 A 统一域） */
function defIdByVid(vid: number): number {
  const i = ITEM_DEFS.findIndex((d) => d?.vid === vid);
  expect(i, `vid ${vid} 应已注册`).toBeGreaterThan(-1);
  return i;
}

/** townNpcSpawnAllowed 最小桩（arms_dealer/steampunker case 只读 player.inv.slots/
 *  world.flags/seedFlags——Game 无 DOM 不可整体构造，同 bj432 Object.create 桩家族） */
function spawnAllowedWith(
  slots: Array<{ vid: number; stack: number } | null>,
  flags: Record<string, boolean> = {},
  seedFlags: Record<string, boolean> = {},
) {
  const self = Object.create(Game.prototype) as unknown as {
    player: { inv: { slots: Array<{ id: number; stack: number } | null> } };
    world: { flags: Record<string, boolean>; seedFlags: Record<string, boolean> };
    townNpcSpawnAllowed(key: string): boolean;
  };
  const bulletId = defIdByVid(97);
  // vid → 内部 def id（slot.id=ITEM_DEFS 下标）；stack/空壳按桩入参原样落
  self.player = { inv: { slots: slots.map((s) => (s ? { id: defIdByVid(s.vid), stack: s.stack } : null)) } };
  self.world = { flags, seedFlags };
  void bulletId;
  return (key: string) => self.townNpcSpawnAllowed(key);
}

describe('BJ531 到达门功能面：SpawnAllowed_ArmsDealer（NPC.cs:7119-7124 1:1）', () => {
  it('T1 用户复现：十周年种子 + 背包火枪子弹(97) → 到达（旧 AMMO_BULLET=14 下恒假）', () => {
    const allow = spawnAllowedWith([{ vid: 97, stack: 100 }], {}, { tenthAnniversary: true });
    expect(allow('arms_dealer')).toBe(true);
  });

  it('T2 弹药槽面：火枪子弹放 54-57 弹药段（inventory[0..57] 全域扫描,NPC.cs:7131）', () => {
    const slots: Array<{ vid: number; stack: number } | null> = Array.from({ length: 58 }, () => null);
    slots[54] = { vid: 97, stack: 250 };
    const allow = spawnAllowedWith(slots);
    expect(allow('arms_dealer')).toBe(true);
  });

  it('T3 useAmmo 面：持枪也算（98 迷你鲨 useAmmo=97 / 534 霰弹枪,Item.cs:2528-2541）', () => {
    expect(spawnAllowedWith([{ vid: 98, stack: 1 }])('arms_dealer')).toBe(true);
    expect(spawnAllowedWith([{ vid: 534, stack: 1 }])('arms_dealer')).toBe(true);
  });

  it('T4 反例：凝胶(23 ammo=23)/木箭(51 ammo=40) 非子弹域 → false；空背包 → false', () => {
    expect(spawnAllowedWith([{ vid: 23, stack: 99 }])('arms_dealer')).toBe(false);
    expect(spawnAllowedWith([{ vid: 51, stack: 999 }])('arms_dealer')).toBe(false);
    expect(spawnAllowedWith([])('arms_dealer')).toBe(false);
  });

  it('T5 stack>0 门（NPC.cs:7135 `item.stack > 0`,★BJ531 补）：零叠空壳格不计', () => {
    expect(spawnAllowedWith([{ vid: 97, stack: 0 }])('arms_dealer')).toBe(false);
    expect(spawnAllowedWith([{ vid: 97, stack: 1 }])('arms_dealer')).toBe(true);
  });

  it('T6 unlock 旗直通：unlockedArmsDealerSpawn → 无背包也 true（WorldGen.cs:5516 随档）', () => {
    expect(spawnAllowedWith([], { unlockedArmsDealerSpawn: true })('arms_dealer')).toBe(true);
  });

  it('T7 十周年零交互：无弹药时十周年旗不放行 19（到达门专属 178/663,Main.cs:66837/66928）', () => {
    expect(spawnAllowedWith([], {}, { tenthAnniversary: true })('arms_dealer')).toBe(false);
  });

  it('对照：蒸汽朋克人 178 十周年直通门原位（BJ432 对照组,防修刀误移支）', () => {
    expect(spawnAllowedWith([], {}, { tenthAnniversary: true })('steampunker')).toBe(true);
  });
});

describe('BJ531 数据表钉值：vanilla-itemcombat.json = Item.cs SetDefaults 终值', () => {
  it('火枪子弹 97：ammo=97（Item.cs:2516-2527 ammo=AmmoID.Bullet;AmmoID.cs:122）', () => {
    const c = itemCombat(97);
    expect(c?.ammo).toBe(97);
    expect(c?.consumable).toBe(true);
  });

  it('枪族 useAmmo=97：98 迷你鲨 / 534 霰弹枪（Item.cs:2528-2541）', () => {
    expect(itemCombat(98)?.useAmmo).toBe(97);
    expect(itemCombat(534)?.useAmmo).toBe(97);
  });

  it('子弹域全集族：278 银子弹 ammo=97；异域 23 凝胶 ammo=23 / 51 木箭 ammo=40 不串', () => {
    expect(itemCombat(278)?.ammo).toBe(97);
    expect(itemCombat(23)?.ammo).toBe(23);
    expect(itemCombat(51)?.ammo).toBe(40);
  });
});

describe('BJ531 源码自包含块钉死（Game 无 DOM 不可构造,T4 同族备案）', () => {
  const src = readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');

  // 域锚：townNpcSpawnAllowed 函数体（同 BJ432 锚法——case 扫描不得跨函数误中）
  const fnStart = src.indexOf('private townNpcSpawnAllowed');
  const fnSrc = src.slice(fnStart, src.indexOf('private updateTownNpcArrival', fnStart));

  function caseBlock(caseKey: string, nextKey: string): string {
    const start = fnSrc.indexOf(`case '${caseKey}':`);
    expect(start, `case '${caseKey}' 缺位`).toBeGreaterThan(-1);
    const end = fnSrc.indexOf(`case '${nextKey}':`, start);
    expect(end, `case '${nextKey}' 缺位`).toBeGreaterThan(start);
    return fnSrc.slice(start, end);
  }

  it("AMMO_BULLET=97 正钉（Terraria.ID/AmmoID.cs:122）,旧值 14 无残留", () => {
    expect(src).toMatch(/const AMMO_BULLET = 97;/);
    expect(src).not.toMatch(/const AMMO_BULLET = 14;/);
  });

  it("case 'arms_dealer' 消费 AMMO_BULLET + stack 门在位（NPC.cs:7135）", () => {
    const block = caseBlock('arms_dealer', 'demolitionist');
    expect(block).toContain('c.ammo === AMMO_BULLET || c.useAmmo === AMMO_BULLET');
    expect(block).toMatch(/s\.stack <= 0/);
  });

  it("case 'arms_dealer' 零十周年/机械 Boss 支（BJ432 门误并同族防复发——19 到达门专属面）", () => {
    const block = caseBlock('arms_dealer', 'demolitionist');
    expect(block).not.toContain('tenthAnniversary');
    expect(block).not.toMatch(/downed_/);
  });

  it("case 'steampunker' 保有其十周年直通支（分支归属唯一,防整批误删/误移）", () => {
    const block = caseBlock('steampunker', 'witch_doctor');
    expect(block).toContain('tenthAnniversary');
  });

  it('到达→旗回路：ARRIVE_UNLOCK_FLAG.arms_dealer = unlockedArmsDealerSpawn（WorldGen.cs:5516）', () => {
    expect(src).toMatch(/arms_dealer:\s*'unlockedArmsDealerSpawn'/);
  });
});
