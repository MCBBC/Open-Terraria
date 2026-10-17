// ★BJ692（2026-10-17 用户实报「穿叶绿套攻击敌人出现魔镜音效」→ 首诊误判「原版
//  复用魔镜采样」被用户驳回 → 复诊勘误）判别锁。
//  ★核心判例：legacy `SoundEngine.PlaySound(int type, x, y, style)` 的【首参=声音库
//  编号】（LegacySoundPlayer.cs 外层 switch：2=Item,3=NpcHit,4=NpcKilled,5=PlayerKilled,
//  6=Grass,7=Grab,8/9=门,13=Shatter,15=Roar…）,style=库内序号;而 `SoundID.ItemN`=
//  LegacySoundStyle(2, N) 名字重载（SoundID.cs:426 `Item6 = new LegacySoundStyle(2, 6)`）。
//  把 `PlaySound(6,…)` 译成 'Item_6'（魔镜采样）= 编号域误读——正解=Grass 割草声。
//  本族普查四处（三错一漏）：
//   ①227 叶弹出生 :28264 PlaySound(6)=Grass——旧 'Item_6'（=用户实报魔镜音根因）;
//   ②227 叶弹消亡 :76022 PlaySound(6)=Grass——旧 'Item_6';
//   ③206/225 叶绿箭 Kill :76009-76018 PlaySound(6)=Grass——旧注「=Dig 变体」译 'dig';
//   ④306 天罚 Kill :78023-78062 PlaySound(3)=NpcHit_1——漏播;
//   ⑤408 迷你鲨鱼龙出膛 :56203 PlaySound(4,x,y,19)=NpcKilled_19——旧 'Item_19' 错库。
//  对照（本刀不动）：晶塔传送 Game.ts:31761/31773 的 'Item_6' 锚的是 Main.cs:13557
//  `PlaySound(SoundID.Item6,…)` 名字重载=真魔镜族传送音,正确。
//  ★变异自证：M1 任一 'chop' 回 'Item_6'/'dig' → §1 恰红;M2 408 回 'Item_19' → §1 恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GAME = join(__dirname, '..');
const VAN = join(GAME, '..', 'Terarria1457');
const read = (p: string) => readFileSync(p, 'utf8');

describe('§1 仓内侧（四处修复在位;M1/M2 位）', () => {
  it('ChloroLeafCrystalProj：出生+消亡均 playSfx chop(=Grass),零 Item_6 调用', () => {
    const src = read(join(GAME, 'src', 'entities', 'ChloroLeafCrystalProj.ts'));
    expect(src).not.toContain("playSfxWav?.('Item_6'");   // 注释中引用旧译字面不算
    expect((src.match(/playSfx\?\.\('chop'/g) ?? []).length).toBe(2);
  });
  it('Game.ts 206/225 叶绿箭 Kill：chop（旧 dig 误译已清）', () => {
    const src = read(join(GAME, 'src', 'core', 'Game.ts'));
    const i = src.indexOf('projId === 206 || projId === 225');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toContain("sfx.play('chop'");
    expect(src.slice(i, i + 400)).not.toContain("sfx.play('dig'");
  });
  it('Game.ts 306 天罚 Kill：NPC_Hit_1 补播（legacy type 3）', () => {
    const src = read(join(GAME, 'src', 'core', 'Game.ts'));
    const i = src.indexOf('if (projId === 306)');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 500)).toContain("playSfxWav('NPC_Hit_1'");
  });
  it('MinionProj 408 出膛：NPC_Killed_19（legacy type 4 库,旧 Item_19 错库已清）', () => {
    const src = read(join(GAME, 'src', 'entities', 'MinionProj.ts'));
    const i = src.indexOf('MINION_SHOT_SFX: Record');
    const block = src.slice(i, src.indexOf('};', i));
    expect(block).toContain("408: { track: 'NPC_Killed_19'");
    expect(block).not.toContain("408: { track: 'Item_19'");
  });
});

describe('§2 反编译锚（legacy 编号域铁证）', () => {
  it('LegacySoundPlayer：case 6=Grass / case 3=NpcHit / case 4=NpcKilled（type=库编号）', () => {
    const src = read(join(VAN, 'Terraria.Audio', 'LegacySoundPlayer.cs'));
    const i = src.indexOf('				case 6:');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toContain('SoundInstanceGrass');
    const i3 = src.indexOf('				case 3:');
    expect(src.slice(i3, i3 + 500)).toContain('SoundInstanceNpcHit');
    const i4 = src.indexOf('				case 4:');
    expect(src.slice(i4, i4 + 700)).toContain('SoundInstanceNpcKilled');
  });
  it('SoundID.Item6 = LegacySoundStyle(2, 6)（Item 库=type 2;与 PlaySound(6) 不同物）', () => {
    const src = read(join(VAN, 'Terraria.ID', 'SoundID.cs'));
    expect(src).toContain('public static readonly LegacySoundStyle Item6 = new LegacySoundStyle(2, 6);');
  });
  it('227 叶弹原版两处 PlaySound(6)（整数重载;非 SoundID.ItemN 名字重载）', () => {
    const src = read(join(VAN, 'Terraria', 'Projectile.cs'));
    const i = src.indexOf('soundDelay == 0 && type == 227');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toContain('SoundEngine.PlaySound(6,');
    const k = src.indexOf('else if (type == 227)', i + 1);   // 跳过 :3126 SetDefaults 首
    expect(k).toBeGreaterThan(-1);
    expect(src.slice(k, k + 200)).toContain('SoundEngine.PlaySound(6,');
  });
});

describe('§3 Sfx 单源对照（chop 键=Grass+±30 方差=原版 case6 同款）', () => {
  it("Sfx.ts: chop:['Grass'] + put(['Grass'],[-30,30])", () => {
    const src = read(join(GAME, 'src', 'core', 'Sfx.ts'));
    expect(src).toContain("chop: ['Grass']");
    expect(src).toContain("put(['Grass'], [-30, 30])");
  });
});
