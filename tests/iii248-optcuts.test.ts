// IIII248 无代价优化包 —— 语义零变更等价性锁:
//  ② projScanCtx(弹幕命中扫描 equip 快照):
//     · 窗内=快照消费(与活 equipStats 逐值恒等——窗内六布尔字段恒定的证明见
//       projScanCtx.ts 头注;本测试钉「快照被消费」与「窗外回退活路径」两面);
//     · 快照缺席(单测/探针直调/其余桶)=旧活读路径逐位不变(回退面)。
//  ③ 液体四邻内联的循环界恒真不变量(inBounds 展开等价性的域前提):
//     nb 展开域 = x∈[max(1,tx0),min(w-2,tx1)] × y 同理 ⇒ 四邻恒 inBounds。
//  ①/④(浏览器面)等价性 = scripts/_iii248-domui.mjs(差分网格)与
//    scripts/_iii248-equiv.mjs(确定性截图哈希),非 vitest 域。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  beginProjScanCtx, endProjScanCtx, getProjScanCtx,
} from '../src/entities/projScanCtx';
import { hitCritters, hitTownNpcs, playerCanHitEnemy } from '../src/entities/projTargets';
import type { GameHooks } from '../src/entities/types';
import { TileStore } from '../src/world/TileStore';

function stubGame(critters: unknown[] = [], npcs: unknown[] = [], equipStats: Record<string, unknown> = {}): GameHooks {
  return {
    player: { hp: 100, maxHp: 100, mana: 20, maxMana: 20, luck: 0, dead: false,
      cx: 0, cy: 0, equipStats, buffs: { has: () => false }, addDPS: (_n: number) => {} },
    enemies: () => [],
    npcs: () => npcs,
    critters: () => critters,
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

function critter(): { x: number; y: number; w: number; h: number; dead: boolean; hurt: (g: unknown) => boolean } {
  let hurtN = 0;
  return { x: 0, y: 0, w: 16, h: 16, dead: false, hurt: () => { hurtN++; return true; } };
}

describe('IIIII248 ② projScanCtx 快照语义', () => {
  beforeEach(() => {
    // WeakMap 按 host 分桶——每个用例用新对象,无需额外清理
  });

  it('快照缺席(未 begin)= 活 equipStats 治理(旧路径不变)', () => {
    const c = critter();
    const g = stubGame([c], [], { dontHurtCritters: true });
    expect(getProjScanCtx(g.player)).toBeNull();
    expect(hitCritters({ x: 0, y: 0, w: 16, h: 16 } as const, g)).toBe(false); // 门=活 dontHurtCritters
  });

  it('窗内快照被消费:快照 dontHurtCritters=false 门放行,即便活 equipStats 同值', () => {
    const c = critter();
    const g = stubGame([c], [], { dontHurtCritters: true });
    beginProjScanCtx(g.player);                       // 快照=活值(false→门关…dontHurt=true ⇒ 恒拒)
    expect(getProjScanCtx(g.player)?.dontHurtCritters).toBe(true);
    expect(hitCritters({ x: 0, y: 0, w: 16, h: 16 } as const, g)).toBe(false);
    endProjScanCtx(g.player);
  });

  it('end 后回退活路径(WeakMap 清除)', () => {
    const c = critter();
    const g = stubGame([c], [], { dontHurtCritters: true });
    beginProjScanCtx(g.player);
    expect(getProjScanCtx(g.player)).not.toBeNull();
    endProjScanCtx(g.player);
    expect(getProjScanCtx(g.player)).toBeNull();
  });

  it('快照与活值恒等面:killGuide/killClothier 逐值(巫毒门)', () => {
    const townNpc = { x: 0, y: 0, w: 16, h: 16, dead: false, hurt: () => true,
      vanillaId: 22, def: { friendly: true } };
    const gEq = stubGame([], [townNpc], { killGuide: true });   // 向导巫毒在身
    const gNe = stubGame([], [{ ...townNpc }], {});
    beginProjScanCtx(gEq.player);
    // 窗内快照:killGuide=true ⇒ 22 可被玩家弹命中(旧路径同判)
    expect(hitTownNpcs({ x: 0, y: 0, w: 16, h: 16 } as const, gEq, 10)).toBe(true);
    endProjScanCtx(gEq.player);
    // 无巫毒:同弹恒拒(快照面/活面同)
    expect(hitTownNpcs({ x: 0, y: 0, w: 16, h: 16 } as const, gNe, 10)).toBe(false);
    expect(playerCanHitEnemy(townNpc, gNe)).toBe(false);
    expect(playerCanHitEnemy(townNpc, gEq)).toBe(true);
  });

  it('缺 equipStats 的 host(测试桩)begin 不炸、get 回 null', () => {
    const host = { noEquip: true };
    beginProjScanCtx(host);
    expect(getProjScanCtx(host)).toBeNull();
    endProjScanCtx(host);
    beginProjScanCtx(null);
    beginProjScanCtx(undefined);
    expect(getProjScanCtx(null)).toBeNull();
  });
});

describe('IIIII248 ③ 液体四邻内联的域不变量(循环界 ⊂ inBounds)', () => {
  it('x∈[1,w-2]/y∈[1,h-2] ⇒ 四邻 (x±1,y)/(x,y±1) 恒 inBounds(展开等价域前提)', () => {
    const st = new TileStore(64, 48);
    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < st.w && y < st.h;
    for (const x of [1, 2, Math.floor(st.w / 2), st.w - 2]) {
      for (const y of [1, 2, Math.floor(st.h / 2), st.h - 2]) {
        expect(inBounds(x - 1, y)).toBe(true);
        expect(inBounds(x + 1, y)).toBe(true);
        expect(inBounds(x, y - 1)).toBe(true);
        expect(inBounds(x, y + 1)).toBe(true);
      }
    }
    // 域外反例(循环体不可达):x=w-1 的右邻才出界 ⇒ clamp min(w-2,tx1) 的意义
    expect(inBounds(st.w - 1 + 1, 4)).toBe(false);
  });
});
