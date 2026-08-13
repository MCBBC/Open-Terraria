// NPC 绘制侧登记遗留核销回归（2026-08-13 六件套，标杆 ../Terarria1456/Terraria/Main.cs）：
//   ① 568/569 枯萎兽出生紫雾（:25899-25907）+ 死亡紫魂环 Extra_89×16 @400
//      （:26130-26155）——参数纯函数 npcWitherBirthParams / npcSoulRingParams
//   ② 城镇宠物 637/638/656 派对帽帧修正分支（drawPartyHat 主 :26849-26887）
//   ③ 229 海盗（ai[0]==12 → −4）/ 550 酒保（ai[0]==5 → +7）帽位 X 修正（:27001-27008）
//   ④ 160 松露人 / 209 电子人微光态 Glow 变体档（:25769/:25783，drawTownNPC 消费）
//   ⑤ 月总死亡白闪层位（MoonlordDeathDrama.DrawWhite :61763 = 帧尾，
//      ScreenDarkness 后 / ScreenObstruction 前）
//   ⑥ gore 16/17 火苗点光注入（Gore.Update 尾段 :1078-1101 AddLight 语义；
//      生产消费点 = Game.ts 光收集循环，与火把/发光族同惯例）
// 只读静态参数/素材/源序，不依赖 DOM（vitest node 环境，同 visual-extras.test.ts）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// pngjs 无类型声明（同 tests/visual-extras.test.ts 的既有用法）
// @ts-ignore
import { PNG } from 'pngjs';
import { Renderer, townSheetFrameCount } from '../src/render/Renderer';
import { TILE } from '../src/core/constants';
import { World } from '../src/world/World';
import { GorePiece, liveGorePieces, resetGorePool } from '../src/entities/GorePiece';

const SRC = join(__dirname, '..', 'src');
const VANILLA = join(__dirname, '..', 'public', 'sprites', 'vanilla');
const srcOf = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
/** PNG IHDR 宽高（偏移 16/20，同 visual-extras.pngSize） */
const pngSize = (f: string): [number, number] => {
  const b = readFileSync(join(VANILLA, f));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('① 568/569 枯萎兽出生紫雾（Main.cs:25899-25907）', () => {
  it('3 份、半径 8×num300 收敛（8→0）、加性强度 num315²（0→1）', () => {
    expect(Renderer.npcWitherBirthParams(60)).toBeNull();   // 出生完成 → 无雾
    expect(Renderer.npcWitherBirthParams(100)).toBeNull();
    const p0 = Renderer.npcWitherBirthParams(0)!;
    expect(p0.count).toBe(3);                               // num299=3
    expect(p0.radius).toBeCloseTo(8, 9);                    // num301×num300 = 8×1
    expect(p0.fade).toBe(0);                                // (0/60)²
    const p30 = Renderer.npcWitherBirthParams(30)!;
    expect(p30.radius).toBeCloseTo(8 * (1 - 0.25), 9);      // 8×(1−0.5²)=6
    expect(p30.fade).toBeCloseTo(0.25, 9);
    const p59 = Renderer.npcWitherBirthParams(59)!;
    expect(p59.radius).toBeCloseTo(8 * (1 - (59 / 60) ** 2), 9);
    expect(p59.fade).toBeCloseTo((59 / 60) ** 2, 9);
  });
});

describe('① 568/569 死亡紫魂环（Main.cs:26130-26155）', () => {
  it('份数恒 16 @半径 400×num323、π/750 慢旋（num324=lai0×0.0041887905）', () => {
    expect(Renderer.npcSoulRingParams(0)).toBeNull();       // localAI[0]>0 门
    expect(Renderer.npcSoulRingParams(-3)).toBeNull();
    const p = Renderer.npcSoulRingParams(60)!;
    expect(p.count).toBe(16);
    expect(p.radius).toBeCloseTo(400, 6);                   // num323=1（≥60 无膨胀段）
    expect(p.scale).toBe(1);
    expect(p.angle0).toBeCloseTo(60 * 0.0041887905, 9);
  });
  it('A 通道 = trunc((cos(lai0·2π/60)·0.5+0.5)×32)×0.75/255（60t 脉动）', () => {
    const p60 = Renderer.npcSoulRingParams(60)!;            // cos(2π)=1 → 32 满档
    expect(p60.alpha).toBeCloseTo((32 * 0.75) / 255, 9);
    const p30 = Renderer.npcSoulRingParams(30)!;            // cos(π)=−1 → 0
    expect(p30.alpha).toBe(0);
    const p15 = Renderer.npcSoulRingParams(15)!;            // cos(π/2)=0 → 16
    expect(p15.alpha).toBeCloseTo((16 * 0.75) / 255 * 0.25, 9);  // 再 ×lerp(0,60,15)=0.25
  });
  it('lai0<60 段：×GetLerpValue(0,60) 渐入 + num323=Lerp(1,0.5,1−lerp²)（0.5→1 膨胀）', () => {
    const q = Renderer.npcSoulRingParams(30)!;
    expect(q.scale).toBeCloseTo(1 - 0.5 * (1 - 0.25), 9);   // 0.625
    expect(q.radius).toBeCloseTo(400 * 0.625, 6);
    const r = Renderer.npcSoulRingParams(0.5)!;
    expect(r.scale).toBeCloseTo(1 - 0.5 * (1 - (0.5 / 60) ** 2), 9);
    // alpha15=trunc((cos(0.5·2π/60)·0.5+0.5)×32)=31 → ×0.75/255 再 ×lerp(0,60,0.5)
    expect(r.alpha).toBeCloseTo((31 * 0.75) / 255 * (0.5 / 60), 9);
  });
  it('灵气态期间恒在环：localAI[0] 任意正数（AI_107 :63882 每 tick +1）都不关环', () => {
    for (const t of [1, 7, 59, 61, 120, 999]) {
      expect(Renderer.npcSoulRingParams(t)).not.toBeNull();
    }
  });
});

describe('② 城镇宠物派对帽帧修正分支（Main.cs:26849-26887）', () => {
  it('637 猫：基准 6；帧 19/22-27 → −2、11-15 → +2（20/21 是缺口帧不动）', () => {
    expect(Renderer.hatNum3(637, 0)).toEqual([6, 0]);
    expect(Renderer.hatNum3(637, 10)).toEqual([6, 0]);
    expect(Renderer.hatNum3(637, 19)).toEqual([4, 0]);
    expect(Renderer.hatNum3(637, 22)).toEqual([4, 0]);
    expect(Renderer.hatNum3(637, 27)).toEqual([4, 0]);
    expect(Renderer.hatNum3(637, 20)).toEqual([6, 0]);      // 缺口帧
    expect(Renderer.hatNum3(637, 21)).toEqual([6, 0]);
    expect(Renderer.hatNum3(637, 11)).toEqual([8, 0]);
    expect(Renderer.hatNum3(637, 15)).toEqual([8, 0]);
    expect(Renderer.hatNum3(637, 16)).toEqual([6, 0]);
  });
  it('638 狗恒 12（无帧修正）', () => {
    for (const f of [0, 5, 14, 27]) expect(Renderer.hatNum3(638, f)).toEqual([12, 0]);
  });
  it('656 兔：基准 6；帧 1-3 → −2、18-25 → −4、8 → −2', () => {
    expect(Renderer.hatNum3(656, 0)).toEqual([6, 0]);
    expect(Renderer.hatNum3(656, 1)).toEqual([4, 0]);
    expect(Renderer.hatNum3(656, 3)).toEqual([4, 0]);
    expect(Renderer.hatNum3(656, 4)).toEqual([6, 0]);
    expect(Renderer.hatNum3(656, 8)).toEqual([4, 0]);
    expect(Renderer.hatNum3(656, 17)).toEqual([6, 0]);
    expect(Renderer.hatNum3(656, 18)).toEqual([2, 0]);
    expect(Renderer.hatNum3(656, 25)).toEqual([2, 0]);
    expect(Renderer.hatNum3(656, 26)).toEqual([6, 0]);
  });
  it('663 公主 1 + 城镇史莱姆档（IsTownSlime NPCID.cs:4446，:26901-26928）', () => {
    expect(Renderer.hatNum3(663, 0)).toEqual([1, 0]);
    expect(Renderer.hatNum3(670, 0)).toEqual([-1, 0]);
    expect(Renderer.hatNum3(679, 0)).toEqual([-1, 0]);
    expect(Renderer.hatNum3(678, 0)).toEqual([1, 0]);
    expect(Renderer.hatNum3(680, 0)).toEqual([1, 0]);
    expect(Renderer.hatNum3(681, 0)).toEqual([-2, 0]);
    expect(Renderer.hatNum3(682, 0)).toEqual([-1, 2]);
    expect(Renderer.hatNum3(683, 0)).toEqual([-1, -2]);
    expect(Renderer.hatNum3(684, 0)).toEqual([-4, 0]);
    expect(Renderer.hatNum3(22, 0)).toEqual([0, 0]);        // 普通城镇 NPC 无档
  });
  it('宠物 NPCFramingGroup 补齐（NPCID.cs:4875：637→4 / 638→5 / 656→6 / 633→1）', () => {
    const src = srcOf('render/Renderer.ts');
    const tbl = src.slice(src.indexOf('HAT_FRAMING_GROUP'), src.indexOf('};', src.indexOf('HAT_FRAMING_GROUP')));
    for (const pair of ['633: 1', '637: 4', '638: 5', '656: 6']) expect(tbl).toContain(pair);
  });
});

describe('③ 229 海盗 / 550 酒保帽位 X 修正（Main.cs:27001-27008）', () => {
  it('海盗弓态 ai[0]==12 → −4；酒保坐姿 ai[0]==5 → +7；其余 0', () => {
    expect(Renderer.hatStateOffsetX(229, 12)).toBe(-4);
    expect(Renderer.hatStateOffsetX(229, 0)).toBe(0);
    expect(Renderer.hatStateOffsetX(229, 10)).toBe(0);
    expect(Renderer.hatStateOffsetX(229, 14)).toBe(0);
    expect(Renderer.hatStateOffsetX(550, 5)).toBe(7);
    expect(Renderer.hatStateOffsetX(550, 0)).toBe(0);
    expect(Renderer.hatStateOffsetX(550, 10)).toBe(0);
    expect(Renderer.hatStateOffsetX(208, 12)).toBe(0);
  });
  it('仓内消费链：229 弓态经 TownNPC.attackState 喂入（TOWN_ATTACK_TYPE[229]=1 → 12）', () => {
    const src = srcOf('entities/TownNPC.ts');
    expect(src).toContain('get attackState(): number');
    const r = srcOf('render/Renderer.ts');
    expect(r).toContain("Renderer.hatStateOffsetX(n.vanillaId, n.attackState)");
  });
});

describe('④ 160/209 微光态 Glow 变体档（Main.cs:25769/:25783）', () => {
  it('档映射：160 微光态 Glow_352；209 微光态按 altTexture 选 350/351', () => {
    expect(Renderer.npcGlowVariantTex(160, false, 0)).toBe('vanilla/Glow_166.png');
    expect(Renderer.npcGlowVariantTex(160, true, 0)).toBe('vanilla/Glow_352.png');
    expect(Renderer.npcGlowVariantTex(160, true, 1)).toBe('vanilla/Glow_352.png');   // 160 不看 altTexture
    expect(Renderer.npcGlowVariantTex(209, false, 1)).toBe('vanilla/Glow_167.png');
    expect(Renderer.npcGlowVariantTex(209, true, 0)).toBe('vanilla/Glow_350.png');
    expect(Renderer.npcGlowVariantTex(209, true, 2)).toBe('vanilla/Glow_350.png');
    expect(Renderer.npcGlowVariantTex(209, true, 1)).toBe('vanilla/Glow_351.png');
    expect(Renderer.npcGlowVariantTex(108, false, 0)).toBeNull();                    // 其余城镇 NPC 无档
  });
  it('Glow 表与 NPC 表帧数同构（drawTownNPC 按帧高切片的前提）', () => {
    for (const [tex, id] of [
      ['Glow_166.png', 160], ['Glow_352.png', 160],
      ['Glow_167.png', 209], ['Glow_350.png', 209], ['Glow_351.png', 209],
    ] as const) {
      const [, h] = pngSize(tex);
      const count = townSheetFrameCount(id);
      expect(h % count, `${tex} 高 ${h} 须整除 ${count} 帧`).toBe(0);
    }
    expect(townSheetFrameCount(160)).toBe(23);   // Glow_166/352 = 1380 = 23×60
    expect(townSheetFrameCount(209)).toBe(26);   // Glow_167/350/351 = 1456 = 26×56
  });
  it("drawTownNPC 已挂叠画（'lighter' + (128−α/2)/255，α=城镇 NPC 静态 0）", () => {
    const src = srcOf('render/Renderer.ts');
    expect(src).toContain('Renderer.npcGlowVariantTex(n.vanillaId, n.shimmered, n.altTexture)');
    expect(src).toContain("ctx.globalAlpha = 128 / 255;");
    expect(src).toContain("ctx.globalCompositeOperation = 'lighter';");
  });
});

describe('⑤ 月总死亡白闪层位（MoonlordDeathDrama.DrawWhite Main.cs:61763）', () => {
  it('调用点 = 帧尾：实体绘制与光照合成之后、ScreenObstruction 之前', () => {
    const src = srcOf('render/Renderer.ts');
    const entities = src.indexOf('// 4. 实体');
    const lightComp = src.indexOf('// 7. 光照合成');
    const flash = src.indexOf('this.sky.drawMoonlordWhiteFlash(ctx, viewW, viewH);');
    const obstruction = src.indexOf('this.updateAndDrawScreenObstruction(ctx, cam, viewW, viewH, player);');
    expect(entities).toBeGreaterThan(0);
    expect(lightComp).toBeGreaterThan(entities);
    expect(flash).toBeGreaterThan(lightComp);
    expect(obstruction).toBeGreaterThan(flash);
  });
  it("2d' 世界变换段不再画白闪（原偏差位）", () => {
    const sky = srcOf('render/SkyRenderer.ts');
    const worldFx = sky.indexOf('drawWorldFx(ctx: CanvasRenderingContext2D');
    const body = sky.slice(worldFx, sky.indexOf('drawMoonlordWhiteFlash', worldFx));
    expect(body).not.toContain('drawMoonlordWhitening');
    // 帧尾出口仍调本体（T 代理实装的白闪）
    const tail = sky.indexOf('drawMoonlordWhiteFlash(ctx: CanvasRenderingContext2D');
    expect(tail).toBeGreaterThan(0);
    expect(sky.slice(tail)).toContain('this.drawMoonlordWhitening(ctx, viewW, viewH);');
  });
});

describe('⑥ gore 16/17 火苗点光注入（Gore.Update 尾段 :1078-1101）', () => {
  /** LightingEngine.addLight 的 mock 收集器（生产消费点 Game.ts 光收集循环） */
  const makeSink = () => {
    const calls: Array<[number, number, number, number, number]> = [];
    return {
      calls,
      addLight: (x: number, y: number, r: number, g: number, b: number) => {
        calls.push([x, y, r, g, b]);
      },
    };
  };
  /** 最小世界（同 tests/gore.test.ts 的 makeWorld：地板一行） */
  const goreWorld = () => {
    const w = new World(48, 48, 7, 'draw-leftovers');
    for (let x = 0; x < 48; x++) w.store.setTile(x, 40, 1);
    return w;
  };
  it('gore active 且 light>0 → 注入 lightRGB 的 tx/ty/rgb（16 号橙火衰减通道）', () => {
    resetGorePool();
    const w = goreWorld();
    const p = GorePiece.newGore(16, 10 * TILE, 5 * TILE, 0, 0, 1)!;
    p.fixedUpdate(1, { world: w } as never);                 // scale 0.7→0.69
    const sink = makeSink();
    const inBounds = (x: number, y: number) => w.store.inBounds(x, y);
    for (const gp of liveGorePieces()) {                     // 同 Game.ts 注入式
      const l = gp.lightRGB();
      if (l && inBounds(l.tx, l.ty)) sink.addLight(l.tx, l.ty, l.r, l.g, l.b);
    }
    expect(sink.calls.length).toBe(1);
    const [tx, ty, r, g, b] = sink.calls[0];
    expect(tx).toBe(Math.floor((p.x + (p.texW * p.scale) / 2) / 16));
    expect(ty).toBe(Math.floor((p.y + (p.texH * p.scale) / 2) / 16));
    expect(r).toBeCloseTo(p.scale, 6);                       // light×scale（1×0.69）
    expect(g).toBeCloseTo(p.scale * 0.8, 6);                 // 16 号 G×0.8
    expect(b).toBeCloseTo(p.scale * 0.3, 6);                 // 16 号 B×0.3
    resetGorePool();
  });
  it('17 号蓝火通道 (R×0.3, G×0.6, B)；light==0 / dead / 越界 → 不注入', () => {
    resetGorePool();
    const w = goreWorld();
    const q = GorePiece.newGore(17, 30 * TILE, 5 * TILE, 0, 0, 1)!;
    const plain = GorePiece.newGore(4, 40 * TILE, 5 * TILE, 0, 0, 1)!;   // 非 16/17：light=0
    expect(plain.light).toBe(0);
    const sink = makeSink();
    const inBounds = (x: number, y: number) => w.store.inBounds(x, y);
    for (const gp of liveGorePieces()) {
      const l = gp.lightRGB();
      if (l && inBounds(l.tx, l.ty)) sink.addLight(l.tx, l.ty, l.r, l.g, l.b);
    }
    expect(sink.calls.length).toBe(1);                        // 仅 17 号
    expect(sink.calls[0][2]).toBeCloseTo(0.7 * 0.3, 4);
    expect(sink.calls[0][3]).toBeCloseTo(0.7 * 0.6, 4);
    expect(sink.calls[0][4]).toBeCloseTo(0.7, 4);
    // 越界 → 界内门拦下（inBounds 守卫，同 Game.ts 表达式）
    const sink2 = makeSink();
    const never = (..._a: number[]) => false;
    for (const gp of liveGorePieces()) {
      const l = gp.lightRGB();
      if (l && never(l.tx, l.ty)) sink2.addLight(l.tx, l.ty, l.r, l.g, l.b);
    }
    expect(sink2.calls.length).toBe(0);
    // dead → lightRGB 恒 null（Gore.active 语义）
    let ticks = 0;
    while (!q.dead && ticks++ < 8000) q.fixedUpdate(1, { world: w } as never);
    expect(q.dead).toBe(true);
    expect(q.lightRGB()).toBeNull();
    resetGorePool();
  });
});
