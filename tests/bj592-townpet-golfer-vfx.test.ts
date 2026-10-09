// ★BJ592（2026-10-09）FindFrame 演出面真收官尾——BJ591 新登记两族残债清偿。
//
// 定谳（Terarria1457 亲读，唯一标杆）：
//  · 件1（[ff-dust-townpet-637-638-656] 城镇宠物 case 22 组演出面,FindFrame
//    case 22 组 :69709-69792）——三面语义勘定（任务书旧标"dust216 泪/139-142 喷嚏"
//    系误读,亲读拨正）：
//      ① ai[0]==11f 困盹面（:69709-69750）：帧 0 持 20t → num60−1 困盹帧+
//        EmoteBubble.NewBubble(89=EmoteSleep,self,90)（:69739-69744）；困盹帧
//        counter==50 拍 dust 216×(3+Next(4))（:69719-69723,NewDust(Center+UnitX×
//        (−dir)×8−One×5+UnitY×8, 3,6, 216, −dir,1) 后【整体】velocity /= 2——÷2
//        施于 NewDust 内随机化结果（Dust.cs:174-175 抖动 ±2.0 一并折半））+
//        1/30 gore 580-582（:69724-69731,NewGore(Center+UnitX×(−dir)×8, Zero,
//        Next(580,583)) 内随机化 Gore.cs:1347-48 后 /=2、Y=|Y|（下坠）、
//        X=−|X|×dir（背向漂））；≥100t 且 Next(20)==0 回帧 0（:69733-69737）；
//        恢复支 :69745-69749（帧既非 0 又非困盹帧 → 拍回 0）。
//        语义=id 216=烟雾族白尘（VanillaDust.ts:241 族表 216-222）+gore 580-582=
//        臭气团三变体（Spawn_Digestion ParticleOrchestrator.cs:2337-2356 同式同尘
//        同 gore,配 SoundID.Item16；马桶弹 AI_153 ToiletPop :53139-53151 同族），
//        海盗 229 打盹时的"鼾睡白烟"演出——【非泪非 Zzz 字母】。
//        设定点 :55897-55902 仅 type==229（海盗闲坐拨弄,1/600 站定掷）→
//        637/638/656 宠物域原版不可达（销案,见下）。
//      ② ai[0]==6f 派对舞面（:69760-69792）：num60−5/−4 交替时间带,−5→−4 切换拍
//        dust 139-142×8（:69774-69785,Confetti 彩纸族非"喷嚏"：Center+(10×dir,−4)、
//        vel=(vx+dir,vy−2.5) 后 vx+=dir×1.5、pos−=Vector2(4)（双轴）、vel×=2、
//        scale 0.7+NextFloat×0.3）。设定点 :55853-55870 带 `!IsTownPet[type]` 门+
//        type==208（派对女孩）或派对中 AttackType[208]=0 同族 → 宠物域不可达。
//      ③ ai[0]==5f 坐姿帧（:69751-69758）：num60−3；【637 猫特例=绝对行 19】。
//        原版坐椅扫描排除面=638/656/史莱姆族（FindGoodRestingSpot :53363
//        `type == 638 || type == 656 || IsTownSlime[type] || ai[0]==5`）——猫【可坐】,
//        本仓 NO_SIT_NPC_IDS 同式不含 637 → 猫坐姿真偏差（旧码落 base−3）,落刀。
//      逐型核：637=TownCat 猫/638=TownDog 狗/656=TownBunny 兔（NPCID.cs:12345/
//        :12347/:12383）——三型差异面=宠物表演帧行带 20/21/22（BJ 对抗批③已 1:1,
//        本件不复锁）+③坐姿猫特例（本件落刀）；①②两面无 per-type 分支。
//    销案（宠物域）:①设定点 type==229 独占、②设定点 !IsTownPet 门、发呆 ai[0]=2
//    设定点 :55891 同带 !IsTownPet——三面宠物域原版零入口;本仓 socialUpdate
//    对应支同样 !isPet 门（源锚锁）。活面债=①的 gore 580-582 子面（BJ591 登记
//    "gore 无 API 不接"）+①的 ÷2 次序（旧码预折半 speed 形参=抖动未折半）+
//    ①恢复支缺+③猫特例——四刀全落。
//  · 件2（[ff-dust-589-golfer-rescue] 被绑高尔夫球手 589 帧 9 落尘）——
//    case 589（:71804-71892）自主练习挥杆链 1:1：row0 闲置 fc>Next(90,450) →
//    row1-3 fc>4（落 row≥4 且 Next(3)!=0=2/3 回弹 row0）→ row4-6 fc>4 →
//    row7 fc>Next(30,90) → row8-10 fc>3 快进（推进落 row【恰 9】拍 dust 32×4
//    （Sand,NewDust(vector,1,1,32) 缺省速=内随机化 ±2.0,锚=position.X+
//    (dir==1?+30:−22)、position.Y+height−6,:71839-71855 挥杆击地）→ row11
//    fc>Next(40,140) → row12 fc>6 → 越帧表回卷 0;腾空（vy≠0）帧 0+计数清零
//    （num27 先读后清）。589=被绑本体（aiStyle 0/18×34/rarity 1,:16680-16693,
//    对话 Transform 588 :19883-19886）;本仓 bound TownNPC（vanillaId 588/体 18×40）
//    承载,旧态恒帧 0=缺链 → 落刀（链+尘面+Renderer 589 真帧行）。尘锚 y+h−6=
//    「足上 6px」相对语义（原版 34−6;本仓体 40=既近似,登记）。
//  · gore 580-582 Update 特例（Gore.cs:770-774）rotation=0+vx×0.95 于
//    GorePiece.fixedUpdate 默认支承接（SpecialAI 表无 580-582=GoreID.cs:9 缺省 0,
//    走默认重力支 :760-764 再被尾块覆写滚转）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { TownNPC, townNpcBaseFrame } from '../src/entities/TownNPC';
import { GorePiece, resetGorePool, liveGorePieces } from '../src/entities/GorePiece';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(__dirname, '..');
const npc1457 = readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8');
const gore1457 = readFileSync(join(ROOT, '../Terarria1457/Terraria/Gore.cs'), 'utf8');
const orch1457 = readFileSync(join(ROOT, '../Terarria1457/Terraria.GameContent.Drawing/ParticleOrchestrator.cs'), 'utf8');
const townSrc = readFileSync(join(ROOT, 'src/entities/TownNPC.ts'), 'utf8');
const goreSrc = readFileSync(join(ROOT, 'src/entities/GorePiece.ts'), 'utf8');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

/** case 22 组 body（case 22 头至 case 375 头止） */
function case589Body(src: string): string {
  const start = src.indexOf('\t\tcase 589:\n\t\t{');
  if (start < 0) return '';
  const end = src.indexOf('\t\tcase 375:', start);
  return src.slice(start, end < 0 ? start + 3000 : end);
}
const body589 = case589Body(npc1457);
/** ai[0]==11f 困盹面 body（:69709 起至 ai[0]==5f 止;4 缩进锚防撞 Fishron 同名支 :50171） */
function napBody(src: string): string {
  const start = src.indexOf('\t\t\t\telse if (ai[0] == 11f)');
  if (start < 0) return '';
  const end = src.indexOf('\t\t\t\telse if (ai[0] == 5f)', start);
  return src.slice(start, end < 0 ? start + 2500 : end);
}
const body11 = napBody(npc1457);
/** ai[0]==6f 舞面 body（:69760 起至 ai[0]==7f 止;4 缩进锚） */
function danceBody(src: string): string {
  const start = src.indexOf('\t\t\t\telse if (ai[0] == 6f)');
  if (start < 0) return '';
  const end = src.indexOf('\t\t\t\telse if ((ai[0] == 7f', start);
  return src.slice(start, end < 0 ? start + 4000 : end);
}
const body6 = danceBody(npc1457);
/** Spawn_Digestion body（臭气团语义锚） */
function digestionBody(src: string): string {
  const start = src.indexOf('private static void Spawn_Digestion');
  if (start < 0) return '';
  const end = src.indexOf('private static void Spawn_ShimmerBlock', start);
  return src.slice(start, end < 0 ? start + 1400 : end);
}
const bodyDigest = digestionBody(orch1457);

// ---------------------------------------------------------------------------
// 原版活体锚（1457 源码直读——漂移即爆红）
// ---------------------------------------------------------------------------
describe('BJ592 原版锚：件1 case 22 组三面（:69709-69792）', () => {
  it('① 困盹面 dust 216：位置式/速式(−dir,1)/后置整体 ÷2/scale0.8（:69719-69723）', () => {
    expect(body11).toMatch(
      /Dust\.NewDust\(base\.Center \+ Vector2\.UnitX \* -direction \* 8f - Vector2\.One \* 5f \+ Vector2\.UnitY \* 8f, 3, 6, 216, -direction, 1f\);\s*Dust dust = Main\.dust\[num\d+\];\s*dust\.velocity \/= 2f;\s*Main\.dust\[num\d+\]\.scale = 0\.8f;/,
    );
    expect(body11).toMatch(/int num\d+ = Main\.rand\.Next\(4\);\s*for \(int k = 0; k < 3 \+ num\d+; k\+\+\)/);
  });

  it('① 困盹面 gore 580-582：1/30 掷、位置式、NewGore 后 /=2 + Y=|Y| + X=−|X|×dir（:69724-69731）', () => {
    expect(body11).toMatch(
      /if \(Main\.rand\.Next\(30\) == 0\)\s*\{\s*int num\d+ = Gore\.NewGore\(base\.Center \+ Vector2\.UnitX \* -direction \* 8f, Vector2\.Zero, Main\.rand\.Next\(580, 583\)\);\s*Gore gore = Main\.gore\[num\d+\];\s*gore\.velocity \/= 2f;\s*Main\.gore\[num\d+\]\.velocity\.Y = Math\.Abs\(Main\.gore\[num\d+\]\.velocity\.Y\);\s*Main\.gore\[num\d+\]\.velocity\.X = \(0f - Math\.Abs\(Main\.gore\[num\d+\]\.velocity\.X\)\) \* \(float\)direction;\s*\}/,
    );
  });

  it('① 困盹面帧带：20t 入盹+NewBubble(89)、50t 拍恰一次、100t+Next(20)==0 醒、恢复支（:69712-69749）', () => {
    expect(body11).toMatch(/EmoteBubble\.NewBubble\(89, new WorldUIAnchor\(this\), 90\);/);
    expect(body11).toMatch(/if \(frameCounter >= 100\.0 && Main\.rand\.Next\(20\) == 0\)/);
    expect(body11).toMatch(/else if \(frame\.Y \/ num == 0 && frameCounter >= 20\.0\)/);
    expect(body11).toMatch(/else if \(frame\.Y != 0 && frame\.Y != num \* \(num60 - 1\)\)/);
  });

  it('② 舞面 dust 139-143×8：触发门 num70==num60−4&&num69==num60−5、位置/速式/pos−4/vel×2/scale（:69772-69785）', () => {
    expect(body6).toMatch(/if \(num70 == num60 - 4 && num69 == num60 - 5\)/);
    expect(body6).toMatch(/Vector2 vector2 = base\.Center \+ new Vector2\(10 \* direction, -4f\);/);
    expect(body6).toMatch(/for \(int l = 0; l < 8; l\+\+\)/);
    expect(body6).toMatch(/int num\d+ = Main\.rand\.Next\(139, 143\);/);
    expect(body6).toMatch(
      /Dust\.NewDust\(vector2, 0, 0, num\d+, velocity\.X \+ \(float\)direction, velocity\.Y - 2\.5f, 0, default\(Color\), 1\.2f\)/,
    );
    expect(body6).toMatch(/Main\.dust\[num\d+\]\.velocity\.X \+= \(float\)direction \* 1\.5f;/);
    expect(body6).toMatch(/dust\.position -= new Vector2\(4f\);/);
    expect(body6).toMatch(/dust\.velocity \*= 2f;/);
    expect(body6).toMatch(/Main\.dust\[num\d+\]\.scale = 0\.7f \+ Main\.rand\.NextFloat\(\) \* 0\.3f;/);
  });

  it('③ 坐姿面：num60−3 + 637 猫特例绝对行 19（:69751-69758）', () => {
    expect(npc1457).toMatch(
      /else if \(ai\[0\] == 5f\)\s*\{\s*frame\.Y = num \* \(num60 - 3\);\s*if \(type == 637\)\s*\{\s*frame\.Y = num \* 19;\s*\}\s*frameCounter = 0\.0;\s*\}/,
    );
  });

  it('①②宠物域销案锚：设定点 11f=type 229 独占、2f/6f 带 !IsTownPet 门（:55853/:55891/:55897）', () => {
    // 发呆 ai[0]=2f 设定点（:55891）——!IsTownPet 门字面
    expect(npc1457).toMatch(
      /else if \(\(!NPCID\.Sets\.IsTownPet\[type\] & flag30\) && ai\[0\] == 0f && velocity\.Y == 0f && Main\.rand\.Next\(1800\) == 0\)/,
    );
    // 派对舞 ai[0]=6f 设定点（:55853）——!IsTownPet 门 + 208/派对同 AttackType
    expect(npc1457).toMatch(
      /else if \(\(!NPCID\.Sets\.IsTownPet\[type\] & flag30\) && ai\[0\] == 0f && velocity\.Y == 0f && Main\.rand\.Next\(1200\) == 0 && \(type == 208 \|\| \(BirthdayParty\.PartyIsUp && NPCID\.Sets\.AttackType\[type\] == NPCID\.Sets\.AttackType\[208\]\)\)\)/,
    );
    // 海盗拨弄 ai[0]=11f 设定点（:55897）——type 229 独占
    expect(npc1457).toMatch(
      /else if \(flag30 && ai\[0\] == 0f && velocity\.Y == 0f && Main\.rand\.Next\(600\) == 0 && type == 229 && !flag18\)\s*\{\s*ai\[0\] = 11f;/,
    );
  });

  it('gore 580-582 语义锚=臭气团（Spawn_Digestion 同式同尘同 gore,非泪非 Zzz）', () => {
    expect(bodyDigest).toMatch(/private static void Spawn_Digestion/);
    expect(bodyDigest).toMatch(
      /Dust\.NewDust\(positionInWorld \+ Vector2\.UnitX \* -num \* 8f - Vector2\.One \* 5f \+ Vector2\.UnitY \* 8f, 3, 6, 216, -num, 1f\)/,
    );
    expect(bodyDigest).toMatch(/Gore\.NewGore\(positionInWorld \+ Vector2\.UnitX \* -num \* 8f, Vector2\.Zero, Main\.rand\.Next\(580, 583\)\)/);
    expect(bodyDigest).toMatch(/SoundEngine\.PlaySound\(SoundID\.Item16/);
  });

  it('NewGore 内随机化 + 580-582 Update 尾块（Gore.cs:1347-48/:770-774）', () => {
    expect(gore1457).toMatch(/Main\.gore\[num\]\.velocity\.Y -= \(float\)Main\.rand\.Next\(10, 31\) \* 0\.1f;/);
    expect(gore1457).toMatch(/Main\.gore\[num\]\.velocity\.X \+= \(float\)Main\.rand\.Next\(-20, 21\) \* 0\.1f;/);
    expect(gore1457).toMatch(/if \(type >= 580 && type <= 582\)\s*\{\s*rotation = 0f;\s*velocity\.X \*= 0\.95f;\s*\}/);
  });
});

describe('BJ592 原版锚：件2 case 589 被绑高尔夫球手（:71804-71892）', () => {
  it('body 存在且帧带阈值齐备（12+:6t/11:Next(40,140)/8+:3t/7:Next(30,90)/4+:4t/1+:4t+Next(3)!≠0/0:Next(90,450)）', () => {
    expect(body589.length).toBeGreaterThan(1000);
    expect(body589).toMatch(/int num27 = frame\.Y \/ num;\s*frameCounter\+\+;\s*if \(velocity\.Y != 0f\)\s*\{\s*frame\.Y = 0;\s*frameCounter = 0\.0;\s*\}/);
    expect(body589).toMatch(/if \(num27 >= 12\)\s*\{\s*if \(frameCounter > 6\.0\)/);
    expect(body589).toMatch(/else if \(num27 >= 11\)\s*\{\s*if \(frameCounter > \(double\)Main\.rand\.Next\(40, 140\)\)/);
    expect(body589).toMatch(/else if \(num27 >= 8\)\s*\{\s*if \(!\(frameCounter > 3\.0\)\)\s*\{\s*break;\s*\}/);
    expect(body589).toMatch(/else if \(num27 >= 7\)\s*\{\s*if \(frameCounter > \(double\)Main\.rand\.Next\(30, 90\)\)/);
    expect(body589).toMatch(/else if \(num27 >= 4\)\s*\{\s*if \(frameCounter > 4\.0\)/);
    expect(body589).toMatch(/else if \(num27 >= 1\)\s*\{\s*if \(frameCounter > 4\.0\)[\s\S]*?if \(frame\.Y >= num \* 4 && Main\.rand\.Next\(3\) != 0\)\s*\{\s*frame\.Y = 0;/);
    expect(body589).toMatch(/else if \(frameCounter > \(double\)Main\.rand\.Next\(90, 450\)\)/);
    expect(body589).toMatch(/if \(frame\.Y >= num \* Main\.npcFrameCount\[type\]\)\s*\{\s*frame\.Y = 0;/);
  });

  it('帧 9 到位拍尘 32×4：锚=position.X+(dir==1?+30:−22)/position.Y+height−6、NewDust(vector,1,1,32)（:71839-71855）', () => {
    expect(body589).toMatch(
      /if \(frame\.Y == num \* 9\)\s*\{\s*Vector2 vector = position;\s*vector\.Y \+= height - 6;\s*if \(direction == 1\)\s*\{\s*vector\.X \+= 30f;\s*\}\s*else\s*\{\s*vector\.X -= 22f;\s*\}\s*for \(int j = 0; j < 4; j\+\+\)\s*\{\s*Dust\.NewDust\(vector, 1, 1, 32\);\s*\}\s*\}/,
    );
  });

  it('589=被绑本体（aiStyle 0/rarity 1/h34,对话 Transform 588）、588=城镇型 h40', () => {
    expect(npc1457).toMatch(/else if \(type == 589\)\s*\{\s*friendly = true;\s*width = 18;\s*height = 34;\s*aiStyle = 0;/);
    expect(npc1457).toMatch(/if \(type == 589\)\s*\{\s*AI_000_TransformBoundNPC\(i, 588\);/);
    expect(npc1457).toMatch(/else if \(type == 588\)\s*\{\s*townNPC = true;\s*friendly = true;\s*width = 18;\s*height = 40;/);
  });
});

// ---------------------------------------------------------------------------
// 本仓锚（落刀面直读——被覆写/回滚即爆红）
// ---------------------------------------------------------------------------
describe('BJ592 本仓锚：件1 case 11 面四刀 + ③ 猫坐姿（TownNPC.ts）', () => {
  it('dust 216 ÷2 次序拨正：speed 形参全值（−facing,1）+ 结果侧折半（抖动随折）', () => {
    expect(townSrc).toMatch(
      /const d = game\.vanillaDust\.spawn\(\s*this\.cx - this\.facing \* 8 - 5, this\.cy \+ 3, 3, 6, 216,\s*-this\.facing, 1, 0, null, 0\.8\);\s*if \(d\) \{ d\.vx \/= 2; d\.vy \/= 2; d\.scale = 0\.8; \}/,
    );
    // 旧预折半写法必须绝迹
    expect(townSrc).not.toMatch(/-this\.facing \/ 2, 0\.5, 0, null, 0\.8\)/);
  });

  it('gore 580-582 发射面：1/30 掷、Next(3) 变体、NewGore 后 /=2+Y=|Y|+X=−|X|×dir', () => {
    expect(townSrc).toMatch(/if \(this\.rng\(\) < 1 \/ 30\) \{[^\n]*\n\s*const g = GorePiece\.newGore\(580 \+ Math\.floor\(this\.rng\(\) \* 3\),\s*this\.cx - this\.facing \* 8, this\.cy, 0, 0, 1\);/);
    expect(townSrc).toMatch(/g\.vx \/= 2; g\.vy \/= 2;\s*g\.vy = Math\.abs\(g\.vy\);\s*g\.vx = -Math\.abs\(g\.vx\) \* this\.facing;/);
  });

  it('恢复支在位（:69745-69749）：帧既非困盹又非 0 → 拍回 0（旧直坠 t≥20 支绝迹）', () => {
    expect(townSrc).toMatch(/\} else if \(this\.frame !== 0\) \{\s*this\.frame = 0; s\.frameT = 0;[^\n]*\n\s*\} else if \(t >= 20\) \{/);
  });

  it('Next(4) 无条件耗骰（vanillaDust 缺省不吞骰——骰流序保真）', () => {
    expect(townSrc).toMatch(/if \(t === 50\) \{\s*const n67 = 3 \+ Math\.floor\(this\.rng\(\) \* 4\);[^\n]*\n\s*if \(game\?\.vanillaDust\) \{/);
  });

  it('③ 猫坐姿特例：637 → 绝对行 19（:69751-69758）', () => {
    expect(townSrc).toMatch(/this\.frame = this\.vanillaId === 637 \? 19 : base - 3;/);
  });
});

describe('BJ592 本仓锚：件2 bound golfer 链（TownNPC.ts + Renderer.ts）', () => {
  it('bound 块挂接位 + 链骨架（阈值/回卷/腾空/回弹门）', () => {
    expect(townSrc).toMatch(/if \(this\.npcKey === 'golfer'\) this\.boundGolferFindFrame\(game\);/);
    expect(townSrc).toMatch(/const num27 = this\.frame;[^\n]*\n\s*this\.frameT\+\+;\s*if \(this\.vy !== 0\) \{\s*this\.frame = 0;\s*this\.frameT = 0;\s*\}/);
    expect(townSrc).toMatch(/if \(num27 >= 12\) \{[\s\S]*?if \(fc > 6\) \{[\s\S]*?if \(this\.frame >= 13\) this\.frame = 0;/);
    expect(townSrc).toMatch(/else if \(num27 >= 11\) \{\s*if \(fc > roll\(40, 140\)\) \{/);
    expect(townSrc).toMatch(/else if \(num27 >= 8\) \{\s*if \(!\(fc > 3\)\) return;/);
    expect(townSrc).toMatch(/else if \(num27 >= 7\) \{\s*if \(fc > roll\(30, 90\)\) \{/);
    expect(townSrc).toMatch(/else if \(num27 >= 4\) \{\s*if \(fc > 4\) \{/);
    expect(townSrc).toMatch(/else if \(num27 >= 1\) \{[\s\S]*?if \(this\.frame >= 4 && this\.rng\(\) >= 1 \/ 3\) this\.frame = 0;/);
    expect(townSrc).toMatch(/else if \(fc > roll\(90, 450\)\) \{/);
  });

  it('帧 9 尘 32×4：锚式（dir==1?+30:−22, y+h−6）+ NewDust(vector,1,1,32) 缺省参', () => {
    expect(townSrc).toMatch(/if \(this\.frame === 9\) \{[\s\S]*?const vx = this\.x \+ \(this\.facing === 1 \? 30 : -22\);\s*const vy = this\.y \+ this\.h - 6;\s*for \(let j = 0; j < 4; j\+\+\) \{\s*vd\.spawn\(vx, vy, 1, 1, 32\);/);
  });

  it('Renderer：589 真帧行切片（row 钳 [0,12]）——其余被缚表恒帧 0', () => {
    expect(rendererSrc).toMatch(/const row = id === 589 \? Math\.min\(Math\.max\(n\.frame, 0\), 12\) : 0;/);
    expect(rendererSrc).toMatch(/sy: row \* fh/);
  });
});

describe('BJ592 本仓锚：gore 580-582 Update 特例（GorePiece.ts）+ 宠物域销案', () => {
  it('默认支尾块：rotation=0 + vx×0.95（Gore.cs:770-774 承接）', () => {
    expect(goreSrc).toMatch(/if \(t >= 580 && t <= 582\) \{\s*this\.rotation = 0;\s*this\.vx \*= 0\.95;\s*\}/);
  });

  it('宠物域销案（源级）：发呆/派对舞/海盗拨弄三支带 !isPet 门（原版设定点同式排除）', () => {
    // ④ 发呆 ai[0]=2（:55891 !IsTownPet）→ 本仓 !isPet
    expect(townSrc).toMatch(/else if \(!isPet && this\.walkMode === 0 && rnd\(\) \* 1800 < 1\) \{/);
    // ③ 派对舞 ai[0]=6（:55853 !IsTownPet）→ 本仓 !isPet
    expect(townSrc).toMatch(/else if \(!isPet && this\.walkMode === 0 && rnd\(\) \* 1200 < 1/);
    // ④" 海盗拨弄 ai[0]=11（:55897 type==229）→ 本仓 !isPet + vanillaId 229
    expect(townSrc).toMatch(/else if \(!isPet && this\.walkMode === 0 && rnd\(\) \* 600 < 1 && this\.vanillaId === 229\) \{/);
  });
});

// ---------------------------------------------------------------------------
// 行为级（判别面：确定性桩）
// ---------------------------------------------------------------------------
const W = 200;

/** NewDust 契约桩：vx=sx+0.123 / vy=sy+0.456 加法标记（观测【spawn 结果】的后置
 *  变换——加法标记不扰动 ÷2/×2/求和恒等式,判别刃保持线性可推） */
function dustGame(): { game: GameHooks; spawns: Array<Record<string, number>> } {
  const spawns: Array<Record<string, number>> = [];
  const game = {
    world: new World(W, 80, 23, 'bj592'),
    vanillaDust: {
      spawn: (x: number, y: number, w: number, h: number, type: number,
        sx: number, sy: number, alpha: number, _color: unknown, scale: number) => {
        const d: Record<string, number> = {
          bx: x, by: y, bw: w, bh: h, type, sx, sy, alpha, scale,
          vx: sx + 0.123, vy: sy + 0.456,
        };
        spawns.push(d);
        return d;
      },
    },
  } as unknown as GameHooks;
  return { game, spawns };
}

const drive = (o: object, fn: string) =>
  (o as unknown as Record<string, (...a: unknown[]) => unknown>)[fn];

/** 构造 pirate + case 11 社交态（base 固定 10 → 困盹帧 9） */
function pirateNpc(): TownNPC {
  const n = new TownNPC('pirate', 1000, 1000);
  n.facing = 1;
  n.rng = () => 0.5;
  (n as unknown as { social: unknown }).social =
    { kind: 11, t: 90, other: null, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
  return n;
}

describe('BJ592 行为级：件1 ① 困盹面 dust 216（÷2 次序=判别刃）', () => {
  afterEach(() => { resetGorePool(); vi.restoreAllMocks(); });

  it('counter==50 恰一拍：5 粒（3+Next(4)=3+2）、216、位置式、scale0.8', () => {
    const { game, spawns } = dustGame();
    const n = pirateNpc();
    n.frame = 9;                                     // base−1 困盹帧
    const sf = drive(n, 'socialFrame');
    for (let i = 0; i < 50; i++) sf.call(n, 10, game);
    expect(spawns.length, '恰一拍 3+Next(4) 粒').toBe(5);
    for (const d of spawns) {
      expect(d.type).toBe(216);
      expect(d.bx).toBe(n.cx - 1 * 8 - 5);            // Center+UnitX×(−dir)×8−One×5
      expect(d.by).toBe(n.cy + 3);                    // −One×5+UnitY×8
      expect(d.bw).toBe(3); expect(d.bh).toBe(6);
      expect(d.scale).toBe(0.8);
    }
  });

  it('★÷2 判别刃：speed 形参全值 (−dir,1)、结果侧折半（旧预折半码两断言皆红）', () => {
    const { game, spawns } = dustGame();
    const n = pirateNpc();
    n.frame = 9;
    const sf = drive(n, 'socialFrame');
    for (let i = 0; i < 50; i++) sf.call(n, 10, game);
    for (const d of spawns) {
      expect(d.sx, 'NewDust SpeedX 形参=−direction 全值').toBe(-1);
      expect(d.sy, 'NewDust SpeedY 形参=1 全值').toBe(1);
      expect(d.vx, '(−dir+抖动) 生成后整体 ÷2=标记式 ÷2').toBeCloseTo((-1 + 0.123) / 2, 6);
      expect(d.vy).toBeCloseTo((1 + 0.456) / 2, 6);
    }
  });

  it('facing=−1 镜像：位置/速式随向翻', () => {
    const { game, spawns } = dustGame();
    const n = pirateNpc();
    n.facing = -1;
    n.frame = 9;
    const sf = drive(n, 'socialFrame');
    for (let i = 0; i < 50; i++) sf.call(n, 10, game);
    expect(spawns.length).toBe(5);
    for (const d of spawns) {
      expect(d.bx).toBe(n.cx + 8 - 5);
      expect(d.sx).toBe(1);
    }
  });
});

describe('BJ592 行为级：件1 ① gore 580-582 发射面（1/30 门+后置变换）', () => {
  afterEach(() => { resetGorePool(); vi.restoreAllMocks(); });

  it('掷中：恰 1 团、type 580、锚=Center+UnitX×(−dir)×8、NewGore 抖动后 /=2+Y=|Y|+X=−|X|×dir', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // NewGore 内随机化：vy−=2.0/vx+=0
    const { game } = dustGame();
    const n = pirateNpc();
    n.rng = () => 0.01;                              // Next(4)=0→3 尘;1/30 门中;Next(3)=0→type 580
    n.frame = 9;
    const sf = drive(n, 'socialFrame');
    for (let i = 0; i < 50; i++) sf.call(n, 10, game);
    const live = liveGorePieces();
    expect(live.length, '1/30 门中恰 1 团').toBe(1);
    const g = live[0];
    expect(g.goreId).toBe(580);
    expect(g.x).toBe(n.cx - 1 * 8);                  // Center+UnitX×(−dir)×8
    expect(g.y).toBe(n.cy);
    // NewGore: vy=0−2.0=−2.0 → /=2=−1.0 → |·|=1.0（下坠）;vx=0+0=0 → /=2=0 → −|0|×dir=0
    expect(g.vy).toBeCloseTo(1.0, 6);
    expect(g.vx === 0).toBe(true);
    expect(g.scale).toBe(1);
  });

  it('掷不中（rng≥1/30）：零团——门=Next(30)==0 精确 1/30', () => {
    const { game } = dustGame();
    const n = pirateNpc();
    n.rng = () => 0.5;                               // 0.5 ≥ 1/30
    n.frame = 9;
    const sf = drive(n, 'socialFrame');
    for (let i = 0; i < 50; i++) sf.call(n, 10, game);
    expect(liveGorePieces().length).toBe(0);
  });

  it('恢复支：入场残行走帧（frame=4）首拍归位帧 0、不冒泡不提前入盹', () => {
    const { game } = dustGame();
    const n = pirateNpc();
    n.frame = 4;                                     // 入场残行走帧
    const sf = drive(n, 'socialFrame');
    sf.call(n, 10, game);
    expect((n as unknown as { frame: number }).frame).toBe(0);
    expect((n as unknown as { social: { frameT: number } }).social.frameT).toBe(0);
    expect(liveGorePieces().length).toBe(0);
  });

  it('醒门：困盹 ≥100t 且 Next(20)==0 → 回帧 0+计数清零；Next(20)≠0 持续', () => {
    const { game } = dustGame();
    const n = pirateNpc();
    n.frame = 9;
    (n as unknown as { social: { frameT: number } }).social.frameT = 100;
    const sf = drive(n, 'socialFrame');
    sf.call(n, 10, game);                            // rng=0.5 ≥ 1/20 → 持续
    expect((n as unknown as { frame: number }).frame).toBe(9);
    n.rng = () => 0.01;                              // < 1/20 → 醒
    sf.call(n, 10, game);
    expect((n as unknown as { frame: number }).frame).toBe(0);
    expect((n as unknown as { social: { frameT: number } }).social.frameT).toBe(0);
  });
});

describe('BJ592 行为级：件1 ② 舞面 danceDust（已同构销案锁——逐参）', () => {
  afterEach(() => { resetGorePool(); vi.restoreAllMocks(); });

  it('−5→−4 切换拍 8 粒：139-143、锚 Center+(10×dir,−4)、vel 链（+dir×1.5→×2）、scale 0.7+r×0.3', () => {
    const { game, spawns } = dustGame();
    const n = new TownNPC('guide', 2000, 2000);
    n.facing = 1;
    n.vx = 0.5; n.vy = 0;
    n.rng = () => 0.5;
    (n as unknown as { social: unknown }).social =
      { kind: 6, t: 300, other: null, frameT: 15, prevFrame: 0, rpsA: 0, rpsB: 0 };
    n.frame = 5;                                     // base−5（base=10）
    const sf = drive(n, 'socialFrame');
    sf.call(n, 10, game);                            // t=16 → f=base−4 且 prev=base−5 → 舞尘
    expect((n as unknown as { frame: number }).frame).toBe(6);
    expect(spawns.length, '恰 8 粒').toBe(8);
    for (const d of spawns) {
      expect(d.type).toBeGreaterThanOrEqual(139);
      expect(d.type).toBeLessThan(143);
      expect(d.bx).toBe(n.cx + 10);                   // Center+(10×dir,−4)
      expect(d.by).toBe(n.cy - 4);
      expect(d.bw).toBe(0); expect(d.bh).toBe(0);     // NewDust(vector2,0,0,…)
      expect(d.sx).toBeCloseTo(0.5 + 1, 6);           // velocity.X+direction
      expect(d.sy).toBeCloseTo(0 - 2.5, 6);           // velocity.Y−2.5
      expect(d.vx, '(sx+标记+dir×1.5)×2（×2 双轴）').toBeCloseTo((1.5 + 0.123 + 1.5) * 2, 6);
      expect(d.vy, '(sy+标记)×2').toBeCloseTo((-2.5 + 0.456) * 2, 6);
      expect(d.scale).toBeCloseTo(0.7 + 0.5 * 0.3, 6);
    }
  });
});

describe('BJ592 行为级：件1 ③ 坐姿帧（637 猫特例=判别刃）', () => {
  it('637 猫坐姿=绝对行 19（旧 base−3=25 红）;通用型仍 num60−3', () => {
    const cat = new TownNPC('town_cat', 500, 500);
    cat.sitting = true;
    const catFrames = vanillaNpc(637)!.frames;
    const catBase = townNpcBaseFrame(637, catFrames);
    expect(catBase - 3, '旧码行（拨正前基线）').not.toBe(19);
    drive(cat, 'updateWalkFrame').call(cat, undefined);
    expect((cat as unknown as { frame: number }).frame, '637 绝对行 19').toBe(19);

    const guide = new TownNPC('guide', 500, 500);
    guide.sitting = true;
    const gFrames = vanillaNpc(22)!.frames;
    const gBase = townNpcBaseFrame(22, gFrames);
    drive(guide, 'updateWalkFrame').call(guide, undefined);
    expect((guide as unknown as { frame: number }).frame).toBe(gBase - 3);
  });
});

describe('BJ592 行为级：件2 case 589 挥杆链+帧 9 落尘', () => {
  afterEach(() => { resetGorePool(); vi.restoreAllMocks(); });

  /** 绑缚高尔夫球手（rng=0 → 各 Next 取下界:90/40/30/5t 节拍最短链） */
  function golfer(): TownNPC {
    const n = new TownNPC('golfer', 3000, 3000);
    n.bound = true;
    n.facing = 1;
    n.vy = 0;
    n.rng = () => 0;
    return n;
  }

  it('全链走查（rng=0 最短拍）：row0 91t → 1-3 各 5t → 4-6 各 5t → 7 31t → 8 4t→帧 9 落尘、恰一事件 4 粒', () => {
    const { game, spawns } = dustGame();
    const n = golfer();
    const ff = drive(n, 'boundGolferFindFrame');
    let sawNine = 0;
    for (let i = 0; i < 156; i++) {
      ff.call(n, game);
      if ((n as unknown as { frame: number }).frame === 9) sawNine++;
    }
    expect(sawNine, '帧 9 到位恰一拍').toBe(1);
    expect(spawns.length, '尘 32×4 恰一事件').toBe(4);
    for (const d of spawns) {
      expect(d.type).toBe(32);
      expect(d.bx).toBe(n.x + 30);                    // direction==1 → +30
      expect(d.by).toBe(n.y + n.h - 6);               // 足上 6px
      expect(d.bw).toBe(1); expect(d.bh).toBe(1);     // NewDust(vector,1,1,32)
    }
  });

  it('facing=−1 镜像：锚 −22（direction≠1 支）', () => {
    const { game, spawns } = dustGame();
    const n = golfer();
    n.facing = -1;
    const ff = drive(n, 'boundGolferFindFrame');
    for (let i = 0; i < 156; i++) ff.call(n, game);
    expect(spawns.length).toBe(4);
    for (const d of spawns) expect(d.bx).toBe(n.x - 22);
  });

  it('整循环回卷：帧表 13 帧（row12 → 越界回 0）——第二循环前帧域恒 [0,12]', () => {
    const { game } = dustGame();
    const n = golfer();
    const ff = drive(n, 'boundGolferFindFrame');
    let maxRow = 0;
    for (let i = 0; i < 212; i++) {                   // 91+15+15+31+12+41+7=212t 整循环
      ff.call(n, game);
      const f = (n as unknown as { frame: number }).frame;
      maxRow = Math.max(maxRow, f);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(12);
    }
    expect(maxRow, '链顶达 row 12').toBe(12);
    expect((n as unknown as { frame: number }).frame, '整循环末回卷 0').toBe(0);
  });

  it('腾空（vy≠0）：帧钉 0+不推进（链计数清零,原版 num27 先读后清同相）', () => {
    const { game } = dustGame();
    const n = golfer();
    const ff = drive(n, 'boundGolferFindFrame');
    for (let i = 0; i < 95; i++) ff.call(n, game);    // 进入 row1+
    expect((n as unknown as { frame: number }).frame).toBeGreaterThan(0);
    (n as unknown as { vy: number }).vy = 0.1;
    ff.call(n, game);
    expect((n as unknown as { frame: number }).frame, '腾空帧 0').toBe(0);
    (n as unknown as { vy: number }).vy = 0;
    ff.call(n, game);
    expect((n as unknown as { frame: number }).frame, '计数已清→次拍仍在 row0 域').toBe(0);
  });

  it('蓄力回弹门（Next(3)!=0=2/3）：row3→4 推进拍掷中 → 拍回 0', () => {
    const { game } = dustGame();
    const n = golfer();
    (n as unknown as { frame: number }).frame = 3;
    (n as unknown as { frameT: number }).frameT = 4;
    n.rng = () => 0.9;                                // ≥1/3 → 回弹
    drive(n, 'boundGolferFindFrame').call(n, game);
    expect((n as unknown as { frame: number }).frame, '2/3 蓄力中止').toBe(0);
  });
});

describe('BJ592 行为级：gore 580-582 Update 特例（Gore.cs:770-774 承接）', () => {
  afterEach(() => { resetGorePool(); vi.restoreAllMocks(); });

  it('581 一拍：vy+=0.2（默认重力支）→ rotation 归 0（覆写翻滚）+ vx×0.95', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // NewGore 抖动 vy−=2.0/vx+=0
    const game = { world: new World(W, 80, 23, 'bj592-gore') } as unknown as GameHooks;
    const g = GorePiece.newGore(581, 100, 20, 0.4, 0.2, 1)!;
    expect(g.vy).toBeCloseTo(0.2 - 2.0, 6);          // 0.2−2.0=−1.8（上飘出生）
    drive(g, 'fixedUpdate').call(g, 1 / 60, game);
    expect(g.vy).toBeCloseTo(-1.6, 6);               // −1.8+0.2
    expect(g.rotation, '滚转清零（特例块覆写 :770-774）').toBe(0);
    expect(g.vx).toBeCloseTo(0.4 * 0.95, 6);         // ×0.95
  });

  it('对照（非 58x 型）：默认翻滚面不灭（rotation=vx×0.05 累计在）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const game = { world: new World(W, 80, 23, 'bj592-gore2') } as unknown as GameHooks;
    const g = GorePiece.newGore(583, 100, 20, 0.4, 0.2, 1)!;
    drive(g, 'fixedUpdate').call(g, 1 / 60, game);
    expect(g.rotation).toBeCloseTo(0.4 * 0.05, 6);
  });
});
