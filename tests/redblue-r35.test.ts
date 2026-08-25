// R35 红蓝对抗回归(分支型 18 件终验 + P3 遗留修齐,2026-08-25):
//  A. 3065 Star Wrath 天降三剑支钉住(Player.cs:47107-47136 逐臂:出生 cy−600−100i、
//     后退 rand<401×direction、|dy|≥20 钳、vy 抖动 ±0.8、目标线 min(mouseY, cy−200))
//  F. 5667/6174 钻地龟落点左上角直传(TrySpawnDigtoiseAt :50039 (x*16+8, y*16−32))+
//     右键回收/左键指挥语义归位(:48687-48752)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

describe('R35-A 3065 Star Wrath 天降三剑', () => {
  it('分支存在且五项几何与原版一致(:47107-47136)', () => {
    expect(gameSrc).toMatch(/cwMelee\.shoot === 503/);
    // 出生 X = cx − rand(0..400)×direction(原版 -Main.rand.Next(0,401)*direction)
    expect(gameSrc).toContain('this.player.cx - Math.random() * 401 * this.player.facing');
    // 出生 Y = cy − 600 − 100i
    expect(gameSrc).toContain('this.player.cy - 600 - 100 * i503');
    // |dy| 钳 ≥20(vector19.Y < 20f → 20f)
    expect(gameSrc).toMatch(/if \(dy503 < 20\) dy503 = 20;/);
    // vy 抖动 ±Next(-40,41)×0.02 = ±0.8
    expect(gameSrc).toContain('(Math.random() * 80 - 40) * 0.02');
    // 目标线 ai2 = min(鼠标Y, cy−200)(num43 > Center.Y−200 → 收)
    expect(gameSrc).toContain('Math.min(mwy, this.player.cy - 200)');
    // 三发循环 + 本击只出天降剑(防通用单发补射)
    expect(gameSrc).toContain('for (let i503 = 0; i503 < 3; i503++)');
    expect(gameSrc).toMatch(/cwMelee\.shoot === 503[\s\S]{0,1200}return;/);
  });
});

describe('R35-F 5667/6174 钻地龟落点与按键语义', () => {
  it('F-1 落点=左上角直传 (x*16+8, y*16-32),无 −17 半身位(TrySpawnDigtoiseAt :50039)', () => {
    expect(gameSrc).toContain('new MinionProj(x * TILE + 8, y * TILE - 32');
    expect(gameSrc).not.toContain('x * TILE + 8 - 17');
  });
  it('F-2 右键=全体回收(flag5 支 :48701-48702),左键在场=指挥(:48705-48727)', () => {
    // 右键支内含 Kill 循环且回收后 useTime 15;不再调用 commandDigtoises
    const rmb = gameSrc.match(/右键【全体回收】[\s\S]{0,1400}?input\.rightDown = false;/);
    expect(rmb).toBeTruthy();
    expect(rmb![0]).toContain('m.dead = true');
    expect(rmb![0]).not.toContain('commandDigtoises');
    // 左键支在场时接指挥(commandDigtoises 唯一消费点在左键路径)
    const lmb = gameSrc.match(/左键召唤[\s\S]{0,1800}?\n    \}/);
    expect(lmb).toBeTruthy();
    expect(lmb![0]).toContain('commandDigtoises');
  });
});

describe('R35-B 669/753 宠物召唤件(use=装备/卸下宠物槽)', () => {
  it('B-1 use 分流存在且走 miscEquips[0] 切换(非 shot 子弹)', () => {
    expect(gameSrc).toMatch(/ptVid === 669 \|\| ptVid === 753/);
    expect(gameSrc).toMatch(/eq\[0\] = null;\s*\/\/ 已在场 → 收回/);
    expect(gameSrc).toMatch(/eq\[0\] = \{ id: held\.id, stack: 1 \}/);
    expect(gameSrc).toContain('this.petHidden = false;');
  });
  it('B-2 节奏与音效=原版 case 669(:9208-9210 Item_2/useTime20)', () => {
    const blk = gameSrc.match(/ptVid === 669[\s\S]{0,900}?input\.mouseDown = false;/);
    expect(blk).toBeTruthy();
    expect(blk![0]).toContain('this.player.useTime = 20');
    expect(blk![0]).toContain("playUseSound(ptVid, 'tink')");
  });
});

describe('R35-C 1168 烟雾弹弹跳真值(aiStyle14)', () => {
  it('C-1 出膛支=grav0.2+bounce+penetrate−1(AI_014 尾 :25380 区段)', () => {
    const blk = gameSrc.match(/tc\.shoot === 196[\s\S]{0,900}?return;/);
    expect(blk).toBeTruthy();
    expect(blk![0]).toContain('grav: 0.2');
    expect(blk![0]).toContain('bounce: true');
    expect(blk![0]).toContain('pierce: -1');
  });
  it('C-2 Arrow 拖尾=每 tick 1-2×d31 烟(:25200-25211 三元组)', () => {
    const arrowSrc = readFileSync(new URL('../src/entities/Arrow.ts', import.meta.url), 'utf8');
    const m = arrowSrc.match(/projId === 196 && game\.spawnDust[\s\S]{0,800}?}/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('31');
    expect(m![0]).toContain('-(0.4 +');     // vy 上飘 −(0.4..2.35)
    expect(m![0]).toContain('* 0.025');     // vx ±Next(-10,11)×0.025
  });
});

describe('R35-D 3005 绳索线圈弹道化(aiStyle35)', () => {
  it('D-1 飞行期延迟重力 [0.2@30] 入 AI1_GRAV(:27581-27590)', () => {
    const cs = readFileSync(new URL('../src/data/vanillaItemCombat.ts', import.meta.url), 'utf8');
    expect(cs).toMatch(/475: \[0\.2, 30\], 476: \[0\.2, 30\], 505: \[0\.2, 30\], 506: \[0\.2, 30\]/);
  });
  it('D-2 Arrow 撞块铺绳:≤10 格向下+IsRope 滑过+四弹映射(:27655-27720)', () => {
    const as = readFileSync(new URL('../src/entities/Arrow.ts', import.meta.url), 'utf8');
    expect(as).toMatch(/ROPE_COIL_TILE\[this\.projId\] !== undefined/);
    expect(as).toContain("475: 'v_353_vine_rope'");
    expect(as).toContain("506: 'v_366_web_rope'");
    expect(as).toContain("505: 'v_365_silk_rope'");
    const blk = as.match(/ROPE_COIL_TILE\[this\.projId\] !== undefined[\s\S]{0,900}?killNow/);
    expect(blk).toBeTruthy();
    expect(blk![0]).toContain('n < 10');
    expect(blk![0]).toContain('TILE_DEFS[stRc.get(rcx, rcy)]?.rope');   // IsRope 下滑
    expect(blk![0]).toContain('setTile');
  });
});
