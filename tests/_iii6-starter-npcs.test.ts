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
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const CELEB_SEED = '1999040562';
const W = 4200, H = 1200;

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
