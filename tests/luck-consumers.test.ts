// 幸运度消费面七类补全批（2026-09-03）——七类消费体的 luck 掷卡接线锁定。
// 定谳锚（亲读 Terarria1457）：
//   ① 旅商画作四掷 GetPainting（Chest.cs:817/821/825/829 rarity[3]）——仓内已接
//     （Game.buildTravelStock rollZero=rollLuck(luck,rarity[tier])==0;本文件不重建
//     Game,复合门补齐由探针 _luck-consumers.mjs 断言）。
//   ② 饵金变体两掷 KillTile_DropBait（WorldGen.cs:66885 worm 357→448 / :66903
//     grasshopper 377→446,GetClosestRollLuck(i,j,goldCritterChance==400),NPC.cs:6054）
//     ——曾 rand<1/400 均匀近似,本批接 luck（DropBait.dropBaitRoll luck 参）。
//   ③ 心/星五掷 DropHeals(:79931/:79937/:79957)+DropCommonLifeAndMana(:80353/:80369)
//     ——仓内 NpcDrops rollTypeHearts/rollHeartsAndStars 已接（luck-drop-chain.test.ts
//     统计面锁定）,本文件补确定性门断言。
//   ④ 坠星定向 SpawnFallingObjects（WorldGen.cs:72405-72417,:72410 `remix ?
//     RollBadLuck : RollLuck`(15)==0）——★定谳:该线【不是】药草种子缩放（药草采收
//     KillTile_DropItems case 83/84 :66194-66214 全程无 luck）;本批接
//     Luck.starfallHoming（旧 rand<luck×1/15 近似退役：luck=0 漏基线 1/15、负运恒 0、
//     正运低估 1.5×）。
//   ⑤ 金蛙 SpawnFrog（NPC.cs:5621-5637,RollLuck(30)→687 / RollLuck(400)→445）——
//     金蛙支曾 1/400 近似,本批接 playerLuck（spawn 周期玩家 luck,SetSpawnFlags
//     NPC.cs:370）。
//   ⑥ 地牢幽魂 DoDeathEvents_SummonDungeonSpirit（NPC.cs:79875-79886,RollLuck
//     13/专家9）——仓内 Enemy.ts 死亡结算已接（rollLuck(ctx.luck,…)==0,本批零改动）。
//   ⑦ 地下仙女 CheckToSpawnUndergroundFairy（NPC.cs:5820-5845,RollLuck(500/250/×1.66)）
//     ——仓内 VanillaSpawner.checkToSpawnUndergroundFairy 已接（本批零改动）。
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { dropBaitRoll } from '../src/world/DropBait';
import { rollHeartsAndStars, type NpcDropCtx } from '../src/drops/NpcDrops';
import { starfallHoming, rollLuck } from '../src/stats/Luck';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';

/** 序列 stub rng：next()/int(a,b) 共享同一序列指针（int(a,b)=a+floor(v*(b-a+1))），
 *  序列耗尽后恒 0 */
function seqRng(seq: number[]): { next: () => number; int: (a: number, b: number) => number } {
  let i = 0;
  const pull = (): number => (i < seq.length ? seq[i++] : 0);
  return {
    next: pull,
    int: (a, b) => a + Math.floor(pull() * (b - a + 1)),
  };
}

// ============ ② 饵金变体（KillTile_DropBait :66885/:66903） ============
describe('dropBaitRoll 金变体掷接 luck（GetClosestRollLuck(…,400)==0 1:1）', () => {
  // tile 3（草地）：wormDenom=400/hopDenom=100——accept 固定喂 0 → 必进 worm 支
  const WORM = (rand: () => number, luck = 0, gy = false) => dropBaitRoll(3, 0, 0, false, rand, luck, gy);

  it('luck=0 与旧均匀近似逐位同价：rand<1/400 才金', () => {
    expect(WORM(() => 0.0024)?.gold).toBe(true);   // floor(0.0024*400)=0
    expect(WORM(() => 0.0026)?.gold).toBe(false);  // floor(0.0026*400)=1
  });

  it('正运门+内掷收窄：同种子前缀 luck=0 不中 → luck=1 中（denom 缩放实证）', () => {
    // luck=0：掷序 [accept=0, gold=floor(0.99*400)=396] → 不金
    expect(WORM(seqRng([0, 0.99]).next)?.gold).toBe(false);
    // luck=1：[accept=0, 门 0.5<1, 内层 B=floor(0.99*200)=198→next(398), 终掷 0→==0] → 金
    expect(WORM(seqRng([0, 0.5, 0.99, 0]).next, 1)?.gold).toBe(true);
  });

  it('统计面：金率（|worm 接受） luck+1≈0.00347 > luck0=0.0025 > luck−1≈0.00174', () => {
    const N = 120_000;
    const rate = (luck: number): number => {
      const rng = new RNG(20260903);
      let gold = 0, worms = 0;
      for (let i = 0; i < N; i++) {
        let first = true;
        // accept 固定 0（首个调用）→ 每迭代必进 worm 支,金掷独享后续掷源
        const r = dropBaitRoll(3, 0, 0, false, () => {
          if (first) { first = false; return 0; }
          return rng.next();
        }, luck);
        if (r?.kind === 'worm') { worms++; if (r.gold) gold++; }
      }
      expect(worms).toBe(N);
      return gold / worms;
    };
    const zero = rate(0);
    expect(zero).toBeGreaterThan(0.002);           // ≈1/400
    expect(zero).toBeLessThan(0.003);
    expect(rate(1)).toBeGreaterThan(zero * 1.2);   // ≈0.00347
    expect(rate(-1)).toBeLessThan(zero * 0.85);    // ≈0.00174
  });

  it('墓地 worm 掷卡短路（num7==357 && 门序 :66881-66887）：gold 恒 false;hop 不豁免', () => {
    // 墓地+满运：gold 仍 false（606 覆写后短路,不进内掷）
    const r = dropBaitRoll(3, 0, 0, false, () => 0, 1, true);
    expect(r?.kind).toBe('worm');
    expect(r?.gold).toBe(false);
    // hop 支墓地下照常掷金（grasshopper 377→446 无墓地豁免 :66903）：
    // [0.5>worm 1/200 错过, 0<1/50 hop 中, 门 0.5<1, B=198, 终掷 0→金]
    const hop = dropBaitRoll(73, 0, 0, false, seqRng([0.5, 0, 0.5, 0.99, 0]).next, 1, true);
    expect(hop?.kind).toBe('hop');
    expect(hop?.gold).toBe(true);
  });

  it('grub/lava 两族无金掷（:66914-66937 直选变体,零 luck 面）——回归', () => {
    const grub = dropBaitRoll(61, 0, 0, false, seqRng([0, 0.5, 0.5]).next);
    expect(grub?.kind).toBe('grub');
    expect(grub?.gold).toBe(false);
    const lava = dropBaitRoll(637, 0, 0, false, seqRng([0, 0.4]).next);
    expect(lava?.kind).toBe('lava');
    expect(lava?.gold).toBe(false);
  });
});

// ============ ④ 坠星定向（SpawnFallingObjects :72405-72417 → Luck.starfallHoming） ============
describe('starfallHoming（:72410 remix?RollBadLuck:RollLuck(15)==0 + 地表/AFK 门 + 两掷偏移）', () => {
  const SURF = true, AFK = true;

  it('roll≠0 / 地表下 / 挂机 任一 → null（照原随机落点）', () => {
    expect(starfallHoming(0, false, seqRng([0.9]).next, SURF, AFK)).toBeNull();       // 13≠0
    expect(starfallHoming(0, false, seqRng([0]).next, !SURF, AFK)).toBeNull();        // 中掷但地表下
    expect(starfallHoming(0, false, seqRng([0]).next, SURF, !AFK)).toBeNull();        // 中掷但挂机
  });

  it('remix 分支翻转内掷窗 [7,14)→[15,29)：同种子前缀非 remix 中 → remix 不中', () => {
    const seq = [0.5, 0.99, 0.0499];
    // 非 remix：B=next(8)=7 → 内掷 next(7+7=14) → floor(0.0499*14)=0 → 定向
    expect(starfallHoming(1, false, seqRng([...seq, 0, 0]).next, SURF, AFK)).not.toBeNull();
    // remix：B=next(15)=14 → 内掷 next(15+14=29) → floor(0.0499*29)=1 → 不定向
    expect(starfallHoming(1, true, seqRng(seq).next, SURF, AFK)).toBeNull();
  });

  it('偏移两掷（Next(1,640) 半径 → Next(-num30,num30+1)）——非 uniform ±640', () => {
    // num30=1（半径最小）→ 偏移 ∈ {-1,0,1}
    expect(starfallHoming(0, false, seqRng([0, 0, 0.999]).next, SURF, AFK)).toBe(1);
    // num30=639（0.999*639=638.36→638,+1）→ 偏移下界 -639
    expect(starfallHoming(0, false, seqRng([0, 0.999, 0]).next, SURF, AFK)).toBe(-639);
  });

  it('统计面：P(定向) luck+1≈0.1002 / 0≈0.0667 / −1≈0.0473（旧近似 luck×1/15 退役）', () => {
    const N = 60_000;
    const rate = (luck: number): number => {
      const rng = new RNG(31337);
      let hits = 0;
      for (let i = 0; i < N; i++) {
        if (starfallHoming(luck, false, () => rng.next(), SURF, AFK) !== null) hits++;
      }
      return hits / N;
    };
    const zero = rate(0);
    expect(zero).toBeGreaterThan(0.06);            // ≈1/15
    expect(zero).toBeLessThan(0.074);
    expect(rate(1)).toBeGreaterThan(zero * 1.3);   // ≈0.1002
    expect(rate(-1)).toBeLessThan(zero * 0.85);    // ≈0.0473
  });
});

// ============ ⑤ 金蛙（SpawnFrog NPC.cs:5621-5637） ============
describe('spawnFrog 金蛙支接 playerLuck（RollLuck(goldCritterChance=400)==0）', () => {
  // 单 World/Spawner 复用（原版掷序：687 支旗短路不耗掷 → 金掷 → else 361）
  const w = new World(160, 160, 42, 'frog-luck');
  w.flags.unlockedSlimeYellowSpawn = true;
  const sp = new VanillaSpawner(w);
  const s = sp as unknown as {
    playerLuck: number; spawnTileX: number; spawnTileY: number;
    spawnFrog: (r: unknown) => { vanillaId: number } | null;
  };
  s.spawnTileX = 80;
  s.spawnTileY = 80;
  const frogOf = (luck: number, rng: () => number): number => {
    s.playerLuck = luck;
    return s.spawnFrog({ next: rng, int: (a: number, b: number) => a + Math.floor(rng() * (b - a + 1)) })
      ?.vanillaId ?? -1;
  };

  it('同种子前缀：luck=0 → 361（不金）/ luck=1 → 445（金蛙）', () => {
    expect(frogOf(0, seqRng([0.5]).next)).toBe(361);              // floor(0.5*400)=200
    expect(frogOf(1, seqRng([0.5, 0.99, 0]).next)).toBe(445);     // 门+B=198→next(398)→0
  });

  it('统计面：金蛙率（|到蛙支） luck+1≈0.00347 > luck0=0.0025 > luck−1≈0.00174', () => {
    const N = 200_000;
    const rate = (luck: number): number => {
      const rng = new RNG(6054);
      let gold = 0, tries = 0;
      for (let i = 0; i < N; i++) {
        const v = frogOf(luck, () => rng.next());
        if (v === 361 || v === 445) { tries++; if (v === 445) gold++; }
      }
      return gold / Math.max(1, tries);
    };
    const zero = rate(0);
    expect(zero).toBeGreaterThan(0.002);           // ≈1/400
    expect(zero).toBeLessThan(0.003);
    expect(rate(1)).toBeGreaterThan(zero * 1.2);
    expect(rate(-1)).toBeLessThan(zero * 0.85);
  });
});

// ============ ③ 心/星（DropCommonLifeAndMana :80353/:80369——确定性门补锁） ============
describe('rollHeartsAndStars luck 门（NpcDrops rollLuck 三态,deterministic 补锁）', () => {
  const ctxOf = (luck: number, rng: { next: () => number; int: (a: number, b: number) => number }): NpcDropCtx => ({
    rng: rng as never,
    netId: 3, type: 3,
    isExpert: false, isMaster: false, hardMode: false, crimson: false,
    flags: {},
    x: 800, y: 3200,
    worldSurfaceTile: 100, rockLayerTile: 150, underworldTileY: 400,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 100, friendly: false, boss: false, damage: 20, value: 100,
    hp: 200, hpMax: 400, mana: 40, manaMax: 180,
    luck,
  });

  it('同种子前缀：luck=0 两掷全不中 → luck=1 内掷收窄后中（denom 6/2 缩放）', () => {
    // luck=0：int(0,5)←0.5→3 miss;int(0,1)←0.9→1 miss → 零掉落
    expect(rollHeartsAndStars(ctxOf(0, seqRng([0.5, 0.9]))).length).toBe(0);
    // luck=1：门 0.5<1 → int(3,5)←0.5→4 → int(0,3)←0→0<1 中 → int(0,1)←0.5→1≠0
    //   → else int(0,1)←0→0==0 && hp<max → 心 58
    const drops = rollHeartsAndStars(ctxOf(1, seqRng([0.5, 0.5, 0, 0.5, 0])));
    expect(drops.length).toBeGreaterThan(0);
    expect([58, 184].includes(drops[0]!.id)).toBe(true);
  });

  it('rollLuck 本体基线回归（Luck.cs:5-16）', () => {
    expect(rollLuck(0, 400, () => 0.0024)).toBe(0);
    expect(rollLuck(0, 400, () => 0.0026)).toBe(1);
  });
});
