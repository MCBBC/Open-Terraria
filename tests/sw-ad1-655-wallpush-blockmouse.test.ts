// SW-AD1 2026-09-04 回归：① 655 墙推支（:26595-26678 三档扫墙±0.5/全空 Center 格奇偶定向;
//   门 ai[0]!=0·vy<=0·vx==0——首拍跳过/下落拍不推）② 334 锁定帧 blockMouse 一次性吞沿纯函数
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { GrenadeProj, beeWallPushDir } from '../src/entities/WeaponProj';
import { Input, armBlockMouse, blockMouseSwallowEdge } from '../src/core/Input';
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
  it('blockMouse 纯函数：置位幂等;吞沿一次性自清;未置位不吞', () => {
    const s = { blockMouse: false };
    armBlockMouse(s); armBlockMouse(s);
    expect(s.blockMouse).toBe(true);
    expect([blockMouseSwallowEdge(s), s.blockMouse, blockMouseSwallowEdge(s)]).toEqual([true, false, false]);
  });
  it('Input.mousedown 消费点：置位期首个左键沿整体丢弃（mouseDown/mouseHeld 均不置）并自清', () => {
    const reg = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('window', { addEventListener: (t: string, f: (e: unknown) => void) => reg.set(t, f), removeEventListener: () => {} });
    const inp = new Input({ addEventListener: () => {}, removeEventListener: () => {} } as unknown as HTMLElement);
    armBlockMouse(inp);
    (reg.get('mousedown') as (e: unknown) => void)({ button: 0, target: null });
    expect([inp.mouseDown, inp.mouseHeld, inp.blockMouse]).toEqual([false, false, false]);
    (reg.get('mousedown') as (e: unknown) => void)({ button: 0, target: null });
    expect([inp.mouseDown, inp.mouseHeld]).toEqual([true, true]);
  });
});
