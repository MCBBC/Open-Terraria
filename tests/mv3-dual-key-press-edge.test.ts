// ★MV3（2026-10-07）双击入窗沿·双键同按面（MV2 收官登记债⑤）清偿守卫。
//
// 案情：原版双击冲刺沿 = `controlRight && releaseRight` / `controlLeft && releaseLeft`
//   （DoCommonDashHandle :21749/:21764），而 releaseRight/Left 由 Update 尾
//   :27827-27845 `releaseRight = !controlRight` 逐拍刷新（位次晚于 DashMovement
//   调用 :26691/:26958 ⇒ 消费面读到上一拍键态）⟺ **单键按下沿**
//   `controlRight ∧ ¬controlRight(前拍)`——双键同按时另一键的按/放不产生本键沿。
//   仓内旧实现用 inputX 合值沿（inputX≠0 ∧ prevInputX=0）承载，在双键同按面：
//   ① 松本键 → inputX 0→∓1 = 假沿（反向窗提前 1 拍登记，原版该拍零登记）；
//   ② 反向窗活时再松本键 → **反向冲刺**（原版同手势冲双击键方向）；
//   ③ 本键重按 → inputX 归 0 = 真沿丢失（原版 :21760/:21775 照登记 ±15 窗）。
//
// 修：沿改单键承载 prevInputLeft/prevInputRight（≙ 原版 releaseLeft/Right 真值源，
//   与 prevInputX 同址五站快照：死亡/坐睡/矿车×2/主尾拍）+ dashDir 改分支向硬编码
//   （原版 :21755 dir=1 / :21769 dir=-1，旧 `keyNum ?: inputX` 在双键同按 inputX=0
//   时丢窗）+ 困惑布尔面轮换补齐（1457 :25190-25196，inputLeft/Right 是
//   controlLeft/Right 同源位，缺轮换=困惑期布尔面与合值面分叉）。
//
// 变异证红：见末尾 describe 注释（tapRight 回退合值沿 → 全组红；摘困惑轮换 → 困惑组红；
//   摘 dashDir=dashEntryDir → keyNum 角组红）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { BuffType } from '../src/stats/Buffs';
import { options } from '../src/core/Options';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

const W = 80, H = 80;
const GROUND_ROW = 30;

function fakeHooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p, enemies: () => [], critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, recLog: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
}

function mkPlayer(w: World, tx = 20): Player {
  const p = new Player(tx * TILE, GROUND_ROW * TILE - 48, new Inventory());
  p.hp = 500;
  p.inv.armor[3] = { id: iid(3097), stack: 1 };   // 克苏鲁护盾 dash2（14.5）
  return p;
}

const tick = (p: Player, w: World): void => { p.fixedUpdate(1 / 60, fakeHooks(w, p) as never); };

function plainWorld(): World {
  const w = new World(W, H, 11, 'mv3-plain');
  for (let x = 4; x < 78; x++) w.store.setTile(x, GROUND_ROW, 1);
  return w;
}

/** 双键同按电平注入（Game.ts:9923 同式 inputX=right−left） */
const both = (p: Player): void => { p.inputX = 0; p.inputLeft = true; p.inputRight = true; };
const onlyR = (p: Player): void => { p.inputX = 1; p.inputLeft = false; p.inputRight = true; };
const onlyL = (p: Player): void => { p.inputX = -1; p.inputLeft = true; p.inputRight = false; };
const none = (p: Player): void => { p.inputX = 0; p.inputLeft = false; p.inputRight = false; };

// ---------------------------------------------------------------------------
describe('MV3 基线 R0：单键域逐位不变（合值沿 ≙ 单键沿的既有域）', () => {
  it('单键双击右：按(登记+15)→松→按(窗活)→冲右 vx=+14.5', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    onlyR(p); tick(p, w);                     // 首按：登记右窗
    expect(p.dashT).toBe(15);
    none(p); for (let i = 0; i < 3; i++) tick(p, w);   // 松开
    onlyR(p); tick(p, w);                     // 二按：窗活 → 冲右
    expect(p.dashDelay).toBe(-1);
    expect(p.vx).toBeGreaterThan(10);
    expect(Math.sign(p.vx)).toBe(1);
  });

  it('单键双击左镜像：冲左 vx<0', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    onlyL(p); tick(p, w);
    expect(p.dashT).toBe(-15);
    none(p); for (let i = 0; i < 3; i++) tick(p, w);
    onlyL(p); tick(p, w);
    expect(p.dashDelay).toBe(-1);
    expect(Math.sign(p.vx)).toBe(-1);
  });

  it('窗过期（>15t）二按只重登记不冲刺（:21760 else 档）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    onlyR(p); tick(p, w);                     // 首按登记
    none(p);
    for (let i = 0; i < 20; i++) tick(p, w);  // 窗耗尽
    expect(p.dashT).toBe(0);
    onlyR(p); tick(p, w);                     // 二按：窗已死 → 重登记
    expect(p.dashT, '过期二按=重登记 ±15（原版 :21751 dashTime>0 门）').toBe(15);
    expect(p.dashDelay).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('MV3 债⑤核心：双键同按面（原版单键沿 vs 仓内合值沿假沿/丢沿）', () => {
  it('双键同按·单击右（一松一按）：松拍零登记，按拍登记【右】窗 +15（修前：松拍 −15 假沿）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 25; i++) { both(p); tick(p, w); }   // ≥16t：初始双按的合法窗（+15）先耗尽再测手势
    // 松右键（左仍按）：原版 releaseRight 该拍才翻真、controlRight=false → 右支不发
    //   =零登记；修前合值沿 inputX 0→−1 假沿 → 反向窗 −15。
    onlyL(p); tick(p, w);
    expect(p.dashT, '松键拍零登记（原版 :21749 controlRight=false 短路）').toBe(0);
    // 重按右键（双键同按）：原版 controlRight ∧ releaseRight(前拍松) → 右支 →
    //   dashTime=+15；修前 inputX 归 0 = 沿丢失。
    both(p); tick(p, w);
    expect(p.dashT, '入窗沿=右支 +15（原版 :21760 dashTime=15 按支硬编码）').toBe(15);
    expect(p.dashDelay).toBe(0);              // 未冲刺
  });

  it('双键同按·双击右 → 冲【右】（修前：二次松键反向冲左）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 25; i++) { both(p); tick(p, w); }   // ≥16t：初始双按的合法窗（+15）先耗尽再测手势
    onlyL(p); tick(p, w);                     // 松右：零登记
    both(p); tick(p, w);                      // 按右：登记 +15
    expect(p.dashT).toBe(15);
    onlyL(p); tick(p, w);                     // 再松右（窗衰减 15→14）
    both(p); tick(p, w);                      // 再按右：窗活 → 冲右
    expect(p.dashDelay).toBe(-1);
    expect(Math.sign(p.vx), '双击右必冲右（原版 dir=右支硬编码 :21755）').toBe(1);
  });

  it('双键同按·双击左镜像 → 冲【左】', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 25; i++) { both(p); tick(p, w); }   // ≥16t：初始双按的合法窗（+15）先耗尽再测手势
    onlyR(p); tick(p, w);                     // 松左：零登记
    expect(p.dashT).toBe(0);
    both(p); tick(p, w);                      // 按左：登记 −15
    expect(p.dashT).toBe(-15);
    onlyR(p); tick(p, w);
    both(p); tick(p, w);                      // 二按左：冲左
    expect(p.dashDelay).toBe(-1);
    expect(Math.sign(p.vx), '双击左必冲左').toBe(-1);
  });

  it('双键同按·双键同拍新按下：右支优先登记 +15（原版右支先判 :21749）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    both(p); tick(p, w);                      // 双键同拍新按：两沿同拍发 → 右支胜
    expect(p.dashT, '右支优先（原版 if 右 else if 左 序）').toBe(15);
  });
});

// ---------------------------------------------------------------------------
describe('MV3 dashDir=分支向：keyNum 角（原版沿支优先于 num==∓1）', () => {
  it('facing=−1+双键同按+Dash键二拍armed：按右拍沿支优先 → 登记 +15 不即冲（修前：num=−1 即冲左）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    p.facing = -1;
    for (let i = 0; i < 25; i++) { both(p); tick(p, w); }   // ≥16t：初始双按的合法窗（+15）先耗尽再测手势   // 双键同按稳态
    // 松右拍：Dash 键未按（inputDash=false → num=0）+ 左沿不发 = 零登记零冲刺
    onlyL(p); p.inputDash = false; p.releaseDash = true;    // 注入面 releaseDash |= !inputDash 预臂
    tick(p, w);
    expect(p.dashT).toBe(0);
    expect(p.dashDelay).toBe(0);
    // 按右拍：inputDash=true（releaseDash 保持 true=注入面语义）+ 右沿发。
    //   原版：右支 `(controlRight && releaseRight) & flag` 先判 → 命中 →
    //   dashTime>0 ∨ num==1 均否（num=−1）→ else 登记 dashTime=+15（:21760）；
    //   num==−1 的左支被右支短接=不可达。修前：合值沿丢右沿 → keyNum=−1 落左支
    //   → num==−1 即冲左（原文不可能路径）。
    both(p); p.inputDash = true; p.releaseDash = true;
    tick(p, w);
    expect(p.dashT, '沿支优先 → 登记 +15（原版 :21749 右支短接 num==−1 左支）').toBe(15);
    expect(p.dashDelay).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('MV3 CCed 拍相互作用（MV2② × 沿检测；结网/冻结拍双击手势=原版同相）', () => {
  it('结网拍双键同按稳态 → 解除拍双键仍按：右支沿优先登记 +15（原版 CCed 拍 release 双真）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 25; i++) { both(p); tick(p, w); }   // ≥16t：初始双按的合法窗（+15）先耗尽再测手势
    p.buffs.apply(BuffType.Webbed, 2);
    both(p); tick(p, w);                      // CCed 拍：输入清零（:25432），release 面原版置双真
    expect(p.inputLeft).toBe(false);
    expect(p.inputRight).toBe(false);
    p.buffs.remove(BuffType.Webbed);
    both(p); tick(p, w);                      // 解除拍：双键仍按 = 双新按沿 → 右支优先
    expect(p.dashT, '解除拍双沿同发 → 右支 +15（原版 :21749 右支先判同相）').toBe(15);
    expect(p.dashDelay).toBe(0);
  });

  it('冻结拍按住右 → 解除拍仍按：单键沿登记 +15（原版 releaseRight 冻结拍置真同相）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 25; i++) { onlyR(p); tick(p, w); }  // ≥16t：初始右按的合法窗先耗尽再测手势
    p.buffs.apply(BuffType.Frozen, 2);
    onlyR(p); tick(p, w);
    p.buffs.remove(BuffType.Frozen);
    onlyR(p); tick(p, w);                     // 解除拍：右仍按 = 新按沿
    expect(p.dashT).toBe(15);
    expect(p.dashDelay).toBe(0);
  });

  it('CCed 拍不消费沿：结网期松按右不登记（原版 control 已清=沿不可达）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 25; i++) { both(p); tick(p, w); }   // ≥16t：初始双按的合法窗（+15）先耗尽再测手势
    p.buffs.apply(BuffType.Webbed, 2);
    onlyL(p); tick(p, w);                     // 结网拍内松右（原版 controlRight 已清）
    expect(p.dashT).toBe(0);
    both(p); tick(p, w);                      // 结网拍内按回
    expect(p.dashT).toBe(0);                  // CCed 拍零登记
  });
});

// ---------------------------------------------------------------------------
describe('MV3 困惑轮换面补齐（1457 :25190-25196 布尔面 L↔R）', () => {
  it('困惑期双击物理右 → 轮换后冲【左】窗 −15（原版 control 面轮换同相；守布尔轮换）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    p.buffs.apply(BuffType.Confused, 2);
    // 物理右新按（inputX/right 同 Game 注入式）→ 困惑轮换：控制面左新按 → 左窗
    onlyR(p); tick(p, w);
    expect(p.dashT, '困惑轮换：物理右按 = 控制面左沿 → −15（:25193-25194）').toBe(-15);
    none(p); for (let i = 0; i < 3; i++) tick(p, w);
    onlyR(p); tick(p, w);                     // 二按物理右 → 轮换左沿 → 冲左
    expect(p.dashDelay).toBe(-1);
    expect(Math.sign(p.vx), '困惑期双击物理右必冲左（轮换面）').toBe(-1);
  });

  it('困惑期独立电平自证：轮换后 inputLeft/inputRight 与 inputX 同面（合值↔布尔不分叉）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    p.buffs.apply(BuffType.Confused, 2);
    onlyR(p); tick(p, w);
    expect(p.inputX).toBe(-1);                // 合值面轮换（既有）
    expect(p.inputRight, '布尔面同轮换（★MV3 补）').toBe(false);
    expect(p.inputLeft).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('MV3 早退态单键沿同源刷新（MV2④ 同址五站）', () => {
  it('矿车拍 prevInputLeft/Right 照走；车拍按压不产生下车后幽灵沿', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    p.ridingCart = true;
    onlyR(p);
    for (let i = 0; i < 3; i++) tick(p, w);
    expect(p.prevInputRight, '矿车拍单键沿照刷（:27827 无条件同源）').toBe(true);
    expect(p.prevInputX).toBe(1);
    // 下车后按住不松：沿已在车拍被消费态（prev=真）→ 不登记新窗
    p.ridingCart = false;
    onlyR(p); tick(p, w);
    expect(p.dashT, '车拍按压沿已入 prev → 下车后按住不重发（原版沿相位同）').toBe(0);
    // 松→按 = 真新沿 → 登记
    none(p); tick(p, w);
    onlyR(p); tick(p, w);
    expect(p.dashT).toBe(15);
  });

  it('死亡拍 prevInputLeft/Right 照走（UpdateDead :17192-17193 同源）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
    p.hp = 0; p.dead = true; p.respawnTimer = 100;
    onlyL(p);
    for (let i = 0; i < 3; i++) tick(p, w);
    expect(p.prevInputLeft).toBe(true);
    expect(p.prevInputX).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
describe('MV3 flag 门与 releaseDash 闩不回归（BJ508 语义）', () => {
  it('doubleTapDash=false：单键双击不冲不合窗（沿面全关，num 支不受门）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    const prev = options.data.doubleTapDash;
    options.data.doubleTapDash = false;
    try {
      for (let i = 0; i < 10; i++) { none(p); tick(p, w); }
      onlyR(p); tick(p, w);
      expect(p.dashT, 'flag 关 = 沿面全关（:21749 flag 门）').toBe(0);
      none(p); for (let i = 0; i < 3; i++) tick(p, w);
      onlyR(p); tick(p, w);
      expect(p.dashT).toBe(0);
      expect(p.dashDelay).toBe(0);
    } finally {
      options.data.doubleTapDash = prev;
    }
  });
});

// ---------------------------------------------------------------------------
// 变异证红记录（2026-10-07 实测）：
//  M1 tapRight/tapLeft 回退合值沿（inputX≠0∧prev=0）→ 本文件 8 组全红
//     （松拍 −15 假沿 / 按拍丢沿 / 双击反向 / keyNum 角即冲左）。
//  M2 摘困惑布尔轮换（flMV3 三行）→ 「困惑轮换面补齐」两组红（+15/右冲反相）。
//  M3 dashDir 回退 `dashKeyNum ?: inputX` → keyNum 角组红（+15 → −14.5 即冲）。
//  M4 摘主尾拍 prevInputLeft/Right 快照 → 基线 R0 双击组红（沿永不满：prev 恒 false
//     → 按住每拍重登记；实测首按后二按不冲）。
