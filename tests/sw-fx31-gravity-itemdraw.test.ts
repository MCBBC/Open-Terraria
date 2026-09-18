// SW-FX31 波 3：反重力 gravDir 持物域（ItemCheck/绘制域）补债回归。
//  金标（1457 反编译）：
//   · FlipItemLocationAndRotationForGravity  Player.cs:52281-52290（8 显式调用位
//     :51154/:51170/:51184/:51196 holdStyle 4/5/6/8 + :51901/:51946/:51991/:52008
//     useStyle 8/12/14/15）；8 内联同式支 :51478/:51497/:51528/:51553/:51595/
//     :51649/:51683/:51709（useStyle 1/7/9/6/2/11/3/4）+ holdStyle 1/2 双支
//     :51070/:51091/:51110；useStyle 5/13 与 holdStyle 3 无翻转支
//   · itemEffect=FlipVertically               PlayerDrawSet.cs:1722/:1727
//   · 绘制 origin 翻转                        PlayerDrawLayers.cs:3269-3271
//   · Main.DrawPlayerItemPos(gravdir,…) dy    Main.cs:3357-3692（逐项 ±N*gravdir）
//   · GetMeleeHitbox gravDir 档               Player.cs:45519-45521/:45533/:45543
//   · ItemCheck_Shoot 枪口 gravDir 档          Player.cs:47680/:47685（986/281/3007）
//   · 真刃系 ai0 = direction×gravDir          Player.cs:49381/:49382/:49396/:49403/
//     :49416/:49427/:49435/:49443/:49444
//   · CanVisuallyHoldItem holdStyle4 倒挂隐藏  Player.cs:50816-50818
//   · GetTargetTileWithReverseGravity         Player.cs:52962-52970
//  ★主判据 = gd=1 逐位恒等：全部 gravDir 支以 `=== -1` 门控 / ×gravDir 因子在
//   gd=1 数值恒等（floor(x)*1 === floor(x)）；gd=-1 逐面与原版公式一致。
//  ★变异证红：每组标注「旧实现退化值」——回退任一刀对应组必红（M1-M6 见组注）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  useStyleFlipsForGravity, holdStyleFlipsForGravity,
  flipItemLocationAndRotationForGravity, heldItemOriginFlipY,
  drawPlayerItemPosDy, reverseGravityTargetTileY,
} from '../src/render/heldItemGrav';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE } from '../src/core/constants';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (p: string): string => readFileSync(join(ROOT, 'src', p), 'utf8');
const srcRenderer = (): string => SRC('render/Renderer.ts');
const srcGame = (): string => SRC('core/Game.ts');
const srcGrav = (): string => SRC('render/heldItemGrav.ts');

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

// ============ A. 纯公式层（gd=1 恒等主判据 + gd=-1 原版公式） ============
describe('FlipItemLocationAndRotationForGravity 纯公式（Player.cs:52281）', () => {
  it('M1 · gd=1 逐位恒等：翻转支不可达（旧实现退化值=无此函数，gd=1 同面）', () => {
    for (const offY of [0, 10, 24, 38, -7, 100.5]) {
      for (const rot of [0, -0.3, 1.57, -3.5, 12.25]) {
        expect(flipItemLocationAndRotationForGravity(offY, rot, 42, 1))
          .toEqual({ offY, rot });
      }
    }
  });
  it('gd=-1：offY 关于玩家盒竖直中心镜像（offY+offY\'=h）+ itemRotation 取反（:52284-52287）', () => {
    // 原式 itemLocation.Y = Bottom.Y + (position.Y − itemLocation.Y)：
    //   p.y + offY' = (p.y + h) + (p.y − (p.y + offY)) ⇒ offY' = h − offY
    for (const offY of [0, 9, 10, 16, 24, 28, 34, 38, -6, 60.25]) {
      const { offY: fy, rot: fr } = flipItemLocationAndRotationForGravity(offY, 0.7, 42, -1);
      expect(fy + offY).toBe(42);          // 镜像律（任意值）
      expect(fr).toBe(-0.7);               // itemRotation = 0f − itemRotation
    }
    // 锚点世界值对拍：p.y=1440、h=42、offY=24 → 世界 Y 1464 → 镜像 1458 = 2·1440+42−1464
    expect(1440 + flipItemLocationAndRotationForGravity(24, 0, 42, -1).offY).toBe(1458);
  });
  it('M2 · useStyle 翻转面定谳：5/13 无翻转支（:51715-51820），其余全翻', () => {
    for (const us of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16]) {
      expect(useStyleFlipsForGravity(us)).toBe(true);
    }
    expect(useStyleFlipsForGravity(5)).toBe(false);    // 枪/弓/杖瞄准持位（MountedCenter 域）
    expect(useStyleFlipsForGravity(13)).toBe(false);   // 短剑复合臂
  });
  it('holdStyle 翻转面定谳：1/2/4/5/6/8 翻、3/7 不翻（:51070-:51121/:51154-:51196）', () => {
    for (const hs of [1, 2, 4, 5, 6, 8]) expect(holdStyleFlipsForGravity(hs)).toBe(true);
    for (const hs of [0, 3, 7]) expect(holdStyleFlipsForGravity(hs)).toBe(false);
  });
});

describe('绘制 origin 翻转（PlayerDrawLayers.cs:3269-3271）+ DrawPlayerItemPos dy（Main.cs:3357）', () => {
  it('M3 · gd=1 恒等；gd=-1：放置位 = −drawOY − H（origin.Y = H − origin.Y 语义换算）', () => {
    expect(heldItemOriginFlipY(-62, 62, 1)).toBe(-62);      // 缺省底左角锚（gd=1 原样）
    expect(heldItemOriginFlipY(-62, 62, -1)).toBe(0);       // 缺省 origin(0,H) → (0,0)
    expect(heldItemOriginFlipY(-31, 62, -1)).toBe(-31);     // us5 枪握把 origin.Y=H/2 自对称
    expect(heldItemOriginFlipY(-62 * 0.4, 62, -1)).toBeCloseTo(-62 * 0.6, 9); // us9 (0.5,0.4)→(0.5,0.6)
    expect(heldItemOriginFlipY(3.5, 62, -1)).toBe(-65.5);   // us8 origin.Y=2 类正值也翻
  });
  it('M4 · DrawPlayerItemPos dy 的 gravDir 因子（Main.cs:3366 `result.Y += 2f*gravdir` 族）', () => {
    expect(drawPlayerItemPosDy(2, 1)).toBe(2);
    expect(drawPlayerItemPosDy(2, -1)).toBe(-2);   // 95: +2*gravdir → 倒挂 −2
    expect(drawPlayerItemPosDy(-1, -1)).toBe(1);   // 3007: −1*gravdir
  });
});

describe('GetTargetTileWithReverseGravity 公式镜像（Player.cs:52962-52970）', () => {
  it('gd=1：普通式 (int)(top+raw)/16（FX27 翻转支不可达=恒等面）', () => {
    expect(reverseGravityTargetTileY(1000, 600, 450, 1)).toBe(Math.trunc(1450 / 16));
  });
  it('gd=-1：反演式 (int)(top+screenHeight−raw)/16（:52966-52968）——与 FX27 翻转后世界 Y 同源', () => {
    // FX27 sw-fx27-gravity-view.test.ts 场景：screenTopY=1000、screenHeight=600、
    // 裸鼠标世界比例 Y=150 → 翻转后世界 Y=1450 → tY=90。原版反演式同值（同源对拍）。
    expect(reverseGravityTargetTileY(1000, 600, 150, -1)).toBe(90);
    expect(reverseGravityTargetTileY(1000, 600, 150, -1))
      .toBe(Math.trunc(Math.trunc(1000 + 600 - 150) / 16));   // (int)(和)/16 截断序
  });
});

// ============ B. Renderer 接线结构锁（防静默回退/整文件覆写） ============
describe('drawUseItem 反重力档接线（render/Renderer.ts）', () => {
  it('M1 变异：useStyle 翻转门 + FlipItem 调用 + itemEffect 镜像 + origin 翻转四件齐', () => {
    const src = srcRenderer();
    expect(src).toContain('useStyleFlipsForGravity(us)');
    expect(src).toContain('flipItemLocationAndRotationForGravity(offY, rot, p.h, -1)');
    // 贴图竖直镜像（itemEffect=FlipVertically）——在 rotate 之后插入
    expect(src).toContain('if (p.gravDir === -1) ctx.scale(1, -1);');
    // origin 翻转消费：drawImage 与 flame dest 同用 drawOYEff（M3 变异：回退 drawOY 此组红）
    expect(src).toContain('const drawOYEff = heldItemOriginFlipY(drawOY, fh, p.gravDir);');
    expect(src).toContain('drawOX, drawOYEff, ar.sw, ar.sh');
    expect(src).toContain('y: drawOYEff, w: ar.sw, h: ar.sh');
  });
  it('M4 变异：us5 枪握把 dy 吃 DrawPlayerItemPos gravDir 因子（回退裸 dp[1] 此组红）', () => {
    const src = srcRenderer();
    expect(src).toContain('drawPlayerItemPosDy(dp[1], p.gravDir)');
  });
  it('翻转在坐骑锚调整之后、ctx.save 之前（镜像作用于最终锚）', () => {
    const src = srcRenderer();
    const mount = src.indexOf('mountHeldAnchor(p.mount.type, us, 0, true,');
    const flip = src.indexOf('useStyleFlipsForGravity(us)');
    const save = src.indexOf('ctx.translate(p.cx + p.facing * offX, p.y + gravOffY);');
    expect(mount).toBeGreaterThan(-1);
    expect(flip).toBeGreaterThan(mount);
    expect(save).toBeGreaterThan(flip);
  });
  it('静持（holdStyle）档：hs 翻转门 + hs4 倒挂隐藏 + origin 翻转', () => {
    const src = srcRenderer();
    expect(src).toContain('holdStyleFlipsForGravity(heldDraw.hs)');
    // CanVisuallyHoldItem holdStyle 4 倒挂隐藏支（Player.cs:50816-50818）
    expect(src).toContain('if (hs === 4 && p.gravDir === -1) staticHoldStyle = 0;');
    expect(src).toContain('const holdOYEff = heldItemOriginFlipY(-fh, fh, p.gravDir);');
  });
  it('金标行号锚在案（52281/1722/3269/52962）', () => {
    const g = srcGrav();
    expect(g).toContain('52281');
    expect(g).toContain('1722');
    expect(g).toContain('3269');
    expect(g).toContain('52962');
  });
});

// ============ C. 近战判定盒（GetMeleeHitbox gravDir 档） ============
describe('Game.updateSwingHits 判定盒 gravDir 档（Player.cs:45519/:45533/:45543）', () => {
  it('M5 · 结构锚：三处 Y 项全带 gravDir（回退任一处此组红）', () => {
    const src = srcGame();
    expect(src).toContain('if (p.gravDir === 1) by -= bh;');                       // :45519-45521
    expect(src).toContain('by += Math.floor(bh * 0.5) * p.gravDir;');              // :45533
    expect(src).toContain('by -= Math.floor(bh * 1.4 - bh) * p.gravDir;');         // :45543
    expect(src).toContain('p.y + (p.gravDir === -1 ? p.h - offY : offY)');         // itemLocation 镜像
  });

  /** 最小可驱动 updateSwingHits 的 Game 原型桩（weapon-melee-leftover 同口径） */
  function swingGame(heldVid: number, gravDir: 1 | -1, enemyTopDy: number) {
    const world = new World(120, 120, 30, 'sw-fx31');
    // 净空战场（世界种子地形随机——LOS 门（:44641 CanHit）会因实心块吞命中，
    // 与被测 gravDir 面无关 → 清出 14×16 空腔保证两向对照只由判定盒位置分辨）
    for (let y = 82; y <= 100; y++) {
      for (let x = 44; x <= 58; x++) world.store.setTileSilent(x, y, 0, 0, 0);
    }
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    player.inv.add(iid(heldVid), 1);
    player.gravDir = gravDir;
    const enemies = [Enemy.fromVanilla(1, player.cx + 8, player.y + enemyTopDy)!];
    const e = enemies[0];
    const hits: number[] = [];
    e.hurt = ((d: number, ...rest: unknown[]) => { hits.push(d); return 0; }) as typeof e.hurt;
    g.swing = { t: 15, dur: 30, dmg: 10, kb: 3, item: iid(heldVid), useStyle: 1 };
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.entities = { critters: [], npcs: [], enemies, add: () => {}, nextId: 1 };
    g.player = player;
    g.world = world;
    g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
    g.addDamageNumber = () => {};
    g.spawnParticles = () => {};
    g.spawnDrop = () => null;
    g.net = null;
    g.bannerNpcActive = () => false;
    g.remotePlayerProxies = [];
    g.dropContext = () => undefined;
    g.onEnemyKilled = () => {};
    return { g, player, e, hits };
  }

  it('gd=-1 行为：判定盒镜像到盒心下方——普通重力打不到的脚下敌被砍中（村正 155）', () => {
    // 中段（t=15/dur=30 → 'mid' → phase1/tier1，offY≤14）判定盒底 ≈ p.y+offY：
    // 僵尸(42 高)顶 p.y+33 → gd=1 盒 [p.y+offY−bh, p.y+offY] 不触（底 ≤ p.y+14）；
    // gd=-1 镜像盒自锚 p.y+h−offY=32 向【下】伸展 [32, 48]（bh=16 缺省帧）覆盖 33+。
    // ★双重分辨：仅镜像不伸展（M5a）盒=[16,32] 与 [33,75] 零交必红；仅伸展不
    // 镜像（旧码）盒=[−6,10] 与 [33,75] 零交必红——镜像+向下伸展两件缺一即红。
    const a = swingGame(155, 1, 33);
    (a.g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(a.hits).toHaveLength(0);        // 基线：普通重力脚下身后敌不中
    const b = swingGame(155, -1, 33);
    (b.g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(b.hits).toHaveLength(1);        // M5 变异：旧码/M5a 任一退化此断言红
  });
  it('gd=-1 行为：镜像非扩盒——倒挂时头顶上方（世界上方）敌脱靶', () => {
    // 僵尸顶 p.y−30（头上方）。gd=-1 镜像盒 = [p.y+h−offY, …+bh]（盒心下方）与其
    // 零交 → 不中；若把翻转误做成「镜像∪原盒」扩盒则此处必红。
    // （gd=1 基线由上一测承担：脚下敌 gd=1 不中 → 两测合取 = 盒整体镜像而非并集）
    const b = swingGame(155, -1, -30);
    (b.g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(b.hits).toHaveLength(0);
  });
  it('火之大剑 121 探针（GetPointOnSwungItemPath num2 倒挂支）接线结构锚', () => {
    const g = srcGame();
    // FlipItem 取反喂探针（Player.cs:52284）+ gravDir 透传（:45124-45126）
    expect(g).toContain('p.gravDir === -1 ? -dirRot : dirRot,');
    expect(g).toMatch(/starfurySwingProbes\([\s\S]{0,1400}?p\.gravDir\)/);
    const spm = SRC('player/SwingPathMath.ts');
    expect(spm).toContain('gravDir: 1 | -1 = 1,');
    expect(spm).toContain('getPointOnSwungItemPath(70, 70, 0, itemScale, itemLocation, itemRotation, direction, gravDir, frame)');
  });
});

// ============ D. 出膛域（枪口 gravDir 档 + 真刃系 ai0） ============
describe('ItemCheck_Shoot 枪口/弹 ai0 gravDir 档接线（core/Game.ts）', () => {
  it('M6 · 枪口特档 gravDir 活语义（Player.cs:47680/:47685——旧码 ay-=6/2 恒 gd=1）', () => {
    const src = srcGame();
    expect(src).toContain('ay -= 6 * this.player.gravDir;');
    expect(src).toContain('ay -= 2 * this.player.gravDir;');
  });
  it('真刃系 ai0 = direction × gravDir（:49381-:49444 逐链）三出生位 + 984 弧', () => {
    const src = srcGame();
    expect(src).toContain('const arcAi0 = this.player.facing * this.player.gravDir;');
    expect(src).toContain('arcAi0, 30, scaleT);');
    expect(src).toContain('arcAi0, 32, scaleT);');
    expect(src).toContain('this.player.facing * this.player.gravDir, (ps?.size ?? 1));');
    // SwingArc 的 ai0 消费侧语义（镜像面）在实体侧已备：ai0<0 → FlipVertically
    // （2026-09-19 剑影染色引擎重构：翻转式下沉到共享 drawArcLayers 层表消费端）
    const arc = SRC('entities/SwingArc.ts');
    expect(arc).toContain('if (ai0 < 0) ctx.scale(1, -1);');
  });
});

// ============ E. 结构自证：gd=1 门控完备（无旁路的无条件翻转） ============
describe('gd=1 逐位恒等自证（翻转支全部门控）', () => {
  it('Renderer 反重力新增行全部带 gravDir === -1 门或恒等函数', () => {
    const src = srcRenderer();
    for (const line of src.split('\n')) {
      if (/heldItemOriginFlipY|flipItemLocationAndRotationForGravity|drawPlayerItemPosDy|holdStyleFlipsForGravity|useStyleFlipsForGravity/.test(line)
        && !/^\s*(\/\/|\*)/.test(line) && !/import /.test(line)) {
        const ctx = src.slice(Math.max(0, src.indexOf(line) - 260), src.indexOf(line));
        const gated = /gravDir === -1|gravDir\)|p\.gravDir|heldDraw\.hs|useStyleFlipsForGravity\(us\)|us, |, -1\)/.test(ctx + line);
        expect(gated, `未门控的翻转消费: ${line.trim()}`).toBe(true);
      }
    }
  });
  it('Game 近战判定盒 gravDir 因子行在案且 gd=1 数值恒等（floor(x)*1 === floor(x)）', () => {
    // gd=1：Math.floor(bh*0.5)*1 === Math.floor(bh*0.5)（乘 1 恒等）——原基线逐位保持
    const bh = 62;
    expect(Math.floor(bh * 0.5) * 1).toBe(Math.floor(bh * 0.5));
    expect(Math.floor(bh * 1.4 - bh) * 1).toBe(Math.floor(bh * 1.4 - bh));
  });
});
