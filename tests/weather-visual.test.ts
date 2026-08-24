// 天气视觉测试：雨云/风暴云选型链 + 稀有云 22-40 + AmbientSky 选族纯函数（全 17 族）+
// 月塔天空激活门 + 雨点涟漪池 + 天气环境音循环。
// 标杆 Terarria1456：Cloud.cs addCloud :114-146/RollRareCloud :183-227 /
// AmbientSky.cs FadingSkyEntity 家族 / AmbienceServer.cs :30-133 /
// SceneState.cs :105-115（月塔门）/ SceneMetrics.cs :276-282/921-928（WithinRangeOfNPC）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  pickCloudType, rollRareCloud, pickAmbientFamily, towerSkyActive, moonLordSkyIntensity,
  AMBIENT_FAMILY_PARAMS, AMBIENT_GROUP_SPEC,
  type AmbientSpawnInput, type RareCloudFlags,
} from '../src/render/SkyRenderer';
import { WeatherState, type WeatherCtx, type WeatherLoopVolumes } from '../src/world/weather/Weather';
import { Sfx, LOOP_BASE_VOL } from '../src/core/Sfx';

// ---------- 工具：可控掷点序列（对齐 C# rand.Next 语义） ----------
function seqRnd(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}
const always = (v: number) => () => v;

const cloudBase = {
  scale: 0.9, y: -100, viewH: 1080,
  numClouds: 100, cloudAlpha: 0, cloudBGActive: 0,
};

describe('云选型链（Cloud.cs:114-138 五族）', () => {
  it('下雨（cloudAlpha>0 且 3/4 掷中）→ 风暴云 18-21', () => {
    // 掷序：type 基值 Next(4)=0.x → 0；雨门 Next(4)!=0 → 0.5 命中（≠0 成立）→ 进风暴支；
    // 再掷 Next(18,22)=0.0 → type 18
    const pick = pickCloudType({ ...cloudBase, cloudAlpha: 0.5, rnd: seqRnd([0.1, 0.5, 0.0]) });
    expect(pick.type).toBeGreaterThanOrEqual(18);
    expect(pick.type).toBeLessThanOrEqual(21);
    expect(pick.stormShift).toBe(0);   // scale 0.9 < 1 → 不上移
  });

  it('阴天（cloudBGActive≥1 且 1/2 掷中）也走风暴云；scale≥1 两档上移共 300', () => {
    // 掷序：基值 Next(4)=0.0 → 0；阴天门 Next(2)==0 → 0.0 命中；Next(18,22)=0.99 → 21
    const pick = pickCloudType({
      ...cloudBase, scale: 1.2, cloudAlpha: 0, cloudBGActive: 1, rnd: seqRnd([0.0, 0.0, 0.99]),
    });
    expect(pick.type).toBe(21);
    expect(pick.stormShift).toBe(300);   // 1.2≥1.15 → 150；1.2≥1 → 150
  });

  it('晴天高空小云 + 云量≤80 → 远空灰云 9-13（雨来时被 kill 的那族）', () => {
    const pick = pickCloudType({
      ...cloudBase, scale: 0.8, y: -300, numClouds: 40, rnd: seqRnd([0.1, 0.3]),
    });
    // y=-300 < -0.15*1080=-162 且 numClouds=40≤80 → 9+floor(0.3*5)=10
    expect(pick.type).toBeGreaterThanOrEqual(9);
    expect(pick.type).toBeLessThanOrEqual(13);
    expect(pick.stormShift).toBe(0);
  });

  it('阴天高空（风暴门 1/2 未中 → scale<1.15 且 y<-0.3H）→ 高层薄云 4-8', () => {
    // 掷序：基值 0.1 → 0；阴天门 Next(2)=floor(0.9*2)=1 未中 → 落 else-if 链；
    // y=-400 < -324 且 cloudBGActive≥1 → 4+floor(0.4*5)=6
    const pick = pickCloudType({
      ...cloudBase, scale: 1.0, y: -400, cloudBGActive: 1, rnd: seqRnd([0.1, 0.9, 0.4]),
    });
    expect(pick.type).toBeGreaterThanOrEqual(4);
    expect(pick.type).toBeLessThanOrEqual(8);
    expect(pick.stormShift).toBe(0);
  });

  it('晴天低空（y>-0.15H）且 1/2 掷中且云量>20 → 低空白云 14-17', () => {
    const pick = pickCloudType({
      ...cloudBase, scale: 1.2, y: 100, numClouds: 60, rnd: seqRnd([0.1, 0.0, 0.3]),
    });
    // 前两支不满足（cloudAlpha=0/阴天=0、第二支 y>-162 但 scale≥1 且 numClouds>80 不成立）
    // → 低空支：Next(2)==0 → 0.0 命中 → Next(14,18)=0.3 → 14+1=15
    expect(pick.type).toBeGreaterThanOrEqual(14);
    expect(pick.type).toBeLessThanOrEqual(17);
  });

  it('全部掷空 → 缺省常态云 0-3', () => {
    const pick = pickCloudType({ ...cloudBase, scale: 1.2, y: 100, numClouds: 10, rnd: always(0.9) });
    expect(pick.type).toBe(3);   // Next(4)=floor(0.9*4)=3，各后续掷不命中
    expect(pick.stormShift).toBe(0);
  });

  it('雨中大概率出风暴云（分布抽样：1000 次里 ≥700 次 18-21）', () => {
    let storm = 0;
    for (let i = 0; i < 1000; i++) {
      const pick = pickCloudType({ ...cloudBase, cloudAlpha: 0.8, rnd: Math.random });
      if (pick.type >= 18 && pick.type <= 21) storm++;
    }
    // 原版雨门 = rand.Next(4)!=0 → 3/4 = 75%
    expect(storm).toBeGreaterThanOrEqual(700);
    expect(storm).toBeLessThanOrEqual(800);
  });
});

describe('AmbientSky 选族纯函数（AmbienceServer.cs:30-133，全 17 族表）', () => {
  const base: AmbientSpawnInput = {
    dayTime: true, raining: false, eclipse: false,
    bloodMoon: false, pumpkinMoon: false, snowMoon: false,
    zoneHallow: false, playerAtSkyHeight: true,
    roll5: 4, pick: 0,
  };
  it('晴天白天 → 族序首个 = 鸟群（注册序 :60 BirdsV 在最前）', () => {
    expect(pickAmbientFamily(base)).toBe('birds');
  });
  it('平静夜 + 神圣带 + roll5≥3 → 严格列表 [小精灵, 腹足怪]，pick 0 取小精灵（:69/:78 在 :72/:80 前）', () => {
    // 全族表下 PixiePosse（IsCalmNight||IsSunnyDay + ZoneHallow 次级）先于 Gastropods 注册
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneHallow: true, roll5: 3 })).toBe('pixieposse');
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneHallow: true, roll5: 3, pick: 0.999 })).toBe('gastropod');
  });
  it('平静夜 + 非神圣 + roll5<3 → 放宽列表首项 = 眼球（Eyeball :64 仅需 !dayTime）', () => {
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneHallow: false, roll5: 2 })).toBe('eyeball');
  });
  it('平静夜 + 非神圣 + roll5≥3 → 严格列表空 → 回落放宽列表（:119）', () => {
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneHallow: false, roll5: 4 })).toBe('eyeball');
  });
  it('雨天 / 夜晚(鸟群) / 日食 → 各日间族失格', () => {
    expect(pickAmbientFamily({ ...base, raining: true })).toBeNull();       // 地狱门也关 → 无候选
    expect(pickAmbientFamily({ ...base, dayTime: false })).toBe('eyeball'); // 夜仍有眼球族
    expect(pickAmbientFamily({ ...base, eclipse: true })).toBeNull();
  });
  it('血月/南瓜月/霜月 → 平静夜不成立，夜空只剩 Eyeball（条件仅 !dayTime :64）', () => {
    expect(pickAmbientFamily({ ...base, dayTime: false, bloodMoon: true, zoneHallow: true, roll5: 4 })).toBe('eyeball');
    expect(pickAmbientFamily({ ...base, dayTime: false, pumpkinMoon: true, roll5: 4 })).toBe('eyeball');
    expect(pickAmbientFamily({ ...base, dayTime: false, snowMoon: true, roll5: 4 })).toBe('eyeball');
  });
  it('玩家低于天空高度带（surface*16+1600）→ 不出天空装饰（:190-193）；地狱高度带例外', () => {
    expect(pickAmbientFamily({ ...base, playerAtSkyHeight: false })).toBeNull();
    // 地狱高度带：天空门关但地狱门开 → 仅 Hellbats（:76 条件恒真 + :89-91 高度分流）
    expect(pickAmbientFamily({ ...base, playerAtSkyHeight: false, playerAtHellHeight: true })).toBe('hellbats');
  });
  it('月总在场 → 全族禁出（AnActiveSkyConflictsWithAmbience :1362-1369/:1383）', () => {
    expect(pickAmbientFamily({ ...base, moonLordActive: true })).toBeNull();
  });

  // ---- 全族门（新增批：每族主条件 1:1） ----
  it('Wyvern 需晴天+困难模式（:61）；困难前不出', () => {
    const sunny = { ...base, hardMode: false, pick: 0 };
    // 晴天放宽列表首个仍是 birds——用沙漠次级条件把 wyvern 排到严格列表单选验证
    expect(pickAmbientFamily({ ...sunny, zoneDesert: true, zoneHallow: true })).toBe('vulture');
    // hardMode 打开后 wyvern 仍在候选（不报错），且空中单选集包含它
    const pool = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const f = pickAmbientFamily({ ...base, hardMode: true, roll5: 2, pick: i / 200 });
      if (f) pool.add(f);
    }
    expect(pool.has('wyvern')).toBe(true);
    const poolNoHm = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const f = pickAmbientFamily({ ...base, hardMode: false, roll5: 2, pick: i / 200 });
      if (f) poolNoHm.add(f);
    }
    expect(poolNoHm.has('wyvern')).toBe(false);
  });
  it('风日门：Airship/LostKite/SlimeBalloons 要风、AirBalloon/Butterflies 要无风（:62-66/:71）', () => {
    const pool = (o: Partial<AmbientSpawnInput>) => {
      const s = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const f = pickAmbientFamily({ ...base, ...o, roll5: 2, pick: i / 300 });
        if (f) s.add(f);
      }
      return s;
    };
    const windy = pool({ windyDay: true });
    const calm = pool({ windyDay: false });
    expect(windy.has('airship') && windy.has('lostkite') && windy.has('slimeBalloons')).toBe(true);
    expect(windy.has('airballoon')).toBe(false);
    expect(calm.has('airballoon')).toBe(true);
    expect(calm.has('airship') && calm.has('lostkite')).toBe(false);
    // Butterflies 还需 butterflyChanceLow（NPC.cs:94583-94599 默认关）
    expect(calm.has('butterflies')).toBe(false);
    expect(pool({ windyDay: false, butterflyChanceLow: true }).has('butterflies')).toBe(true);
    // TooWindyForButterflies（|windTarget|≥0.4）压制蝶群
    expect(pool({ windyDay: false, butterflyChanceLow: true, tooWindyForButterflies: true }).has('butterflies')).toBe(false);
  });
  it('Bats：黄昏支需 IsSunset（:39-46/:68）+ 丛林次级门（:84）', () => {
    // 白天非黄昏 + 无风 + 丛林：bats 不在候选（sunset=false 时仅 calmNight 支，白天不成立）
    const dayPool = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const f = pickAmbientFamily({ ...base, windyDay: false, zoneJungle: true, roll5: 2, pick: i / 200 });
      if (f) dayPool.add(f);
    }
    expect(dayPool.has('bats')).toBe(false);
    // 黄昏 + 丛林：严格列表单选 = bats
    expect(pickAmbientFamily({ ...base, sunset: true, zoneJungle: true, roll5: 4 })).toBe('bats');
    // 平静夜 + 丛林：严格列表单选 = bats
    expect(pickAmbientFamily({ ...base, dayTime: false, zoneJungle: true, roll5: 4 })).toBe('bats');
  });
  it('沙漠/海滩/腐化/猩红次级门：Vulture/Seagulls/EOS/Crimera 严格单选（:77-83）', () => {
    expect(pickAmbientFamily({ ...base, zoneDesert: true, roll5: 4 })).toBe('vulture');
    expect(pickAmbientFamily({ ...base, zoneBeach: true, roll5: 4 })).toBe('seagulls');
    expect(pickAmbientFamily({ ...base, zoneCorrupt: true, roll5: 4 })).toBe('eos');
    expect(pickAmbientFamily({ ...base, zoneCrimson: true, roll5: 4 })).toBe('crimera');
  });
  it('Hellbats 恒候选（:76）但走地狱高度门（:87-93）', () => {
    expect(pickAmbientFamily({ ...base, playerAtSkyHeight: true, playerAtHellHeight: false, roll5: 2, pick: 0.999 })).not.toBe('hellbats');
    const hell = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const f = pickAmbientFamily({ ...base, playerAtHellHeight: true, roll5: 2, pick: i / 100 });
      if (f) hell.add(f);
    }
    expect(hell.has('hellbats')).toBe(true);
  });

  // ---- 族参数表对账（AMBIENT_FAMILY_PARAMS/AMBIENT_GROUP_SPEC 关键数值） ----
  it('族参数：鸟群 4 帧 FramingSpeed 5；腹足怪 1 帧 int.Max；风筝 42 帧风暴提速 4', () => {
    expect(AMBIENT_FAMILY_PARAMS.birds.rows).toBe(4);
    expect(AMBIENT_FAMILY_PARAMS.birds.framingSpeed).toBe(5);
    expect(AMBIENT_FAMILY_PARAMS.birds.life).toEqual([60, 121]);
    expect(AMBIENT_FAMILY_PARAMS.birds.speedA).toBeCloseTo(3, 5);
    expect(AMBIENT_FAMILY_PARAMS.birds.speedB).toBeCloseTo(0.8, 5);
    expect(AMBIENT_FAMILY_PARAMS.gastropod.rows).toBe(1);
    expect(AMBIENT_FAMILY_PARAMS.gastropod.framingSpeed).toBe(0);       // 0 = int.MaxValue
    expect(AMBIENT_FAMILY_PARAMS.gastropod.brightness).toBeCloseTo(0.75, 5);  // Colors.cs:39 自发光
    expect(AMBIENT_FAMILY_PARAMS.lostkite.rows).toBe(42);
    expect(AMBIENT_FAMILY_PARAMS.lostkite.framingSpeed).toBe(6);
    // EOCSkyEntity 族：深度 4.5-7.5（:1243）→ EOS/Crimera 贴图三档分界 >6/≤6/≤5
    expect(AMBIENT_FAMILY_PARAMS.eyeball.depthMin).toBeCloseTo(4.5, 5);
    expect(AMBIENT_FAMILY_PARAMS.eyeball.eoc).toBe(true);
    expect(AMBIENT_FAMILY_PARAMS.crimera.eoc).toBe(true);
    // PixiePosse/Seagulls 的 depthScale 偏移（:440/:561）
    expect(AMBIENT_FAMILY_PARAMS.pixieposse.depthScaleAdj).toBeCloseTo(-0.1, 5);
    expect(AMBIENT_FAMILY_PARAMS.seagulls.depthScaleAdj).toBeCloseTo(-1.5, 5);
    // SlimeBalloons 固定纵速（:751）
    expect(AMBIENT_FAMILY_PARAMS.slimeBalloons.vy).toBeCloseTo(-0.01, 5);
    // Airship/AirBalloon spriteDir 与风无关（:1087/:1134）
    expect(AMBIENT_FAMILY_PARAMS.airship.randomDir).toBe(true);
    expect(AMBIENT_FAMILY_PARAMS.airballoon.randomDir).toBe(true);
  });
  it('群体族参数：数量/磁吸目标/散布（CreateGroup 各族 1:1）', () => {
    expect(AMBIENT_GROUP_SPEC.seagulls?.count).toEqual([5, 9]);
    expect(AMBIENT_GROUP_SPEC.gastropod?.count).toEqual([3, 8]);
    expect(AMBIENT_GROUP_SPEC.slimeBalloons?.count).toEqual([5, 10]);
    expect(AMBIENT_GROUP_SPEC.bats?.count).toEqual([20, 40]);
    expect(AMBIENT_GROUP_SPEC.hellbats?.count).toEqual([20, 40]);
    expect(AMBIENT_GROUP_SPEC.gastropod?.target).toBe(120);        // :692
    expect(AMBIENT_GROUP_SPEC.slimeBalloons?.target).toBe(150);    // :791
    expect(AMBIENT_GROUP_SPEC.seagulls?.spread).toBe(50);          // :590
    expect(AMBIENT_GROUP_SPEC.gastropod?.spread).toBe(60);         // :697
    expect(AMBIENT_GROUP_SPEC.slimeBalloons?.spread).toBe(80);     // :796
    // 群族基础寿命 = Next(30,61)*60（:583/:690/:1008）——SlimeBalloons 例外 80-120（:789）
    expect(AMBIENT_GROUP_SPEC.bats?.baseLife).toEqual([30, 61]);
    expect(AMBIENT_GROUP_SPEC.hellbats?.baseLife).toEqual([30, 61]);
    expect(AMBIENT_GROUP_SPEC.slimeBalloons?.baseLife).toEqual([80, 121]);
    // 单体族不在群体表
    expect(AMBIENT_GROUP_SPEC.birds).toBeUndefined();
    expect(AMBIENT_GROUP_SPEC.wyvern).toBeUndefined();
  });
});

// ---------- 稀有云 22-40（Cloud.cs RollRareCloud :183-227） ----------
const rareFlags = (over: Partial<RareCloudFlags> = {}): RareCloudFlags => ({
  downedBoss1: false, downedBoss2: false, downedBoss3: false,
  hardMode: false, crimson: false, dontStarveWorld: false, tenthAnniversaryWorld: false,
  ...over,
});

describe('稀有云 RollRareCloud（1457 Cloud.cs:184-232，掷点走 CloudID.Sets 池表）', () => {
  it('无门类型 22-24/27/29/32-34 恒可出（default 直通）', () => {
    // 固定掷点：pool[floor(0.00*20)]=22（default 接受）
    expect(rollRareCloud(rareFlags(), () => 0)).toBe(22);
    expect(rollRareCloud(rareFlags(), () => 0.999)).toBe(41);   // pool[19]=41 精灵云：hardMode 门未过 → 重掷至守卫退出返回 41
  });
  it('克眼云 25/26 需 downedBoss1（:201-204）；未杀时重掷到无门类型', () => {
    let call = 0;
    const alt = () => (call++ % 2 === 0 ? 3 / 20 : 0.55);   // 25（门未过）→ 重掷 pool[11]=33（default 直通）
    expect(rollRareCloud(rareFlags({ downedBoss1: false }), alt)).toBe(33);
    expect(rollRareCloud(rareFlags({ downedBoss1: true }), () => 3 / 20)).toBe(25);
  });
  it('骷髅云 31 需 downedBoss3（:195-197）', () => {
    const r = () => 9 / 20;   // pool[9]=31
    expect(rollRareCloud(rareFlags({ downedBoss3: false }), r)).toBe(31);   // 守卫退出返回末值
    expect(rollRareCloud(rareFlags({ downedBoss3: true }), r)).toBe(31);
  });
  it('克脑云 36 需 downedBoss2 且猩红世界（:198-200）', () => {
    const r = () => 14 / 20;  // pool[14]=36
    expect(rollRareCloud(rareFlags({ downedBoss2: true, crimson: false }), r)).toBe(36);
    expect(rollRareCloud(rareFlags({ downedBoss2: true, crimson: true }), r)).toBe(36);
  });
  it('困难模式云 30/35 需 hardMode（:205-208）', () => {
    expect(rollRareCloud(rareFlags({ hardMode: true }), () => 8 / 20)).toBe(30);   // pool[8]=30
    expect(rollRareCloud(rareFlags({ hardMode: true }), () => 13 / 20)).toBe(35); // pool[13]=35
  });
  it('精灵云 41 需 hardMode（1457 :208-210 新增 case）', () => {
    const r = () => 19 / 20;  // pool[19]=41
    expect(rollRareCloud(rareFlags({ hardMode: false }), r)).toBe(41);   // 门未过 → 守卫退出返回末值
    expect(rollRareCloud(rareFlags({ hardMode: true }), r)).toBe(41);
  });
  it('Redigit 云 28 1/10（:211-216）；饥荒云 37-40 需饥荒世界或 1/10（:217-225）', () => {
    // 28：掷 r=6/20 → pool[6]=28；第二掷（1/10 门）0.0 → 命中
    let c = 0;
    const seq = () => (c++ === 0 ? 6 / 20 : 0);
    expect(rollRareCloud(rareFlags(), seq)).toBe(28);
    c = 0;
    const seqMiss = () => (c++ === 0 ? 6 / 20 : 0.5);   // 1/10 门未中 → 重掷
    expect(rollRareCloud(rareFlags(), seqMiss)).toBe(32);  // 重掷 pool[10]=32（default 直通）
    expect(rollRareCloud(rareFlags({ dontStarveWorld: true }), () => 17 / 20)).toBe(39);  // 饥荒直通 pool[17]=39
  });
  it('十周年世界：池收窄 RareClouds_Celebration（22-36+41）——37-40 不可达', () => {
    const out = new Set<number>();
    for (let i = 0; i < 2000; i++) out.add(rollRareCloud(rareFlags({ tenthAnniversaryWorld: true }), Math.random));
    expect(Math.max(...out)).toBeLessThanOrEqual(36);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(22);
    expect(out.has(37) || out.has(38) || out.has(39) || out.has(40)).toBe(false);
  });
  it('旗标全开后全类型 22-41 可达（分布抽样）', () => {
    const out = new Set<number>();
    const f = rareFlags({ downedBoss1: true, downedBoss2: true, downedBoss3: true, hardMode: true, crimson: true });
    for (let i = 0; i < 20000; i++) out.add(rollRareCloud(f, Math.random));
    expect(out.size).toBe(20);   // 22..41 全覆盖（1457 池表含 41 Rare_Pixie）
  });
});

// ---------- 月塔天空激活门（SceneState.cs:105-115 + SceneMetrics.cs:921-928） ----------
describe('月塔天空激活门 towerSkyActive', () => {  it('塔近距门：距离²≤4000² 即激活（NPCEventZoneRadius）', () => {
    expect(towerSkyActive(true, -1, 1, true)).toBe(true);    // 近塔
    expect(towerSkyActive(false, -1, 1, false)).toBe(false); // 远离且无器件
  });
  it('器件门：无任何塔近距且 ActiveMonolithType 对应 → 激活（:111-115 !flag4）', () => {
    expect(towerSkyActive(false, 1, 1, false)).toBe(true);   // 星云柱 type 1
    expect(towerSkyActive(false, 3, 1, false)).toBe(false);  // 耀斑柱 type 3 ≠ 星云
    expect(towerSkyActive(false, 1, 1, true)).toBe(false);   // 任一塔近距（flag4）→ 器件门关闭
  });
  it('MonolithType 映射：0 星璇/1 星云/2 星尘/3 耀斑（SceneState.cs:111-115）；4=月总柱不配对任何族', () => {
    expect(towerSkyActive(false, 0, 0, false)).toBe(true);
    expect(towerSkyActive(false, 2, 2, false)).toBe(true);
    expect(towerSkyActive(false, 3, 3, false)).toBe(true);
    // familyIndex 只有 0-3（渲染侧只对四族求值）——月总柱 type 4 与任何族都不相等
    for (let idx = 0; idx < 4; idx++) expect(towerSkyActive(false, 4, idx, false)).toBe(false);
  });
});

// ---------- 月总天空渐暗强度（MoonLordSky + SceneMetrics.cs:297-305） ----------
describe('月总天空渐暗 moonLordSkyIntensity', () => {
  it('贴身 3000px 内全黑幕；6000px 外归零（SmoothStep 钳位线性）', () => {
    expect(moonLordSkyIntensity(0)).toBe(1);
    expect(moonLordSkyIntensity(3000)).toBe(1);
    expect(moonLordSkyIntensity(4500)).toBeCloseTo(0.5, 5);
    expect(moonLordSkyIntensity(6000)).toBe(0);
    expect(moonLordSkyIntensity(9000)).toBe(0);
  });
});

// （雨点涟漪池已随自创椭圆环系统退役 2026-08-14——原版雨落水只有 Rain.Update 的
//  splash 尘(Rain.cs:120-133),WeatherRenderer 1:1;环状涟漪=自创近似+双画,已删）

// ---------- 天气环境音循环（Weather 状态机 + SceneState.cs 双轨语义） ----------
const wctx = (over: Partial<WeatherCtx> = {}): WeatherCtx => ({
  dayRate: 1,
  dayTime: true,
  dayTimeTicks: 10000,
  playerStrongEnough: true,
  playerReadyForKingSlime: true,
  expertMode: false,
  atmo: 1,
  aboveRockLayer: true,
  graveyardIntensity: 0,
  hardMode: false,
  noOtherEvent: true,
  downedSlimeKing: false,
  maxTilesX: 4200,
  worldSurface: 300,
  viewCenterY: 3000,
  ...over,
});

describe('天气环境音循环（Weather.updateAmbienceLoops）', () => {
  it('雨 cue28 音量 = min(1,(cloudAlpha×10/9×0.5+0.5)×(1-shimmer))×atmo⁴（Main.cs case28 :11702-11706）', () => {
    const w = new WeatherState(7);
    w.startRain(true, 0.6);   // instant：cloudAlpha = maxRaining
    const v: WeatherLoopVolumes = w.loopVolumes(1);
    // num11 = min(1, 0.6×(10/9)×0.5+0.5)×1⁴ = min(1, 0.8333…) = 0.8333…（基线 0.5 为原版真态）
    expect(v.rain).toBeCloseTo(0.6 * (10 / 9) * 0.5 + 0.5, 5);
    expect(v.rainGate).toBe(true);   // 门位透传（setRain 第二参）
    // 地表门关（ZoneRain&&!ZoneSnow 假，Main.cs:11713——地下 ZoneRain 恒假）→ 0
    expect(w.loopVolumes(1, false).rain).toBe(0);
    expect(w.loopVolumes(1, false).rainGate).toBe(false);
    // atmo⁴ 深度衰减：atmo=0.5 → ×0.0625
    expect(w.loopVolumes(0.5).rain).toBeCloseTo((0.6 * (10 / 9) * 0.5 + 0.5) * 0.5 ** 4, 5);
    // shimmer 抑制项乘在 clamp 前（:11703-11705）：高雨强裸值超 1 时次序可见
    w.changeRain(true, 1.0);   // cloudAlpha=1 → base=10/9×0.5+0.5=1.0556 裸值超 1
    expect(w.loopVolumes(1, true, 0).rain).toBeCloseTo(1, 5);                                  // 无微光：clamp 到 1
    expect(w.loopVolumes(1, true, 0.2).rain).toBeCloseTo((10 / 9 * 0.5 + 0.5) * 0.8, 5);       // ×0.8 后 <1 不再钳
    expect(v.blizzardStrong).toBe(0);   // 非雪原带
    expect(v.blizzardInside).toBe(0);
    expect(v.sandstorm).toBe(0);
  });

  it('雨 cue28 地下门：ctx.zoneRain=false → onAmbience 下发 rain=0（SurfaceAtmospherics 门）', () => {
    const w = new WeatherState(19);
    w.startRain(true, 0.6);
    const seen: WeatherLoopVolumes[] = [];
    for (let i = 0; i < 5; i++) w.update(wctx({ zoneRain: false, zoneSnow: false, onAmbience: (v) => seen.push(v) }));
    expect(seen[seen.length - 1].rain).toBe(0);          // 地下：门假
    for (let i = 0; i < 5; i++) w.update(wctx({ zoneRain: true, zoneSnow: false, onAmbience: (v) => seen.push(v) }));
    expect(seen[seen.length - 1].rain).toBeGreaterThan(0.5);   // 地表：n28 ≥ 0.5 基线
  });

  it('暴风雪双轨：blizzardSoundVolume 0.01/tick 渐入（SceneState.cs:252）；室内/室外互切', () => {
    const w = new WeatherState(11);
    w.startRain(true, 0.8);
    const seen: WeatherLoopVolumes[] = [];
    const c = wctx({ zoneSnow: true, onAmbience: (v) => seen.push(v) });
    for (let i = 0; i < 100; i++) w.update(c);   // 100 帧 → 音量 1.0
    expect(w.blizzardSoundVolume).toBeCloseTo(1, 5);
    // 室外：num13 = min(1, 0.8*2)=1 → strong=1、inside=0（SceneState.cs:253/:276）
    expect(seen[seen.length - 1].blizzardStrong).toBeCloseTo(1, 5);
    expect(seen[seen.length - 1].blizzardInside).toBeCloseTo(0, 5);
    // 进屋（BehindBackwall）：室外强度 0.005/tick 逼近 -0.1 → 钳 0 → strong 归零
    const cIn = wctx({ zoneSnow: true, behindBackwall: true });
    for (let i = 0; i < 300; i++) w.update(cIn);
    const vIn = w.loopVolumes(1);
    expect(vIn.blizzardStrong).toBeCloseTo(0, 5);
    expect(vIn.blizzardInside).toBeGreaterThan(0.5);   // 掩蔽轨接管
    expect(w.outsideWeatherEffect).toBe(0);
  });

  it('非雪原带下雨 → 暴风雪轨不启', () => {
    const w = new WeatherState(13);
    w.startRain(true, 0.8);
    for (let i = 0; i < 200; i++) w.update(wctx({ zoneSnow: false }));
    expect(w.blizzardSoundVolume).toBe(0);
    expect(w.loopVolumes(1).blizzardStrong).toBe(0);
  });

  it('雨停 → blizzardSoundVolume 渐出归零；onAmbience 每帧下发', () => {
    const w = new WeatherState(17);
    w.startRain(true, 0.7);
    let calls = 0;
    const c = wctx({ zoneSnow: true, onAmbience: () => calls++ });
    for (let i = 0; i < 100; i++) w.update(c);
    w.stopRain();
    for (let i = 0; i < 200; i++) w.update(c);
    expect(w.blizzardSoundVolume).toBe(0);
    expect(calls).toBe(300);
  });
});

// ---------- Sfx 循环轨 API（AudioContext mock） ----------
class FakeGain {
  gain = { value: 0, setTargetAtTime: vi.fn() };
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}
class FakeSrc {
  buffer: unknown = null;
  loop = false;
  connect = vi.fn(() => this);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeCtx {
  /** 记录每次 new（Sfx.ensure 内部 new AC()）——测试从末位取实例 */
  static instances: FakeCtx[] = [];
  currentTime = 0;
  state = 'running';
  destination = {};
  resume = vi.fn(() => Promise.resolve());
  createGain = vi.fn(() => new FakeGain());
  createBufferSource = vi.fn(() => new FakeSrc());
  decodeAudioData = vi.fn(async () => ({ fake: 'buffer' }) as unknown as AudioBuffer);
  constructor() { FakeCtx.instances.push(this); }
}

describe('Sfx.playLoop 循环轨 API', () => {
  const windowBackup = (globalThis as { window?: unknown }).window;
  const fetchBackup = (globalThis as { fetch?: unknown }).fetch;
  beforeEach(() => {
    FakeCtx.instances = [];
    (globalThis as { window?: unknown }).window = { AudioContext: FakeCtx as unknown as typeof AudioContext };
    (globalThis as { fetch?: unknown }).fetch = vi.fn(async () =>
      ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response);
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = windowBackup;
    (globalThis as { fetch?: unknown }).fetch = fetchBackup;
  });

  it('缺素材轨（sandstormWind）→ null，不触音频', () => {
    const sfx = new Sfx();
    expect(sfx.playLoop('sandstormWind', 0.3)).toBeNull();
  });

  it('blizzardStrong：句柄起振/音量跟随/停止；基础音量 0.5 生效', async () => {
    const sfx = new Sfx();
    sfx.master = 1;
    const h = sfx.playLoop('blizzardStrong', 0.6);
    expect(h).not.toBeNull();
    expect(h!.playing).toBe(false);   // 缓冲在途
    // 等 fetch → arrayBuffer → decodeAudioData 微任务链
    await new Promise((r) => setTimeout(r, 20));
    expect(h!.playing).toBe(true);
    expect(h!.dead).toBe(false);   // 解码在途/已起振都非终态——调用方勿重建
    const fake = FakeCtx.instances[FakeCtx.instances.length - 1];
    const gain = fake.createGain.mock.results[0].value as FakeGain;
    const src = fake.createBufferSource.mock.results[0].value as FakeSrc;
    expect(src.loop).toBe(true);
    expect(src.start).toHaveBeenCalled();
    // 基础音量（SoundID.cs:821 WithVolume(0.5)）× 0.6
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.6 * LOOP_BASE_VOL.blizzardStrong, 0, 0.2);
    h!.setVolume(1);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(LOOP_BASE_VOL.blizzardStrong, 0, 0.2);
    h!.stop();
    expect(h!.playing).toBe(false);
    expect(h!.dead).toBe(true);    // 终态——可丢弃重建
    expect(src.stop).toHaveBeenCalled();
    // 幂等 stop
    h!.stop();
    expect(src.stop).toHaveBeenCalledTimes(1);
  });

  it('缓冲加载失败 → dead=true（可重建，不泄漏）', async () => {
    (globalThis as { fetch?: unknown }).fetch = vi.fn(async () =>
      ({ ok: false }) as unknown as Response);
    const sfx = new Sfx();
    const h = sfx.playLoop('blizzardInside', 0.5);
    expect(h).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(h!.playing).toBe(false);
    expect(h!.dead).toBe(true);
  });

  it('playWav 对缺素材轨安全短路（空映射）', () => {
    const sfx = new Sfx();
    expect(sfx.playWav('sandstormWind', 1)).toBe(false);
  });
});
