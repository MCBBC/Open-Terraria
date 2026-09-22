// ★C1 帧零分配守卫（2026-09-22）
//
// 渲染帧热路径分配消除四件（plan 文档 §三 C1）：
// A. EntityManager.all() 复用持久缓冲（原每帧 6-spread 新数组,Game.ts:47797 热路径）
// B. render() 实体绘制排序持久化（原每帧 new Map+sortY 闭包+[...entities] spread）——
//    键值逐字同式：sortY 链式锚(递归+帧内 memo,NaN 环保护)+层级 1e6(四 instanceof 同序)
// C. 尘预乘对/染料缓存键数值化（原每尘每帧模板串分配）——单射性由扫掠双测保证
// D. 波样本槽复用（swPerf 支 player/projectile）——**NPC/TownNPC 禁槽**结构记忆：
//    injectEntity 以样本对象作 _oldVel WeakMap 键（WaterWaves.ts:886）,现行为=每帧
//    新字面量恒 miss,槽化即激活旧速度项=视觉分歧（BJ78 槽纪律例外,须独立定谳）。
// 分配面权威证据由实机仪具兜底（perf.mjs / cpuprofile）;本测试=行为面+结构锁。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EntityManager } from '../src/entities/Entity';
import type { Entity } from '../src/entities/Entity';

const src = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const entitySrc = src('../src/entities/Entity.ts');
const rendererSrc = src('../src/render/Renderer.ts');

// ---------- A. all() 行为面 ----------
describe('C1-A EntityManager.all() 持久缓冲', () => {
  const mk = (): Entity => ({}) as unknown as Entity;

  it('拷贝序 = 原 spread 序（enemies,drops,npcs,projectiles,props,critters）', () => {
    const em = new EntityManager();
    const e1 = mk(), e2 = mk(), d1 = mk(), n1 = mk(), p1 = mk(), pr1 = mk(), c1 = mk();
    em.add(e1, 'enemies'); em.add(e2, 'enemies');
    em.add(d1, 'drops');
    em.add(n1, 'npcs');
    em.add(p1, 'projectiles');
    em.add(pr1, 'props');
    em.add(c1, 'critters');
    expect(em.all()).toEqual([e1, e2, d1, n1, p1, pr1, c1]);
  });

  it('空池与非稳态长度正确（缩尾/扩容两向）', () => {
    const em = new EntityManager();
    expect(em.all()).toEqual([]);
    const a = mk();
    em.add(a, 'enemies');
    expect(em.all()).toEqual([a]);          // 扩容
    em.enemies.length = 0;
    expect(em.all()).toEqual([]);           // 缩尾
    em.add(a, 'drops');
    expect(em.all()).toEqual([a]);          // 再扩
  });

  it('缓冲跨调用复用（同一数组实例;scratch 语义=新内容覆写）', () => {
    const em = new EntityManager();
    const a = mk();
    em.add(a, 'enemies');
    const first = em.all();
    em.enemies.length = 0;
    const b = mk();
    em.add(b, 'npcs');
    const second = em.all();
    expect(second).toBe(first);             // 同一持久缓冲
    expect(second).toEqual([b]);            // 内容=当帧池态（不得读出旧实体=残留）
  });
});

// ---------- C. 尘键数值化单射性 ----------
describe('C1-C 尘缓存键数值化', () => {
  // dustFrameOf 构造边界：fx∈[0,990]（10*type 后逐百 −1000）、fy=10r+30k<2048
  const FX = [0, 40, 90, 200, 500, 990];
  const FY = [0, 10, 20, 30, 110, 210, 1020, 2047];
  const M = [0, 1, 17, 128, 254, 255];

  it('预乘对键：新数值键与旧串键一一对应（双单射 ⟺ 双射）且 <2^53', () => {
    const oldKeys = new Set<string>();
    const newKeys = new Set<number>();
    for (const fx of FX) for (const fy of FY) {
      if (fy > 2047) continue;
      for (const mR of M) for (const mG of M) for (const mB of M) for (const mA of M) {
        oldKeys.add(`${fx},${fy},${mR},${mG},${mB},${mA}`);
        // 与源码逐字同式（Renderer.dustPremulPair）：fx·2⁴³+fy·2³²+mR·2²⁴+mG·2¹⁶+mB·2⁸+mA
        newKeys.add(((((fx * 2048 + fy) * 256 + mR) * 256 + mG) * 256 + mB) * 256 + mA);
      }
    }
    expect(newKeys.size).toBe(oldKeys.size);   // 数量恒等+数值集无重复=单射
    for (const k of newKeys) expect(k).toBeLessThan(2 ** 53);
  });

  it('染料键：dyeVid·2^21+fx·2^11+fy 与旧串键一一对应', () => {
    const oldKeys = new Set<string>();
    const newKeys = new Set<number>();
    for (const vid of [1, 2, 300, 1157, 6195]) for (const fx of FX) for (const fy of FY) {
      oldKeys.add(`${vid}|${fx}|${fy}`);
      newKeys.add(vid * 2097152 + fx * 2048 + fy);
    }
    expect(newKeys.size).toBe(oldKeys.size);
    for (const k of newKeys) expect(k).toBeLessThan(2 ** 53);
  });

  it('边界不串扰：fy=2047 与 fy=0 不同 fx 段不碰撞', () => {
    const k1 = ((((0 * 2048 + 2047) * 256 + 0) * 256 + 0) * 256 + 0) * 256 + 0;
    const k2 = ((((1 * 2048 + 0) * 256 + 0) * 256 + 0) * 256 + 0) * 256 + 0;
    expect(k1).not.toBe(k2);
  });
});

// ---------- B/D. 结构锁（源文本锚） ----------
describe('C1-B 排序块结构锁（键式逐字保留）', () => {
  it('sortY 链式锚语义位：递归 +0.01 / NaN 环保护 / memo 恒存裸值', () => {
    expect(rendererSrc).toContain('k = m && !m.dead ? this._sortY(m) + 0.01 : en.y;');
    expect(rendererSrc).toContain('this._sortMemo.set(e, NaN);');
    expect(rendererSrc).toContain('this._sortMemo.clear();');
    // memo 恒存【裸】链值——层级 1e6 在键装配处外加,绝不入 memo（递归锚防污染）
    expect(rendererSrc).toContain('sKeys[i] = this._sortY(e) + (this._drawKeyWorldLayer(e) ? 0 : 1e6);');
  });

  it('层级 1e6 四 instanceof 同序（原比较器逐字）', () => {
    const m = rendererSrc.match(/_drawKeyWorldLayer\(e: Entity\): boolean \{\s*\n\s*return ([^;]+);/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('e instanceof Enemy || e instanceof ItemDrop || e instanceof TownNPC || e instanceof Tombstone');
  });

  it('旧分配形态不复活：无 [...entities].sort / 无 render() 内 new Map<Entity,number> / 无内联 sortY 闭包', () => {
    expect(rendererSrc).not.toContain('[...entities].sort');
    expect(rendererSrc).not.toContain('const keyMemo = new Map<Entity, number>()');
    expect(rendererSrc).not.toContain('const sortY = (e: Entity)');
  });

  it('all() 无 spread 复活', () => {
    expect(entitySrc).not.toContain('[...this.enemies, ...this.drops');
  });
});

describe('C1-D 波样本槽结构记忆（NPC 禁槽判例）', () => {
  it('槽仅 player/projectile；NPC/TownNPC 禁槽注释在案', () => {
    expect(rendererSrc).toContain('const _waveSamplePlayer: WaveEntitySample');
    expect(rendererSrc).toContain('const _waveSampleProj: WaveEntitySample');
    expect(rendererSrc).not.toContain('_waveSampleNpc');
    expect(rendererSrc).toContain('NPC/TownNPC 禁槽');
  });

  it('NPC/TownNPC 注入保持每帧字面量（WeakMap 键恒 miss 语义）', () => {
    expect(rendererSrc).toContain("push({\n          kind: 'npc'");
    expect(rendererSrc).toContain("push({\n          kind: 'townnpc'");
  });

  it('弹幕槽化挂 swPerf 双支（flag 关=原字面量逐位不变）', () => {
    expect(rendererSrc).toMatch(/if \(swPerf\) \{\s*\n\s*\/\/ ★C1 槽复用[^]*?_waveSampleProj;[^]*?push\(s\);[^]*?\} else \{\s*\n\s*push\(\{[^]*?projDistort: true,/);
  });
});

describe('C2 单遍合并结构锁（bobber+排序键,2026-09-22）', () => {
  it('bobber 扫描与键预计算同循环；memo 帧头单次 clear', () => {
    // 合并遍：Bobber 判定与 sKeys 装配同 for 体
    expect(rendererSrc).toMatch(/if \(e instanceof Bobber && !e.dead\) \{[^]*?\}[^]*?sKeys\[i\] = this\._sortY\(e\) \+ \(this\._drawKeyWorldLayer\(e\) \? 0 : 1e6\);/);
    expect(rendererSrc.split('this._sortMemo.clear()').length - 1).toBe(1);   // 帧头单点
  });

  it('排序块无二次预计算（仅置换+稳定排序）', () => {
    const sortBlock = rendererSrc.slice(rendererSrc.indexOf('const nS = entities.length;'));
    expect(sortBlock).not.toContain('this._sortY(');           // 键已在帧头算毕
    expect(sortBlock).toContain('this._sortIdx.sort(this._sortIdxCmp);');
    expect(sortBlock).toContain('sBuf[i] = entities[this._sortIdx[i]];');
  });
});
