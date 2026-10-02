// ★BJ437（2026-10-02）：燃烧 buff 粒子族定谳落刀——用户实报「着火敌怪只发红没有火
// 粒子」。定谳锚（Terarria1457/Terraria/NPC.cs UpdateNPC_BuffApplyVFX :92263-92712
// 亲读,:91488 对【全体】NPC 调用——敌怪与城镇同环）：
//   逐 buff 粒子谱（尘 id/频率/盒扩/速度修型/重力翻转/点光）：
//     onFire 24      尘6  75%/拍 盒(pos−2,+4) α100 scale3.5 v=v×0.4→×1.8→Y−0.5→1/4 翻重力+scale×0.5  光(1,.3,.1)  (:92353-92367)
//     onFire3 189    尘6  75%/拍 同上+customData=0(实心格收缩档,引擎无消费面=债)              光(1,.3,.1)  (:92369-92385)
//     onFire2 39     尘75 75%/拍 同 onFire 形                                          光(1,.3,.1)  (:92618-92634)
//     onFrostBurn 44 尘135 75%/拍 同 onFire 形                                          光(.1,.6,1)  (:92586-92601)
//     onFrostBurn2   尘135 75%/拍 同 onFire 形                                          光(.1,.6,1)  (:92602-92617)
//     daybreak 899   尘158 75%/拍 同形但 ×2.8                                           光(1,.3,.1)  (:92386-92401)
//     betsysCurse    尘55 75%/拍 ×2.8→Y−1.5→【无条件】翻重力+scale=0.9+色(0,0,180)+×0.2  光(.6,.1,.9)  (:92402-92416)
//     shadowFlame153 尘27  80%/拍(Next(5)<4) α180 scale1.95 ×0.75→X×0.75→Y−1→1/4 翻转     无光         (:92340-92352)
//     poisoned 20    尘46  1/30    盒不扩 α120 scale0.2 noGravity fadeIn1.9              无光         (:92303-92308)
//     venom 70       尘171 1/10    盒不扩 α100 scale0.5 noGravity fadeIn1.5              无光         (:92309-92314)
//     bleeding/hem   尘5   1/2     缺省参;Y+0.5 先于 ×0.35                               无光         (:92334-92339)
//     oiled 204      尘4   1/3(2/3×1/2) 盒(pos−2,+4/+2) α175+2×25 色(0,0,0,250) noLight v×0.2→Y+0.2→+=实体v (:92417-92440)
//     ichor 69       【无粒子】——原版 VFX 环无 ichor 块（唯一视觉=染色 255,255,0 :92226-92229）
//   本仓缺层（修复前）：仅 onFire 有泛色方块近似（spawnParticles 色块,画在光照合成前
//   被乘光+形态非火）且挂在 DoT 豁免门内;其余全族零发射——tint(染色/点光)有而粒子
//   无=实报病根。FTW 火把史莱姆（ai1=8 永燃）被旧门误杀零粒子同刀收编。
// 断言面：
//   A. Enemy 燃烧族逐 buff 尘发射钉值（静态假人 488 锚位——dummyAI 零位移,sy=0 绝对钉）。
//   B. FTW 豁免面：火把史莱姆永燃+DoT 免+粒子随旗位照发（旧门误杀面）。
//   C. TownNPC tickDebuffs 城镇同环逐系独立发射（X1 面粒子随刀收编）。
//   D. VanillaDust 引擎补档：case 27/45 链 A（:1717-1775 ×0.94/+0.002/紫光）+
//      case 31 组成员 46/188（:1336 ×0.98 阻尼,31 专属 noGravity 臂按型守卫）。
//   E. 变异自证见报告单（sha256 对拍逐字节还原,禁 git checkout）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { VanillaDust } from '../src/fx/VanillaDust';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const W = 120, H = 80, FLOOR = 60;
const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; vi.restoreAllMocks(); });

type DustRec = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number;
  color: { r: number; g: number; b: number; a: number } | null;
  noGravity: boolean; vx: number; vy: number; fadeIn: number; noLight: boolean;
};

function makeHarness(getGood = false) {
  const w = new World(W, H, 11, 'bj437-burn-vfx');
  if (getGood) w.seedFlags.getGoodWorld = true;
  const st = w.store;
  w.groundLevel = 30;
  for (let x = 0; x < W; x++) { st.setTile(x, FLOOR, 1); st.setTile(x, FLOOR + 1, 1); }
  const captured: DustRec[] = [];
  const enemies: Enemy[] = [];
  const em = { nextId: 1, add: () => {} };
  const player = new Player(W * TILE * 0.5, (FLOOR - 3) * TILE, new Inventory());
  const hooks = {
    world: w, player,
    enemies: () => enemies, critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    playSfxFile: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    entities: em, scene: {},
    spawnDust: (
      x: number, yn: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, color: DustRec['color'] = null, scale = 1,
    ) => {
      const rec: DustRec = {
        x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, color,
        noGravity: false, vx: sx, vy: sy, fadeIn: 0, noLight: false,
      };
      captured.push(rec);
      return rec;
    },
  } as unknown as GameHooks;
  return { hooks, w, captured, enemies, em };
}

function makeEnemy(h: ReturnType<typeof makeHarness>, vanillaId = 3): Enemy {
  const e = Enemy.fromVanilla(vanillaId, 60 * TILE, (FLOOR - 3) * TILE)!;
  e.id = h.em.nextId++;
  e.def.defense = 0;
  e.maxHp = e.hp = 1000000;
  e.iframes = 0;
  e.vx = 0; e.vy = 0;
  h.enemies.push(e);
  return e;
}

/** 静态训练假人（dummyAI 零位移+immortal——逐参数绝对钉值载体;锚 tile 378 缺=自灭） */
function makeDummy(h: ReturnType<typeof makeHarness>): Enemy {
  h.w.store.setTileSilent(60, FLOOR - 3, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
  const e = Enemy.fromVanilla(488, 60 * TILE, (FLOOR - 3) * TILE)!;
  e.dummyAnchor = [60, FLOOR - 3];
  e.maxHp = e.hp = 1000000;
  e.y = FLOOR * TILE - e.h;              // 立于地板面（防嵌格推出残速）
  e.vx = 0; e.vy = 0;
  h.enemies.push(e);
  return e;
}

/** 统计扫频（真 RNG）：target T 值维持整段,数指定型发射频率 */
function sweepRate(
  h: ReturnType<typeof makeHarness>, e: Enemy,
  field: string, ticks: number, type: number,
): number {
  (e as unknown as Record<string, number>)[field] = ticks / 60 + 100;
  for (let i = 0; i < ticks; i++) e.fixedUpdate(1 / 60, h.hooks);
  return h.captured.filter((r) => r.type === type).length / ticks;
}

// ===========================================================================
// A. Enemy 燃烧族逐 buff 尘发射钉值（静态假人,sy=0 绝对钉）
// ===========================================================================
describe('BJ437 A：Enemy 燃烧族 VFX 逐 buff 钉值（UpdateNPC_BuffApplyVFX :92263-92712）', () => {
  it('A1 火焰族共形（onFire/onFire3/cursed/frostburn×2/daybreak）：门 Next(4)<3、盒(pos−2,+4)、'
    + 'α100、scale3.5、v=v×0.4、noGravity→×mul→Y−add、1/4 翻重力+scale×0.5', () => {
    // 火焰族表（id/velMul/yAdd/锚）——1457 亲读金标
    const FAMILY: Array<[string, number, number, number, number]> = [
      ['onFireT', 6, 1.8, 0.5, 92353],      // :92356 尘6
      ['onFire3T', 6, 1.8, 0.5, 92369],     // :92372 尘6(+customData 债)
      ['cursedT', 75, 1.8, 0.5, 92618],     // :92621 尘75
      ['frostburnT', 135, 1.8, 0.5, 92586], // :92589 尘135
      ['frostburn2T', 135, 1.8, 0.5, 92602],// :92605 尘135
      ['daybreakT', 158, 2.8, 0.5, 92386],  // :92389 尘158
    ];
    for (const [field, dust, mul, yAdd] of FAMILY) {
      // 掷 0：门中+翻转面中（floor(0×4)===0）→ noGravity=false、scale=3.5×0.5
      Math.random = () => 0;
      const h1 = makeHarness();
      const e1 = makeDummy(h1);
      (e1 as unknown as Record<string, number>)[field] = 10;
      e1.fixedUpdate(1 / 60, h1.hooks);
      expect(h1.captured.length).toBe(1);
      const r = h1.captured[0];
      expect(r.type).toBe(dust);
      expect(r.w).toBe(e1.w + 4);            // 盒(pos−2,+4)
      expect(r.h).toBe(e1.h + 4);
      expect(r.alpha).toBe(100);
      expect(r.noGravity).toBe(false);       // 1/4 翻转面（掷 0 命中）
      expect(r.scale).toBe(1.75);            // 3.5×0.5
      // 速度修型相对钉（基=sy 捕获的实体 v×0.4）：vy=sy×mul−yAdd、vx=sx×mul
      expect(r.vy).toBeCloseTo(r.sy * mul - yAdd, 10);
      expect(r.vx).toBeCloseTo(r.sx * mul, 10);
      // 掷 0.5：门中+翻转面不中（floor(2)≠0）→ noGravity=true、scale 保持 3.5
      Math.random = () => 0.5;
      const h2 = makeHarness();
      const e2 = makeDummy(h2);
      (e2 as unknown as Record<string, number>)[field] = 10;
      e2.fixedUpdate(1 / 60, h2.hooks);
      expect(h2.captured.length).toBe(1);
      expect(h2.captured[0].noGravity).toBe(true);
      expect(h2.captured[0].scale).toBe(3.5);
      expect(h2.captured[0].vy).toBeCloseTo(h2.captured[0].sy * mul - yAdd, 10);
      // 掷 0.76：门 Next(4)<3 不中（≥0.75）→ 零发射
      Math.random = () => 0.76;
      const h3 = makeHarness();
      const e3 = makeDummy(h3);
      (e3 as unknown as Record<string, number>)[field] = 10;
      e3.fixedUpdate(1 / 60, h3.hooks);
      expect(h3.captured.length).toBe(0);
    }
  });

  it('A2 火焰族发射频率统计 75%/拍（6× 统计口径,真 RNG 大数）', () => {
    Math.random = realRandom;
    const h = makeHarness();
    const e = makeEnemy(h);
    const n1 = sweepRate(h, e, 'onFireT', 800, 6);
    expect(Math.abs(n1 - 0.75)).toBeLessThan(0.06);
    const e2 = makeEnemy(h);
    const n2 = sweepRate(h, e2, 'daybreakT', 800, 158);
    expect(Math.abs(n2 - 0.75)).toBeLessThan(0.06);
  });

  it('A3 betsysCurse 尘55（:92402-92416）：×2.8→Y−1.5→无条件翻重力+scale=0.9+色(0,0,180,255)+×0.2,无 1/4 面', () => {
    Math.random = () => 0.5;
    const h = makeHarness();
    const e = makeDummy(h);
    e.betsysCurseT = 10;
    e.fixedUpdate(1 / 60, h.hooks);
    expect(h.captured.length).toBe(1);
    const r = h.captured[0];
    expect(r.type).toBe(55);
    expect(r.alpha).toBe(100);
    expect(r.noGravity).toBe(false);       // 无条件翻重力（掷 0.5 无 1/4 面仍 false）
    expect(r.scale).toBe(0.9);             // 覆写非乘
    expect(r.color).toEqual({ r: 0, g: 0, b: 180, a: 255 });
    // 相对钉（基=sx/sy 捕获的实体 v×0.4）：×2.8→Y−1.5→×0.2
    expect(r.vy).toBeCloseTo((r.sy * 2.8 - 1.5) * 0.2, 10);
    expect(r.vx).toBeCloseTo(r.sx * 2.8 * 0.2, 10);
  });

  it('A4 shadowFlame 尘27（:92340-92352）：80%/拍(Next(5)<4)、α180、scale1.95、×0.75→X×0.75→Y−1、1/4 翻转', () => {
    Math.random = () => 0.5;
    const h = makeHarness();
    const e = makeDummy(h);
    e.shadowFlameT = 10;
    e.fixedUpdate(1 / 60, h.hooks);
    expect(h.captured.length).toBe(1);
    const r = h.captured[0];
    expect(r.type).toBe(27);
    expect(r.alpha).toBe(180); expect(r.scale).toBe(1.95);
    expect(r.noGravity).toBe(true);        // 掷 0.5 翻转面不中
    expect(r.vy).toBeCloseTo(r.sy * 0.75 - 1, 10);   // velocity×0.75→Y−1（第二次 ×0.75 是 X 专项）
    expect(r.vx).toBeCloseTo(r.sx * 0.75 * 0.75, 10);
    Math.random = () => 0.81;              // Next(5)<4 门不中
    const h2 = makeHarness();
    const e2 = makeDummy(h2);
    e2.shadowFlameT = 10;
    e2.fixedUpdate(1 / 60, h2.hooks);
    expect(h2.captured.length).toBe(0);
  });

  it('A5 滴溅族钉值：poisoned 46@1/30α120 fadeIn1.9 / venom 171@1/10α100 fadeIn1.5 / '
    + 'bleeding 5@1/2 Y+0.5 先于 ×0.35 / oiled 4@净1/3 α175 色(0,0,0,250) noLight +=实体v', () => {
    // 相位 1（掷 0.01：46/171/5 门全中;oiled 外掷 Next(3)!=0 不中=零油滴）
    Math.random = () => 0.01;
    const h = makeHarness();
    const e = makeDummy(h);
    e.poisonT = 10; e.venomT = 10; e.bleedT = 10; e.hemorrhageT = 0; e.oiledT = 10;
    e.fixedUpdate(1 / 60, h.hooks);
    const by = (t: number) => h.captured.filter((r) => r.type === t);
    expect(by(46).length).toBe(1);
    expect(by(46)[0].alpha).toBe(120);
    expect(by(46)[0].scale).toBe(0.2);
    expect(by(46)[0].noGravity).toBe(true);
    expect(by(46)[0].fadeIn).toBe(1.9);
    expect(by(46)[0].w).toBe(e.w);         // 盒不扩
    expect(by(171).length).toBe(1);
    expect(by(171)[0].alpha).toBe(100);
    expect(by(171)[0].fadeIn).toBe(1.5);
    expect(by(5).length).toBe(1);
    expect(by(5)[0].vy).toBeCloseTo((by(5)[0].sy + 0.5) * 0.35, 10);  // Y+0.5 先于 ×0.35 语句序
    expect(by(5)[0].alpha).toBe(0);              // NewDustDirect 缺省参
    expect(by(4).length).toBe(0);                // 掷 0.01 外门 floor(0.03)=0 不中
    // 相位 2（掷 0.4：外 Next(3)!=0 过、内 Next(2)==0 中 → 油滴发）
    Math.random = () => 0.4;
    const h2 = makeHarness();
    const e2 = makeDummy(h2);
    e2.oiledT = 10;
    e2.fixedUpdate(1 / 60, h2.hooks);
    expect(h2.captured.length).toBe(1);
    const o = h2.captured[0];
    expect(o.type).toBe(4);
    expect(o.alpha).toBe(225);                   // 175+25+25（掷 0.4 两臂全中）
    expect(o.color).toEqual({ r: 0, g: 0, b: 0, a: 250 });
    expect(o.noLight).toBe(true);
    expect(o.h).toBe(e2.h + 2);                  // 盒(pos−2,+4/+2)
    expect(o.vy).toBeCloseTo(o.sy * 0.2 + 0.2 + o.sy / 0.4, 10);   // v×0.2→Y+0.2→+=实体v
    expect(o.vx).toBeCloseTo(o.sx * 0.2 + o.sx / 0.4, 10);
    // 相位 3（掷 0.5：外过、内 floor(1.0)=1≠0 不过 = 零油滴——净 1/3 的内臂面）
    Math.random = () => 0.5;
    const h3 = makeHarness();
    const e3 = makeDummy(h3);
    e3.oiledT = 10;
    e3.fixedUpdate(1 / 60, h3.hooks);
    expect(h3.captured.length).toBe(0);
  });

  it('A6 滴溅族频率统计：venom 1/10 / bleeding 1/2 / oiled 净 1/3（真 RNG 大数）', () => {
    Math.random = realRandom;
    const h = makeHarness();
    const e = makeEnemy(h);
    e.venomT = 10;
    const nv = sweepRate(h, e, 'venomT', 2000, 171);
    expect(Math.abs(nv - 1 / 10)).toBeLessThan(0.03);
    const e2 = makeEnemy(h);
    e2.bleedT = 10;
    const nb = sweepRate(h, e2, 'bleedT', 800, 5);
    expect(Math.abs(nb - 0.5)).toBeLessThan(0.06);
    const e3 = makeEnemy(h);
    e3.oiledT = 10;
    const no = sweepRate(h, e3, 'oiledT', 2400, 4);
    expect(Math.abs(no - 1 / 3)).toBeLessThan(0.04);
  });

  it('A7 多火系并存各发各的（onFire3+shadowFlame 同拍双发射）+ ichor 零粒子（原版无 VFX 块）', () => {
    Math.random = () => 0;
    const h = makeHarness();
    const e = makeDummy(h);
    e.onFire3T = 10; e.shadowFlameT = 10;
    e.fixedUpdate(1 / 60, h.hooks);
    expect(h.captured.filter((r) => r.type === 6).length).toBe(1);
    expect(h.captured.filter((r) => r.type === 27).length).toBe(1);
    // ichor：唯一视觉=染色（:92226-92229 整色替换）——VFX 环无 ichor 块,零发射
    Math.random = () => 0;
    const h2 = makeHarness();
    const e2 = makeDummy(h2);
    e2.ichorT = 100;
    for (let i = 0; i < 50; i++) e2.fixedUpdate(1 / 60, h2.hooks);
    expect(h2.captured.length).toBe(0);
  });

  it('A8 buff 在位才有粒子（T=0 零发射）+ canDisplayBuffs=false 全熄（:92265 早退,FTW 245-248 面）', () => {
    Math.random = () => 0;
    const h = makeHarness();
    const e = makeDummy(h);
    e.fixedUpdate(1 / 60, h.hooks);
    expect(h.captured.length).toBe(0);
    const h2 = makeHarness();
    const e2 = makeDummy(h2);
    e2.onFireT = 100; e2.shadowFlameT = 100; e2.poisonT = 100;
    e2.canDisplayBuffs = false;
    for (let i = 0; i < 30; i++) e2.fixedUpdate(1 / 60, h2.hooks);
    expect(h2.captured.length).toBe(0);
  });
});

// ===========================================================================
// B. FTW 豁免面（火把史莱姆 ai1=8 永燃 :61239-61247;DoT 免 :92733;粒子随旗位）
// ===========================================================================
describe('BJ437 B：FTW 火把史莱姆（永燃 DoT 免,粒子不被旧门误杀）', () => {
  it('B1 FTW（type1 ai1=8 getGood）：AI 每拍续燃 3600+DoT 免+火尘逐拍照发;四冰毒系位被逐拍清零', () => {
    Math.random = () => 0;
    const h = makeHarness(true);
    const e = makeEnemy(h, 1);
    e.ai1 = 8;
    e.frostburnT = 10;                     // 免疫面：AI 梯逐拍清四计时位
    for (let i = 0; i < 3; i++) e.fixedUpdate(1 / 60, h.hooks);
    expect(e.onFireT).toBeGreaterThan(3500);   // AddBuff(24,216000) 永燃等价
    expect(e.frostburnT).toBe(0);              // buffImmune[44] 等价清零
    expect(e.hp).toBe(1000000);                // AddFlamable 豁免=零 DoT
    expect(h.captured.filter((r) => r.type === 6).length).toBe(3);   // 逐拍 1 粒（旗位驱动）
    expect(h.captured.filter((r) => r.type === 135).length).toBe(0);
  });

  it('B2 非 FTW 蓝史莱姆同型照吃 DoT（1s 步进 −4 HP）且粒子照发', () => {
    Math.random = () => 0;
    const h = makeHarness(false);
    const e = makeEnemy(h, 1);
    e.ai1 = 8;
    e.onFireT = 100;
    e.fixedUpdate(1, h.hooks);
    expect(e.hp).toBe(1000000 - 4);
    expect(h.captured.filter((r) => r.type === 6).length).toBe(1);
  });
});

// ===========================================================================
// C. TownNPC 城镇同环逐系独立发射（X1 面）
// ===========================================================================
describe('BJ437 C：TownNPC tickDebuffs 燃烧族真尘（:91488 城镇同环）', () => {
  function townHarness() {
    const w = new World(200, 200, 100, 'bj437-town');
    for (let x = 20; x <= 180; x++) w.store.setTileSilent(x, 100, 1);
    const captured: DustRec[] = [];
    const hooks = {
      world: w, player: new Player(100 * TILE, 98 * TILE, new Inventory()),
      npcs: () => [], enemies: () => [], critters: () => [],
      addDamageNumber: () => {}, spawnParticles: () => {}, playSfx: () => {},
      playSfxFiles: () => {}, playSfxWav: () => {}, spawnDrop: () => null,
      damagePlayer: () => 0, cutTile: () => {}, onEnemyKilled: () => {},
      spawnEnemy: () => {}, spawnTownShot: () => {}, spawnBurst: () => {},
      showPickupLabel: () => {}, notifyInventoryChanged: () => {},
      townNpcPrioritizedLockReset: () => {},
      spawnDust: (
        x: number, yn: number, wn: number, hn: number, type: number,
        sx = 0, sy = 0, alpha = 0, color: DustRec['color'] = null, scale = 1,
      ) => {
        const rec: DustRec = {
          x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, color,
          noGravity: false, vx: sx, vy: sy, fadeIn: 0, noLight: false,
        };
        captured.push(rec);
        return rec;
      },
    } as unknown as GameHooks;
    const n = new TownNPC('guide', 100 * TILE, 98 * TILE);
    return { hooks, captured, n };
  }

  it('C1 逐系独立 75%/拍：onFire→6 / onFire3→6 / cursed→75 / frostburn2→135,同帧多系各发各的', () => {
    // 掷 0：四系门全中+翻转面全中
    Math.random = () => 0;
    const { hooks, captured, n } = townHarness();
    n.onFireT = 10; n.onFire3T = 10;
    (n as unknown as Record<string, number>).cursedT = 10;
    (n as unknown as Record<string, number>).frostburn2T = 10;
    (n as unknown as { tickDebuffs: (dt: number, g: GameHooks) => void })
      .tickDebuffs(1 / 60, hooks);
    expect(captured.filter((r) => r.type === 6).length).toBe(2);    // onFire+onFire3 各一发
    expect(captured.filter((r) => r.type === 75).length).toBe(1);
    expect(captured.filter((r) => r.type === 135).length).toBe(1);
    for (const r of captured) {
      expect(r.w).toBe((n as unknown as { w: number }).w + 4);
      expect(r.alpha).toBe(100); expect(r.scale).toBe(1.75);        // 3.5×0.5 翻转面
      expect(r.noGravity).toBe(false);
      expect(r.vy).toBeCloseTo(-0.5, 10);
    }
    // 门不中掷：四系全零
    Math.random = () => 0.76;
    const h2 = townHarness();
    const n2 = h2.n;
    n2.onFireT = 10;
    (n2 as unknown as Record<string, number>).cursedT = 10;
    (n2 as unknown as { tickDebuffs: (dt: number, g: GameHooks) => void })
      .tickDebuffs(1 / 60, h2.hooks);
    expect(h2.captured.length).toBe(0);
  });

  it('C2 城镇燃烧频率统计 75%/拍（真 RNG 大数）', () => {
    Math.random = realRandom;
    const { hooks, captured, n } = townHarness();
    n.onFireT = 100;
    const ticks = 800;
    for (let i = 0; i < ticks; i++) {
      n.onFireT = 100;   // 维持在位（tickDebuffs 会倒数）
      (n as unknown as { tickDebuffs: (dt: number, g: GameHooks) => void })
        .tickDebuffs(1 / 60, hooks);
    }
    const rate = captured.filter((r) => r.type === 6).length / ticks;
    expect(Math.abs(rate - 0.75)).toBeLessThan(0.06);
  });
});

// ===========================================================================
// D. VanillaDust 引擎补档（case 27/45 链 A + case 31 组成员 46/188）
// ===========================================================================
describe('BJ437 D：VanillaDust 引擎档（Dust.cs :1717-1775 / :1336-1394）', () => {
  it('D1 dust 27 链 A（:1717-1775）：×0.94 阻尼+scale+0.002+紫光 (0.6,0.2,1)×min(scale,1),跳通用重力;'
    + '净 scale 含公共老化 −0.01（fadeIn=0 衰落档,全体）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 0, 0, 27, 0, 0, 100, null, 1);
    expect(d).not.toBeNull();
    d!.vx = 2; d!.vy = 0; d!.scale = 1; d!.fadeIn = 0;
    vd.update(0, 0, 10000, 10000, 0, 0, null, null, null, null);
    expect(d!.vx).toBeCloseTo(1.88, 10);       // 2×0.94
    expect(d!.vy).toBeCloseTo(0, 10);          // 链 A 命中跳 :1884 重力
    expect(d!.scale).toBeCloseTo(0.992, 10);   // 1+0.002(链A)−0.01(老化衰落)
    expect(vd.lights.length).toBe(1);
    expect(vd.lights[0].r).toBeCloseTo(0.6, 6);   // num97=1.002 钳 1
    expect(vd.lights[0].g).toBeCloseTo(0.2, 6);
    expect(vd.lights[0].b).toBeCloseTo(1, 6);
  });

  it('D2 dust 46/188 入 :1336 组（×0.98 阻尼+跳通用重力）;31 专属 noGravity 臂不外溢;'
    + '46 带 fadeIn=1.9（实发值）走 +0.1 生长臂;noGravity 族续吃 :2407 兜底 ×0.92', () => {
    const vd = new VanillaDust();
    const d46 = vd.spawn(100, 100, 0, 0, 46, 0, 0, 120, null, 0.2);
    d46!.vx = 2; d46!.vy = 0; d46!.noGravity = true; d46!.scale = 0.2; d46!.fadeIn = 1.9;
    const d188 = vd.spawn(200, 100, 0, 0, 188, 0, 0, 100, null, 1.5);
    d188!.vx = 1; d188!.vy = 0; d188!.scale = 1.5;
    vd.update(0, 0, 10000, 10000, 0, 0, null, null, null, null);
    expect(d46!.vx).toBeCloseTo(1.8032, 10);   // 2×0.98(链A:1336)×0.92(:2407 兜底)
    expect(d46!.vy).toBeCloseTo(0, 10);        // noGravity+链 A 命中=零重力
    expect(d46!.scale).toBeCloseTo(0.3, 10);   // 0.2+0.1（46 生长臂 :2174;31 臂不外溢）
    expect(d188!.vx).toBeCloseTo(0.98, 10);    // 1×0.98;noGravity=false 无兜底乘
    expect(d188!.vy).toBeCloseTo(0, 10);       // 非 noGravity 也零重力（链 A 独占）
    expect(d188!.scale).toBeCloseTo(1.49, 10); // 1.5−0.01 老化衰落
  });
});
