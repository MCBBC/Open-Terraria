// BJ113 域外登记债：breakHive 蜂巢块（tile 225）出蜂整面定谳（2026-09-17）。
// 原版锚（1457 WorldGen.cs:65985-66009；1458 :65993 同文零变更）：
//   case 225 全文在 KillTile_GetItemDrops（:64477）→ 受掉落段 noItem 门（:64373）管籍：
//   ① Next(3)==0 → 本格满蜂蜜（liquid=255, honey 型）——无掉落无蜂；
//   ② 否则 dropItem=1124（ItemID.Hive 蜂巢块放置物）+ Next(2)==0 时出蜂
//     1 只（Next(3)!=0）或 2 只（Next(3)==0），type=Next(210,212)=210/211，
//     NewNPC(x*16+8, y*16+15) → Bottom=(X,Y)（NPC.cs:81594，盒底=py），
//     初速 vx=vy=Next(-200,201)×0.002（离散 401 档 ±0.4）。
// 分道：tile-break 臂（本面）≠ 手雷臂（655 蜂巢弹 Kill,Projectile.cs:76611-76660——
//   干巢裂 2+Next(3)³=2-5 蜂 @弹心 Bottom/入水落 1124×Next(2,6)）。两臂蜂数域
//   不相交处（tile 臂 0-2、弹臂 2-5）+蜜流/锚点=分道判别面。
// 判别力：分道断言（0-2 硬帽+三签名共存）×6 种子蜜流统计（Math.random 6× 判例）×
//   Bottom 锚点断言×离散初速；变异 ≥3 发（摘蜜流/锚错/数量错/连续初速→红）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { anchorBeeBottom } from '../src/world/hive';
import type { RNG } from '../src/core/rng';

const HIVE = TILE_BY_KEY['v_225_hive_block']!;

interface Rec {
  drops: Array<{ x: number; y: number; key: string; n: number }>;
  bees: Array<{ x: number; y: number; w: number; h: number; vx: number; vy: number; vid: number }>;
  digs: number;
}

/** breakTile 可驱动面最小桩（shell 形制同 tests/killtile-tail-liquid.test.ts） */
function mkShell(): { g: Game & Record<string, unknown>; w: World; rec: Rec } {
  const w = new World(40, 40, 1, 'bj113hive');
  const rec: Rec = { drops: [], bees: [], digs: 0 };
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown> & {
    breakTile(x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean): void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: (name: string) => { if (name === 'dig') rec.digs++; } } as never;
  g.entities = {
    nextId: 1,
    critters: [], enemies: [], npcs: [],
    add: (e: { vanillaId?: number; y: number; h: number }) => {
      if (e.vanillaId === 210 || e.vanillaId === 211) {
        rec.bees.push({ x: (e as unknown as { x: number }).x, y: e.y, w: (e as unknown as { w: number }).w, h: e.h,
          vx: (e as unknown as { vx: number }).vx, vy: (e as unknown as { vy: number }).vy, vid: e.vanillaId });
      }
    },
  } as never;
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { rec.drops.push({ x, y, key, n }); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} } as never;
  g.player = { cx: 10 * 16 + 8, cy: 19 * 16 + 8, equipStats: {} } as never;
  return { g, w, rec };
}

/** 逐次重置蜂巢格并破坏一次（正常路径） */
function breakOnce(g: Game & Record<string, unknown>, w: World, rec: Rec): { honey: boolean; beeCount: number } {
  const st = w.store;
  rec.drops.length = 0; rec.bees.length = 0; rec.digs = 0;
  st.setTile(20, 20, HIVE);
  st.setLiquid(20, 20, 0, 0);
  g.breakTile(20, 20, true);
  const i = st.idx(20, 20);
  return { honey: st.liquid[i] === 255 && st.liquidType[i] === 3 && st.type[i] === 0, beeCount: rec.bees.length };
}

describe('BJ113：蜂巢块 tile-break 臂（KillTile case 225 → GetItemDrops :65985-66009）', () => {
  it('noItem 门（:64373 管籍）：noItem 破坏不放蜜/不掉物/不出蜂，仅清格+破块音', () => {
    const { g, w, rec } = mkShell();
    const st = w.store;
    st.setTile(20, 20, HIVE);
    g.breakTile(20, 20, true, true);
    const i = st.idx(20, 20);
    expect(st.type[i]).toBe(0);              // 清格（落通用尾段）
    expect(st.liquid[i]).toBe(0);            // 不放蜜
    expect(rec.drops.length).toBe(0);        // 不掉 1124
    expect(rec.bees.length).toBe(0);         // 不出蜂
    expect(rec.digs).toBe(1);                // 音不受 noItem 门（KillTile :64062-64072 头段）
  });

  it('分道断言：蜂数硬帽 ≤2（手雷臂 2-5 签名不可达）+三签名共存（蜜流/掉物零蜂/单蜂）', () => {
    const { g, w, rec } = mkShell();
    let honey = 0, dropNoBee = 0, oneBee = 0;
    for (let k = 0; k < 300; k++) {
      const r = breakOnce(g, w, rec);
      if (r.honey) {
        honey++;
        expect(rec.drops.length).toBe(0);    // 蜜流臂无掉落（case 225 break 短路）
        expect(r.beeCount).toBe(0);
      } else {
        expect(rec.drops.length).toBe(1);    // 非蜜臂恒掉 1124（stack 1）
        expect(rec.drops[0].key).toBe('place_v_225_hive_block');
        expect(rec.drops[0].n).toBe(1);
        expect(r.beeCount).toBeLessThanOrEqual(2);   // 0-2 硬帽
        expect(r.beeCount).toBeGreaterThanOrEqual(0);
        if (r.beeCount === 0) dropNoBee++;
        if (r.beeCount === 1) oneBee++;
      }
      expect(rec.digs).toBe(1);              // 破块音（PlaySound(0) Dig :67068）恒 1 次
      expect(w.store.type[w.store.idx(20, 20)]).toBe(0);   // 格恒清
    }
    expect(honey).toBeGreaterThan(0);        // 蜜流签名存在（弹臂无此态）
    expect(dropNoBee).toBeGreaterThan(0);    // 掉物零蜂签名存在（弹臂最小 2 蜂）
    expect(oneBee).toBeGreaterThan(0);       // 单蜂签名存在（弹臂无 1 蜂态）
  });

  it('Bottom 锚点断言（NewNPC→Bottom=(X,Y),NPC.cs:81594/BJ111 判例）：盒底=y*16+15、盒心 x=x*16+8', () => {
    const { g, w, rec } = mkShell();
    let seen = 0;
    for (let k = 0; k < 120 && seen < 40; k++) {
      breakOnce(g, w, rec);
      for (const b of rec.bees) {
        seen++;
        expect(b.y + b.h).toBe(20 * 16 + 15);            // 盒底边=py（曾中心锚低 h/2）
        expect(b.x + b.w / 2).toBe(20 * 16 + 8);         // 盒心 x=px
        expect([210, 211]).toContain(b.vid);             // type=Next(210,212)
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('掉落锚=NewItem 16×16 盒心（:64469→Item.cs:49656 X+W/2）：drop@(328,328)', () => {
    const { g, w, rec } = mkShell();
    for (let k = 0; k < 60; k++) {
      breakOnce(g, w, rec);
      for (const d of rec.drops) {
        expect(d.x).toBe(20 * 16 + 8);
        expect(d.y).toBe(20 * 16 + 8);
      }
    }
  });

  it('蜜流概率 6 种子统计（Math.random 6× 判例）：蜜 ≈1/3、出蜂|非蜜 ≈1/2、双蜂|蜂 ≈1/3', () => {
    const { g, w, rec } = mkShell();
    for (let seed = 0; seed < 6; seed++) {
      let honey = 0, drop = 0, beeEvents = 0, twoBee = 0;
      for (let k = 0; k < 600; k++) {
        const r = breakOnce(g, w, rec);
        if (r.honey) honey++;
        else {
          drop++;
          if (r.beeCount > 0) { beeEvents++; if (r.beeCount === 2) twoBee++; }
        }
      }
      expect(honey / 600).toBeGreaterThan(0.26);   // μ=1/3 σ≈0.019 → ±3.2σ
      expect(honey / 600).toBeLessThan(0.42);
      expect(beeEvents / drop).toBeGreaterThan(0.40);  // μ=1/2 σ≈0.025
      expect(beeEvents / drop).toBeLessThan(0.60);
      expect(twoBee / beeEvents).toBeGreaterThan(0.22); // μ=1/3 σ≈0.033
      expect(twoBee / beeEvents).toBeLessThan(0.45);
    }
  }, 60_000);
});

describe('BJ113：anchorBeeBottom 单元（Bottom 锚+离散 401 档初速）', () => {
  function scriptedRng(values: number[]): RNG {
    let i = 0;
    return { next: () => values[i++ % values.length] } as unknown as RNG;
  }

  it('盒底=py；r=0.123456789 → 桌面值 −151×0.002（连续式给出 −0.30123…≠此值=变异判别）', () => {
    const e = { y: 0, h: 12, vx: 99, vy: 99 };
    anchorBeeBottom(e, 20 * 16 + 15, scriptedRng([0.123456789]));
    expect(e.y).toBe(20 * 16 + 15 - 12);                 // 顶=py−h → 底边=py
    expect(e.vx).toBe(-151 * 0.002);                     // floor(49.506)−200=−151
    expect(e.vx).toBe(-0.302);
    expect(e.vy).toBe(-0.302);                           // 两次独立掷同序列（脚本环回）
  });

  it('档位边界：r=0 → −0.4；r=0.999999 → +0.4；r=0.5 → 0（401 档对称）', () => {
    const mk = () => ({ y: 0, h: 8, vx: 0, vy: 0 });
    const a = mk(); anchorBeeBottom(a, 100, scriptedRng([0]));
    expect(a.vx).toBe(-200 * 0.002);
    expect(a.vx).toBe(-0.4);
    const b = mk(); anchorBeeBottom(b, 100, scriptedRng([0.999999]));
    expect(b.vx).toBe(200 * 0.002);
    expect(b.vx).toBe(0.4);
    const c = mk(); anchorBeeBottom(c, 100, scriptedRng([0.5]));
    expect(c.vx).toBe(0);                                 // floor(200.5)−200=0
    expect(c.vy).toBe(0);
  });
});
