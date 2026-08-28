// ★IIIIIII6（CELEB 第二批 StarterNPCs）：SpawnStarterNPCs pass 决策链 + 掷流对拍。
//
// 真值锚（x86 1.4.5.8 rig 产物 /tmp/sw-slp/g1458-celeb/w.wld v326，
//   数字种子 1999040562 + serverconfig `seed_celebration=1`，小世界 4200×1200）：
//   - w.wld header：spawn=(285,229)（沙滩出生 → beachBordersWidth+15=290 带内 Next(-5..5)=−5）
//   - NPC 段（原版 SaveNPCs 序）：
//       id22 Andrew  home=(285,229) homeless variation=0
//       id178 Whitney home=(287,229)
//       id663 Yorai   home=(283,227)
//       id208 Amanda  home=(289,230)
//       id656 'Boof'  home=(281,227) variation=1
//     白兔名 = B 掷落 Lop 池第 11 个（'Boof'），与本仓 UnifiedRandom 复算全等。
// 参照实现：src/world/gen/vanilla/StarterNPCsPass.ts（1458 cs:19848-20068 行号锚在文件头）。
// ★IIIII20：非十周年 else 链（cs:19986-20059）全支硬等断言追加（本文件第二组用例）——
//   终名预言 = pass 头重播种子后第 2 掷落池名（第 1 掷被 GetNameForVariant 覆写；
//   各臂 NewNPC 是该 pass 的首个掷骰消费点，故 UnifiedRandom(seed) 前 2 掷即命名双掷），
//   与探针 /tmp/iii20-out/probe.json 五分支五中全等。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

const CELEB_SEED = '1999040562';
const W = 4200, H = 1200;

/** en-US 名池（与 StarterNPCsPass.NPC_NAME_POOLS 同源独立副本——漂移会直接断言爆红） */
const POOLS = {
  20: ['Alalia', 'Alura', 'Ariella', 'Caelia', 'Calista', 'Chryseis', 'Emerenta', 'Elysia',
    'Evvie', 'Faye', 'Felicitae', 'Lunette', 'Nata', 'Nissa', 'Tatiana', 'Rosalva', 'Shea',
    'Tania', 'Isis', 'Celestia', 'Xylia'],
  17: ['Alfred', 'Barney', 'Calvin', 'Edmund', 'Edwin', 'Eugene', 'Frank', 'Frederick',
    'Gilbert', 'Gus', 'Wilbur', 'Seymour', 'Louis', 'Humphrey', 'Harold', 'Milton',
    'Mortimer', 'Howard', 'Walter', 'Isaac', 'Joseph', 'Kristian', 'Ralph'],
  38: ['Dolbere', 'Bazdin', 'Durim', 'Tordak', 'Garval', 'Morthal', 'Oten', 'Dolgen',
    'Gimli', 'Gimut', 'Duerthen', 'Beldin', 'Jarut', 'Ovbere', 'Norkas', 'Dolgrim',
    'Boften', 'Norsun', 'Dias', 'Fikod', 'Urist', 'Darur'],
  441: ['McKinly', 'Millard', 'Fillmore', 'Rutherford', 'Chester', 'Grover', 'Cleveland',
    'Theodore', 'Herbert', 'Warren', 'Lyndon', 'Ronald', 'Harrison', 'Woodrow', 'Tweed',
    'Blanton', 'Dwyer', 'Carroll', 'Agnew'],
  633: ['Maria', 'MacKenzie', 'Azaria', 'Juanita', 'Astra', 'Hayley', 'Becca', 'Veronica',
    'Tia', 'Robyn', 'Arien', 'Jane', 'Bindi', 'Dian', 'Lori', 'Mardy', 'Mollie', 'Lizzy',
    'Daphne', 'Ellen', 'Lilith'],
} as const;

/** 终名预言：pass 头重播后的第 2 掷（Legacy GetNameForVariant 覆写第一掷） */
function predictStarterName(seed: number, type: keyof typeof POOLS): string {
  const ur = new UnifiedRandom(seed);
  ur.nextInt(POOLS[type].length);
  const second = ur.nextInt(POOLS[type].length);
  return POOLS[type][second];
}

const X86_SPAWN: [number, number] = [285, 229];
const X86_STARTERS: Array<{ key: string; givenName: string; anchor: [number, number]; dir: number }> = [
  { key: 'guide', givenName: 'Andrew', anchor: [285, 229], dir: 1 },
  { key: 'steampunker', givenName: 'Whitney', anchor: [287, 229], dir: -1 },
  { key: 'princess', givenName: 'Yorai', anchor: [283, 227], dir: 1 },
  { key: 'party_girl', givenName: 'Amanda', anchor: [289, 230], dir: -1 },
  { key: 'town_bunny', givenName: 'Boof', anchor: [281, 227], dir: 1 },
];

describe('IIIIIII6 SpawnStarterNPCs（celebrationmk10 起始镇民）', () => {
  it('十周年世界播种五名初始镇民：名单/名字掷流/homeless 锚与 x86 w.wld 全等', { timeout: 180_000 }, async () => {
    const world = await generateWorld({
      width: W, height: H,
      seedText: CELEB_SEED,
      seedFlags: { tenthAnniversary: true },
      evil: 0,
    });
    // 播种记录
    const starters = world.starterTownNpcs;
    expect(starters, 'starterTownNpcs 应由 pass 填充').toBeDefined();
    expect(starters!.map((s) => s.key)).toEqual(X86_STARTERS.map((s) => s.key));
    starters!.forEach((s, i) => {
      expect(s.givenName, `#${i} ${s.key} 名`).toBe(X86_STARTERS[i].givenName);
      expect(s.dir, `#${i} ${s.key} 朝向`).toBe(X86_STARTERS[i].dir);
      expect(s.anchor, `#${i} ${s.key} homeless 锚(homeTile)`).toEqual(X86_STARTERS[i].anchor);
      if (s.key === 'town_bunny') {
        expect(s.variationIndex, '白兔 townNpcVariationIndex=1（cs:19983）').toBe(1);
        expect(s.y, 'bottom-anchor 展开：y=Y*16−20（兔 h=20；x86 存档 y=3612 同构）').toBe(s.anchor[1] * 16 - 20);
      }
    });
    // bottom-anchor 展开公式抽查：x86 存档 princess position.y=3592=227*16−40
    const princess = starters![2];
    expect(princess.y).toBe(3592);

    // 开局旗标（NPC.boughtBunny / unlockedPrincessSpawn / unlockedPartyGirlSpawn）
    expect(world.flags.boughtBunny).toBe(true);
    expect(world.flags.unlockedPrincessSpawn).toBe(true);
    expect(world.flags.unlockedPartyGirlSpawn).toBe(true);
    expect(world.flags.unlockedMerchantSpawn).toBeFalsy(); // 纯 celeb 不触商人门

    // ★SpawnPoint 沙滩出生（cs:19689-19695）：出生点落在 x86 同款左滩带
    expect([world.spawnX, world.spawnY]).toEqual(X86_SPAWN);
  });

  it('非十周年世界零副作用早退（starterTownNpcs 不产生、旗标不置位）', { timeout: 180_000 }, async () => {
    const world = await generateWorld({
      width: W, height: H,
      seedText: CELEB_SEED,
      seedFlags: {},
      evil: 0,
    });
    expect(world.starterTownNpcs).toBeUndefined();
    expect(world.flags.boughtBunny).toBeFalsy();
    expect(world.flags.unlockedPrincessSpawn).toBeFalsy();
    expect(world.flags.unlockedPartyGirlSpawn).toBeFalsy();
  });
});

// ★IIIII20（换人支收齐）：非十周年 else 链（1457 cs:19986-20059）各支硬等断言。
//   链树原文序：infected(20,var1) > vampireSeed(633) > remix(441+savedTaxCollector)
//   > drunk×const(124) > notBees(!const)(17) > getGood(38) > 裸 drunk(208) > 向导兜底
//   （兜底 = Game.ts 承接域，pass 对普通种子零副作用——上一组用例锚定）。
describe('IIIII20 SpawnStarterNPCs else 链换人支（cs:19986-20059）', () => {
  const BRANCHES: Array<{
    name: string; seedText: string; flags: Record<string, boolean>;
    key: string; type: keyof typeof POOLS;
    flag?: [string, boolean];
  }> = [
    // 动物学家：vampireSeed 臂 cs:19999-20005（无附加旗标；终名=BestiaryGirlNames 第2掷）
    { name: 'vampire', seedText: 'whatahorriblenighttohaveacurse', flags: { vampireSeed: true }, key: 'zoologist', type: 633 },
    // 税务员：remix 臂 cs:20007-20015（savedTaxCollector=true）
    { name: 'remix', seedText: 'dontdigup', flags: { remix: true }, key: 'tax_collector', type: 441, flag: ['savedTaxCollector', true] },
    // 商人：notBees 臂 cs:20025-20032（!theConstant 门 + unlockedMerchantSpawn=true）
    { name: 'notbees', seedText: 'notthebees', flags: { notTheBees: true }, key: 'merchant', type: 17, flag: ['unlockedMerchantSpawn', true] },
    // 爆破匠：getGood(for the worthy) 臂 cs:20034-20041（unlockedDemolitionistSpawn=true）
    { name: 'ftw', seedText: 'fortheworthy', flags: { getGoodWorld: true }, key: 'demolitionist', type: 38, flag: ['unlockedDemolitionistSpawn', true] },
  ];

  for (const b of BRANCHES) {
    it(`${b.name} 世界起始 NPC=${b.key}：记录/掷流终名/旗标硬等`, { timeout: 240_000 }, async () => {
      const world = await generateWorld({
        width: W, height: H, seedText: b.seedText, seedFlags: b.flags, evil: 0,
      });
      const starters = world.starterTownNpcs;
      expect(starters, `${b.name}: pass 应产出单条 starter`).toBeDefined();
      expect(starters!.length).toBe(1);
      const s = starters![0]!;
      expect(s.key).toBe(b.key);
      // 终名 = pass 头重播后第 2 掷落池名（GiveTownUniqueDataToNPCsThatNeedIt 命名链：
      // 第一掷被 GetNameForVariant=getNewNPCName(Type) 覆写，两掷结果硬编码名不在场）
      expect(s.givenName).toBe(predictStarterName(world.seed, b.type));
      // 位置/朝向/homeless 锚：NewNPC(spawnPx) 直投 → 消费端底锚约定 x=cx*16+8、y=(cy−2)*16
      expect(s.dir).toBe(1);                                        // direction=1（cs:20004 等）
      expect(s.x).toBe(s.anchor[0] * 16 + 8);
      expect(s.y).toBe((s.anchor[1] - 2) * 16);
      // 无变体位（infected 支除外）
      if (s.key !== 'dryad') expect(s.variationIndex).toBeUndefined();
      // 旗标写入 + 异支旗标负例
      if (b.flag) expect(world.flags[b.flag[0]]).toBe(b.flag[1]);
      else {
        expect(world.flags.savedTaxCollector ?? false).toBe(false);
        expect(world.flags.savedMech ?? false).toBe(false);
      }
      expect(world.flags.boughtBunny ?? false).toBe(false);
      expect(world.flags.unlockedPrincessSpawn ?? false).toBe(false);
      if (b.key !== 'merchant') expect(world.flags.unlockedMerchantSpawn ?? false).toBe(false);
      if (b.key !== 'demolitionist') expect(world.flags.unlockedDemolitionistSpawn ?? false).toBe(false);
    });
  }

  it('infected(purifythis) 世界起始=德鲁伊 20 var1（Lilith 族），名字走 DryadNames 第二掷', { timeout: 240_000 }, async () => {
    const world = await generateWorld({
      width: W, height: H, seedText: 'purifythis', seedFlags: { infectedSeed: true }, evil: 0,
    });
    const s = world.starterTownNpcs![0]!;
    expect(s.key).toBe('dryad');
    expect(s.variationIndex).toBe(1);                               // townNpcVariationIndex（cs:19993）
    expect(s.givenName).toBe(predictStarterName(world.seed, 20));   // DryadNames 双掷第二掷=终名
    expect(s.dir).toBe(1);
    expect(world.flags.savedTaxCollector ?? false).toBe(false);     // 无 remix 叠加（cs:19994 门）
  });

  it('优先级：drunk×notBees 组合世界由 notBees 臂受理（else 树上游否定）', { timeout: 240_000 }, async () => {
    const world = await generateWorld({
      width: W, height: H, seedText: '05162020',
      seedFlags: { drunkWorld: true, notTheBees: true }, evil: 0,
    });
    const starters = world.starterTownNpcs!;
    expect(starters.length).toBe(1);
    expect(starters[0].key).toBe('merchant');   // cs:20025 在 cs:20043 之前截胡（旧门曾误接派对女孩臂）
    expect(starters[0].givenName).toBe(predictStarterName(world.seed, 17));
    expect(world.flags.unlockedMerchantSpawn).toBe(true);
    expect(world.flags.unlockedPartyGirlSpawn ?? false).toBe(false);
  });

  it('十周年×remix 组合首臂=税务员 "Andrew"+savedTaxCollector（zenith 主线;类型臂≠命名臂）', { timeout: 240_000 }, async () => {
    const world = await generateWorld({
      width: W, height: H, seedText: CELEB_SEED,
      seedFlags: { tenthAnniversary: true, remix: true }, evil: 0,
    });
    const starters = world.starterTownNpcs!;
    expect(starters.length).toBe(5);
    expect(starters[0].key).toBe('tax_collector');                  // cs:19869 NewNPC(441)
    expect(starters[0].givenName).toBe('Andrew');                   // cs:19887 else 臂硬编码名
    expect(starters[0].variationIndex).toBeUndefined();
    expect(world.flags.savedTaxCollector).toBe(true);               // cs:19870
    // 尾席照常走 remix 支彩虹史莱姆（cs:19964-19966）
    expect(starters[4].key).toBe('town_slime_diva');
    expect(starters[4].givenName).toBe('Slimestar');
    expect(world.flags.unlockedSlimeRainbowSpawn).toBe(true);
  });

  it('十周年×infected 组合首臂=德鲁伊 "Lilith" var1（serverconfig 形态;余四席不变）', { timeout: 240_000 }, async () => {
    const world = await generateWorld({
      width: W, height: H, seedText: CELEB_SEED,
      seedFlags: { tenthAnniversary: true, infectedSeed: true }, evil: 0,
    });
    const starters = world.starterTownNpcs!;
    expect(starters.map((s) => s.key)).toEqual([
      'dryad', 'steampunker', 'princess', 'party_girl', 'town_bunny',
    ]);
    expect(starters[0].givenName).toBe('Lilith');                   // cs:19878 GetTextValue("Lilith")
    expect(starters[0].variationIndex).toBe(1);                     // cs:19879
    // 其余席位与纯 celeb 五人组同构（D 批金标名单尾部抽查）
    expect(starters[3].givenName).toBe('Amanda');
    expect(starters[4].givenName).toBe('Boof');                     // 白兔 B 掷（种子同源复现）
  });
});
