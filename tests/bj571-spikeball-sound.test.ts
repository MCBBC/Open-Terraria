// ★BJ571（2026-10-08）地牢尖刺球音效定谳——用户问询「被尖刺球砸中的音效是爆炸音效,对吗?」
//  判例锚（反编译 Terarria1457/Terraria/ 唯一标杆,动刀前逐件亲读定谳）：
//  · 身份：地牢尖刺球有两体——
//      ①吊摆尖刺球 NPC = NPCID.SpikeBall = 70（NPCID.cs:11211）：
//        SetDefaults（NPC.cs:9708-9724）aiStyle=20 / HitSound=SoundID.NPCHit1 /
//        DeathSound=NPCDeath1 / **dontTakeDamage = true**（:9722）。
//        NPCHit1 是【NPC 自身受击】面的音（SoundEngine.PlaySound(HitSound) 仅
//        NPC.cs:82381-82390 受击面 switch/else 与 :92974 电鳗 DoT 三处）——
//        70 恒 dontTakeDamage ⇒ 该音【死码,永不播】。
//      ②尖刺球陷阱弹 = ProjectileID.SpikyBallTrap = 185（ProjectileID.cs:822）：
//        SetDefaults（Projectile.cs:2719-2729）aiStyle=14 / trap=true / timeLeft=900
//        / penetrate=-1,**无任何音效字段**（1.4.5.7 Projectile.cs 全文 0 处 HitSound）。
//  · 原版命中面音效链（被砸中实际听到的）：
//      NPC 70 碰玩家 → Player.cs Update_NPCCollision（:31557-31673）**零 PlaySound**
//        → Hurt（:38482）→ PlayHurtSound（:38867 段）= 玩家自身受击语音
//        （DefaultPlayerHurt = Player_Hit_0/1/2）;
//      弹 185 碰玩家 → Damage_EVP（Projectile.cs:14846-14955）无直接音效
//        → player.Hurt 同链;SpawnHitVisuals（:14466）无音效;
//        消亡 Kill（:71752-78993）无 type 185 分支 ⇒ 静音;
//        发射 Wiring.cs case 137（:1764-1986,case 3 :1829 num96=185）**零 PlaySound**。
//    ⇒ 原版整链【无任何爆炸音】（Item14 族不在链上任何位置）。
//  · 本仓对照（全亲读）：
//      NPC 70 = Enemy.ts blazingWheelAI（AI_020 :8920,纯运动零音效）;接触伤害
//        Enemy.ts:3030 → Game.damagePlayer → 尾部 playHurtVoice（Game.ts:43638,
//        Sfx.ts:106 hurt=['Player_Hit_0','Player_Hit_1','Player_Hit_2']）= 原版相;
//      弹 185 = Dart.ts TrapShot kind 'spiky'（:100 spec 无 sfx;:584-608 运动+反弹
//        静音;:689-696 命中玩家→hitPlayer→受击语音;:500 寿终静音）= 原版相;
//      音源物证：terraria-assets/Sounds Player_Hit_0.wav=0.25s 哼声/Tink_0.wav=
//        0.07s 金属叮/Item_14.wav=0.95s 爆炸——无错映射。
//  · 结论 = **销案答询**：原版被尖刺球砸中【不是】爆炸音效,正确音=玩家受击语音;
//    本仓命中面与原版逐站同构,零偏差。
//  · ★邻接登记债（本测试不锁,留待独立落刀）：Game.ts:31735-31737 shootProjectile
//    对陷阱族（含 spiky）发射播自创 'tink'（"陷阱族=敲石近似"）——原版 Wiring.cs
//    发射全程静音,属发射面自创偏差（听感 0.07s 金属叮,非爆炸;与本案命中面无关）。
//  变异证红契约（≥2 发→恰红,逐字节还原+sha256 对拍）：
//   M1 Dart.ts spiky spec 加 sfx/launchSfx → ⑥红
//   M2 Sfx.ts hurt 表换掉 Player_Hit_* → ⑦红
//   M3 Enemy.ts 70/72 dontTakeDamage 手补行删 → ⑤红（刺球可被磨死+死码音转真）
//   M4 spiky 运动块加 playSfx → ⑥b红
//   M5 原版金标变动（type == 185 分支数≠2 / Update_NPCCollision 出现 PlaySound）
//      → ②④红 = 触发金标再生重审
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');
const V1457 = join(ROOT, 'Terarria1457');
const GAME = join(ROOT, 'game');

const npcSrc = readFileSync(join(V1457, 'Terraria', 'NPC.cs'), 'utf8');
const projSrc = readFileSync(join(V1457, 'Terraria', 'Projectile.cs'), 'utf8');
const playerSrc = readFileSync(join(V1457, 'Terraria', 'Player.cs'), 'utf8');
const wiringSrc = readFileSync(join(V1457, 'Terraria', 'Wiring.cs'), 'utf8');

const enemySrc = readFileSync(join(GAME, 'src', 'entities', 'Enemy.ts'), 'utf8');
const dartSrc = readFileSync(join(GAME, 'src', 'entities', 'Dart.ts'), 'utf8');
const sfxSrc = readFileSync(join(GAME, 'src', 'core', 'Sfx.ts'), 'utf8');
const gameSrc = readFileSync(join(GAME, 'src', 'core', 'Game.ts'), 'utf8');

/** 切片工具：from 首现起到 to 首现止（含 from 不含 to） */
function slice(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  expect(a, `锚缺失: ${JSON.stringify(from)}`).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(to, a + from.length);
  expect(b, `尾锚缺失: ${JSON.stringify(to)}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe('BJ571-原版①：吊摆尖刺球 NPC 70 SetDefaults（NPC.cs:9708-9724）', () => {
  const blk = slice(npcSrc, 'else if (type == 70)', 'else if (type == 71)');
  it('HitSound=NPCHit1 / DeathSound=NPCDeath1（刺球自带受击音定义）', () => {
    expect(blk).toContain('HitSound = SoundID.NPCHit1;');
    expect(blk).toContain('DeathSound = SoundID.NPCDeath1;');
  });
  it('dontTakeDamage = true ⇒ NPCHit1 死码（受击面音永不播）', () => {
    expect(blk).toContain('dontTakeDamage = true;');
  });
  it('HitSound 播放点全树恰 3 处,全在 NPC 自身受击/电鳗 DoT 面（无一在碰玩家面）', () => {
    const sites = npcSrc.match(/SoundEngine\.PlaySound\(HitSound/g) ?? [];
    expect(sites.length).toBe(3);
  });
});

describe('BJ571-原版②：碰玩家面静音（Player.Update_NPCCollision）', () => {
  it('NPC 接触伤害全程零 PlaySound（M5 触发点）', () => {
    const blk = slice(playerSrc, 'public void Update_NPCCollision()', 'public bool CanParryAgainst');
    expect(blk.includes('PlaySound')).toBe(false);
  });
  it('玩家受击音=PlayHurtSound 自身语音链（DefaultPlayerHurt,非爆炸）', () => {
    expect(playerSrc).toContain('PlayHurtSound();');
    expect(playerSrc).toContain('SoundID.DefaultPlayerHurt');
  });
});

describe('BJ571-原版④：陷阱弹 185 全链无音效（Projectile.cs / Wiring.cs）', () => {
  it('1.4.5.7 弹幕无 HitSound 字段（Projectile.cs 全文 0 处）', () => {
    expect(projSrc.includes('HitSound')).toBe(false);
  });
  it('type == 185 全文恰 2 处=SetDefaults+碰块反弹（无音效支/无 Kill 支,M5 触发点）', () => {
    const hits = projSrc.match(/type == 185/g) ?? [];
    expect(hits.length).toBe(2);
  });
  it('185 SetDefaults：trap/timeLeft 900/penetrate -1,无音效', () => {
    const blk = slice(projSrc, 'else if (type == 185)', 'else if (type == 186)');
    expect(blk).toContain('trap = true;');
    expect(blk).toContain('timeLeft = 900;');
    expect(blk).toContain('penetrate = -1;');
  });
  it('陷阱发射块（Wiring case 137）含 185 弹生成且零 PlaySound（原版发射静音）', () => {
    const blk = slice(wiringSrc, 'case 137:', 'case 443:');
    expect(blk).toContain('num96 = 185;');
    expect(blk).toContain('Projectile.NewProjectile');
    expect(blk.includes('PlaySound')).toBe(false);
  });
});

describe('BJ571-本仓⑤：NPC 70 恒不可击=HitSound 死码同构', () => {
  it('70/72 dontTakeDamage 手补表在位（M3 触发点）', () => {
    expect(enemySrc).toContain('if (id === 70 || id === 72) e.dontTakeDamage = true;');
  });
  it('Enemy.hurt 头部 dontTakeDamage 早退先于 hitSound（碰/被击两面零音）', () => {
    expect(enemySrc).toContain('if (this.dontTakeDamage) return false;');
  });
});

describe('BJ571-本仓⑥：弹 185（TrapShot spiky）自身零音效（M1/M4 触发点）', () => {
  it('spiky spec 无 sfx/launchSfx 字段', () => {
    const blk = slice(dartSrc, "spiky: { w: 14, h: 14, color: '#8A8F96'", '},');
    expect(blk.includes('sfx')).toBe(false);
    expect(blk).toContain("'vanilla/Projectile_185.png'");
  });
  it('spiky 运动/反弹块零 playSfx', () => {
    const blk = slice(dartSrc, "if (this.kind === 'spiky') {", '} else if (st.gravDelay !== undefined) {');
    expect(blk.includes('playSfx')).toBe(false);
    expect(blk).toContain('-lvy * 0.9'); // 反弹响应在位（Projectile.cs:19818-19828 同构）
  });
});

describe('BJ571-本仓⑦：被砸中实际听到的音=玩家受击语音 Player_Hit_*（M2 触发点）', () => {
  it("Sfx hurt 表 = ['Player_Hit_0','Player_Hit_1','Player_Hit_2']（无爆炸项）", () => {
    expect(sfxSrc).toContain("hurt: ['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2'],");
  });
  it('damagePlayer 尾部接 playHurtVoice（受击面单口）', () => {
    expect(gameSrc).toContain('playHurtVoice(this as unknown as GameHooks, p.voiceState);');
  });
  it('音源文件在库且与原版同源命名（Player_Hit_0/1/2）', () => {
    for (const f of ['Player_Hit_0.opus', 'Player_Hit_1.opus', 'Player_Hit_2.opus']) {
      expect(existsSync(join(GAME, 'public', 'sounds', f)), f).toBe(true);
    }
  });
});
