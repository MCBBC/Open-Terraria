// ManaV2 空蓝慢施窗分叉（第二轮红蓝 F-03）回归 —— 原版权威 Player.cs:
//   :4463-4468  ApplyItemAnimation slowMagic 支 SetItemAnimation(useAnimation, 2.5)
//               （SetItemAnimation(base,mult) :4438-4446 val=(int)(base×mult)【截断】,
//               base>0 下限 1;尾段 itemAnimation += num :4470-4472 = useStyle5+
//               autoReuse+reuseDelay==0+useTime≤useAnimation+shoot>0 的 +1 补间帧）
//   :47594-47601 ItemCheck_Shoot 尾段 ApplyItemTime(sItem, 2.5) → itemTime=⌊U0×2.5⌋
//               （≡ Player.getSlowMagicUseTime :47425-47432 同取整式）
//   :47453-47456 GetSlowMagicMultiplier() 恒 2.5f
//   :53216-53261 CheckMana 入口清 slowMagicUse → 空蓝照放支 DoRunOutOfManaEffect
//               置位——【只在空蓝仍放分支发生】,正常蓝量施法恒 false
// 分叉病灶（修前）：U 侧已 ×2.5 但挥击窗（swing.dur ≡ itemAnimationMax）不拉伸 →
//   3053 暗影炎弓 multishot 发数=1+⌊(A−1)/U⌋ 用未拉伸 A=21 → 窗 22/U 17 实发 2 发;
//   原版窗 ⌊21×2.5⌋+1=53、U=⌊7×2.5⌋=17 → 相位 52/35/18/1 = 4 发（末发精确）。
// 修面：case 'magic' 付款点 slowMagicWindowGrow 拉伸 swing.t/dur（增量只乘 vanilla
//   useAnimation 本体,+num 补间帧/reuseDelay 后摇帧原位保留）+ 各 multishot 支
//   slowMagicSprayPlan 按缩放对计发数 + 窗冷却=拉伸窗本身（旧式再 ×2.5=双重缩放）。
// 消费面公式（updateSwingHits R26/R27 通道,tests/redblue-r26·3053 已锁）：elapsed=
//   dur−t;mscycle=⌊elapsed/ms.useTime⌋;mscycle>fired−1 且 ≤maxShots−1 → fire()。
import { describe, it, expect, vi } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { combatWeapon, itemCombat } from '../src/data/vanillaItemCombat';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Game, sprayCyclePlan, slowMagicWindowGrow, slowMagicSprayPlan } from '../src/core/Game';
import { TILE } from '../src/core/constants';

const W = 120, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}

/** useCombatWeapon 最小桩（真链：词缀折叠 wrapper/付款块/慢施拉伸/各 multishot 支
 *  全真,只旁路音效/录制/渲染锚点面——wasp-gun-parkour.test.ts magicGame 同款,
 *  另补 useSwing 所需 swingHitSet/swingTileCutSet 与 canHitLine 所需真 TileStore;
 *  enemies:[] = 6173 电弧涌动补雷扫描面（:15145 GetSparkleGuitarTarget 口径）,空场=零补雷） */
function magicGame(vid: number, o?: { mana?: number }) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]], 1);
  player.mana = o?.mana ?? 100;
  const added: unknown[] = [];
  g.player = player;
  g.entities = { add: (e: unknown) => { added.push(e); }, projectiles: [], enemies: [] };
  g.input = { mouseDown: true, mouseHeld: true, rightDown: false, mouseX: 700, mouseY: 300, uiBlocking: false };
  g.camera = { screenToWorld: () => [800, 0] };
  g.sfx = { play: () => {}, playWavFile: () => true, playFiles: () => true };
  g.achievements = { handleSpecialEvent: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.swing = null;
  g.swingHitSet = new Set();
  g.swingTileCutSet = new Set();
  g.mining = null;
  g.world = { store: makeStore() };
  g.recLog = () => {};
  g.playUseSound = () => {};
  g.resolveShotAnchor = (_k: string, ang: number) =>
    ({ x: player.cx + Math.cos(ang) * 18, y: player.cy + Math.sin(ang) * 18 });
  return { g, player, added };
}

function fireCombatWeapon(g: Record<string, unknown>, vid: number): void {
  const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]];
  (g as unknown as { useCombatWeapon: (cw: unknown, def: unknown) => void })
    .useCombatWeapon(combatWeapon(def), def);
}

interface Ms { useTime: number; fired: number; maxShots: number; fire: () => void }
/** R26/R27 消费面公式直驱（updateSwingHits 同式）：整窗拍进,返回实际发数（含首发） */
function consumeShots(swing: { dur: number }, ms: Ms): number {
  let fired = ms.fired;
  let refires = 0;
  for (let elapsed = 0; elapsed <= swing.dur; elapsed++) {
    const mscycle = Math.floor(elapsed / ms.useTime);
    if (mscycle > fired - 1 && mscycle <= ms.maxShots - 1) {
      fired = mscycle + 1;
      refires++;
      ms.fire();
    }
  }
  return 1 + refires;
}

// ==================== 纯函数锁（取整式/发数式,与原版逐式对照） ====================
describe('slowMagicWindowGrow（SetItemAnimation(useAnimation,2.5) :4463-4468 截断式）', () => {
  it('3053: ⌊21×2.5⌋−21 = 31 → 窗 22+31 = 53 = (int)(21×2.5)+num1（itemAnimationMax）', () => {
    expect(slowMagicWindowGrow(21, true)).toBe(31);
    // (int) 截断:21×2.5=52.5 → 52（非 round 53）——与 getSlowMagicUseTime 同族取整
    expect(Math.floor(21 * 2.5)).toBe(52);
    expect(slowMagicWindowGrow(21, true)).not.toBe(32);   // round 反证钉
  });
  it('3787/1336/6152(vanilla A0) 逐件增量', () => {
    expect(slowMagicWindowGrow(12, true)).toBe(18);   // ⌊30⌋−12（天界碎裂）
    expect(slowMagicWindowGrow(18, true)).toBe(27);   // ⌊45⌋−18（黄金雨）
    expect(slowMagicWindowGrow(40, true)).toBe(60);   // ⌊100⌋−40（日耀花 vanilla A0）
    expect(slowMagicWindowGrow(7, true)).toBe(10);    // ⌊17.5⌋−7=10（截断半值反证）
  });
  it('slow=false → 0（正常施法窗零改动回归锁）;anim0 undefined/0 → 0（缺数据面旁路支）', () => {
    expect(slowMagicWindowGrow(21, false)).toBe(0);
    expect(slowMagicWindowGrow(undefined, true)).toBe(0);
    expect(slowMagicWindowGrow(0, true)).toBe(0);
  });
});

describe('slowMagicSprayPlan（flag4 :43871-43903 发数式,慢施缩放对）', () => {
  it('3053 慢施：A_eff=53−1−0=52,U_eff=⌊7×2.5⌋=17 → 1+⌊51/17⌋=4 发（修前裸对 21/7=3）', () => {
    const plan = slowMagicSprayPlan(true, 21, 7, 21, 53, 0);
    expect(plan).not.toBeNull();
    expect(plan!.shots).toBe(4);
    expect(plan!.window).toBe(52);
  });
  it('慢施相位映射 52/35/18/1 + flag3 门 8 → 仅末发精确（台账「第 4 发精确」）', () => {
    const phases = [0, 1, 2, 3].map((k) => 52 - k * 17);
    expect(phases).toEqual([52, 35, 18, 1]);
    expect(phases.map((p) => p <= 7 + 1)).toEqual([false, false, false, true]);
  });
  it('3787 慢施（rd=18 后摇帧保留在窗外）：窗 30+18=48,A_eff=48−1−18=29,U_eff=10 → 3 发', () => {
    // 原版慢施窗 = ⌊12×2.5⌋+num0 = 30（reuseDelay>0 → num=0）,rd 系本仓「后摇并入
    // 动画尾」模型不占 vanilla 动画面 → A_eff 必须扣回 rd
    expect(slowMagicWindowGrow(12, true)).toBe(18);
    expect(slowMagicSprayPlan(true, 12, 4, 12, 48, 18)!.shots).toBe(3);
  });
  it('1336 慢施：窗 19+27=46（=⌊18×2.5⌋+1）,U_eff=15 → 1+⌊44/15⌋=3 发', () => {
    expect(slowMagicSprayPlan(true, 18, 6, 18, 46, 0)!.shots).toBe(3);
  });
  it('slow=false / anim0 undefined → 透传既有裸值对（R26 冻结面零改动）', () => {
    expect(slowMagicSprayPlan(false, 21, 7, 21, 53, 0)).toEqual(sprayCyclePlan(21, 7));
    expect(slowMagicSprayPlan(false, 21, 7, 21, 53, 0)!.shots).toBe(3);
    // anim0 undefined（数据面缺行形态）→ 旁路支（U≥A → sprayCyclePlan null → 消费侧
    // ?? 1）。★2026-09-03 勘误：6152/6173 的 useAnimation 已由 vanillaItemCombat
    // EXTRACT_PATCH 批 C 回填（40/18）,实机不再走本旁路——满蓝行为锁见文末 describe
    expect(slowMagicSprayPlan(true, 4, 4, undefined, 31, 0)).toEqual(sprayCyclePlan(4, 4));
    expect(slowMagicSprayPlan(true, 4, 4, undefined, 31, 0)).toBeNull();
  });
});

// ==================== 行为锁（useCombatWeapon 真链） ====================
describe('3053 暗影炎弓：空蓝慢施窗 ×2.5 + 发数对齐原版（F-03 主病）', () => {
  it('【①窗拉伸】空蓝：swing.dur 22 → 53（=⌊21×2.5⌋+num1,t 同步 = 新窗满相）', () => {
    const { g, player } = magicGame(3053, { mana: 2 });
    fireCombatWeapon(g, 3053);
    expect(player.slowMagicUse).toBe(true);            // :53258-53261 空蓝照放
    expect(player.mana).toBe(0);                       // :53243 statMana=0
    const sw = g.swing as { t: number; dur: number };
    expect(sw.dur).toBe(53);
    expect(sw.t).toBe(53);
  });
  it('【②发数】空蓝：multishot U=17/maxShots=4 → 整窗实发 4（修前 2）', () => {
    const { g } = magicGame(3053, { mana: 2 });
    fireCombatWeapon(g, 3053);
    const sw = g.swing as { dur: number; multishot: Ms };
    expect(sw.multishot.useTime).toBe(17);             // ⌊7×2.5⌋（:47594-47601）
    expect(sw.multishot.maxShots).toBe(4);             // 慢施缩放对 52/17
    expect(consumeShots(sw, sw.multishot)).toBe(4);
  });
  it('【③正常回归锁】满蓝：窗 22 不拉伸 / U=7 / maxShots=3 / 实发 3（逐字段恒等修前值）', () => {
    const { g, player } = magicGame(3053, { mana: 100 });
    fireCombatWeapon(g, 3053);
    expect(player.slowMagicUse).toBe(false);
    expect(player.mana).toBe(94);                      // 100−6（cwCost 不吃慢施）
    const sw = g.swing as { t: number; dur: number; multishot: Ms };
    expect(sw.dur).toBe(22);                           // 21+num1（不拉伸）
    expect(sw.multishot.useTime).toBe(7);
    expect(sw.multishot.maxShots).toBe(3);             // 1+⌊20/7⌋（R26 原值）
    expect(consumeShots(sw, sw.multishot)).toBe(3);
    expect(player.useTime).toBe(22);                   // 窗冷却=窗（透传）
  });
  it('【④窗冷却】空蓝：useTime=53=拉伸窗本身（旧式 getSlowMagicUseTime(53)→132 / 修前 55 双反证钉）', () => {
    const { g, player } = magicGame(3053, { mana: 2 });
    fireCombatWeapon(g, 3053);
    expect(player.useTime).toBe(53);
    expect(player.useTime).not.toBe(132);              // 双重缩放反证
    expect(player.useTime).not.toBe(55);               // 修前值（2.5×22,窗未拉伸时代）反证
  });
});

describe('同族窗化 multishot 支（慢施缩放对 + 窗冷却收口）', () => {
  it('3787 天界碎裂（rd=18）：空蓝窗 30 → 48（rd 帧保留）,maxShots 慢施对=3;满蓝 30/3 不变', () => {
    const slow = magicGame(3787, { mana: 2 });
    fireCombatWeapon(slow.g, 3787);
    expect(slow.player.slowMagicUse).toBe(true);
    const swS = slow.g.swing as { dur: number; multishot: Ms };
    expect(swS.dur).toBe(48);                          // ⌊12×2.5⌋+num0+rd18 = 48
    expect(swS.multishot.maxShots).toBe(3);
    expect(consumeShots(swS, swS.multishot)).toBe(3);
    expect(slow.player.useTime).toBe(48);
    const norm = magicGame(3787, { mana: 100 });
    fireCombatWeapon(norm.g, 3787);
    const swN = norm.g.swing as { dur: number; multishot: Ms };
    expect(swN.dur).toBe(30);                          // 12+rd18（不拉伸）
    expect(swN.multishot.maxShots).toBe(3);
    expect(consumeShots(swN, swN.multishot)).toBe(3);
    expect(norm.player.useTime).toBe(30);
  });
  it('1336 黄金雨（spray27 通用尾支）：空蓝窗 19 → 46（=⌊18×2.5⌋+1）;满蓝 19 不变', () => {
    const slow = magicGame(1336, { mana: 2 });
    fireCombatWeapon(slow.g, 1336);
    expect(slow.player.slowMagicUse).toBe(true);
    expect((slow.g.swing as { dur: number }).dur).toBe(46);
    expect(slow.player.useTime).toBe(45);              // winScaled27=⌊18×2.5⌋（既有慢施冷却值）
    const norm = magicGame(1336, { mana: 100 });
    fireCombatWeapon(norm.g, 1336);
    expect((norm.g.swing as { dur: number }).dur).toBe(19);
    expect(norm.player.useTime).toBe(18);
  });
  // ★R3-F1（2026-09-03 第三轮红蓝清偿）：邻接缺陷已修——尾支 useSwing（2026-08-31
  // 「useSwing 补漏」批引入）重起 this.swing 曾【丢弃】上方注册的 swing.multishot
  // （修前探针 1336 满蓝 swing 无 multishot 字段=黄金雨整族一窗一发,与 R26 探针
  // spawnTicks=[0,6,12,18] 相悖）。修=尾支 useSwing 后原样回挂 multishot（含 gate
  // 闭包,读实时相位语义不变;Game.ts case 'magic' 尾块 ms27 局部提升+回挂）
  it('【R3-F1】1336 满蓝 multishot 存活（尾支 useSwing 不再丢弃;R26 冻结面发数 3/U6 不变）', () => {
    const { g } = magicGame(1336, { mana: 100 });
    fireCombatWeapon(g, 1336);
    const ms = (g.swing as { multishot?: Ms }).multishot;
    expect(ms).toBeDefined();
    expect(ms!.useTime).toBe(6);
    expect(ms!.maxShots).toBe(3);                      // sprayCyclePlan(18,6) 透传（R26 冻结面）
    expect(consumeShots(g.swing as { dur: number }, ms!)).toBe(3);
  });
  it('【R3-F1】1336 空蓝慢施 multishot 存活且按缩放对消费（U_eff=15/maxShots=3——窗 46 拉伸自此真实生效）', () => {
    const slow = magicGame(1336, { mana: 2 });
    fireCombatWeapon(slow.g, 1336);
    expect(slow.player.slowMagicUse).toBe(true);
    const sw = slow.g.swing as { dur: number; multishot: Ms };
    expect(sw.dur).toBe(46);
    const ms = (slow.g.swing as { multishot?: Ms }).multishot;
    expect(ms).toBeDefined();
    expect(ms!.useTime).toBe(15);                      // ⌊6×2.5⌋（ApplyItemTime(sItem,2.5) :47594）
    expect(ms!.maxShots).toBe(3);                      // A_eff=46−1−0=45,⌊44/15⌋+1=3
    expect(consumeShots(sw, ms!)).toBe(3);
  });
});

describe('Player 慢施通道取整式同族（:47425-47432/:47453-47456）', () => {
  it('getSlowMagicUseTime=Math.floor(2.5×t)（(int) 截断同式）;窗增量恒等 ⌊2.5A⌋−A', () => {
    const p = new Player(50 * TILE, 90 * TILE, new Inventory());
    p.slowMagicUse = false;
    expect(p.getSlowMagicUseTime(7)).toBe(7);
    p.slowMagicUse = true;
    expect(p.getSlowMagicUseTime(7)).toBe(17);         // 17.5 截断
    expect(p.getSlowMagicUseTime(53)).toBe(132);       // 故冷却面必须用拉伸窗本身
    for (const a0 of [7, 12, 18, 21, 40]) {
      expect(slowMagicWindowGrow(a0, true)).toBe(Math.floor(a0 * 2.5) - a0);
    }
  });
});

// ==================== 6152 太阳花法杖 / 6173 电弧涌动：满蓝 multishot 按原版 useAnimation ====================
// 数据面（2026-09-03 提取缺口验证批）：vanilla-itemcombat.json 两行确缺 useAnimation
// （提取器不解析 DefaultToMagicWeapon/DefaultToStaff 形参赋值）,但 vanillaItemCombat.ts
// EXTRACT_PATCH 批 C 已逐件回填终值——若缺行,cw.useAnimation 回退 useTime
// （combatWeapon magic 支 `useAnimation: c.useAnimation ?? base.useTime`）→
// sprayCyclePlan(U,U)=null → 消费侧 ?? 1 = 满蓝恒 1 发。本组锁回填后的满蓝发数：
//   6152 Item.cs:47411-47422 DefaultToMagicWeapon(1114,40,6f)→useAnim=40 + useTime=4 直写
//   6173 Item.cs:47556-47563 DefaultToStaff(1122,8f,18,18)→useAnim=18 + useTime=6 直写
describe('6152/6173 满蓝 multishot（EXTRACT_PATCH useAnimation 数据面闸门）', () => {
  it('6152 太阳花法杖：A=40（DefaultToMagicWeapon 形参 :47413）满蓝窗 41/U4/maxShots=10/实发 10', () => {
    expect(itemCombat(6152)?.useAnimation).toBe(40);   // json 缺行 → EXTRACT_PATCH '6152' 回填
    expect(itemCombat(6152)?.useTime).toBe(4);         // :47414 直写
    const { g, player } = magicGame(6152, { mana: 100 });
    fireCombatWeapon(g, 6152);
    expect(player.slowMagicUse).toBe(false);
    expect(player.mana).toBe(95);                      // 100−5（窗首拍一扣,续发免扣 :53276）
    const sw = g.swing as { dur: number; multishot: Ms };
    expect(sw.dur).toBe(41);                           // A40+num1（useStyle5+autoReuse+rd0+U≤A+shoot>0）
    expect(sw.multishot.useTime).toBe(4);              // 慢施未置位 → U0 透传
    expect(sw.multishot.maxShots).toBe(10);            // sprayCyclePlan(40,4) = 1+⌊39/4⌋（缺行形态=1）
    expect(consumeShots(sw, sw.multishot)).toBe(10);   // 整窗拍进实发 10
    expect(player.useTime).toBe(41);                   // 窗冷却=窗（透传）
  });
  it('6173 电弧涌动：A=18（DefaultToStaff 形参 :47557）满蓝窗 19/U6/maxShots=3/实发 3', () => {
    expect(itemCombat(6173)?.useAnimation).toBe(18);   // json 缺行 → EXTRACT_PATCH '6173' 回填
    expect(itemCombat(6173)?.useTime).toBe(6);         // :47558 直写
    const { g, player } = magicGame(6173, { mana: 100 });
    fireCombatWeapon(g, 6173);
    expect(player.slowMagicUse).toBe(false);
    expect(player.mana).toBe(82);                      // 100−18
    const sw = g.swing as { dur: number; multishot: Ms };
    expect(sw.dur).toBe(19);                           // A18+num1
    expect(sw.multishot.useTime).toBe(6);
    expect(sw.multishot.maxShots).toBe(3);             // sprayCyclePlan(18,6) = 1+⌊17/6⌋（缺行形态=1）
    expect(consumeShots(sw, sw.multishot)).toBe(3);
    expect(player.useTime).toBe(19);
  });
});

// ==================== F-7（登记项②,2026-09-03）：非 spray 魔法（U≥A 族）慢施挥击姿势窗拉伸 ====================
// 原版 ApplyItemAnimation slowMagic 支 SetItemAnimation(useAnimation, 2.5)（Player.cs:
// :4463-4468,DebugOptions.ManaV2 && sItem.mana > 0 && slowMagicUse）对【所有】施魔件生效
// ——与是否连射（useTime<useAnimation）、与 useStyle 无关（近战乘区/放置支先截走者除外）。
// 修前缺口：付款点 smGrow 拉伸被「尾支 useSwing 补漏」（2026-08-31 批,Case 尾重起窗）重置,
// spray27 的 growTail 回拉只覆盖 useTime<useAnimation 连射族 → U≥A 单击族慢施姿势窗仍是
// 裸 A0（提前 60% 收杖）。修面 = Game.regrowSlowMagicSwing 补拉口，覆盖三处重置位：
// 非 spray 通用尾支 / 1121 蜂枪 / 1155 黄蜂枪专支重播（1244 云杖走专支不重播=付款点拉伸
// 自存,一并锁作对照）。取整式全组与 vanilla (int) 截断 + num 补间帧（useStyle5+autoReuse+
// reuseDelay==0+U≤A+shoot>0 → +1）逐式对照。
describe('非 spray 魔法慢施挥击姿势窗拉伸（F-7,U≥A 族三重置位）', () => {
  it('272 恶魔镰刀（U=A=20,us5,generic 尾支）：空蓝窗 20 → 50 = ⌊20×2.5⌋（num0）;满蓝 20 不变', () => {
    expect(itemCombat(272)?.useTime).toBe(20);
    expect(itemCombat(272)?.useAnimation).toBe(20);
    const { g, player } = magicGame(272, { mana: 2 });
    fireCombatWeapon(g, 272);
    expect(player.slowMagicUse).toBe(true);
    const sw = g.swing as { t: number; dur: number; multishot?: unknown };
    expect(sw.dur).toBe(50);                           // ⌊20×2.5⌋（autoReuse 缺 → num0）
    expect(sw.t).toBe(50);                             // 起手即满相（新窗）
    expect(sw.multishot).toBeUndefined();              // U≥A → sprayCyclePlan null（无窗内续发）
    expect(player.useTime).toBe(50);                   // U 侧 ⌊20×2.5⌋（既有面,双面同步）
    // 满蓝回归锁：窗/U 逐字段恒等修前值
    const g2p = magicGame(272, { mana: 100 });
    fireCombatWeapon(g2p.g, 272);
    expect(g2p.player.slowMagicUse).toBe(false);
    expect(g2p.player.mana).toBe(86);                  // 100−14
    const sw2 = g2p.g.swing as { t: number; dur: number };
    expect(sw2.dur).toBe(20);
    expect(sw2.t).toBe(20);
    expect(g2p.player.useTime).toBe(20);
  });

  it('1244 雨云杖（U=A=22,us1,云 237 专支不重播 useSwing）：空蓝窗 22 → 55 = ⌊22×2.5⌋;满蓝 22 不变', () => {
    expect(itemCombat(1244)?.useTime).toBe(22);
    expect(itemCombat(1244)?.useAnimation).toBe(22);
    const { g, player } = magicGame(1244, { mana: 2 });
    fireCombatWeapon(g, 1244);
    expect(player.slowMagicUse).toBe(true);
    const sw = g.swing as { t: number; dur: number };
    expect(sw.dur).toBe(55);                           // 付款点拉伸在专支存续（无重播重置）
    expect(sw.t).toBe(55);
    expect(player.useTime).toBe(55);                   // U 侧 ⌊22×2.5⌋
    const g2p = magicGame(1244, { mana: 100 });
    fireCombatWeapon(g2p.g, 1244);
    expect(g2p.player.mana).toBe(70);                  // 100−30
    expect((g2p.g.swing as { dur: number }).dur).toBe(22);
    expect(g2p.player.useTime).toBe(22);
  });

  it('1121 蜂枪（U=A=12,us5+autoReuse,volley 专支重播 useSwing）：空蓝窗 13 → 31 = ⌊12×2.5⌋+num1', () => {
    expect(itemCombat(1121)?.useTime).toBe(12);
    expect(itemCombat(1121)?.useAnimation).toBe(12);
    const { g, player } = magicGame(1121, { mana: 2 });
    fireCombatWeapon(g, 1121);
    expect(player.slowMagicUse).toBe(true);
    const sw = g.swing as { t: number; dur: number };
    expect(sw.dur).toBe(31);                           // 30+num1（:4469-4472 itemAnimationMax+=num）
    expect(sw.t).toBe(31);
    expect(player.useTime).toBe(30);                   // U 侧 ⌊12×2.5⌋（volley 收口既有面）
    const g2p = magicGame(1121, { mana: 100 });
    fireCombatWeapon(g2p.g, 1121);
    expect((g2p.g.swing as { dur: number }).dur).toBe(13);   // 12+num1（不拉伸）
  });

  it('1155 黄蜂枪（U=A=18,us5+autoReuse,volley 专支重播 useSwing）：空蓝窗 19 → 46 = ⌊18×2.5⌋+num1', () => {
    expect(itemCombat(1155)?.useTime).toBe(18);
    expect(itemCombat(1155)?.useAnimation).toBe(18);
    const { g, player } = magicGame(1155, { mana: 2 });
    fireCombatWeapon(g, 1155);
    expect(player.slowMagicUse).toBe(true);
    const sw = g.swing as { t: number; dur: number };
    expect(sw.dur).toBe(46);                           // 45+num1
    expect(sw.t).toBe(46);
    expect(player.useTime).toBe(45);                   // U 侧 ⌊18×2.5⌋
    const g2p = magicGame(1155, { mana: 100 });
    fireCombatWeapon(g2p.g, 1155);
    expect((g2p.g.swing as { dur: number }).dur).toBe(19);   // 18+num1（不拉伸）
  });

  it('【反证钉】regrow 补拉口无效化 → 272 空蓝窗回落裸 20（修前形态,载重证明）', () => {
    const { g } = magicGame(272, { mana: 2 });
    (g as unknown as { regrowSlowMagicSwing: () => void }).regrowSlowMagicSwing = () => {};
    fireCombatWeapon(g, 272);
    const sw = g.swing as { dur: number };
    expect(sw.dur).toBe(20);                 // 付款点拉伸被尾支 useSwing 重置后的修前形态
    expect(sw.dur).not.toBe(50);
  });
});
