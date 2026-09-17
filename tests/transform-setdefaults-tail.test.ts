// ★BJ101（2026-09-16）Transform 缺 SetDefaults 尾链清偿守卫。
// 病灶：tryTransformTo（Enemy.ts，= 原版 Transform NPC.cs:81909-81970 移植面）旧实现
//   全取【基表】值——盒 Math.round 无种子档二盒、maxHp=v.lifeMax（基）、damage/defense
//   基值、kb/value 残留旧型、HP 结转 = 新【基】/旧【缩】且 Math.round——而原版
//   Transform → SetDefaults(newType)（:81921）是【全链】重跑：
//     remix 主体块（:8775+ 逐型）→ 首盒 (int) 截断（:17842-17843）→ defDamage 快照
//     （:17846-17848）→ zenith（:17871-17874，只改 lifeMax :17967）→
//     getGood（:17875-17878：13 ×1.35+def+2 / 14,15 ×1.4+def+2；二盒 :18122-18123）→
//     十周年（:17879-17882：列族 ×0.5 :17900-17950；二盒 :17958-17959 恒乘）→
//     ScaleStats（:17888，活体 Main.Difficulty+玩家数门 :18180）→ life=lifeMax（:17889）
//     → HP 结转 life = num2 * lifeMax / num3（:81931，C# int 乘除截断；≤0 钳 1 :81933）。
//   实害（F 刀立案+红蓝双确认）：FTW EoW 14→13/15 晋升盒 38 vs 原版 51/53+def+2、
//   十周年 19 vs 38、专家/大师世界一切变身敌怪（195→196 宁芙 / 348→349 胡桃夹子 /
//   158⇄159 吸血鬼 / 230⇄55 金鱼 / 微光 3→21 等）lifeMax/damage/defense/kb/value
//   停经典档——与已移植 spawn 段（fromVanilla 同链）内部不一致。
// 修法：tryTransformTo 复用 fromVanilla 单源链（applyRemixSetDefaults → vScale 捕获 →
//   applySeedAdjustments → seedTailBox → scaleStats，禁止第二套种子/难度实现=fx43 同族）；
//   两级 (int) 截断盒抽 seedTailBox（ScaleStats.ts）供 spawn/transform 双消费。
// 1457↔1458 对拍：Transform/:81909、getGoodAdjustments/:17971、tenth/:17892、zenith/
//   :17962、ScaleStats/:18178 五函数 byte-diff 全等（2026-09-16）。
// 数值断言全部按原版公式手算（每条附算式），不与本仓实现互相印证。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import {
  bindScaleStatsWorld, scaleStatsWorldOf, GDL, f32,
} from '../src/stats/ScaleStats';

beforeEach(() => { bindScaleStatsWorld(scaleStatsWorldOf(new World(100, 100, 7, 't'), () => false)); });
afterEach(() => { bindScaleStatsWorld(null); });

/** 造一个指定难度/种子的世界并绑定（scaleStatsWorldOf 投影 = Game.afterWorldLoad 同源）。
 *  ★gameMode = World.difficulty 轴（0 经典 / 1 专家 / 2 大师 / 3 旅程，World.ts:150），
 *  非 GDL 浮点轴——mainDifficulty() 做 0→1/1→2/2→3 映射且 getGoodWorld 再 +1
 *  （FTW = 大师+1 = 传奇 4，Main.cs:2764-2786 同式） */
function worldOf(gameMode: number, opts?: {
  getGoodWorld?: boolean; tenthAnniversary?: boolean; remix?: boolean; everything?: boolean;
  hardMode?: boolean;
}): World {
  const w = new World(100, 100, 7, 'bj101');
  w.difficulty = gameMode;
  if (opts?.getGoodWorld) w.seedFlags = { ...w.seedFlags, getGoodWorld: true };
  if (opts?.tenthAnniversary) w.seedFlags = { ...w.seedFlags, tenthAnniversary: true };
  if (opts?.remix) w.seedFlags = { ...w.seedFlags, remix: true };
  if (opts?.everything) w.seedFlags = { ...w.seedFlags, everything: true };
  if (opts?.hardMode) w.flags.hardMode = true;
  bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
  return w;
}

/** 变身（Transform :81909 主体）：底边对齐改尺寸 + ai 归零；st 仅旧嵌墙自检残参 */
function transform(e: Enemy, id: number, st: World['store']): void {
  expect(e.transformTo(id, st, true)).toBe(true);
}

// ===========================================================================
// 1. FTW（getGoodWorld）EoW 晋升 14→13/15：盒 51/53 + def+2 + 难度档（F 刀实害正主）
// ===========================================================================
describe('BJ101 FTW EoW 晋升（getGoodAdjustments :17974-17988 二盒 :18122-18123）', () => {
  // 手算（FTW=GameMode 大师(2)+getGood → mainDifficulty=传奇 4 + hardMode + zenith，1 玩家）：
  //   13 头：getGood scale=f32(1×1.35)=1.350000023841858、def 2+2=4 →
  //     二盒 trunc(f32(38×1.350000023841858))=51 →
  //     ScaleStats：lifeMax=trunc(150×4)=600 → Tweaks num4=f32(0.7×0.85)=0.5950000286
  //     → roundCS(f32(600×0.5950000286)=357.00003)=357；damage=trunc(f32(22×5.3333335))=117
  //     → num 1.1 → roundCS(f32(117×1.1)=128.7+)=129；def 4+2=6；
  //     value=trunc(800×3.5)=2800（传奇钱档 3.5）；kb=f32(0×0.7)=0；
  //     ExpertHardmode 豁免（13∈DONT_DO_HARDSMODE_SCALING）；ByPlayerCount 1 人恒等。
  it('FTW 生成本尊锚（spawn 段已移植链）：13 盒 51×51 / maxHp 357 / dmg 129 / def 6', () => {
    worldOf(2, { getGoodWorld: true, everything: true, hardMode: true });
    const e = Enemy.fromVanilla(13, 0, 0)!;
    expect(e.w).toBe(51);                 // trunc(38×1.35f32)=51（旧 38=基表）
    expect(e.h).toBe(51);
    expect(e.maxHp).toBe(357);            // 600→roundCS(×0.595)=357（旧 150=基表）
    expect(e.def.damage).toBe(129);       // 117→roundCS(×1.1)=129（旧 22=基表）
    expect(e.def.defense).toBe(6);        // getGood+2 → Tweaks+2（旧 2=基表）
    expect(e.def.value).toBe(2800);       // ×3.5 传奇钱档（旧 800=基表）
    expect(e.def.knockbackResist).toBe(0);
    expect(e.difficulty).toBe(GDL.LEGENDARY);
    expect(e.vanillaScale).toBeCloseTo(f32(1.35), 6);
  });

  it('FTW 14→13 晋升 = 生成本尊逐字段全等（内部一致性=F 刀实害消除判据）', () => {
    const w = worldOf(2, { getGoodWorld: true, everything: true, hardMode: true });
    const spawned = Enemy.fromVanilla(13, 0, 0)!;
    const body = Enemy.fromVanilla(14, 0, 0)!;   // 14 本尊：盒 53×53（trunc(38×1.4f32)）
    expect(body.w).toBe(53);                     // spawn 侧锚（旧实现变身前就 38——本刀不动 spawn）
    expect(body.maxHp).toBe(357);                // 14 同链：600→roundCS(×0.595)=357
    expect(body.def.damage).toBe(55);            // trunc(f32(13×5.3333335))=69 → roundCS(f32(69×0.8)=55.2)=55
    transform(body, 13, w.store);
    expect(body.w).toBe(spawned.w);              // 51
    expect(body.h).toBe(spawned.h);
    expect(body.maxHp).toBe(spawned.maxHp);      // 357
    expect(body.def.damage).toBe(spawned.def.damage);      // 129
    expect(body.def.defense).toBe(spawned.def.defense);    // 6（getGood+2→Tweaks+2）
    expect(body.def.value).toBe(spawned.def.value);        // 2800
    expect(body.def.knockbackResist).toBe(spawned.def.knockbackResist);
    expect(body.difficulty).toBe(spawned.difficulty);
    expect(body.vanillaScale).toBeCloseTo(spawned.vanillaScale, 6);
  });

  it('FTW 14→15 收尾：盒 53×53（×1.4）/ dmg 46 / def 12 / maxHp 357', () => {
    const w = worldOf(2, { getGoodWorld: true, everything: true, hardMode: true });
    const body = Enemy.fromVanilla(14, 0, 0)!;
    transform(body, 15, w.store);
    // 15 尾：getGood ×1.4 → 二盒 trunc(38×1.399999976158142)=53；
    //   damage=trunc(f32(11×5.3333335))=58 → Tweaks num 0.8 → roundCS(f32(58×0.8)=46.4)=46；
    //   def 基 8 + getGood 2 + Tweaks 专家 2 = 12
    expect(body.w).toBe(53);
    expect(body.h).toBe(53);
    expect(body.maxHp).toBe(357);
    expect(body.def.damage).toBe(46);
    expect(body.def.defense).toBe(12);   // 基 8 + getGood 2 + Tweaks 专家 2
  });

  it('HP 结转（FTW）：残血 100/357 晋升 → 100（三段 lifeMax 同 150，比例 1:1）', () => {
    const w = worldOf(2, { getGoodWorld: true, everything: true, hardMode: true });
    const body = Enemy.fromVanilla(14, 0, 0)!;
    body.hp = 100;
    transform(body, 13, w.store);
    // life = num2 × lifeMax / num3 = 100 × 357 / 357 = 100（:81931）
    expect(body.hp).toBe(100);
    expect(body.maxHp).toBe(357);
  });
});

// ===========================================================================
// 2. HP 结转 :81931 语义（新缩/旧缩 + C# int 截断）：195→196 宁芙（lifeMax 250→300）
// ===========================================================================
describe('BJ101 HP 结转 life = num2 × lifeMax / num3（:81931）', () => {
  // 手算（专家=GameMode 1 → mainDifficulty 2，非困难世界）：
  //   195 失落女孩 lifeMax=trunc(250×2)=500、dmg=trunc(10×2)=20；
  //   196 宁芙 lifeMax=trunc(300×2)=600、dmg=trunc(35×2)=70、def 16、value=trunc(20000×2.5)=50000、
  //   kb=f32(0.4×0.9)=0.36；ExpertHardmode 不跑（hardMode 假）；ByPlayerCount 1 人恒等。
  //   hp=137 → life=trunc(137×600/500)=trunc(164.4)=164（旧实现 round(137×300/500)=82 伪值）
  it('专家世界 137/500 → trunc(137×600/500)=164（旧伪值 82；分子须用新【缩】lifeMax）', () => {
    const w = worldOf(1);
    const girl = Enemy.fromVanilla(195, 0, 0)!;
    expect(girl.maxHp).toBe(500);        // 前置：spawn 侧难度档已生效
    girl.hp = 137;
    transform(girl, 196, w.store);
    expect(girl.maxHp).toBe(600);        // trunc(300×2)
    expect(girl.hp).toBe(164);           // trunc(164.4)；round 复辟 → 164 不变但见下条
    expect(girl.def.damage).toBe(70);    // trunc(35×2)
    expect(girl.def.defense).toBe(16);   // 基表 16（宁芙无种子/Tweaks 臂）
    expect(girl.def.value).toBe(50000);  // ×2.5
    expect(girl.def.knockbackResist).toBeCloseTo(f32(0.36), 6);   // f32(0.4×0.9)
  });

  it('截断判别（.6 分数）：163/500 → trunc(195.6)=195（Math.round 复辟 → 196 变异爆红）', () => {
    const w = worldOf(1);
    const girl = Enemy.fromVanilla(195, 0, 0)!;
    girl.hp = 163;
    transform(girl, 196, w.store);
    expect(girl.hp).toBe(195);
  });

  it('大师世界（GameMode 2 + hardMode）：401/750 → trunc(401×900/750)=481（旧伪值 160）', () => {
    const w = worldOf(2, { hardMode: true });
    const girl = Enemy.fromVanilla(195, 0, 0)!;
    expect(girl.maxHp).toBe(750);        // trunc(250×3)；ExpertHardmode 227≥80 不触发
    girl.hp = 401;
    transform(girl, 196, w.store);
    expect(girl.maxHp).toBe(900);        // trunc(300×3)；346≥80 不触发
    expect(girl.hp).toBe(481);           // trunc(481.2)
    expect(girl.def.damage).toBe(105);   // trunc(35×3)
    expect(girl.def.knockbackResist).toBeCloseTo(f32(0.32), 6);   // f32(0.4×0.8)
  });

  it('残血下限：hp=1 结转 trunc(1×600/500)=1（:81933 ≤0 钳 1 门在链上，同式 Math.max 承接）', () => {
    const w = worldOf(1);
    const girl = Enemy.fromVanilla(195, 0, 0)!;
    girl.hp = 1;                          // 1×600/500=1.2 → trunc 1
    transform(girl, 196, w.store);
    expect(girl.hp).toBe(1);
  });
});

// ===========================================================================
// 3. 十周年（celebrationmk10）：列族 ×0.5（:17900-17950）+ 二盒恒乘（:17958-17959）
// ===========================================================================
describe('BJ101 十周年 14→13：盒 19×19（×0.5）、无 getGood def+2', () => {
  it('13 列族：trunc(trunc(38×1)×0.5)=19 / maxHp 150 / dmg 22 / def 2（经典档）', () => {
    const w = worldOf(0, { tenthAnniversary: true });
    const body = Enemy.fromVanilla(14, 0, 0)!;
    // spawn 侧 14 也在十周年列族：盒 trunc(38×0.5f32)=19（既有批次B 行为，本刀不动）
    expect(body.w).toBe(19);
    transform(body, 13, w.store);
    expect(body.w).toBe(19);             // 旧实现 38=基表
    expect(body.h).toBe(19);
    expect(body.maxHp).toBe(150);        // 经典档=基表
    expect(body.def.damage).toBe(22);
    expect(body.def.defense).toBe(2);    // 十周年不改 defense（getGood 才 +2）
    expect(body.vanillaScale).toBeCloseTo(f32(0.5), 6);
  });

  it('未列族 158→159：十周年二盒恒乘但 scale=1 → 盒不变（原版怪癖：18×40）', () => {
    const w = worldOf(0, { tenthAnniversary: true });
    const bat = Enemy.fromVanilla(158, 0, 0)!;
    transform(bat, 159, w.store);
    expect(bat.w).toBe(18);              // trunc(trunc(18×1)×1)
    expect(bat.h).toBe(40);
    expect(bat.maxHp).toBe(750);         // 经典档=基表
    expect(bat.def.damage).toBe(80);
    expect(bat.vanillaScale).toBe(1);    // seedHit=true（恒乘）但比值 1
  });
});

// ===========================================================================
// 4. zenith-only（getfixedboi 单臂）:只改 lifeMax（125-131/139 ×0.8），不动盒
// ===========================================================================
describe('BJ101 zenith 臂（getZenithSeedAdjustmentsBeforeEverything :17962-17969）', () => {
  it('zenith-only 世界 158→159：非 125-131/139 → lifeMax/盒全不动（seedHit=false）', () => {
    const w = worldOf(0, { everything: true });
    const bat = Enemy.fromVanilla(158, 0, 0)!;
    transform(bat, 159, w.store);
    expect(bat.w).toBe(18);              // zenith 不扩盒（无 getGood/tenth 二盒）
    expect(bat.maxHp).toBe(750);
    expect(bat.def.damage).toBe(80);
  });

  it('zenith 臂经单源生效：139 毁灭者探针 lifeMax ×0.8（spawn 侧同函数锚）', () => {
    worldOf(0, { everything: true });
    // 139 基 lifeMax=200 → zenith trunc(200×0.8)=160（:17965-17968 (int) 截断；
    //   spawn 侧 = 同一 applySeedAdjustments，经典档 ScaleStats ×1 不改值）
    expect(Enemy.fromVanilla(139, 0, 0)!.maxHp).toBe(160);
  });
});

// ===========================================================================
// 5. 经典世界零漂移（负控）：变身 = 基表值（spawn≡transform 全等）
// ===========================================================================
describe('BJ101 经典世界负控（零漂移）', () => {
  it('14→13：盒 38×38 / maxHp 150 / dmg 22 / def 2 / value 800 / kb 0 / vanillaScale 1', () => {
    const w = worldOf(0);
    const body = Enemy.fromVanilla(14, 0, 0)!;
    transform(body, 13, w.store);
    expect(body.w).toBe(38);
    expect(body.h).toBe(38);
    expect(body.maxHp).toBe(150);
    expect(body.def.damage).toBe(22);
    expect(body.def.defense).toBe(2);
    expect(body.def.value).toBe(800);
    expect(body.def.knockbackResist).toBe(0);
    expect(body.vanillaScale).toBe(1);   // 经典不写渲染乘区（负控）
    expect(body.difficulty).toBe(GDL.CLASSIC);
  });

  it('spawn≡transform（经典）：生成本尊 13 与 14→13 晋升逐字段全等', () => {
    const w = worldOf(0);
    const spawned = Enemy.fromVanilla(13, 0, 0)!;
    const body = Enemy.fromVanilla(14, 0, 0)!;
    transform(body, 13, w.store);
    expect(body.maxHp).toBe(spawned.maxHp);
    expect(body.def.damage).toBe(spawned.def.damage);
    expect(body.def.defense).toBe(spawned.def.defense);
    expect(body.def.value).toBe(spawned.def.value);
    expect(body.def.knockbackResist).toBe(spawned.def.knockbackResist);
    expect(body.w).toBe(spawned.w);
    expect(body.h).toBe(spawned.h);
  });

  it('小动物门（ScaleStats 入口门 :18180）：金鱼 55→230 lifeMax=5 不进难度乘区', () => {
    const w = worldOf(2, { hardMode: true });
    const fish = Enemy.fromVanilla(55, 0, 0)!;   // lifeMax=5 → 门失败（lifeMax>5）
    expect(fish.maxHp).toBe(5);
    transform(fish, 230, w.store);
    expect(fish.maxHp).toBe(5);                  // SetDefaults 基值，难度乘区未进
    expect(fish.def.damage).toBe(0);
  });

  it('348→349 胡桃夹子（半血变身，霜月组 Tweaks 默认臂 ×0.75）：maxHp 2700 / 伤 348=120→349=150 / 防 42', () => {
    const w = worldOf(1);
    const gift = Enemy.fromVanilla(348, 0, 0)!;
    // 348 基 1800 → 专家 ×2=3600 → 霜月 Tweaks 默认臂 num2=0.75 → roundCS(2700)=2700；
    //   damage 80→×2=160→num 0.75→roundCS(120)=120（GetNPCInvasionGroup(348)=-2,
    //   非 315/325/327/344/345/346 case 表 → default；ExpertHardmode 不跑，hardMode 假）
    expect(gift.maxHp).toBe(2700);
    expect(gift.def.damage).toBe(120);
    gift.hp = 500;
    transform(gift, 349, w.store);
    expect(gift.maxHp).toBe(2700);               // 349 同链：3600×0.75=2700
    expect(gift.hp).toBe(500);                   // 同 lifeMax 比例 1:1
    expect(gift.def.damage).toBe(150);           // 349 基 100→×2=200→×0.75=roundCS(150)=150（残旧型=120 伪）
    expect(gift.def.defense).toBe(42);           // 349 基 42（无种子/Tweaks 臂）
    expect(gift.def.knockbackResist).toBeCloseTo(f32(0.09), 6);  // f32(0.1×0.9)=0.09000000357627869
  });
});

// ===========================================================================
// 6. 结构锁（防双源漂移=fx43 同族）：spawn/transform 共用单源、无第二套实现
// ===========================================================================
describe('BJ101 结构锁：Transform 链 = fromVanilla 单源复用', () => {
  const src = readFileSync(new URL('../src/entities/Enemy.ts', import.meta.url), 'utf8');
  const bodyOf = (name: string): string => {
    const start = src.indexOf(name);
    expect(start, `${name} 存在`).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf('\n  }\n', start) + 6);
  };
  const tt = bodyOf('private tryTransformTo(');

  it('tryTransformTo 链序：applyRemixSetDefaults → applySeedAdjustments → seedTailBox → scaleStats', () => {
    const idx = (s: string) => tt.indexOf(s);
    expect(idx('applyRemixSetDefaults(')).toBeGreaterThan(-1);
    expect(idx('applySeedAdjustments(')).toBeGreaterThan(idx('applyRemixSetDefaults('));
    expect(idx('seedTailBox(')).toBeGreaterThan(idx('applySeedAdjustments('));
    expect(idx('scaleStats(ss)')).toBeGreaterThan(idx('seedTailBox('));
  });

  it('tryTransformTo 无第二套种子/难度/盒实现（负控）', () => {
    expect(tt).not.toContain('Math.round(v.width');
    expect(tt).not.toContain('Math.round(v.height');
    expect(tt).not.toContain('Math.round((this.hp');
    expect(tt).not.toContain('ENEMY_MAX_LIFE_MULTIPLIER');
    expect(tt).not.toContain('ENEMY_DAMAGE_MULTIPLIER');
    expect(tt).not.toContain('getAttackDamageScaledByDifficulty(');
    expect(tt).not.toContain('sampleCurve(');
    expect(tt).not.toContain('Math.trunc(f32(Math.trunc(f32(v.width');  // 盒链不得内联复制
  });

  it('HP 结转 = 新缩/旧缩（ss.lifeMax/oldMax），非基表 v.lifeMax', () => {
    const m = tt.match(/this\.hp = [^;]+;/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain('ss.lifeMax');
    expect(m![0]).toContain('oldMax');
    expect(m![0]).toContain('Math.trunc');
    expect(m![0]).not.toContain('v.lifeMax');
  });

  it('fromVanilla 盒链走 seedTailBox 单源（旧内联两级 trunc 已摘）', () => {
    const fv = bodyOf('static fromVanilla(');
    expect(fv).toContain('seedTailBox(v.width, v.height, vScale, seedS.scale, seedBox)');
    expect(fv).not.toContain('Math.trunc(f32(Math.trunc(f32(v.width');
  });
});
