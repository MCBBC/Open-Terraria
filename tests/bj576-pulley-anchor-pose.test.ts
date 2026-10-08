// ★BJ576 绳索滑轮位置+上举攀爬帧（2026-10-09 用户复报 BJ559：①滑轮原版应在头上,
//   本仓叠在头前 ②攀爬时角色应有上举姿势,本仓普通帧）——定谳+守卫（亲读 1457 反编译）：
//
//   ① 滑轮锚（DrawPlayer_24_Pulley, PlayerDrawLayers.cs:3034-3056）：
//      贴图 26×72 两帧竖排（帧 26×36）。origin=(宽/2, 高/4)=(13, 72/4=18)——XNA/FNA
//      SpriteBatch origin 相对【源矩形】左上（源矩形高=高/2=36 → 18=帧中心）。
//      BJ559 旧注 (13,9) 系误用帧高 36/4 推导=帧上沿 1/4 处 → 滑轮整体低 9px：
//      轮体密集带（帧内 y12..19,逐像素实测）落 p.y+1..p.y+8=脸部（复报病灶）；
//      正确锚落 p.y−8..p.y−1=头顶/帽区、上缘探出头顶=「在头上」。
//      帧中心锚定后世界锚（gravDir=1,h=42,feet=p.y+42）：
//        侧挂档（pulleyDir==2）numX=0/numY=−25 → translate(−6.5,−44) → 锚=p.y−2（=centerY−23）
//        居中档（pulleyDir==1）numX=10/numY=−26 → translate(3.5,−45) → 锚=p.y−3（=centerY−24）
//      （两档 translate/x/rot 值 BJ559 本就正确——病灶只在 dest 上沿 −fh/4 vs −fh/2。）
//
//   ② 攀爬姿势（Player.cs:36727-36736 PlayerFrame else-if 链）：
//        else if (pulley) { bodyFrame.Y = (pulleyDir==2) ? Height·1 : Height·2; }
//      行1=侧挂攀姿/行2=居中攀姿（双臂上举抓绳）——原版序位=useStyle 支后、
//      holdStyle 支前（:36738 起）→ 绳上静持火把（holdStyle 1）照钉攀爬行。
//      本仓身体链（Renderer.playerFrameRows）原无 pulley 支：绳上 vy=0 落 body=0
//      普通站立帧（复报②病灶）。行1/2 的复合臂格由 PaperDoll ARM_FRAME 承接
//      （行1→(3,0)/行2→(4,0)=CreateCompositeData PlayerDrawSet.cs:1995/:2002 同构,
//      sw-bj11 数据锁已在）——playerFrameRows 本支是缺的最后一块。腿链无 pulley 支
//      （原版全文件 bodyFrame pulley 写面唯 :36727 一处）:攀爬 vy≠0 腿行5、静悬行0,
//      本仓腿链已同相免刀。
//
//   ③ 空格进入攀爬=原版本相（无刀,登记说明）：pulley=true 全文件仅 FindPulley 内
//      三处（:19835/:19852/:19869）；FindPulley 体首门=(!controlUp && !controlDown)→
//      return（:19773,按上/下键才抓）,调用门=(!pulley && !CCed && !controlJump && …)
//      （:26320,按住跳整门禁抓）。绳上空格=跳离（:26656 controlJump → pulley=false
//      +jump）。即原版按【空格永远不抓绳】,抓绳键面=W/S（上/下）+头顶格 (y−8)/16
//      为绳。本仓 findPulley（Player.ts :10000）1:1：inputUp/inputDown 抓+
//      jumpOnlyHeld=inputJump&&!inputUp 门（Space+↑ 组合可抓=合并键面登记差异,
//      台账⑥）。用户预期「空格进攀爬」与原版不符,不改。
//
// 变异证红映射（本文件；BJ559 文件 M1-M8 不重复）：
//   N1 dest −fh/2→−fh/4（还原 BJ559 旧 dest）      → T1 红（两档 dest 钉值 −18→−9）、
//                                                    BJ559 T1/T2/T3 连红；
//   N2 pulley 支行值互换（2?1:2→2?2:1）             → T2 红（两档行值对调）、T3 红；
//   N3 摘 playerFrameRows pulley 支                 → T2 红（body 落 0）、T3 红；
//   N4 支序挪到 holdStyleRaw 支后                   → T3 红（holdStyle1 胜出 body=3）、
//                                                    T3 对照组（非 pulley holdStyle）仍绿=单腿恰红；
//   N5 门 p.pulley→!p.pulley                        → T2 非 pulley 对照红（body 误钉 1/2）、
//                                                    T2 pulley 两档红（body 落 0/普通链）。
import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/Renderer';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

/** 记录型 ctx（bj559 同款假体）：按序捕获 save/translate/rotate/drawImage/restore */
function recCtx() {
  const ops: Array<{ op: string; a?: number; b?: number; rest?: number[] }> = [];
  const ctx = {
    save: () => ops.push({ op: 'save' }),
    restore: () => ops.push({ op: 'restore' }),
    translate: (a: number, b: number) => ops.push({ op: 'translate', a, b }),
    rotate: (a: number) => ops.push({ op: 'rotate', a }),
    scale: () => {},
    drawImage: (...args: unknown[]) => ops.push({ op: 'drawImage', rest: args.slice(1) as number[] }),
    canvas: undefined,
  } as unknown as CanvasRenderingContext2D;
  return { ops, ctx };
}

/** 直调 drawPulleyLayer（bj559 同款）：img 26×72 两帧竖排 */
function drawPulley(p: Player) {
  const { ops, ctx } = recCtx();
  const proto = Renderer.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  proto.drawPulleyLayer.call(
    {
      ctx,
      atlas: {
        ensureVImage: () => ({ width: 26, height: 72 }) as unknown as HTMLImageElement,
      },
    } as unknown as Renderer,
    ctx, p, false,
  );
  return ops;
}

/** 直调 playerFrameRows（swing=null → useRow=-1,不吃 this） */
function frameRows(p: Player, holdStyleRaw = 0): { body: number; legs: number } {
  const proto = Renderer.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  return proto.playerFrameRows.call({} as Renderer, p, null, holdStyleRaw, null, null, 0) as unknown as {
    body: number; legs: number;
  };
}

function ropePlayer(): Player {
  const p = new Player(0, 0, new Inventory());
  p.pulley = true;
  return p;
}

describe('BJ576 T1 滑轮锚=帧中心（dest −fh/2;BJ559 旧 −fh/4=低 9px 叠脸病灶）', () => {
  it('两档 dest 上沿=(−13,−18)=帧中心锚——origin(13,18) 相对源矩形（XNA 语义）', () => {
    const pSide = ropePlayer();
    pSide.pulleyDir = 2;                                   // 侧挂档（:3040-3043 num=−25/num2=0/rot=0）
    const side = drawPulley(pSide);
    expect(side.map((o) => o.op)).toEqual(['save', 'translate', 'drawImage', 'restore']);
    expect(side[1].a).toBe(-6.5);                          // numX−6.5（BJ559 镜像化简,不动）
    expect(side[1].b).toBe(-44);                           // numY+2−h/2=−25+2−21
    expect(side[2].rest).toEqual([0, 0, 26, 36, -13, -18, 26, 36]);   // 帧0 dest(−13,−18)=帧中心

    const pMid = ropePlayer();
    pMid.pulleyDir = 1;                                    // 居中档（:3046-3054 num3=−26/num4=10/rot=0.35·−dir）
    const mid = drawPulley(pMid);
    expect(mid.map((o) => o.op)).toEqual(['save', 'translate', 'rotate', 'drawImage', 'restore']);
    expect(mid[1].a).toBe(3.5);
    expect(mid[1].b).toBe(-45);                            // −26+2−21
    expect(mid[2].a).toBeCloseTo(-0.35, 10);
    expect(mid[3].rest).toEqual([0, 0, 26, 36, -13, -18, 26, 36]);    // 帧中心锚两档同式
  });

  it('世界锚=头顶上 2/3px（frame-center 落点 p.y−2 / p.y−3=centerY−23/−24）——非叠脸', () => {
    const p = ropePlayer();
    p.pulleyDir = 2;
    p.h = 42;                                              // 原版 height（Player ctor 同值,钉相显式）
    const side = drawPulley(p);
    // translate 局部 y=−44 → 世界锚 = feet−44 = p.y+42−44 = p.y−2 = centerY(=p.y+21)−23
    const anchorY = p.y + p.h + (side[1].b as number);
    expect(anchorY).toBe(p.y - 2);
    expect(anchorY).toBe(p.y + p.h / 2 + (2 + -25));       // 原版公式逐项（:3041 Position.Y+h/2+2g+num·g）
    // 帧中心锚（dest −fh/2=−18）→ 轮体密集带（帧内 y12..19）= [锚−18+12, 锚−18+19]
    //   = [p.y−8, p.y−1] 头顶/帽区;旧 dest −fh/4 → 带 [p.y+1, p.y+8] 脸部（复报病灶）
    expect((side[2].rest as number[])[5]).toBe(-18);
    expect([anchorY - 18 + 12, anchorY - 18 + 19]).toEqual([p.y - 8, p.y - 1]);

    p.pulleyDir = 1;
    const mid = drawPulley(p);
    const anchorMid = p.y + p.h + (mid[1].b as number);
    expect(anchorMid).toBe(p.y - 3);
    expect(anchorMid).toBe(p.y + p.h / 2 + (2 + -26));     // :3049 逐项（num3=−26）
  });
});

describe('BJ576 T2 攀爬姿势行（Player.cs:36727-36736 bodyFrame 写面 1:1）', () => {
  it('侧挂档（pulleyDir==2）→ 行1；居中档 → 行2（双臂上举抓绳帧,ARM_FRAME 行1→(3,0)/行2→(4,0) 承接近举臂）', () => {
    const pSide = ropePlayer();
    pSide.pulleyDir = 2;
    expect(frameRows(pSide)).toMatchObject({ body: 1 });
    const pMid = ropePlayer();
    pMid.pulleyDir = 1;
    expect(frameRows(pMid)).toMatchObject({ body: 2 });
    // 腿链无 pulley 支（原版唯 :36727 一处）：静悬 vy=0 腿行 0（攀爬 vy≠0 行 5 走既有支）
    expect(frameRows(pSide).legs).toBe(0);
  });

  it('非 pulley 态不回归：body=0 普通帧（门反置/支缺失即红）', () => {
    const p = new Player(0, 0, new Inventory());
    p.pulley = false;
    p.pulleyDir = 1;
    expect(frameRows(p).body).toBe(0);
  });
});

describe('BJ576 T3 支序判别（原版 :36727 pulley 位=useStyle 支后/holdStyle 支前）', () => {
  it('绳上静持火把（holdStyleRaw=1）照钉攀爬行——pulley 胜 holdStyle（原版 else-if 序）', () => {
    const p = ropePlayer();
    p.pulleyDir = 1;
    expect(frameRows(p, 1).body).toBe(2);                  // holdStyle1 非胜出档（:36738 在 pulley 后）
    p.pulleyDir = 2;
    expect(frameRows(p, 1).body).toBe(1);
  });

  it('对照组（非 pulley + holdStyle1 → 行3）不回归——N4 支序变异单腿恰红', () => {
    const p = new Player(0, 0, new Inventory());
    p.pulley = false;
    expect(frameRows(p, 1).body).toBe(3);                  // 既有 holdStyle 支（:36025-36040）不受扰
  });
});
