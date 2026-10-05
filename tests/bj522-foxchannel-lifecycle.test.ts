/**
 * BJ522（BJ521 登记债①清偿）：AI_026 localAI[0]=30 双消费定谳落刀。
 *
 * 【原版生命周期表（1457 Projectile.cs 亲读,flag8=1094/1113）】
 *  写：
 *   W0 Player.cs:43686-43689 TryUsingFoxsparksAbility（按下沿,:43064
 *      controlUseItem∧releaseUseItem∧itemAnimation==0 门——releaseUseItem 由
 *      :43160 逐拍置 !controlUseItem=按住恒假,非逐拍）→ ai[0]=1000/ai[1]=0/
 *      localAI[0]=0（localAI[1]=0 flag8 无消费不折）
 *      ★BJ523 勘误：「按住恒假」系漏读 autoReuse——狐杖 autoReuse=true
 *      （Item.cs:44503/:47377）→ :53519 逐拍强制 releaseUseItem=true,门闭真因=
 *      AI 续期 :60068 针 itemAnimation=2;调用集=按下沿∪岩浆持住重臂环（详见
 *      tests/bj523-fox-w0-invocation-face.test.ts 头注,BJ522 债①「须重按」证伪）
 *   W1 :60016 喷火块头（ai[0]>=1000 每拍）→ localAI[0]=0
 *   W2 :60092-60093 喷火循环尾（++ai[0]>=1004,num12=4=每 4t）→ ai[0]=flag13?1000:0
 *      ∧ localAI[0]=30（flag13 假=释放拍：ai[0]=0 与 30 同块落）
 *   W3 :62693 索敌接敌（flag22 支,CanHit 目标<800+num134）→ localAI[0]=60（num136）
 *   W4 :62741狐实际出弹（|Δx|≤num151 ∧ owner 本地）→ localAI[0]=num135
 *      （1094=42 :62573 / 1113=30）——同拍覆写 W3;伴生 ai[1]=num135 :62710
 *   W5 Player.cs:48944 召唤（5664/6149）→ localAI[0]=30（1157→191-194 同族
 *      :48928=flag6 域,未接线维持登记）
 *  读（四消费面）：
 *   R1 :61295-61297 归位门 num92+=500（flag10/266/flag7 支内,266 另 +100 :61298）
 *   R2 :61320 |Δy|>300 返程闸：flag10 族要求 !(localAI[0]>0) 才触发
 *   R3 :62590 flag22 射击抑制：flag8∧(alpha>0∨localAI[0]>0) → 不索敌不出弹
 *   R4 :63026-63028 朝向同步冻结：flag10∧ai[1]==0∧localAI[0]==0 才 direction=玩家
 *  清/减：
 *   D1 :62575-62578 idle 支（ai[0]==0∧!flag11）逐拍 localAI[0]-- 钳 0（1/t）
 *   C1 W1/W0 块头清零（W2 持住期写的 30 被下拍 W1 清零,且喷火块尾 return
 *      :60101 先于 R1-R4/D1=零观测窗）⇒「每 4t 循环尾重写」与「释放单写」
 *      观测等价,释放恒经 W2 落 30——BJ521 债面「循环尾重置缺」半句销案
 *  值域：{0, 30（W2/W5）, 42/30（W4）, 60（W3,狐恒被 W4 同拍覆写）}
 *
 * 【本仓形】a026L0=L[0] 槽 / shootCd=ai[1] 槽（BJ517 已接 R1-R4/D1/W3/W4 于
 *  ai026TailGround）;本刀=载体归真三处：
 *   ① lockAfterFoxChannel：shootCd → a026L0（旧形误触 :64730 攻击帧/
 *      :63014 制动/:63021 转向双清三 ai[1] 面,且 R1/R2/R4 三消费面全脱线）
 *   ② W0 按下沿清两槽（Game foxAbilityPress,foxChannel 上升沿=mouseDown 边沿,
 *      召唤拍不误清:本块先于 updateUse,召唤拍弹尚不存在）
 *   ③ 召唤臂 1113 armSpawnCooldown→armLingerCooldown（:48944 载体归真）
 *
 * 判别面：①载体（L0 落 30∧ai[1] 恒净）②+500 归位门加程（600px 环:无锁返/
 * 有锁驻）③|Δy| 闸+朝向冻结④W0 清两槽⑤flag22 抑制窗（接敌不出弹,期满出弹
 * =W4 落 42）⑥循环 4t 拍面（foxT%4 出弹 2/8t）+释放计数 30→0。夹具注：狐
 * alphaFade 出生 255（DoPalAppearEffect 淡入）−15/t→17t 归零,R3 门在淡入期
 * 同抑（原版同相）→出弹判别前垫 18t 沉淀;世界高 160（BJ521 同注）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINION_TS = readFileSync(join(ROOT, 'src', 'entities', 'MinionProj.ts'), 'utf8');
const GAME_TS = readFileSync(join(ROOT, 'src', 'core', 'Game.ts'), 'utf8');

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

function makeHooks(enemies: unknown[] = []) {
  const w = new World(200, 160, 7, 'bj522');
  for (let x = 0; x < 200; x++) for (let y = 140; y < 160; y++) w.store.setTile(x, y, 1);
  // 干台：row 92（x 70-90）——落地/出弹舞台（BJ521 同式）
  for (let x = 70; x <= 90; x++) w.store.setTile(x, 92, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => enemies as never,
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
    spawnDust: () => null,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown, b: string) => void } }).entities =
    { projectiles: [], add: (e: unknown, b: string) => { added.push(e); void b; } };
  return { hooks, store: w.store, player, world: w, added };
}

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

/** 狐出场淡入沉淀（alphaFade 255→0,17t;R3 门淡入期同抑=原版 :62590 alpha>0 面） */
const settleAppear = (m: MinionProj, h: ReturnType<typeof makeHooks>, ticks = 18): void => {
  for (let i = 0; i < ticks; i++) m.fixedUpdate(1, h.hooks);
  expect(priv(m).alphaFade, '出场淡入已沉淀（R3 alpha 臂退出）').toBe(0);
};

// ================================================================
// ① 生命周期钉值：载体归真（写/读/清位次源锚 + 行为钉值）
// ================================================================
describe('① 生命周期钉值（载体/清面/位次）', () => {
  it('源锚：W2 释放臂落 a026L0 槽（非 shootCd）+R1-R4/D1 消费面在位', () => {
    // W2（:60092-60093）载体——★本刀判别锚
    expect(MINION_TS).toContain('lockAfterFoxChannel(): void { this.a026L0 = Math.max(this.a026L0, 30); }');
    // D1（:62575-62578）/R1（:61295-61297）/R2（:61320）/R3（:62590）/R4（:63026-63028）
    expect(MINION_TS).toContain('if (this.a026L0 > 0) this.a026L0--;');
    expect(MINION_TS).toContain('+ (this.a026L0 > 0 ? 500 : 0)');
    expect(MINION_TS).toContain('(Math.abs(dyp) > 300 && this.a026L0 <= 0)');
    expect(MINION_TS).toContain('if (isF8 && (this.alphaFade > 0 || this.a026L0 > 0)) flag22 = false;');
    expect(MINION_TS).toContain('else if (isF10 && this.a026L0 === 0) this.facing = p.facing;');
    // W3/W4（:62693/:62741）
    expect(MINION_TS).toContain('this.a026L0 = 60;');
    expect(MINION_TS).toContain('if (isF8) this.a026L0 = shooter.cd ?? 30;');
  });

  it('W0 清面源锚：Game 调用沿调 foxAbilityPress 清两槽（★BJ523 扩形:按下沿∪岩浆重臂环）', () => {
    expect(MINION_TS).toContain('foxAbilityPress(): void { this.shootCd = 0; this.a026L0 = 0; this.foxT = 0; }');
    // :43064 起手门（mouseDown 边沿,_prevMouseDown 在 updateUse 后记账 :10626 →
    // 本块读相=上拍值=真边沿）;召唤拍不误清（本块先于 updateUse）。
    // ★BJ523：调用集=按下沿∪foxLavaHold 重臂环（autoReuse :53519 逐拍强制
    // releaseUseItem + :53524 fast-path,岩浆拍 AI 续期停 :60068 → 门重开每拍重调）
    // ——旧注「:43160 按住恒假」系漏读 autoReuse,勘误见 Game/MinionProj BJ523 注
    expect(GAME_TS).toContain('const foxW0 = (inp.mouseDown && !this._prevMouseDown) || m.foxLavaHold;');
    expect(GAME_TS).toContain('if (foxW0) m.foxAbilityPress();');
  });

  it('W0 行为：残留 ai[1]/L[0] 双清+循环相位归位（PC:43686-43689 同拍三写+ai[0]=1000f 相位）', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, h.player.cx + 100, h.player.cy);
    priv(m).shootCd = 42; priv(m).a026L0 = 42;      // 近射残留（W4 值域）
    priv(m).foxT = 3;                               // ★BJ523：喷火循环相位残留
    m.foxAbilityPress();
    expect(priv(m).shootCd, 'ai[1]=0f（:43687）').toBe(0);
    expect(priv(m).a026L0, 'localAI[0]=0f（:43688）').toBe(0);
    expect(priv(m).foxT, '★BJ523 foxT=0（ai[0]=1000f 循环相位归位——重按首拍即出弹）').toBe(0);
  });

  it('W2 行为：释放锁=L[0] 30 ∧ ai[1] 恒净（旧形 shootCd=30 污染判别面）', () => {
    const h = makeHooks();
    for (const pid of [1094, 1113]) {
      const m = minion(h.player, pid, h.player.cx + 100, h.player.cy);
      m.lockAfterFoxChannel();
      expect(priv(m).a026L0, `${pid} L[0]=30（:60093 值域）`).toBe(30);
      expect(priv(m).shootCd, `${pid} ai[1] 不落锁（旧形误写=BJ521 债面）`).toBe(0);
    }
  });

  it('召唤臂载体：armLingerCooldown 落 L[0] 槽 / armSpawnCooldown 仍 ai[0] 槽（1119 专）', () => {
    expect(GAME_TS).toContain('if (cw.shoot === 1113) spawned?.armLingerCooldown(30);');
    expect(GAME_TS).toContain('if (cw.shoot === 1119) spawned?.armSpawnCooldown(45);');
    const h = makeHooks();
    const f = minion(h.player, 1113, h.player.cx, h.player.cy);
    f.armLingerCooldown(30);                          // W5（Player.cs:48944）
    expect(priv(f).a026L0).toBe(30);
    expect(priv(f).shootCd).toBe(0);
    const g = minion(h.player, 1119, h.player.cx, h.player.cy);
    g.armSpawnCooldown(45);                           // :50115-50116 ai[0]=45（AI_206 开火循环）
    expect(priv(g).shootCd).toBe(45);
    expect(priv(g).a026L0).toBe(0);
  });

  it('D1 节拍：释放锁 30 → 1/t 递减恰 30t 归零（:62575 idle 支逐拍）', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, h.player.cx + 200, h.player.cy);
    m.lockAfterFoxChannel();
    expect(priv(m).a026L0).toBe(30);
    for (let i = 0; i < 15; i++) m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026L0, '15t 半程=15').toBe(15);
    for (let i = 0; i < 15; i++) m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026L0, '恰 30t 归零（值域下界 0 钳）').toBe(0);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).a026L0, '不越 0').toBe(0);
  });
});

// ================================================================
// ② R1/R2 双消费：归位门 +500 加程 + |Δy|>300 返程闸（:61292-61320 判别环）
// ================================================================
describe('② R1/R2 归位门加程（600px 环判别）', () => {
  it('R1：无锁 600px>num92(500) → 归位（ai[0]=1）;有锁 num92=1000 → 驻留', () => {
    const hA = makeHooks();
    const a = minion(hA.player, 1094, hA.player.cx + 600, hA.player.cy);
    a.fixedUpdate(1, hA.hooks);                       // R1 门不读 alpha/flag22 → 单拍可判
    expect(priv(a).a026A0, '无锁：600>500+40×0 → 返程（:61320 num95>num92）').toBe(1);
    const hB = makeHooks();
    const b = minion(hB.player, 1094, hB.player.cx + 600, hB.player.cy);
    priv(b).a026L0 = 31;                              // 本拍 D1 先减 → 门读 30
    b.fixedUpdate(1, hB.hooks);
    expect(priv(b).a026L0, 'D1 先行（31→30）').toBe(30);
    expect(priv(b).a026A0, '有锁：600<500+500 → 驻留（R1 +500 加程判别面）').toBe(0);
  });

  it('R2：|Δy|>320 竖直环——无锁触发返程,有锁闸禁用（:61320 第二析取）', () => {
    const hA = makeHooks();
    const a = minion(hA.player, 1094, hA.player.cx, hA.player.cy - 320);
    a.fixedUpdate(1, hA.hooks);
    expect(priv(a).a026A0, '无锁：|Δy|>300∧L0≤0 → 返程').toBe(1);
    const hB = makeHooks();
    const b = minion(hB.player, 1094, hB.player.cx, hB.player.cy - 320);
    priv(b).a026L0 = 31;
    b.fixedUpdate(1, hB.hooks);
    expect(priv(b).a026A0, '有锁：|Δy|>300 析取被 L0>0 禁用（原版 !(localAI[0]>0) 门）').toBe(0);
  });

  it('R4：朝向同步冻结——L0>0 不随玩家转向,L0==0 恢复（:63026-63028）', () => {
    const hA = makeHooks();
    hA.player.facing = 1;
    const a = minion(hA.player, 1094, hA.player.cx + 100, hA.player.cy);
    a.facing = -1;
    priv(a).a026L0 = 31;
    a.fixedUpdate(1, hA.hooks);
    expect(a.facing, 'L0>0：direction 不同步（冻结面）').toBe(-1);
    const hB = makeHooks();
    hB.player.facing = 1;
    const b = minion(hB.player, 1094, hB.player.cx + 100, hB.player.cy);
    settleAppear(b, hB);
    b.facing = -1;
    b.fixedUpdate(1, hB.hooks);
    expect(b.facing, 'L0==0：direction=玩家（:63026）').toBe(1);
  });
});

// ================================================================
// ③ R3 flag22 抑制窗 + W4 出弹写梯（:62590/:62693/:62710/:62741 判别）
// ================================================================
describe('③ R3 抑制窗 + W4 出弹写梯', () => {
  const mkEnemy = (x: number, y: number) => ({
    id: 1, x, y, w: 20, h: 20, cx: x + 10, cy: y + 10, dead: false, maxHp: 100,
    hurt: () => true,
  });

  it('抑制窗：L0>0 接敌不出弹且不写 60（:62590 前置门）;期满出弹 L0=42/ai[1]=42', () => {
    const foes: unknown[] = [];
    const hA = makeHooks(foes);
    const a = minion(hA.player, 1094, 76 * 16, 91 * 16 - 18);
    settleAppear(a, hA);                              // 沉淀期无敌 → 不提前出弹
    foes.push(mkEnemy(80 * 16, 91 * 16));
    priv(a).a026L0 = 31;
    a.fixedUpdate(1, hA.hooks);
    expect(hA.added.length, 'L0>0：flag22 假 → 不索敌不出弹').toBe(0);
    expect(priv(a).a026L0, '且不被 W3=60 覆写（门先于 :62693）').toBe(30);
    // 期满：L0 递减至 0 的那拍接敌 → W3=60 → 出弹 → W4 覆写 42 + ai[1]=42
    for (let i = 0; i < 29; i++) a.fixedUpdate(1, hA.hooks);
    expect(priv(a).a026L0, '29t 后=1（仍抑制,零出弹）').toBe(1);
    expect(hA.added.length).toBe(0);
    a.fixedUpdate(1, hA.hooks);
    expect(hA.added.length, '期满接敌出弹（1097）').toBe(1);
    expect(hA.added[0] instanceof Arrow).toBe(true);
    expect((hA.added[0] as Arrow).projId).toBe(1097);
    expect(priv(a).a026L0, 'W4 覆写=num135（1094=42 :62573/:62741）').toBe(42);
    expect(priv(a).shootCd, 'W4 伴生 ai[1]=num135（:62710）').toBe(42);
  });

  it('1113 出弹写梯：W4=30（:62573 type==1113 臂）', () => {
    const foes: unknown[] = [];
    const h = makeHooks(foes);
    const m = minion(h.player, 1113, 76 * 16, 91 * 16 - 18);
    settleAppear(m, h);
    foes.push(mkEnemy(80 * 16, 91 * 16));
    m.fixedUpdate(1, h.hooks);
    expect(h.added.length, '1113 期满首拍出弹').toBe(1);
    expect((h.added[0] as Arrow).projId).toBe(1097);
    expect(priv(m).a026L0, '1113 W4=30').toBe(30);
    expect(priv(m).shootCd).toBe(30);
  });
});

// ================================================================
// ④ 喷火 4t 循环形态（本仓等价位）+ 释放面闭环 + BJ521 面守恒
// ================================================================
describe('④ 4t 循环 + 释放闭环 + BJ521 守恒', () => {
  it('持住期：4t 拍出弹（8t 两发）∧ 两槽恒净（W2 循环尾 30 零观测=不落 L0/ai[1]）', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, h.player.cx + 100, h.player.cy);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    for (let t = 0; t < 8; t++) m.fixedUpdate(1, h.hooks);
    expect(priv(m).foxT, 'foxT=8（4t 循环推进）').toBe(8);
    expect(h.added.length, '8t 两发（foxT%4===1 拍=1/5,1106）').toBe(2);
    expect(m.foxFlameRan, '喷火块已入（W2 通道成立判据,BJ521②）').toBe(true);
    expect(priv(m).a026L0, '持住期 L0 恒净（W2 循环尾写被 W1 下拍清+喷火块 return 先于消费=零观测）').toBe(0);
    expect(priv(m).shootCd, '持住期 ai[1] 恒净（攻击帧/制动/转向三面不误触）').toBe(0);
  });

  it('释放闭环：通道断开臂=foxFlameRan 门下 lockAfterFoxChannel（Game 源锚）+锁值 30', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, h.player.cx + 100, h.player.cy);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    m.fixedUpdate(1, h.hooks);
    m.foxChannel = false;
    // Game :10370 释放臂（BJ521② 源锚原样=foxFlameRan 门不回归）
    if (m.foxFlameRan) { m.foxFlameRan = false; m.lockAfterFoxChannel(); }
    expect(priv(m).a026L0, '释放锁落 L0=30（W2 形）').toBe(30);
    expect(priv(m).shootCd, 'ai[1] 净').toBe(0);
    expect(m.foxFlameRan, '门消费后复位').toBe(false);
  });

  it('纯岩浆通道无锁通道（BJ521② face 不回归）+ 释放臂源锚在位', () => {
    expect(GAME_TS).toContain('if (m.foxFlameRan) { m.foxFlameRan = false; m.lockAfterFoxChannel(); }');
    const w = new World(200, 160, 7, 'bj522b');
    for (let x = 0; x < 200; x++) for (let y = 140; y < 160; y++) w.store.setTile(x, y, 1);
    w.groundLevel = 100;
    const player = new Player(60 * 16, 79 * 16, new Inventory());
    const hooks: GameHooks = {
      world: w as never, player: player as never, enemies: () => [] as never, critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {}, spawnDust: () => null,
    };
    (hooks as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
      { projectiles: [], add: () => {} };
    for (let x = 67; x <= 68; x++) for (let y = 90; y <= 91; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = 255; w.store.liquidType[i] = 2;
    }
    const m = new MinionProj(1076, 90 * 16, 1094, 10, 2, false, 0, false, () => player);
    m.fixedUpdate(1, hooks);
    expect(priv(m).lavaWet).toBe(true);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    for (let t = 0; t < 3; t++) {
      m.x = 1076; m.y = 90 * 16;
      m.fixedUpdate(1, hooks);
    }
    expect(m.foxFlameRan, '纯岩浆通道喷火块未入 → 释放臂不落锁（:60093 通道不成立）').toBe(false);
    expect(priv(m).a026L0).toBe(0);
  });

  it('攻击帧面不误触：释放锁后贴地静立帧走待机段（18）非攻击段（36-41）', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, 76 * 16, 91 * 16 - 18);   // 台上
    m.lockAfterFoxChannel();
    for (let i = 0; i < 40 && !(m as unknown as { onGround: boolean }).onGround; i++) {
      m.fixedUpdate(1, h.hooks);
    }
    m.fixedUpdate(1, h.hooks);
    expect((m as unknown as { onGround: boolean }).onGround, '已落地').toBe(true);
    expect(priv(m).foxFrame, '贴地静立=待机段 18（旧形 shootCd=30 误入攻击段 36+）').toBeLessThan(36);
  });
});
