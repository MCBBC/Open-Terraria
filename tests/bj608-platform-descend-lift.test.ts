// ★BJ608（2026-10-10 用户实报+两件套物证真机破案）：平台穿层被强制抬升到上面平台。
// 用户原话:「平台好像又有 bug,下落到下一格平台时被强制抬升到上面平台?」
// 物证:十周年纪念种子(1).wld + behavior-log-…-2026-10-10T03-05-42-364Z.json（微信件,
//   /tmp/bj608/ 留档）。场景=十周年派对区:行272 长平台(x3900-3934),其下 x3930 有
//   竖列平台 行273/274/275（16px 间距,锤立形态 t19),行276 棕榈木 t322(solid)。
//   behavior-log 34747-34850:玩家连按 S 三次,每次下沉 10-22px 即被抬回 y中心4331
//   （feet=4352=行272平台顶）;34886 长按 18t 成功落棕榈木 feet=4416（34905,g=true）,
//   但 34935 又回 feet=4352——落到底也被抬回。
// 真机拍序（scripts/_bj608-repro.mjs,修复前）:短按释放后 feet 4394→4384→4368→4352
//   三拍梯爬抬回原平台;长按落地释放后 4416→4400→4384→4368→4352 四拍梯爬。
// 病根定谳（唯一）:src/physics/TileCollision.ts BJ-C9-SP 越行平台块嵌入驻留支
//   (prevB ∈ (topP, topP+16] → 拉回平台顶) 对【一切下落体】生效。原版 TileCollision
//   平台承接唯一门=Collision.cs:2364 `vector3.Y + Height <= vector4.Y`（旧脚≤平台顶）,
//   else 链其余三支（:2435/:2449/:2464）全部 `!Main.tileSolidTop` 排除平台 → 嵌入盒
//   （旧脚已低于平台顶）永不承接=下落体穿平台后绝不被抬回。BJ-C9-SP 注「原版本支
//   嵌入解析源码位未钉」今已钉死=不存在;哨兵 spawn 嵌入驻留（Player.cs:50045-50063
//   PickSentryLandingSpot spawnY=(首实心行−1)×16−24,h=50 盒底嵌 10px+出膛 vy15
//   :48662-48684）按 BJ-C9-SP 用户基准保留为 opt-in（Entity.embedPlatSnap,仅哨兵
//   MinionProj 置位）。
// 十周年种子面:celebrationmk10 不改平台物理（本仓 gen/SeedEasterEggs 无平台物理旗）,
//   种子仅提供上述布局（本测试夹具按 .wld dump 1:1 缩比复刻）——种子面不另设锁。
// 原版锚:Collision.cs:2364（承接门）/2391（fallThrough∧vy≤1 放行;★BJ609 补钉后半
//   vy>1 仍承接=阶梯下降半边,①②终态随语义更新）/2435/2449/2464
//   （else 链 !tileSolidTop 三排）/Player.cs:28296（fallThrough=controlDown,无窗口计时器）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';

const W = 80, H = 130;
const P = 100;              // 平台行（顶=P×16）——对应用户图行272
const C = 40;               // 竖列平台列——对应 x3930
const PLATFORM = TILE_BY_KEY['platform']!;

/** 用户场景 1:1 缩比夹具:行P 长平台 + 列C 竖列平台 P+1..P+3（16px 间距）+ 行P+4 实心 */
function makeWorld(opts: { column?: boolean } = {}): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 104; y < H; y++) store.setTile(x, y, 1);
  for (let x = C - 10; x <= C + 10; x++) store.setTile(x, P, PLATFORM, 0, 0);
  if (opts.column !== false) {
    for (let y = P + 1; y <= P + 3; y++) store.setTile(C, y, PLATFORM, 0, 0);
    store.setTile(C, P + 4, 1);   // 棕榈木替身（solid,对应行276 t322）
  }
  return store;
}

function makeBody(store: TileStore, feet: number, opts: Partial<Body> = {}): Body {
  const b: Body = {
    x: C * 16 - 10, y: feet - 42, w: 20, h: 42,   // 玩家 20×42,中心对准列 C
    vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
    ...opts,
  };
  void store;
  return b;
}

/** 逐拍模拟:重力 0.4（vanilla Player.gravityAcceleration）→ moveAndCollide(b,0,vy)。
 *  dropThrough 由每拍回调给定（模拟按/松 S）。返回 feet 序列。 */
function runTicks(b: Body, world: { store: TileStore }, n: number, dropFor: (i: number) => boolean): number[] {
  const feetSeq: number[] = [];
  for (let i = 0; i < n; i++) {
    b.dropThrough = dropFor(i);
    b.vy = Math.min(b.vy + 0.4, 10);
    moveAndCollide(b, world as never, 0, b.vy);
    feetSeq.push(b.y + b.h);
  }
  return feetSeq;
}

describe('BJ608 平台穿落强制抬升（用户场景复现锁）', () => {
  it('①短按S 10t 穿落释放:自然落到下方平台顶,不抬回原平台,无上行梯爬', () => {
    const store = makeWorld();
    const world = { store };
    const b = makeBody(store, P * 16, { onGround: true });
    // ★BJ609（2026-10-10）夹具补 platFallThrough（runTicks 内 dropThrough 旗面已拆分,
    //   见下注）——按 S 期 vy≤1 慢速放行、释放后承接下来首个平台（阶梯下降第一级）。
    b.platFallThrough = true;
    const seq = runTicks(b, world, 45, (i) => i < 10);   // 前10拍按S,后35拍释放
    // 起始 feet=P*16;按S期间穿落（feet 单调增,穿过列平台行 P+1..P+3 各顶）
    expect(seq[0], '重力首拍=+0.4').toBeCloseTo(P * 16 + 0.4, 6);
    // 释放后每一拍 feet 不得回退（原版嵌入盒永不承接=无上行梯爬;≤1px 内允许
    // BJ-C9-SP prevB≤top+1 容差窗的亚像素承接修正,BJ608 抬回病灶=10-22px 级）
    for (let i = 11; i < seq.length; i++) {
      const landed = seq[i] === seq[i - 1];
      expect(seq[i] >= seq[i - 1] || landed || seq[i - 1] - seq[i] <= 1.01,
        `释放后拍${i}: feet ${seq[i - 1]}→${seq[i]} 出现上行=抬升`).toBe(true);
    }
    // 终态=自上方承接的平台顶。★BJ609 语义更新:按 S 期 vy>1 仍承接（:2391 后半）
    // → 按S 10t 期间已在 P+1 顶被接住一次（vy=3.6>1,t9）,释放时旧脚仅超 P+1 顶
    // 0.4px∈(top,top+1] 容差窗 → 承接驻留 P+1（BJ609 前全量放行旧值=(P+2)×16,
    // 真机对拍 4384 系全量放行下的物证标定,随语义退役）。
    expect(b.onGround, '落地下承接').toBe(true);
    expect(b.y + b.h, '终态 feet=下方平台顶 (P+1)×16（BJ609 阶梯下降第一级）')
      .toBe((P + 1) * 16);
    // 永不回到原平台顶
    for (const f of seq.slice(11)) expect(f, '不得回到原平台（抬回=病灶）').toBeGreaterThan(P * 16);
  });

  it('②长按S 18t 落到下方平台顶:释放后驻留不被抬回（物证 34905→34935 抬回相）', () => {
    const store = makeWorld();
    const world = { store };
    const b = makeBody(store, P * 16, { onGround: true });
    // ★BJ609：夹具补 platFallThrough（见①注）。长按 S 期阶梯下降:vy>1 逐级接住
    //   （t9 接 P+1、t18 接 P+2）;18t 窗恰停在 (P+2)×16——BJ609 前全量放行旧值
    //   =(P+4)×16（真机 4416 系全量放行物证标定,随语义退役;长按到底需持续按 S
    //   逐级续落=原版逐级阶梯下降节奏）。
    b.platFallThrough = true;
    const seq = runTicks(b, world, 40, (i) => i < 18);
    // 落到列平台 P+2 顶（(P+2)*16）
    expect(b.onGround).toBe(true);
    expect(b.y + b.h, '阶梯承接面 (P+2)×16').toBe((P + 2) * 16);
    // 释放后恒驻留（无梯爬回 P 行）
    for (const f of seq.slice(19)) expect(f, '平台面驻留,不得被抬回').toBe((P + 2) * 16);
  });
});

describe('BJ608 原版平台承接语义锁（Collision.cs:2364/2391）', () => {
  it('③旧脚高于顶+不按S+下落 → 承接（feet=平台顶,onGround）', () => {
    const store = makeWorld();
    const b = makeBody(store, P * 16 - 4, { vy: 2 });
    const seq = runTicks(b, { store }, 4, () => false);
    expect(seq.some((f) => f === P * 16), `逐拍下落到承接: ${seq.join(',')}`).toBe(true);
    expect(b.y + b.h, '自上来承接=平台顶').toBe(P * 16);
    expect(b.onGround).toBe(true);
  });

  it('④按S（dropThrough）+慢速 vy≤1 → 放行（:2391 fallThrough 支）', () => {
    const store = makeWorld();
    const b = makeBody(store, P * 16 - 1, { vy: 0.8, dropThrough: true });
    const seq = runTicks(b, { store }, 8, () => true);
    expect(b.onGround, '按S穿落不承接').toBe(false);
    expect(b.y + b.h, '已落到平台顶之下').toBeGreaterThan(P * 16);
    expect(seq.every((f) => f !== P * 16 || f === seq[0]), '全程未被承接在平台顶').toBe(true);
  });

  it('⑤嵌入域（旧脚∈(顶,顶+16]）+不按S → 不承接（:2364 门=BJ608 核心锁）', () => {
    const store = makeWorld();
    // 旧脚 top+10（=原版哨兵 spawn 嵌入深度）,下落 0.4
    const b = makeBody(store, P * 16 + 10, { vy: 0.4 });
    moveAndCollide(b, { store } as never, 0, 0.4);
    expect(b.y + b.h, '嵌入盒不得被拉回平台顶（原版嵌入盒永不承接）').toBe(P * 16 + 10.4);
    expect(b.onGround, '不置 onGround').toBe(false);
    // 跨行形态（下落快到边缘行越过平台行）同样不得承接——单平台世界隔离列干扰
    const store2 = makeWorld({ column: false });
    const b2 = makeBody(store2, P * 16 + 10, { vy: 15 });
    moveAndCollide(b2, { store: store2 } as never, 0, 15.2);
    expect(b2.y + b.h, '跨行嵌入盒不得拉回（无 embedPlatSnap,穿行而过）').toBeCloseTo(P * 16 + 25.2, 6);
    expect(b2.onGround).toBe(false);
  });

  it('⑥嵌入域+embedPlatSnap=true（哨兵）→ 承接（BJ-C9-SP 基准保留面,opt-in 收窄）', () => {
    const store = makeWorld();
    // 原版哨兵出膛形态:PickSentryLandingSpot spawnY=(平台行−1)×16−24,h=50 盒底嵌
    // 10px,vy15（Player.cs:48662-48684 speedY11=15f;BJ-C9-SP 端到端同款）
    const b = makeBody(store, P * 16 + 10, { vy: 15, embedPlatSnap: true, w: 66, h: 50 });
    b.y = P * 16 + 10 - 50;
    moveAndCollide(b, { store } as never, 0, 15.2);
    expect(b.y + b.h, '哨兵嵌入驻留=拉回平台顶').toBe(P * 16);
    expect(b.onGround).toBe(true);
  });

  it('⑦上穿门:盒在平台格内上升（vy<0）→ 平台不拦不承接（平台无上行碰撞）', () => {
    const store = makeWorld();
    const b = makeBody(store, P * 16 + 4, { vy: -2 });
    moveAndCollide(b, { store } as never, 0, -2);
    expect(b.y + b.h, '上升体自由穿过平台格（feet 随位移上移）').toBe(P * 16 + 2);
    expect(b.onGround, '上升不得被承接').toBe(false);
  });

  it('⑧列内站定（旧脚=下方平台顶,盒身嵌上一行平台格）→ 稳定驻留不逐拍梯爬', () => {
    const store = makeWorld();
    // 站在 P+2 行平台顶（feet=(P+2)*16）,盒身 4326..4368 域=P 行平台格重叠 16px
    const b = makeBody(store, (P + 2) * 16, { onGround: true });
    const seq = runTicks(b, { store }, 12, () => false);
    for (const f of seq) expect(f, '柱内驻留每拍恒 feet=(P+2)×16（无嵌入梯爬）').toBe((P + 2) * 16);
    expect(b.onGround).toBe(true);
  });
});
