// BJ451 分块显示账结转（dotChunkOut 残块时点,纯显示面）——BJ447 登记债清偿刀。
//
// 定谳（1457 反编译 Player.cs 亲读,原版负兑付语义）：
//   · :1919 `public int lifeRegen` / :1921 `public int lifeRegenCount` —— 流率与
//     账面双 int;:19384 `lifeRegenCount += lifeRegen` —— 全流量（DoT+蜂蜜对冲
//     +4+蜂蜜 flat+2+自然回复）合一本账;
//   · :19407 正兑付 / :19436 灼烧(-600) / :19467 极饿(-num13) / :19478 通用负兑付
//     `while (lifeRegenCount <= -120) { num14 = min(count/-120, 4); …;
//     HurtLifeRegen(num14); }` —— 【每 tick 无条件跑账面检查,兑付条件=账面值跨
//     门槛,与当拍 lifeRegen 流量符号无关】。直接证伪「只在负 heal 拍弹」：
//     :19436 灼烧环退出残账 ∈(-600,-120]（环只加 600）,灼烧/窒息熄灭后下一拍由
//     :19478 通用环即时兑付——可在正流量拍弹字;极饿 :19467 同构（退出 >-num13 ≤
//     -240）。残账结转只存在于【账面低于兑付门槛】的尘埃（|count|<120 通用环不变
//     量）;整 HP（≥120 单位当量）账面债当拍必兑、不留过夜;
//   · :19509-19514 HurtLifeRegen：statLife 扣减同拍 CombatText.NewText(dot:true)
//     弹字（LifeRegen 色,dot 形态）。
// 本仓映射：dotChunkOut（整 HP 口径）= lifeRegenCount 负兑付账的显示面同构——
//   dotChunkOut > 0 ⟺ 账面已跨门槛,按原版应【当拍弹出】。旧消费门 `buffHeal < 0`
//   （当拍流量符号门）令整 HP 残块跨拍滞留 = 原版账面不可能态（BJ447 整数化后
//   确定性可达：蜂蜜 flat 对冲拍与 DoT 分块拍对齐 → buffHeal 恰 0,如 OnFire+
//   Venom+Honey t60 邻域）。修 = Player 消费门加 dotActiveTick 支（Buffs.tick
//   「本 tick DoT 流量在账」谓词,Player.ts:4277 lifeRegenTime 复位门同款消费面）,
//   弹字块移出 heal 写入分支独立冲刷（覆盖 buffHeal≥0 的对齐拍/正流量拍;hp 写入
//   面零改动）。
// 判别面（变异=摘 dotActiveTick 支 → ① 红）：
//   ① 对齐拍当拍弹出：存在 hp 净变化=0 且弹字照发的拍（flat 对冲 DoT 分块拍）,
//     且全窗口 dotChunkOut 无跨拍滞留（consumeDotChunk 恒 0 = :19478 环不变量）;
//   ② 净额守恒回归：BuffState 合成流率 vs 原版算式锚（OnFire+Venom+Honey →
//     -160±1/600t）;
//   ③ 冲刷重构不伤既有面：死亡拍弹字保留 + 弹字金额恒整数非零（BJ443 兜底）。
import { describe, expect, it } from 'vitest';
import { BuffState, BuffType } from '../src/stats/Buffs';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

// ---- 原版算式锚常量（Player.cs 行号见文件头） ----
const VAN_ONFIRE = -8;       // :18811 onFire lifeRegen -= 8（4 HP/s）
const VAN_VENOM = -30;       // :18791 venom lifeRegen -= 30（15 HP/s）
const VAN_HONEY_OFFSET = 4;  // :19214 honey 对冲 +4（DoT 在账时每 tick）
const VAN_HONEY_FLAT = 2;    // :19253 honey flat +2（1 HP/s,DoT 后不被清零）
const VAN_CHUNK = 120;       // :19478 lifeRegenCount 负弹出门槛（120 单位 = 1 HP）
const TICKS = 600;           // 10 s 窗口
const DT = 1 / 60;

const tripleDot = (b: BuffState) => {
  b.apply(BuffType.OnFire, 30);
  b.apply(BuffType.Venom, 30);
  b.apply(BuffType.Honey, 30);
};

// ---- Player.fixedUpdate 夹具（同 BJ443/BJ447;damagePlayer=0 屏蔽外源伤害） ----
const fakeHooks = (w: World, p: Player, captured: number[]) => ({
  world: w,
  player: p,
  enemies: () => [],
  critters: () => [],
  spawnDrop: () => null,
  damagePlayer: (): number => 0,
  addDamageNumber: (_x: number, _y: number, a: number) => { captured.push(a); },
  cutTile: () => {},
  onEnemyKilled: () => {},
  spawnEnemy: () => {},
  spawnParticles: () => {},
  notifyInventoryChanged: () => {},
  playSfx: () => {},
  playSfxFiles: () => {},
  showPickupLabel: () => {},
});

// ---- ① 对齐拍当拍弹出 + 账面无跨拍滞留 ----

describe('BJ451 ① 对齐拍当拍弹出 + 账面无跨拍滞留（:19478 环不变量）', () => {
  it('OnFire+Venom+Honey：flat 对冲拍弹字照发且 hp 净变化 0;dotChunkOut 即时清账', () => {
    const w = new World(60, 60, 42, 'bj451a');
    const p = new Player(20 * 16, 27 * 16, new Inventory());
    tripleDot(p.buffs);
    const captured: number[] = [];
    let alignedPops = 0;    // hp 净变化 0 且弹字照发 = 对齐拍当拍弹出（旧实现此拍不弹、残块过夜）
    let staleLeftover = 0;  // 冲刷后账面残留（旧实现在对齐拍 >0 = 整 HP 债过夜）
    for (let i = 0; i < TICKS && p.hp > 0; i++) {
      const hpBefore = p.hp;
      const lenBefore = captured.length;
      p.fixedUpdate(DT, fakeHooks(w, p, captured) as never);
      if (p.hp === hpBefore && captured.length > lenBefore) alignedPops++;
      staleLeftover += p.buffs.consumeDotChunk();
    }
    // 夹具有效性探针：对齐拍确实发生（旧符号门此拍既不弹字也无 hp 变化 → 双 0）
    expect(alignedPops).toBeGreaterThanOrEqual(1);
    // 判别面：整 HP 残块不当拍冲刷 = 账面跨拍滞留（修复前此处 >0 → 红）
    expect(staleLeftover).toBe(0);
  });
});

// ---- ② 净额守恒回归 ----

describe('BJ451 ② 净额守恒回归（原版算式锚,±1 延迟弹出容差）', () => {
  it('OnFire+Venom+Honey：BuffState 合成流率 = (-8-30+4+2)/120×600 = -160±1', () => {
    const b = new BuffState();
    tripleDot(b);
    let sum = 0;
    for (let k = 0; k < TICKS; k++) sum += b.tick(DT);
    const want = ((VAN_ONFIRE + VAN_VENOM + VAN_HONEY_OFFSET + VAN_HONEY_FLAT) / VAN_CHUNK) * TICKS;
    expect(sum).toBeGreaterThanOrEqual(want - 1);
    expect(sum).toBeLessThanOrEqual(want + 1);
  });
});

// ---- ③ 冲刷重构不伤既有面 ----

describe('BJ451 ③ 冲刷重构不伤既有面', () => {
  it('DoT 致死拍弹字保留（:19513 弹字与 statLife 扣减同拍,死亡拍照弹）', () => {
    const w = new World(60, 60, 42, 'bj451c');
    const p = new Player(20 * 16, 27 * 16, new Inventory());
    p.buffs.apply(BuffType.Burning, 30);
    const captured: number[] = [];
    let deathPop = false;
    for (let i = 0; i < 400 && p.hp > 0; i++) {
      const hpBefore = p.hp;
      const lenBefore = captured.length;
      p.fixedUpdate(DT, fakeHooks(w, p, captured) as never);
      if (hpBefore > 0 && p.hp <= 0) {
        deathPop = captured.length > lenBefore;
        break;
      }
    }
    expect(deathPop).toBe(true);
  });

  it('弹字金额恒整数且非零（BJ443 兜底不受冲刷位移动影响）', () => {
    const w = new World(60, 60, 42, 'bj451d');
    const p = new Player(20 * 16, 27 * 16, new Inventory());
    tripleDot(p.buffs);
    const captured: number[] = [];
    for (let i = 0; i < 300 && p.hp > 0; i++) {
      p.fixedUpdate(DT, fakeHooks(w, p, captured) as never);
    }
    expect(captured.length).toBeGreaterThanOrEqual(1);
    for (const v of captured) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).not.toBe(0);
    }
  });
});
