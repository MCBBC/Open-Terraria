// ★D12 守卫(2026-10-13):mod 尘 per-type 渲染分支——全亮桶分流 + 段位注册。
//   锚:fx/VanillaDust.fullbrightnessWanted(mod fullbright 声明→each(true) 桶)+
//   Renderer.drawVanillaDustPass mod 支(alias 键 vanilla/Dust_<type>.png;
//   渲染支为 canvas 级=实机探针批覆盖,本测锁引擎分流面+注册面)。
import { describe, it, expect, beforeEach } from 'vitest';
import { VanillaDust } from '../src/fx/VanillaDust';
import { registerModDustData, modDustTexOf, _resetModDustsForTests } from '../src/mods/dusts';
import { MOD_DUST_TYPE_BASE } from '../src/mods/types';

beforeEach(() => _resetModDustsForTests());

describe('D12:mod 尘渲染分流', () => {
  it('fullbright 声明:each(true) 全亮桶;非声明:each(false) lit 桶;原版域零扰动', () => {
    const FB = MOD_DUST_TYPE_BASE;        // 400=fullbright 声明
    const LIT = MOD_DUST_TYPE_BASE + 1;   // 401=lit
    registerModDustData(FB, 'textures/d.png', 0, true);
    registerModDustData(LIT, 'textures/d2.png', 0, false);

    const vd = new VanillaDust();
    vd.spawn(0, 0, 8, 8, FB, 0, 0, 0, null, 1);
    vd.spawn(0, 0, 8, 8, LIT, 0, 0, 0, null, 1);
    vd.spawn(0, 0, 8, 8, 31, 0, 0, 0, null, 1);   // 原版 lit 型对照
    vd.spawn(0, 0, 8, 8, 15, 0, 0, 0, null, 1);   // 原版全亮型对照

    const lit = [...vd.each(false)].map((d) => d.type);
    const fb = [...vd.each(true)].map((d) => d.type);
    expect(lit).toContain(LIT);
    expect(lit).toContain(31);
    expect(fb).toContain(FB);
    expect(fb).toContain(15);
    expect(lit).not.toContain(FB);
    expect(fb).not.toContain(LIT);
  });

  it('段位注册:400+ 段/重复 fail-fast/贴图查表回退 null', () => {
    expect(() => registerModDustData(399, 'x.png', 0, false)).toThrow(/400/);
    registerModDustData(400, 'textures/a.png', 6, true);
    expect(() => registerModDustData(400, 'textures/b.png', 0, false)).toThrow(/重复注册/);
    expect(modDustTexOf(400)).toBe('textures/a.png');
    expect(modDustTexOf(401)).toBeNull();   // 原版域/未注册=null
  });
  // ★D12 余债(2026-10-13):motionType 复用——spawn 期 d.type 重写为运动档原版
  //  type(全行为复用),modType 载体保原 mod type;全亮桶=mod 声明唯一权威
  //  (运动档原版桶位不传染)
  it('motionType 重写:d.type=运动档;modType 载体;lit 声明不被原版桶传染', () => {
    const FIRE = MOD_DUST_TYPE_BASE;        // motionType 6(原版全亮桶成员),fullbright=false
    registerModDustData(FIRE, 'textures/f.png', 6, false);
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 8, 8, FIRE, 0, 0, 0, null, 1)!;
    expect(d.type).toBe(6);                 // 重写=运动档全行为(update/alphaOf/速度特例)
    expect(d.modType).toBe(FIRE);           // 原载体(渲染分支贴图键)
    const lit = [...vd.each(false)].map((x) => x.modType ?? x.type);
    const fb = [...vd.each(true)].map((x) => x.modType ?? x.type);
    expect(lit).toContain(FIRE);            // mod 声明 lit 胜原版 6 桶
    expect(fb).not.toContain(FIRE);
  });

  it('motionType 缺省:不改写(d.type=mod 段);modType 仍承载', () => {
    const LIT = MOD_DUST_TYPE_BASE + 1;
    registerModDustData(LIT, 'textures/g.png', 0, true);
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 8, 8, LIT, 0, 0, 0, null, 1)!;
    expect(d.type).toBe(LIT);
    expect(d.modType).toBe(LIT);
    expect([...vd.each(true)].length).toBe(1);   // fullbright 声明照走全亮桶
  });

  it('池复用归位:mod 尘槽位被原版尘复用后 modType=undefined(不误走 mod 渲染支)', () => {
    const MT = MOD_DUST_TYPE_BASE + 2;
    registerModDustData(MT, 'textures/h.png', 6, false);
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 8, 8, MT, 0, 0, 0, null, 1)!;
    expect(d.modType).toBe(MT);
    // 池遍历:禁用后同槽位 spawn 原版尘(31 烟;POOL 大,首 spawn 占首空槽)
    d.active = false;
    const v = vd.spawn(0, 0, 8, 8, 31, 0, 0, 0, null, 1)!;
    if (v === d) {
      expect(v.modType).toBeUndefined();   // 归位(否则原版尘误走 mod 贴图键)
    } else {
      expect(v.modType).toBeUndefined();   // 新槽位=本来就 undefined
    }
  });
});
