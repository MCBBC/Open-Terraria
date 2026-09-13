// SW-AD1 2026-09-04 回归：① 655 墙推支（:26595-26678 三档扫墙±0.5/全空 Center 格奇偶定向;
//   门 ai[0]!=0·vy<=0·vx==0——首拍跳过/下落拍不推）② 334 锁定帧 blockMouse 电平门
//   （SW-AF1 2026-09-04 F-2：一次性吞沿改按住期压制+松键复位,用例同步改写）
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { GrenadeProj, beeWallPushDir } from '../src/entities/WeaponProj';
import { Input, armBlockMouse, releaseBlockMouse } from '../src/core/Input';
import type { GameHooks } from '../src/entities/types';

const mk = (fills: Array<[number, number]> = []) => {
  const w = new World(80, 60, 30, 'open');
  for (let x = 0; x < 80; x++) w.store.setTileSilent(x, 50, 1, 0, 0);   // 地面行 50
  for (const [x, y] of fills) w.store.setTileSilent(x, y, 1, 0, 0);     // 墙
  return { world: w, player: null, enemies: () => [], critters: () => [], cutTile: () => {},
    spawnParticles: () => {} } as unknown as GameHooks; };
const Y = 769;   // 31×31 盒贴地（y=50*16−31;vanilla 655 SetDefaults 31×31,Game.beehive 同值）

describe('SW-AD1 655 墙推支 + 334 blockMouse', () => {
  it('beeWallPushDir 三档扫墙：0px 左墙 +0.5（左优先）/0px 右墙 -0.5/16px/32px 档/第二行命中/全空奇偶', () => {
    expect(beeWallPushDir(mk().world.store, 514, Y, 31, 529.5)).toBe(-0.5);      // 全空:33 奇→左
    expect(beeWallPushDir(mk([[31, 48], [31, 49]]).world.store, 514, Y, 31, 529.5)).toBe(0.5);
    expect(beeWallPushDir(mk([[34, 48], [34, 49]]).world.store, 514, Y, 31, 529.5)).toBe(-0.5);
    expect(beeWallPushDir(mk([[30, 48], [30, 49]]).world.store, 514, Y, 31, 529.5)).toBe(0.5);
    expect(beeWallPushDir(mk([[29, 48], [29, 49]]).world.store, 514, Y, 31, 529.5)).toBe(0.5);
    expect(beeWallPushDir(mk([[31, 49]]).world.store, 514, Y, 31, 529.5)).toBe(0.5);
  });
  it('触发门：首 AI 拍 ai0==0 跳过;贴地拍推离 ±0.5 且被 X 自加速带到 ±0.55;下落拍（vy>0）不推', () => {
    const g = mk([[38, 46], [38, 47], [38, 48], [38, 49]]);             // 右墙列 38
    const p = new GrenadeProj(576, Y, 0, 0, 10, 3600, 655, () => {});
    p.w = 31; p.h = 31;                                                 // Game.beehive 同款覆写
    p.fixedUpdate(0, g);
    expect(p.vx).toBe(0);                                               // 首拍跳过（:26682 尾写 ai[0]=1）
    p.fixedUpdate(0, g);
    expect(p.vx).toBeCloseTo(-0.55, 12);                                // 推离 -0.5 → 自加速 -0.05
    const q = new GrenadeProj(500, Y, 0, 0, 10, 3600, 655, () => {});
    q.w = 31; q.h = 31;                                                 // 无墙:515.5/16=32 偶→+0.5
    q.fixedUpdate(0, g); q.fixedUpdate(0, g);
    expect(q.vx).toBeCloseTo(0.55, 12);
    const f = new GrenadeProj(500, 600, 0, 0, 10, 3600, 655, () => {}); // 空中:vy>0 门假
    f.w = 31; f.h = 31;
    f.fixedUpdate(0, g); f.fixedUpdate(0, g);
    expect(f.vx).toBe(0);
    expect(f.vy).toBeGreaterThan(0);
  });
  it('blockMouse 电平纯函数：置位幂等不清、松键复位幂等——旗跨沿不残留（F-2 电平语义）', () => {
    const s = { blockMouse: false };
    armBlockMouse(s); armBlockMouse(s);
    expect(s.blockMouse).toBe(true);            // 置位幂等,且不再自清（一次性版差异）
    releaseBlockMouse(s); releaseBlockMouse(s);
    expect(s.blockMouse).toBe(false);           // 复位幂等
    // 场景 B（松键再按）：复位后置位/复位可循环,下次点击不受前次置位追溯
    armBlockMouse(s);
    releaseBlockMouse(s);
    expect(s.blockMouse).toBe(false);
  });
  it('Input.mousedown/up 消费点：置位不再吞沿（按住期压制由 updateUse 门承担）,松键复位旗', () => {
    const reg = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('window', { addEventListener: (t: string, f: (e: unknown) => void) => reg.set(t, f), removeEventListener: () => {} });
    const inp = new Input({ addEventListener: () => {}, removeEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) } as unknown as HTMLElement)   // ★rect 缓存批后 refreshRect 读 el.rect;
    // 场景 B：旗置位（334 锁定帧写点等价）时新沿不再被吞——mouseDown/mouseHeld 照常置
    armBlockMouse(inp);
    (reg.get('mousedown') as (e: unknown) => void)({ button: 0, target: null });
    expect([inp.mouseDown, inp.mouseHeld, inp.blockMouse]).toEqual([true, true, true]);
    // 复位 = 松键（mouseup 既有消费点）——TriggersSet.cs:844-847 else 支
    (reg.get('mouseup') as (e: unknown) => void)({ button: 0 });
    expect([inp.mouseDown, inp.mouseHeld, inp.blockMouse]).toEqual([false, false, false]);
    // 松键后再按：正常使用（场景 B 终态）
    (reg.get('mousedown') as (e: unknown) => void)({ button: 0, target: null });
    expect([inp.mouseDown, inp.mouseHeld, inp.blockMouse]).toEqual([true, true, false]);
    // 失焦清理链同复位（无按住态）
    armBlockMouse(inp);
    inp.clearForBlur();
    expect(inp.blockMouse).toBe(false);
  });
});
