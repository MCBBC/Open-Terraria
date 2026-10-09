// ★BJ564（2026-10-09）陷阱/机关发射面静音定谳——BJ571 邻接登记债清偿
//  （BJ571 债面原文：shootProjectile 对陷阱族（含 spiky）发射播自创 'tink'
//   （"陷阱族=敲石近似"）——原版发射静音,听感 0.07s 金属叮非爆炸,属发射面偏差）
//  判词锚（反编译 Terarria1457/Terraria/ 唯一标杆,动刀前逐件亲读定谳）：
//   · 经 DeviceCtx.shootProjectile 可达的全部 kind 原版发射面均零 PlaySound：
//       case 137 六陷阱（Wiring.cs:1764-1986,spiky=:1829 num96=185）——仅
//         Projectile.NewProjectile（:1983）,dart/superdart/flame/venomdart/spiky/spear 全走此面；
//       巨石雕像 case 531（:1998-2016,num92=99）——仅 NewProjectile（:2011）；
//       GeyserTrap 443（:3097-3126,num3=654）——仅 NewProjectile（:3123）；
//       雪球发射器 case 212（:1345-1510）零 PlaySound；
//       大炮 335（WorldGen.cs ShootFromCannon :51033-51149）——仅 NewProjectile（:51146）。
//   · Wiring.cs 全文恰 8 处 PlaySound：HitSwitch 开关叮 7×（:267-375,SoundID 28）+
//     Hopper 拾取 1×（:2778,SoundID 7）——无一在弹体发射面。
//   · 弹体自身音另面自理（不在本案发射面）：炮弹族首帧 Item14（Projectile.cs:21542/26830,
//     TrapShot 弹内）、烟花爆花 Item14 在 Kill（:73437）。
//  · 本仓修刀：Game.ts shootProjectile 摘除自创 'tink' 分支（含 8 kind 排除表全拆）——
//    发射面全 kind 零音效=原版相；hail/沙暴巨石/冰霜巨石等直加 TrapShot 的路径本就不经
//    此口（Game.ts:11855/:11881/:45305）,不受影响。
//  变异证红契约（≥2 发→恰红,逐字节还原+sha256 对拍）：
//   M1 Game.ts shootProjectile 复播 'tink'（无条件或条件式）→ ①红
//   M2 Wiring.cs case 137 注入 PlaySound → ②红
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');
const V1457 = join(ROOT, 'Terarria1457');
const GAME = join(ROOT, 'game');

const wiringSrc = readFileSync(join(V1457, 'Terraria', 'Wiring.cs'), 'utf8');
const worldGenSrc = readFileSync(join(V1457, 'Terraria', 'WorldGen.cs'), 'utf8');
const gameSrc = readFileSync(join(GAME, 'src', 'core', 'Game.ts'), 'utf8');
const devicesSrc = readFileSync(join(GAME, 'src', 'world', 'wiring', 'devices.ts'), 'utf8');

/** 切片工具：from 首现起到 to 首现止（含 from 不含 to） */
function slice(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  expect(a, `锚缺失: ${JSON.stringify(from)}`).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(to, a + from.length);
  expect(b, `尾锚缺失: ${JSON.stringify(to)}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe('BJ564-原版②：全部机关发射面零 PlaySound（M2 触发点）', () => {
  it('case 137 六陷阱（:1764-1986）：185 弹生成在位、仅 NewProjectile、零 PlaySound', () => {
    const blk = slice(wiringSrc, 'case 137:', 'case 443:');
    expect(blk).toContain('num96 = 185;');
    expect(blk).toContain('Projectile.NewProjectile');
    expect(blk.includes('PlaySound')).toBe(false);
  });
  it('巨石雕像 case 531（:1998-2016）：仅 NewProjectile、零 PlaySound', () => {
    const blk = slice(wiringSrc, 'case 531:', 'case 35:');
    expect(blk).toContain('num92 = 99;');
    expect(blk).toContain('Projectile.NewProjectile');
    expect(blk.includes('PlaySound')).toBe(false);
  });
  it('GeyserTrap 443（:3097-3126）：仅 NewProjectile、零 PlaySound', () => {
    const blk = slice(wiringSrc, 'private static void GeyserTrap', 'private static void Teleport');
    expect(blk).toContain('num3 = 654;');
    expect(blk).toContain('Projectile.NewProjectile');
    expect(blk.includes('PlaySound')).toBe(false);
  });
  it('雪球发射器 case 212（:1345-1510）零 PlaySound', () => {
    const blk = slice(wiringSrc, 'case 212:', 'case 335:');
    expect(blk).toContain('Projectile.NewProjectile');
    expect(blk.includes('PlaySound')).toBe(false);
  });
  it('大炮发射 ShootFromCannon（WorldGen.cs:51033-51149）：仅 NewProjectile、零 PlaySound', () => {
    const blk = slice(worldGenSrc, 'public static void ShootFromCannon', 'public static bool BunnyCannonCanFire');
    expect(blk).toContain('Projectile.NewProjectile');
    expect(blk.includes('PlaySound')).toBe(false);
  });
  it('Wiring.cs 的 PlaySound 全部在 HitSwitch（SoundID 28）与 Hopper 拾取（SoundID 7）面,共 8 处', () => {
    const hitSwitch = slice(wiringSrc, 'public static void HitSwitch', 'public static void PokeLogicGate');
    expect(hitSwitch.includes('SoundEngine.PlaySound(28')).toBe(true);
    const hopper = slice(wiringSrc, 'private static bool TryAddingToEmptySlot', 'private static bool TryAddingToStack');
    expect(hopper.includes('SoundEngine.PlaySound(7)')).toBe(true);
    const total = (wiringSrc.match(/PlaySound/g) ?? []).length;
    expect(total).toBe(8);
  });
});

describe('BJ564-本仓①：shootProjectile 发射面零音效（M1 触发点）', () => {
  const blk = slice(gameSrc, 'shootProjectile: (px: number', 'hasFountainAt:');
  // 代码面 = 剥离 // 行注释后判读（修刀注释自身含 "PlaySound"/'tink' 字样,不入判）
  const code = blk.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  it('发射块代码面零 sfxAt / PlaySound / tink / 直接播放', () => {
    expect(code.includes('sfxAt')).toBe(false);
    expect(code.includes('PlaySound')).toBe(false);
    expect(code.includes("'tink'")).toBe(false);
    expect(code.includes('sfx.')).toBe(false);
  });
  it('生成面在位（TrapShot 实体仍发射）——防过度摘除', () => {
    expect(blk).toContain('new TrapShot(px, py, vx, vy, damage, kind, form, anchor)');
    expect(blk).toContain("'projectiles'");
  });
  it('BJ564 修刀标记在位', () => {
    expect(blk).toContain('BJ564');
  });
  it('发射器件层（devices.ts）零自播音——全部发射经 ctx.shootProjectile 单口', () => {
    expect(devicesSrc.includes('sfxAt')).toBe(false);
    expect(devicesSrc.includes('playSfx')).toBe(false);
    expect(devicesSrc.includes('sfx.play')).toBe(false);
  });
});
