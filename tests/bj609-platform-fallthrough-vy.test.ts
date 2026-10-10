// ★BJ609（2026-10-10，BJ608 收刀新登记 D2 平台域续刀）：平台 fallThrough 半边——
// 按 S（fallThrough）期平台【非全量放行】:Collision.cs:2391
//   `if ((!(Main.tileSolidTop[type] & fallThrough) || !((Velocity.Y <= 1f) | fall2)) && num6 > vector4.Y)`
//   = isPlat∧fallThrough∧!fall2 时 vy≤1（慢速）放行、vy>1（快速）仍承接
//   （高速下落逐级被平台接住=原版逐级阶梯下降;承接后 vy=0,再按 S 慢速起步穿本级,
//   加速到 vy>1 被下一级接住——每级 ~9-11 拍节奏）。
// fallThrough/fall2 两语义拆分（先定谳）:
//   · fallThrough = controlDown（Player.cs:28296,逐拍态,无窗口计时器）——慢放行/快承接;
//   · fall2（ignorePlats）= Player.cs:28298 `gravDir==-1 | mount.Cart/12/7/8/23/44/48 |
//     GoingDownWithGrapple | pulley` → flag30∧fallThrough 双置 —— 平台【整体不承接】
//     （`(vy≤1)|fall2` 恒真 → 承接支恒假,任意 vy）;
//   · 原版双参合流证据:Projectile.cs:17705-17721 全路径 `TileCollision(..., flag6, flag6)`;
//     NPC.cs:93867 Collision_MoveNormal `TileCollision(..., fall, fall)` —— 弹体/NPC 的
//     flag6/fall 同时喂 fallThrough+fall2 = 永不承接。
// 本仓映射:Body.dropThrough 历史语义=「平台永不承接」（≡原版双参合流,弹体/NPC/随从/
//   钩爪下拉/爬墙各源零改）;新增 Body.platFallThrough 仅玩家 inputDown 源置 true
//   （Player.ts 每拍写,gravDir=-1 原版强 fall2 不置;Game.ts 代理同式）。
// 落刀面:TileCollision.ts moveAxis 两支（边缘行平台门+BJ-C9-SP 越行补扫）——
//   `!(b.dropThrough || (b.platFallThrough && b.vy <= 1))` ≡ :2391 化简形。
// vy 量纲定谳:原版 Velocity.Y=碰撞调用入参速度（px/tick,Y 向下正;重力后值）——
//   本仓 b.vy 同量纲同符号（重力先加、碰撞后清零;子步 ≤8px 不改写 vy）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';

const W = 80, H = 130;
const P = 100;              // 首平台行（顶=P×16）
const C = 40;               // 竖列平台列
const PLATFORM = TILE_BY_KEY['platform']!;

/** 平台塔夹具:行 P..P+2 全宽平台（16px 间距阶梯）+ 远下方实体地板（行 H-2） */
function makeTower(rows = 3): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = H - 2; y < H; y++) store.setTile(x, y, 1);
  for (let r = 0; r < rows; r++) {
    for (let x = C - 10; x <= C + 10; x++) store.setTile(x, P + r, PLATFORM, 0, 0);
  }
  return store;
}

function makeBody(store: TileStore, feet: number, opts: Partial<Body> = {}): Body {
  const b: Body = {
    x: C * 16 - 10, y: feet - 42, w: 20, h: 42,   // 20×42,中心对准列 C
    vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
    ...opts,
  };
  void store;
  return b;
}

/** 逐拍模拟:重力 0.4（vanilla gravityAcceleration）→ moveAndCollide(b,0,vy)。
 *  S 旗由 dropFor 给定（模拟按/松 S）。返回 feet 序列。 */
function runTicks(b: Body, world: { store: TileStore }, n: number, dropFor: (i: number) => boolean): number[] {
  const feetSeq: number[] = [];
  for (let i = 0; i < n; i++) {
    const down = dropFor(i);
    b.dropThrough = down;
    b.platFallThrough = down;   // 玩家写位同式（Player.ts:7856 同源:inputDown 双旗同置）
    b.vy = Math.min(b.vy + 0.4, 10);
    moveAndCollide(b, world as never, 0, b.vy);
    feetSeq.push(b.y + b.h);
  }
  return feetSeq;
}

describe('BJ609 平台 fallThrough 半边（:2391 慢放行/快承接拆分）', () => {
  it('① fallThrough 慢速（vy≤1,含边界 vy=1.0）穿落锁——按S慢速放行半边', () => {
    const store = makeTower(1);
    // 边界形态:vy=1.0 原版 `Velocity.Y <= 1f` 含等号=放行（承接窗内旧脚 top-0.5）
    const b = makeBody(store, P * 16 - 0.5, { onGround: false });
    b.dropThrough = true;
    b.platFallThrough = true;
    b.vy = 1.0;
    moveAndCollide(b, { store } as never, 0, 1.0);
    expect(b.onGround, 'vy=1.0 边界放行不承接').toBe(false);
    expect(b.y + b.h, 'feet 越过平台顶（自由落体无承接修正）').toBe(P * 16 + 0.5);
    // 亚边界形态:vy=0.8 同放行（BJ608 ④ 同式,此处经 platFallThrough 旗面）
    const b2 = makeBody(store, P * 16 - 0.5, { onGround: false });
    b2.dropThrough = true;
    b2.platFallThrough = true;
    b2.vy = 0.8;
    moveAndCollide(b2, { store } as never, 0, 0.8);
    expect(b2.onGround, 'vy=0.8 同放行').toBe(false);
    expect(b2.y + b.h).toBe(P * 16 + 0.3);
    // 慢速起步序列形态:站平台顶按S,vy=0.4/0.8 两拍均放行（穿落起步）
    const b3 = makeBody(store, P * 16, { onGround: true });
    const seq = runTicks(b3, { store }, 8, () => true);
    expect(seq[0], '首拍 vy=0.4 放行').toBeCloseTo(P * 16 + 0.4, 6);
    expect(seq[1], '次拍 vy=0.8 放行').toBeCloseTo(P * 16 + 1.2, 6);
    expect(b3.onGround).toBe(false);
  });

  it('② fallThrough 高速（vy>1）承接锁——修复核心（:2391 后半）', () => {
    const store = makeTower(1);
    // 旧脚=平台顶上沿 0.5px（承接窗内,prevB ≤ top+1）,vy=1.2>1 → 仍承接
    const b = makeBody(store, P * 16 - 0.5, { onGround: false });
    b.dropThrough = true;
    b.platFallThrough = true;
    b.vy = 1.2;
    moveAndCollide(b, { store } as never, 0, 1.2);
    expect(b.y + b.h, 'vy>1 仍承接=平台顶（修复核心）').toBe(P * 16);
    expect(b.onGround, '承接置 onGround').toBe(true);
    // 高速形态:vy=6 同承接
    const b2 = makeBody(store, P * 16 - 0.5, { onGround: false });
    b2.dropThrough = true;
    b2.platFallThrough = true;
    b2.vy = 6;
    moveAndCollide(b2, { store } as never, 0, 6);
    expect(b2.y + b.h, 'vy=6 同承接（高速下落逐级被接住）').toBe(P * 16);
    expect(b2.onGround).toBe(true);
  });

  it('③ fall2（grapple/pulley/ratClimb 源=仅 dropThrough 单旗）永不承接锁', () => {
    const store = makeTower(1);
    // 钩爪下拉/爬墙源形态:dropThrough=true 且 platFallThrough=false（原版 flag30:
    // Player.cs:28298 → 平台整体不承接,任意 vy）——快速 vy=8 同样穿落
    const b = makeBody(store, P * 16 - 0.5, { onGround: false });
    b.dropThrough = true;
    b.vy = 8;
    moveAndCollide(b, { store } as never, 0, 8);
    expect(b.y + b.h, 'fall2 快速穿落不承接（vy=8）').toBeGreaterThan(P * 16);
    expect(b.onGround, '不置 onGround').toBe(false);
    // 慢速同穿（fall2 与 vy 无关）
    const b2 = makeBody(store, P * 16 - 0.5, { onGround: false });
    b2.dropThrough = true;
    b2.vy = 0.8;
    moveAndCollide(b2, { store } as never, 0, 0.8);
    expect(b2.y + b.h, 'fall2 慢速同穿').toBeGreaterThan(P * 16);
    expect(b2.onGround, '不置 onGround').toBe(false);
  });

  it('④ 逐级阶梯下降序列锁——按S长落整叠平台逐级停（不直达底）', () => {
    const store = makeTower(3);
    const b = makeBody(store, P * 16, { onGround: true });
    const seq = runTicks(b, { store }, 40, () => true);   // 全程按 S
    // 每级顶都被【精确承接过】（feet 命中各级平台顶;全量放行形态=feet 恒在级间穿行
    // 不命中顶:自由落体累计位移 0.4k(k+1)/2 序列避开 16/32 整值,直达底形态红）
    const hit1 = seq.indexOf((P + 1) * 16);
    const hit2 = seq.indexOf((P + 2) * 16);
    expect(hit1, '第一级 (P+1)×16 被承接命中').toBeGreaterThan(-1);
    expect(hit2, '第二级 (P+2)×16 被承接命中').toBeGreaterThan(-1);
    expect(hit1 < hit2, '自上而下逐级命中（阶梯序）').toBe(true);
    // 阶梯节奏:级间距 ~9-11 拍（承接=vy 清零→慢速起步穿本级→加速再被下级接住;
    // 非直达形态）
    expect(hit2 - hit1, '级间距=阶梯节奏').toBeGreaterThan(4);
    expect(hit2 - hit1, '级间距上界（节奏收敛,非久滞）').toBeLessThan(20);
    // 承接后下一拍 = 慢速起步穿本级（feet=top+0.4,vy=0.4≤1 放行半边复演）
    expect(seq[hit2 + 1]).toBeCloseTo((P + 2) * 16 + 0.4, 6);
    // 全程不得落到底部实体地板（(H-2)×16）
    for (const f of seq) expect(f, '不得直达实体地板').toBeLessThan((H - 2) * 16);
  });

  it('⑤ BJ608 嵌入收窄回归锁——embedPlatSnap opt-in 面与嵌入域不承接面零变', () => {
    const store = makeTower(1);
    // (a) 嵌入域（旧脚 top+10∈(顶,顶+16]）+按S快速 → 仍不承接（:2364 门,embedPlatSnap
    //     opt-in 未置;BJ609 只动承接窗半边,嵌入域两语义不动）
    const b = makeBody(store, P * 16 + 10, { onGround: false });
    b.dropThrough = true;
    b.platFallThrough = true;
    b.vy = 8;
    moveAndCollide(b, { store } as never, 0, 8);
    expect(b.y + b.h, '嵌入盒不得被拉回平台顶（BJ608 核心锁随 BJ609 保持）')
      .toBeCloseTo(P * 16 + 18, 6);
    expect(b.onGround).toBe(false);
    // (b) 哨兵 opt-in（embedPlatSnap=true,BJ-C9-SP 基准保留面）→ 拉回平台顶
    const b2 = makeBody(store, P * 16 + 10, { onGround: false, w: 66, h: 50, embedPlatSnap: true });
    b2.y = P * 16 + 10 - 50;
    b2.vy = 15;
    moveAndCollide(b2, { store } as never, 0, 15.2);
    expect(b2.y + b2.h, '哨兵嵌入驻留=拉回平台顶（opt-in 面零变）').toBe(P * 16);
    expect(b2.onGround).toBe(true);
  });

  it('⑥ 无旗源（不按S）承接零变——慢速/快速均承接（!fallThrough 半边）', () => {
    const store = makeTower(1);
    const b = makeBody(store, P * 16 - 0.5, { onGround: false });
    b.vy = 6;
    moveAndCollide(b, { store } as never, 0, 6);
    expect(b.y + b.h, '不按S快速下落=承接平台顶').toBe(P * 16);
    expect(b.onGround).toBe(true);
    // 慢速同承接（与 fallThrough 慢速放行对照=旗面判别）
    const b2 = makeBody(store, P * 16 - 0.5, { onGround: false });
    b2.vy = 0.8;
    moveAndCollide(b2, { store } as never, 0, 0.8);
    expect(b2.y + b.h, '不按S慢速同承接').toBe(P * 16);
    expect(b2.onGround).toBe(true);
  });
});
