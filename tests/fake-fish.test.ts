// FakeFish 钓鱼装饰鱼群回归（FakeFishParticle.cs / Projectile.SpawnFakeFishInWater 移植）：
//   ① 生成门条件（水深 ≥3 格列、±10 列窗、1/10 列出鱼、展示候选表非空才出、池上限）
//   ② 态机转移链（Interested→Latched→停咬解除/收竿自灭；Jumping→FreeRoaming）
//   ③ 四液型 splash 音分支（pitchOffset 微光 5 / 蜂蜜·岩浆·水 1 + clamp 语义 + 尘型分派）
import { describe, expect, it, beforeEach } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import {
  seededRng, getDisplayableDrops, type FishingRollCtx,
} from '../src/data/vanillaFishing';
import {
  FakeFish, FAKE_FISH_POOL_CAP, clearFakeFish, fakeFishCount, eachFakeFish,
  requestFakeFishSpawn, spawnFakeFishInWater,
  magnetFakeFish, pingFakeFish, pushAwayFakeFish, releaseCaughtFakeFish,
  updateFakeFishSchool, FISH_SPLASH_PITCH_OFFSET, fishSplashPitch, dustWaterFor,
  receivesDiagonalCorrectionAsFakeFish, FAKE_FISH_INANIMATE, IS_FISHING_CRATE,
  setFakeFishRandom, type FakeFishHost, type FakeFishLatchTarget,
} from '../src/entities/FakeFish';

function baseCtx(over: Partial<FishingRollCtx> = {}): FishingRollCtx {
  return {
    inLava: false, inHoney: false, junk: false, crate: false,
    common: true, uncommon: true, rare: true, veryrare: true, legendary: true,
    anyEnemies: false, canFishInLava: false,
    x: 1000, y: 100, waterTilesCount: 2000,
    rockLayer: 400, maxTilesX: 4200, heightLevel: 1, questFish: -1,
    hardMode: false, bloodMoon: false, combatBookWasUsed: false, remix: false,
    zones: { corrupt: false, crimson: false, jungle: false, snow: false,
      dungeon: false, desert: false, hallow: false },
    rolled: { corruption: false, crimson: false, jungle: false, snow: false,
      desert: false, infectedDesert: false, remixOcean: false },
    ...over,
  };
}

interface SfxCall { file: string; vol: number; x?: number; y?: number; pitch?: number }

function makeHost(store: TileStore, sfx: SfxCall[] = [], dusts: Array<{ type: number }> = []): FakeFishHost {
  return {
    world: { store },
    playSfxWav: (file, vol = 1, x?, y?, pitch?) => { sfx.push({ file, vol, x, y, pitch }); },
    spawnDust: (_x, _y, _w, _h, type) => { dusts.push({ type }); return null; },
  };
}

/** 矩形水池：cols [x0,x0+w)，rows [y0,y0+d)，liquidType 1 水 */
function pool(st: TileStore, x0: number, y0: number, w: number, d: number, type = 1): void {
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) st.setLiquid(x0 + dx, y0 + dy, 255, type);
  }
}

const seeded = (seed: number) => seededRng(seed).double;

beforeEach(() => {
  clearFakeFish();
});

// ==================== 展示候选表（GetDisplayableDrops :23-43）====================

describe('生成门 · 展示候选表', () => {
  it('普通淡水上下文命中非空候选表且全为正 id（stopper 均不匹配）', () => {
    const entries = getDisplayableDrops(baseCtx());
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.itemType).toBeGreaterThan(0);
    // 频率表锚（AFishDropRulePopulator.cs:46-81）
    const freqs = new Set(entries.map((e) => e.frequency));
    for (const f of freqs) expect([1, 0.8, 0.4, 0.25, 0.1, 0.6]).toContain(f);
  });

  it('junk 上下文 → JunkDrops stopper 入表截断,itemType=0 原版空白观感', () => {
    const entries = getDisplayableDrops(baseCtx({ junk: true }));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[entries.length - 1].itemType).toBe(0);
  });
});

// ==================== ① 生成门（SpawnFakeFishInWater :20594-20696）====================

describe('生成门条件', () => {
  it('浅于 3 格的列永不出鱼（num5=3,:20632-20634）——任意种子恒 0', () => {
    const st = new TileStore(64, 64);
    pool(st, 20, 30, 12, 2);                       // 全池深 2
    const host = makeHost(st);
    for (let seed = 1; seed <= 30; seed++) {
      spawnFakeFishInWater(host, 25, 30, baseCtx(), seeded(seed * 7919));
    }
    expect(fakeFishCount()).toBe(0);
  });

  it('合格水列 1/10 概率出鱼：多种子合计 >0,个体位置在 ±10 列窗内、鱼种∈候选表', () => {
    const st = new TileStore(96, 96);
    pool(st, 20, 40, 12, 8);                       // 深 8（≤num4=10 上限）
    const host = makeHost(st);
    const items = new Set(getDisplayableDrops(baseCtx()).map((e) => e.itemType));
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      clearFakeFish();
      spawnFakeFishInWater(host, 25, 40, baseCtx(), seeded(seed * 104729));
      total += fakeFishCount();
      for (const f of eachFakeFish()) {
        expect(f.x).toBeGreaterThanOrEqual((25 - 10 - 1) * 16);   // minX-1 容差
        expect(f.x).toBeLessThanOrEqual((25 + 10 + 2) * 16);
        if (f.stateId === 1 || f.stateId === 0) {                 // 非 jump 起跳体
          expect(items.has(f.itemType)).toBe(true);
        }
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('候选表为空（如纯岩浆池 stopper 截断后仅 itemType=0）也按原版继续走列扫描', () => {
    // inLava=true → LavaDrops stopper 首个命中即截断,表内只有 {0,freq}
    const ctx = baseCtx({ inLava: true, common: false, uncommon: false, rare: false });
    const entries = getDisplayableDrops(ctx);
    expect(entries.length).toBe(1);
    expect(entries[0].itemType).toBe(0);
    const st = new TileStore(64, 64);
    pool(st, 20, 30, 10, 6, 2);                    // 岩浆池
    const host = makeHost(st);
    let spawned = 0;
    for (let seed = 1; seed <= 40; seed++) {
      clearFakeFish();
      spawnFakeFishInWater(host, 24, 30, ctx, seeded(seed * 31));
      spawned += fakeFishCount();
    }
    // 原版行为：item 0 鱼照常入池（Draw 无贴图=空白观感）；不因无贴图拒生成
    expect(spawned).toBeGreaterThan(0);
  });

  it('编排池上限 100（ParticlePool<FakeFishParticle>(100),:32）', () => {
    for (let i = 0; i < FAKE_FISH_POOL_CAP + 20; i++) {
      requestFakeFishSpawn(100, 100, 100, 108, 2476);
    }
    expect(fakeFishCount()).toBe(FAKE_FISH_POOL_CAP);
  });

  it('jump 分支：FakeFishJump 载荷 = 跳跃初速（MovementVector）+ TryJumping 态', () => {
    // 直接驱动编排入口（Spawn_FakeFish :1366-1369 jumping 支）
    const f = new FakeFish();
    f.prepare(2476, 400, 400, 400);
    f.x = 320; f.y = 320;
    f.vx = 1.2; f.vy = -3.4;
    f.tryJumping();                                 // :436-445 jumpTimeLeft=⌊vy/-0.2⌋×2
    expect(f.jumpTimeLeft).toBe(Math.trunc(-3.4 / -0.2) * 2);
    expect(f.stateId).toBe(3);                      // State.Jumping
  });
});

// ==================== ② 态机转移链 ====================

describe('态机转移（FreeRoaming/Interested/Latched/Jumping）', () => {
  it('Prepare :422 Next(3)!=0 → Interested（rand<2/3）;宝匣强制 FreeRoaming+inanimate', () => {
    // ★模块内 randFloat 是加载期捕获的 Math.random 引用——spy 无效,走 setFakeFishRandom 注入口
    setFakeFishRandom(() => 0.5);                   // Next(3)=floor(1.5)=1≠0 → Interested
    try {
      const f = new FakeFish();
      f.prepare(2455, 300, 500, 500);
      expect(f.stateId).toBe(1);                    // InterestedInBobber
      expect(f.inanimate).toBe(false);
      // rand<1/3 → Next(3)==floor(rand·3)==0 → FreeRoaming 支（2/3 概率 Interested）
      setFakeFishRandom(() => 0.2);
      const f2 = new FakeFish();
      f2.prepare(2455, 300, 500, 500);
      expect(f2.stateId).toBe(0);
      // 宝匣 2334（IsFishingCrate :1086）
      setFakeFishRandom(() => 0.5);
      const c = new FakeFish();
      c.prepare(2334, 300, 500, 500);
      expect(c.stateId).toBe(0);                    // 强制 FreeRoaming(:424-429)
      expect(c.inanimate).toBe(true);
      // 蛙腿 2423（FakeFishInanimate :1082）
      const g = new FakeFish();
      g.prepare(2423, 300, 500, 500);
      expect(g.inanimate).toBe(true);
    } finally {
      setFakeFishRandom(Math.random);
    }
  });

  it('链路 Interested→Latched→浮漂停咬解除回 FreeRoaming', () => {
    const st = new TileStore(64, 64);
    requestFakeFishSpawn(410, 410, 430, 430, 2455);
    const fish = eachFakeFish()[0];
    fish.lifeTotal = 100000;
    let ai1 = -120;                                 // 咬钩窗中
    const view: FakeFishLatchTarget = {
      get cx() { return 430; }, get cy() { return 430; }, active: true,
      projType: 360, retract: 0, get ai1() { return ai1; }, caughtVid: 0,
    };
    // 磁化吸附（TryToMagnetizeTo :79-91：80f 内 + 视线通 + 配型）→ Latched
    magnetFakeFish(st, view, 2455);
    expect(fish.stateId).toBe(2);                   // Latched
    // 停咬（ai[1]≥0 且 ai[0]==0 → RemoveLatch,:154-157）→ FreeRoaming。
    // ★两次步进：首次消耗 delayTime 迟启窗（Update :265-268）
    ai1 = 0;
    const host = makeHost(st);
    updateFakeFishSchool(host);
    updateFakeFishSchool(host);
    expect(fish.stateId).toBe(0);
  });

  /** 单鱼磁化辅助：对池中唯一鱼尝试配型磁化,返回其后 stateId */
  function magnetFakeFishOne(st: TileStore, view: FakeFishLatchTarget): number {
    const f = eachFakeFish()[0];
    magnetFakeFish(st, view, f.itemType);
    return f.stateId;
  }

  it('CheckLatch 收线路：caughtVid==本鱼种 → 自灭（:158-165 + Player.cs:53082）', () => {
    const st = new TileStore(64, 64);
    requestFakeFishSpawn(100, 100, 100, 108, 2455);
    const fish = eachFakeFish()[0];
    const view: FakeFishLatchTarget = {
      cx: fish.x + 5, cy: fish.y, active: true, projType: 360,
      retract: 1, ai1: 2455, caughtVid: 2455,
    };
    fish.tryToMagnetizeTo(st, view, 2455);
    expect(fish.stateId).toBe(2);                   // Latched
    releaseCaughtFakeFish(view, 2455);              // Bobber.reel 时点直驱补偿
    expect(fish.dead).toBe(true);
  });

  it('Jumping→落回 FreeRoaming（Update :283-295 重力积分+jumpTimeLeft 归零）', () => {
    const st = new TileStore(64, 64);
    const host = makeHost(st);
    const f = new FakeFish();
    f.lifeTotal = 100000;
    f.x = 500; f.y = 500;
    f.vy = -2;                                      // jumpTimeLeft = ⌊-2/-0.2⌋×2 = 20
    f.tryJumping();
    let seenRise = f.vy < 0;
    let ticks = 0;
    while (f.stateId === 3 && ticks < 200) {
      f.update(host);
      if (f.vy > 0) seenRise = true;                // 重力 0.2/t 反转下落
      ticks++;
    }
    expect(seenRise).toBe(true);
    expect(f.stateId).toBe(0);
    expect(ticks).toBeGreaterThanOrEqual(20);       // delayTime(0..10)+20t 飞行
  });

  it('声呐 Ping/PushAway 门（TryToBePinged/TryToPushAway :93-122）', () => {
    const st = new TileStore(128, 128);
    requestFakeFishSpawn(1000, 1000, 1000, 1008, 2455);
    const f = eachFakeFish()[0];
    f.lifeTotal = 100000;
    // Ping：80f 内点亮,配型 selected
    expect(f.tryToBePinged(st, f.x + 30, f.y, 2455)).toBe(true);
    expect(f.isSonarActive).toBe(true);
    expect(f.isSelectedSonar).toBe(true);
    // 他款鱼种 → 仍点亮但未选中(:119)
    expect(f.tryToBePinged(st, f.x + 30, f.y, 2456)).toBe(true);
    expect(f.isSelectedSonar).toBe(false);
    // 超 80f → 拒（CanHit 固定 80f,:130-134;allowedRange 死参）
    expect(f.tryToBePinged(st, f.x + 200, f.y, 2455)).toBe(false);
    // PushAway：同款豁免(:99)/跳跃态豁免(:95)
    expect(f.tryToPushAway(st, f.x + 10, f.y, 2455)).toBe(false);   // 同款
    f.vy = -2; f.tryJumping();
    expect(f.tryToPushAway(st, f.x + 10, f.y, 1234)).toBe(false);   // Jumping
  });

  it('视线阻断（CanHitLine）→ 磁化失败', () => {
    const st = new TileStore(128, 128);
    // 鱼与浮标之间立一堵实心墙（tile 1=实心）
    for (let y = 900; y < 1100; y++) st.setTile(32, Math.floor(y / 16), 1);
    requestFakeFishSpawn(20 * 16, 1000, 20 * 16, 1008, 2455);
    const f = eachFakeFish()[0];
    const view: FakeFishLatchTarget = {
      cx: 44 * 16, cy: 1000, active: true, projType: 360,
      retract: 0, ai1: -120, caughtVid: 0,
    };
    expect(f.tryToMagnetizeTo(st, view, 2455)).toBe(false);
    expect(f.stateId).not.toBe(2);
  });

  it('ItemID.Sets 锚：斜校例外={锯鲨2342}/静物={蛙腿2423}/宝匣表含木匣2334', () => {
    expect(receivesDiagonalCorrectionAsFakeFish(2455)).toBe(true);
    expect(receivesDiagonalCorrectionAsFakeFish(2342)).toBe(false);  // ItemID.cs:56
    expect(FAKE_FISH_INANIMATE.has(2423)).toBe(true);                // ItemID.cs:1082
    expect(IS_FISHING_CRATE.has(2334)).toBe(true);                   // ItemID.cs:1086
    expect(IS_FISHING_CRATE.has(4878)).toBe(true);
  });
});

// ==================== ③ 四液型 splash 音分支（DoStandardWaterSplash :190-261）====================

describe('四液型 splash 音/尘分支', () => {
  it('pitchOffset 表（微光 5 / 蜂蜜·岩浆·水 1,FakeFishParticle.cs:219/:233/:246/:259）', () => {
    expect(FISH_SPLASH_PITCH_OFFSET).toEqual({ shimmer: 5, honey: 1, lava: 1, water: 1 });
  });

  it('clamp 语义（LegacySoundPlayer.cs:1417）：微光档任意 variance 钳到 +1;水档 ∈[0.98,1]', () => {
    for (let k = 0; k < 50; k++) {
      const r = k / 50;
      expect(fishSplashPitch('shimmer', () => r)).toBe(1);         // 5±0.02 → clamp 1
      const water = fishSplashPitch('water', () => r);
      expect(water).toBeGreaterThanOrEqual(0.98);
      expect(water).toBeLessThanOrEqual(1);
    }
  });

  function pulseOnce(liquidType: number): { sfx: SfxCall[]; dusts: Array<{ type: number }> } {
    // 高度 ≥ 液行+40：Collision.WetCollision 扫描钳 maxTilesY-40(Collision.cs:1597/:1600)
    const st = new TileStore(64, 200);
    pool(st, 20, 30, 4, 4, liquidType);
    const sfx: SfxCall[] = [];
    const dusts: Array<{ type: number }> = [];
    const host = makeHost(st, sfx, dusts);
    const f = new FakeFish();                     // wasWet 初始 false → 入液沿必触发
    f.lifeTotal = 100000;
    f.x = 21 * 16 + 8; f.y = 31 * 16 + 8;         // 液格中心
    // 首个 update 消耗 delayTime 迟启窗（Update :265-268）,次 tick 才见液沿
    f.update(host);
    f.update(host);                               // flag(true)!≠wasWet(false) → EmitWaterPulse
    return { sfx, dusts };
  }

  it('水：fish_splash ×1,pitch∈[0.98,1],尘=dustWater() 缺省 33（Dust.cs:405-423）', () => {
    const { sfx, dusts } = pulseOnce(1);
    expect(sfx.length).toBe(1);                                   // 循环外一次(:259)
    expect(sfx[0].file).toBe('fish_splash');
    expect(sfx[0].pitch!).toBeGreaterThanOrEqual(0.98);
    expect(sfx[0].pitch!).toBeLessThanOrEqual(1);
    expect(dusts.length).toBe(10);
    expect(dusts.every((d) => d.type === 33)).toBe(true);
    expect(dustWaterFor(0)).toBe(33);
  });

  it('微光：循环【内】×10 播（:219 原版如此）,尘 308 微光尘', () => {
    const { sfx, dusts } = pulseOnce(4);
    expect(sfx.length).toBe(10);
    for (const c of sfx) {
      expect(c.file).toBe('fish_splash');
      expect(c.pitch!).toBe(1);                    // offset 5 clamp 后恒 +1
    }
    expect(dusts.every((d) => d.type === 308)).toBe(true);
  });

  it('蜂蜜 ×1 / 尘 152;岩浆 ×1 / 尘 35（alpha=100 noGravity 族）', () => {
    const honey = pulseOnce(3);
    expect(honey.sfx.length).toBe(1);
    expect(honey.dusts.every((d) => d.type === 152)).toBe(true);
    const lava = pulseOnce(2);
    expect(lava.sfx.length).toBe(1);
    expect(lava.dusts.every((d) => d.type === 35)).toBe(true);
  });

  it('dustWaterFor waterStyle 档位（Dust.cs:407-422 全表）', () => {
    expect(dustWaterFor(2)).toBe(98);
    expect(dustWaterFor(8)).toBe(104);
    expect(dustWaterFor(12)).toBe(288);
    expect(dustWaterFor(99)).toBe(33);             // 缺省档
  });
});

// ==================== 出液沿脉冲去重（Update :277-282）====================

describe('出入液沿触发', () => {
  it('持续湿身不再重复触发（flag==wasWet 短路）', () => {
    const st = new TileStore(64, 200);   // 同上:wetCollision 钳 h-40
    pool(st, 20, 30, 8, 8);
    const sfx: SfxCall[] = [];
    const host = makeHost(st, sfx);
    const f = new FakeFish();
    f.lifeTotal = 100000;
    f.x = 22 * 16 + 8; f.y = 32 * 16 + 8;
    f.update(host);                                // 迟启窗
    f.update(host);                                // 入液沿 → ×1
    expect(sfx.length).toBe(1);
    for (let i = 0; i < 30; i++) f.update(host);
    expect(sfx.length).toBe(1);                    // 无新沿→无新音
  });
});
// ==================== Bobber 集成（生成门经真实 fishingCheck 链路）====================

describe('Bobber.fishingCheck 生成门集成', () => {
  it('浮标渔情周期触发 SpawnFakeFishInWater：咬钩出现时池内必有装饰鱼;声呐联动不炸', async () => {
    const { Player } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    const { Bobber } = await import('../src/entities/Bobber');
    const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('../src/data/items');
    const { BuffType } = await import('../src/stats/Buffs');

    // 30 列 ×3 深水池 = 90 液格 ≥75（fishing-r7 makeHooks 同款）
    const store = new TileStore(200, 200);
    pool(store, 64, 95, 30, 3);
    const player = new Player(60 * 16, 90 * 16, new Inventory());
    player.inv.selected = 5;
    player.inv.slots[5] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2289]!]!, stack: 1 };
    player.buffs.apply(BuffType.Sonar, 60);        // 声呐药水 → 咬钩联动支
    const hooks = {
      world: {
        store,
        clock: { timeOfDay: 0.25 + 10000 / 54000 * 0.5, isDay: true, moonPhase: 2, bloodMoon: false, eclipse: false },
        weather: { raining: false, cloudAlpha: 0 },
        flags: {},
        scene: null,
      },
      player,
      enemies: () => [],
      critters: () => [],
      spawnDrop: () => null,
      damagePlayer: (): number => 0,
      addDamageNumber: () => {},
      cutTile: () => {},
      onEnemyKilled: () => {},
      spawnEnemy: () => {},
      spawnParticles: () => {},
      notifyInventoryChanged: () => {},
      playSfx: () => {},
      playSfxFiles: () => {},
      showPickupLabel: () => {},
    } as never;

    const b = new Bobber(player.cx, player.y - 10, 6, -4, 50, 0, 50, () => player);
    let landed = false;
    for (let k = 0; k < 300; k++) { b.fixedUpdate(1, hooks); if (b.floating) { landed = true; break; } }
    expect(landed).toBe(true);
    // 生成门先于咬钩掷骰且独立——首查即可出鱼而咬钩掷空拍（rand(100)>(力+75)/2）,
    // 故双条件都等到再断言（渔情周期每轮都会补鱼）
    let sawFish = false;
    let bit = false;
    for (let k = 0; k < 8000 && !(sawFish && bit); k++) {
      b.fixedUpdate(1, hooks);
      if (fakeFishCount() > 0) sawFish = true;
      if (b.biteT > 0) bit = true;
    }
    expect(sawFish).toBe(true);                    // 渔情周期必出装饰鱼（:20709）
    expect(bit || b.biteT > 0).toBe(true);
  });
});
