// 天花板坡受阻支行为面（红队 F3/F4③/F4④ 落刀守卫,2026-09-08）：
//
// 原 SlopeCollision 收尾 TileCollision 校验受阻支 2（Collision.cs:2020-2034
// `else if (vector5.Y < velocity.Y)`）在 TileCollision.ts slopeCollide 下推守卫
// 受阻臂的 1:1 移植：①截短下推（:2023 vector2.Y = Position.Y + vector5.Y,采纳
// 放行量非弃用）②bitsByte[3]/[4] 沿坡 X 滑移（:2024-2031,num10<0;slope3 右滑/
// slope4 左滑,两写均自 Position.X 绝对式 ⇒ 双 bit 时 [4] 整体覆盖 [3]）
// ③速度双清（:2032-2033 vector3.X/Y = 0f）。
// 受阻支 1 的 up=false 镜像（:2018 → b.hitHead=false,F4④）在 shortfall 臂,
// 由 case D/E 锁窗口（受阻才清,不受阻保留）。
//
// 几何（TILE=16,行 18 天花板坡/行 19 地板,均手推全门定值）：
//   slope3@(12,18) 对角线在 num4 处 = 304−num4;body x=200 ⇒ num4=8 ⇒ 头目标 296。
//   body(w8,h12) 入口 y=289 → 分轴 dy=2 落到 y=291（不落地:feet 303 未越 304）→
//   num5=5;下推目标 feet=308 嵌入行 19 地板(top=304) ⇒ 受阻,allowedDrop=
//   304−303=1,num10=1−5=−4。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(w: number, h: number): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}

interface TestBody { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; hitWall: boolean; hitHead: boolean }

function body(x: number, y: number, w: number, h: number, vx: number, vy: number): TestBody {
  return { x, y, w, h, vx, vy, onGround: false, hitWall: false, hitHead: false };
}

function floorRow(st: TileStore, x0: number, x1: number, row: number): void {
  for (let x = x0; x <= x1; x++) st.setTile(x, row, DIRT);
}

describe('天花板坡受阻支（Collision.cs:2020-2034 移植）', () => {
  it('slope3 受阻:截短下推=放行量(非弃用)+右滑|num10|+vx/vy 双清', () => {
    const w = makeWorld(40, 40);
    const st = w.store;
    floorRow(st, 8, 16, 19);            // 地板 top=304
    st.setTile(12, 18, DIRT);
    st.setSlope(12, 18, 3);             // 天花板坡3:头目标 = 304−num4
    const b = body(200, 289, 8, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    // ①截短下推:full num5=5 会到 y=296;放行量=1(脚底 303→304 落地板顶) ⇒ y=292
    expect(b.y).toBe(292);
    // ②右滑 |num10|=4:num10=1−5=−4,slope3 ⇒ X=Position.X−num10=204
    expect(b.x).toBe(204);
    // ③双清（:2032-2033）
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('slope4 受阻:镜像左滑(X=Position.X+num10=188),截短量与双清同', () => {
    const w = makeWorld(40, 40);
    const st = w.store;
    floorRow(st, 8, 16, 19);
    st.setTile(12, 18, DIRT);
    st.setSlope(12, 18, 4);             // num4 = 右缘进深 = 208−200 = 8,同几何
    const b = body(192, 289, 8, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(292);
    expect(b.x).toBe(188);              // 192 + (−4)
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('双 bit 写序:bitsByte[3]后[4]绝对写覆盖 ⇒ 终位=Position.X+num10（左滑）', () => {
    // body 跨 (12,18)slope3 与 (13,18)slope4:num4(3)=10 → num5(3)=3(先置 bit3);
    // num4(4)=2 → num5(4)=11 严格胜出 ⇒ bit4 同设。原版 :2024-2030 两写均
    // 自 Position.X ⇒ [4] 覆盖 [3]:202+(−10)=192。增量式实现会得 202(假)。
    const w = makeWorld(40, 40);
    const st = w.store;
    floorRow(st, 8, 16, 19);
    st.setTile(12, 18, DIRT); st.setSlope(12, 18, 3);
    st.setTile(13, 18, DIRT); st.setSlope(13, 18, 4);
    const b = body(202, 289, 20, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(292);              // 截短下推同①(allowedDrop=1)
    expect(b.x).toBe(192);              // bit4 绝对写覆盖
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('未受阻对照:无截短无滑移无清零(全推+速度保持,分支不点火)', () => {
    const w = makeWorld(40, 40);
    const st = w.store;
    floorRow(st, 14, 16, 19);           // 地板让开 col12 ⇒ 下推目标无受阻格
    st.setTile(12, 18, DIRT);
    st.setSlope(12, 18, 3);
    const b = body(200, 289, 8, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(296);              // 全推 y+num5(291+5)
    expect(b.x).toBe(200);              // 无滑移
    expect(b.vy).toBe(2);               // 速度保持（受阻臂才会双清）
    expect(b.vx).toBe(1.5);
  });
});

describe('shortfall 臂 up=false 镜像（Collision.cs:2018 → b.hitHead,F4④）', () => {
  // 几何:行 18 实心天花板(bottom=304)+行 19 slope1(面=304+num4)。
  // 入口 y=306/vy=−3 → 分轴上顶钳 y=304 且 hitHead=true;脚 316 沉入坡面下
  // (num4=x−192):x=196 ⇒ 沉 8 → 抬升目标 y=296 被行 18 实心堵住 ⇒ shortfall。
  it('受阻 shortfall:hitHead 被清+X 沿坡滑+双清', () => {
    const w = makeWorld(40, 40);
    const st = w.store;
    st.setTile(12, 18, DIRT);           // 天花板(顶头+抬升阻塞格)
    st.setTile(12, 19, DIRT);
    st.setSlope(12, 19, 1);             // 地面坡1:面=304+num4
    const b = body(196, 306, 8, 12, 1.5, -3);
    moveAndCollide(b as never, w, 0, -3);
    // F4④:branch1 收尾 up=false（:2018）——上顶报告被坡面吞没即抑制
    expect(b.hitHead).toBe(false);
    expect(b.x).toBe(204);              // slope1 ⇒ X −= num9(−8) ⇒ +8
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('未受阻对照:同上顶但 gap=0 无 shortfall ⇒ hitHead 保留（窗口窄）', () => {
    const w = makeWorld(40, 40);
    const st = w.store;
    st.setTile(12, 18, DIRT);
    st.setTile(12, 19, DIRT);
    st.setSlope(12, 19, 1);
    const b = body(204, 306, 8, 12, 1.5, -3);   // num4=12 ⇒ 面=316=脚底,gap=0
    moveAndCollide(b as never, w, 0, -3);
    expect(b.hitHead).toBe(true);       // 不受阻不清（原版 branch1 独有行）
    expect(b.x).toBe(204);
    expect(b.vx).toBe(1.5);             // 双清只在受阻支
    expect(b.vy).toBe(0);               // 分轴上顶钳位所致,非坡段
  });

  it('双 bit 写序合成:bitsByte[1]先[2]后 ⇒ 终位=Position.X+num9（左滑）', () => {
    // 可达双 bit 序（slope1 左 slope2 右;divergent 序被 rawNum4<0 站顶支结构性
    // 先制,见 TileCollision.ts 声明处定谳——本 case 钉合成公式防将来改增量式）：
    // body(185..201) 跨 (11,19)s1[num4=9,面313,num7=−3] 与 (12,19)s2[num4=7,面311,
    // num7=−5 严格胜出] ⇒ 两位同设;vanilla :2008-2014 [1] X=P+5 → [2] X=P−5 覆盖。
    const w = makeWorld(40, 40);
    const st = w.store;
    st.setTile(11, 18, DIRT); st.setTile(12, 18, DIRT);   // 抬升阻塞格
    st.setTile(11, 19, DIRT); st.setSlope(11, 19, 1);
    st.setTile(12, 19, DIRT); st.setSlope(12, 19, 2);
    const b = body(185, 302, 16, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(304);              // 抬升整弃（受阻,Y 不动）
    expect(b.x).toBe(180);              // [2] 绝对写覆盖:185+(−5)
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });
});

describe('下推截短候选面（原版校验 facets,:2330-2403 逐项）', () => {
  it('半砖受阻:盒顶=格顶+8（:2350-2354）截短量按 halfTop 采集', () => {
    // body x=194 ⇒ num4=2,头目标 302,下推目标 feet=314 越半砖顶 312 ⇒ 受阻;
    // allowedDrop = 312−305 = 7,num10 = 7−9 = −2。旧码跳半砖 ⇒ 全推 y=302(假)。
    const w = makeWorld(40, 40);
    const st = w.store;
    st.setTile(12, 18, DIRT); st.setSlope(12, 18, 3);
    st.setTile(12, 19, DIRT); st.half[st.idx(12, 19)] = 1;
    const b = body(194, 291, 8, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(300);              // 293+7:脚落 halfTop=312
    expect(b.x).toBe(196);              // 194+2（slope3 右滑）
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('站台面受阻:平台顶亦拦（:2391 fallThrough=false,校验调用硬编码）', () => {
    // 同 case A 几何,地板换木平台(sheet 19,非 tileSolid):旧码跳平台 ⇒ 全推
    // y=296(假);原版校验 fallThrough=false ⇒ 平台顶截短,数值与实心地板同。
    const w = makeWorld(40, 40);
    const st = w.store;
    st.setTile(12, 18, DIRT); st.setSlope(12, 18, 3);
    st.setTile(12, 19, TILE_BY_KEY['platform']!);
    const b = body(200, 289, 8, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(292);              // 截短下推 1(脚落平台顶 304)
    expect(b.x).toBe(204);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('下位天花板坡受阻:不过放行门 ⇒ 按格顶截短(:2363 flag3 否,:2388-2403)', () => {
    // (12,19) 亦为 slope3:body 在其上方 ⇒ flag3 门 b.y>=topTile(304) 否 ⇒
    // 以格顶 304 截短(顶面=实心地面,与 moveAxis 落地约定同);推者自身
    // (12,18) 过门(b.y=291>=288 且 x>=192)跳过不自拦。
    const w = makeWorld(40, 40);
    const st = w.store;
    st.setTile(12, 18, DIRT); st.setSlope(12, 18, 3);
    st.setTile(12, 19, DIRT); st.setSlope(12, 19, 3);
    const b = body(200, 289, 8, 12, 1.5, 2);
    moveAndCollide(b as never, w, 0, 2);
    expect(b.y).toBe(292);
    expect(b.x).toBe(204);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });
});
