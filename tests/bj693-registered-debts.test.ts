// ★BJ693（2026-10-17 用户令「登记债开刀处理」——BJ692 普查登记债四件+一件销案）
// 判别锁。
//  债清单与处置：
//   ①喵刀 502 撞块喵叫音量——BJ692 普查误登记「不播」（实为 meowBounceOff 已播）,
//     复核发现真债=音量系数错：旧 0.5×style×0.05（0.15-0.25）=原版一半（LSP case37
//     :1338 `num2 × Style×0.05` 无 ×0.5——旧式疑误并 case2 库内 style37 ×0.5 档,
//     那是 PlaySound(2,…,37)=Item_37 的微调,与喵刀 case37 不同物）→ 修 style×0.05。
//   ②喵刀彩虹尘环（P.cs:18340-18348）——dust66 ×(10+ai0×4) 环爆,色=hsl(i/n,1,0.5),
//     速度=(0,−(3+ai0)) 绕随机基角+环角 ×(1.05,1)×(0.8+rand×0.4),noGravity,
//     scale=1+ai0/3,NewDustPerfect 语义 → 补齐。
//   ③喵刀弹跳扩大盒 AOE（:18350-18361）——盒临时扩 40+8×ai0、penetrate=-1 →
//     Damage() 等价=dealContacts+meowHitCd 适配器（与主命中环同表=原版
//     localNPCImmunity 共享 10t 局部免疫）→ 补齐。
//   ④HappyBomb ×0.45 音量——Dart sfx 表加 sfxVol 逐条目位（缺省 0.8 表惯例档）。
//   ⑤case3/4 style 微调面——核对销案（Sfx.ts :224-229/:320 早已精确建模 20-54×0.5/
//     55-57/23-57×0.5/61-62/±10 音调/10 去重;我们 306 style1 与 408 style19 均落
//     无微调平档=精确正确,零代码变化）。
//  ★变异自证：M1 音量回 0.5× → §1 恰红;M2 摘尘环/AOE → §1 恰红;M3 摘 sfxVol → §3 恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GAME = join(__dirname, '..');
const VAN = join(GAME, '..', 'Terarria1457');
const read = (p: string) => readFileSync(p, 'utf8');

describe('§1 喵刀 502 meowBounceOff 三债（Arrow.ts;M1/M2 位）', () => {
  const src = read(join(GAME, 'src', 'entities', 'Arrow.ts'));
  const i = src.indexOf('private meowBounceOff(');
  const block = () => src.slice(i, src.indexOf('private ', i + 10) > 0 ? src.indexOf('// ======================', i) : i + 3000);

  it('①喵叫音量 style×0.05（旧 0.5×style×0.05=原版一半已清）', () => {
    const b = src.slice(i, i + 2400);
    expect(b).toContain('style * 0.05, this.cx, this.cy');
    expect(b).not.toContain('0.5 * style * 0.05');
  });
  it('②彩虹尘环：dust66+empressHslRgb(i/n)+perfect 通道+scale=1+ai0/3', () => {
    const b = src.slice(i, i + 3200);
    expect(b).toContain('empressHslRgb(i / n)');
    expect(b).toContain('66,');
    expect(b).toContain('1 + this.meowCount / 3');
    expect(b).toContain('10 + this.meowCount * 4');
    expect(b).toContain('0.8 + Math.random() * 0.4');
  });
  it('③弹跳 AOE：盒交换 40+8×ai0 + dealContacts + meowHitCd 适配器（同表共享）', () => {
    const b = src.slice(i, i + 3200);
    expect(b).toContain('40 + 8 * this.meowCount');
    expect(b).toContain('dealContacts(this, game, aoeCd, 10)');
    expect(b).toContain('this.meowHitCd.get(id) ?? 0');
    expect(b).toContain('this.meowHitCd.set(id, cdv)');
  });
});

describe('§2 反编译锚（喵刀撞块块 :18316-18361 全貌）', () => {
  it('原版：PlaySound(37,5+ai0)+彩虹尘（dust66/hslToRgb/scale 1+ai0/3）+扩大盒 Damage(40+8ai0)', () => {
    const van = read(join(VAN, 'Terraria', 'Projectile.cs'));
    const i = van.indexOf('MathHelper.Clamp(++ai[0], 1f, 5f)');
    expect(i).toBeGreaterThan(-1);
    const b = van.slice(i, i + 1500);
    expect(b).toContain('PlaySound(37, (int)position.X, (int)position.Y, 5 + (int)ai[0])');
    expect(b).toContain('Dust.NewDust(base.Center, 0, 0, 66');
    expect(b).toContain('Main.hslToRgb(num22 / num21, 1f, 0.5f)');
    expect(b).toContain('1f + ai[0] / 3f');
    expect(b).toContain('width = (height = 40 + 8 * (int)ai[0])');
    expect(b).toContain('penetrate = -1');
    expect(b).toContain('Damage();');
  });
  it('case37 音量式无 ×0.5（LSP :1338 num2×Style×0.05）', () => {
    const lsp = read(join(VAN, 'Terraria.Audio', 'LegacySoundPlayer.cs'));
    const j = lsp.indexOf('Main.rand.Next(57, 59)');
    const b = lsp.slice(j, j + 400);
    expect(b).toContain('num2 * ((float)Style * 0.05f)');
    expect(b).not.toContain('num2 * 0.5f * ((float)Style');
  });
});

describe('§3 HappyBomb sfxVol（Dart.ts;M3 位）', () => {
  it('75 条目 sfxVol:0.45 + 消费口 st.sfxVol ?? 0.8', () => {
    const src = read(join(GAME, 'src', 'entities', 'Dart.ts'));
    const i = src.indexOf('75: { w: 22, h: 22');
    expect(src.slice(i, i + 320)).toContain('sfxVol: 0.45');
    expect(src).toContain('st.sfxVol ?? 0.8');
  });
});

describe('§4 case3/4 微调面对账销案（Sfx.ts 既有精确建模锚）', () => {
  it('Sfx：NpcHit 20-54×0.5+55/56/57 档 + NpcKilled 23-57×0.5+61/62+10 去重 + ±10 音调', () => {
    const src = read(join(GAME, 'src', 'core', 'Sfx.ts'));
    expect(src).toContain("for (let s = 20; s <= 54; s++) m[`NPC_Hit_${s}`] = 0.5;");
    expect(src).toContain('m.NPC_Hit_55 = 0.5; m.NPC_Hit_56 = 0.5; m.NPC_Hit_57 = 0.6;');
    expect(src).toContain("for (let s = 23; s <= 57; s++) m[`NPC_Killed_${s}`] = 0.5;");
    expect(src).toContain('m.NPC_Killed_61 = 0.6; m.NPC_Killed_62 = 0.6;');
    expect(src).toContain("put(rng('NPC_Killed_', 1, 68), [-10, 10])");
    expect(src).toContain("put(rng('NPC_Hit_', 1, 58), [-10, 10])");
  });
  it('原版 case3/4 微调面（style1 与 style19 均无微调=我们 306/408 落平档）', () => {
    const lsp = read(join(VAN, 'Terraria.Audio', 'LegacySoundPlayer.cs'));
    const i3 = lsp.indexOf('				case 3:');
    const b3 = lsp.slice(i3, i3 + 500);
    expect(b3).toContain('num >= 20 && num <= 54');
    const i4 = lsp.indexOf('				case 4:');
    const b4 = lsp.slice(i4, i4 + 500);
    expect(b4).toContain('num >= 23 && num <= 57');
  });
});
