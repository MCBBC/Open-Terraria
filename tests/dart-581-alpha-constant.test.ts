// ★F4 判别锁（清偿 B·弹幕域 R4）：581 破甲刺 α 恒 255=本体永隐。
//  定谳（反编译 1457 Projectile.cs）：SetDefaults alpha=255（:6308-6316）且通用
//  fade switch（:56590-56615,渐入族 14/20/36/83/84/89/100/104/110/158-161/180/
//  279/283-287/389/576/577）无 581 → 全寿命零 α 写面;缺省 GetAlpha 尾
//  （:81507-81520）A=newColor.A−α → α255 恒 A=0=全透明。可视面唯一=AI 尘站
//  （:57289-57306,每 update 2×SelRandom(229,161,161)）+Kill 尘（:73991-74004）。
//  旧通用 fade 门对无 fade 键弹缺省 −50/t ≈5 拍渐显=凭空造出原版没有的本体
//  （R4 普查受害面全表仅 581）。
//  判别口径：逐拍 α===255（旧病灶首拍即 205）+ 尘站照常供弹视觉。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Dart } from '../src/entities/Dart';

function dartHooks() {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 70, 2); // 地板(70 行)
  const player = { x: 40 * 16, y: 66 * 16, w: 20, h: 42, cx: 41 * 16, cy: 67 * 16, dead: false, vx: 0, vy: 0 };
  const dusts: { type: number }[] = [];
  const hooks = {
    world: w,
    player,
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    entities: { add: () => {} },
    spawnDust: (...a: unknown[]) => { dusts.push({ type: a[4] as number }); return null; },
  } as never;
  return { hooks, dusts };
}

describe('581 破甲刺 α 恒 255（F4：fade 门排除列收编）', () => {
  it('全寿命逐拍 α===255——旧通用缺省 fade −50/t 首拍即 205、约 6 拍归 0（假渐显本体）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 4, 0, 40, 581);
    expect(d['alpha']).toBe(255);                    // SetDefaults :6308-6316
    for (let i = 0; i < 30 && !d.dead; i++) {
      d.fixedUpdate(1 / 60, hooks);
      expect(d['alpha']).toBe(255);                  // 任何 α 写面即爆
    }
  });

  it('可视面=AI 尘站照常：首 update 2 尘、型 ∈{229,161}（本体隐,尘为唯一视觉,不误伤尘站）', () => {
    const { hooks, dusts } = dartHooks();
    const d = new Dart(20 * 16, 20 * 16, 4, 0, 40, 581);
    d.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(2);                    // :57296-57305 每更新 2 尘
    for (const t of dusts) expect([229, 161]).toContain(t.type);
  });
});
