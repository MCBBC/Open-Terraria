// 投射物命中 → 敌怪 debuff(Projectile.StatusNPC 1:1,Projectile.cs:10555-11065;
// 由 StrikeNPC:12757 每次命中敌怪后调用)。表由 tools/extract-projstatus.mjs 从
// Terarria1456 源码提取:{"<projType>": [{buff, chance, durMin, durMax}]}(tick)。
// 复杂块(ai[1] 定向/套装门 setHuntressT2/配件门 frostBurn·magmaStone/区间门)未入表,
// 见提取脚本 SKIP 清单——后续按需人工补。
import tableJson from '../data/vanilla-projstatus.json';
import { BuffType } from '../stats/Buffs';

/** mut=互斥组 id(StatusNPC if/else 双分支:单掷骰二选一必中其一,
 *  组内按累积 chance 扫描——两条独立掷骰会让双落空/双中,2026-08-13 修正) */
interface StatusEntry { buff: number; chance: number; durMin: number; durMax: number; mut?: number }
const TABLE = tableJson as unknown as Record<string, StatusEntry[]>;

/** Enemy 侧已实装的 buff 字段(秒)。GAP:30 Bleeding(禁回血——repo 敌不回血,
 *  天然等效)/137 Slimed(摩擦减速)/151 SoulDrain(陷阱吸血)/169 BoneJavelin/
 *  183 StardustBleed/337 TentacleSpike/344 BloodButcherer/375 Hemorrhage——
 *  低频或需专属机制,命中静默跳过(表数据完整) */
const SUPPORTED: Record<number, string> = {
  24: 'onFireT',     // On Fire!(NPC.cs:92619 lifeRegen-8 = 4 HP/s)
  20: 'poisonT',     // Poisoned(-12 → 6 HP/s,:92590)
  70: 'venomT',      // Venom(-60 → 30 HP/s,:92706)
  39: 'cursedT',     // Cursed Inferno(onFire2,-48 → 24 HP/s,:92690)
  31: 'confusedT',   // Confused(TargetClosest direction 反转,:78569)
  69: 'ichorT',      // Ichor(防御 -15;repo 近似=armorPen 7,Enemy.ts:4132)
  72: 'midasT',      // Midas(掉钱 ×1.10-1.51,Enemy.ts:4286 rollCoins)
  44: 'frostburnT',    // Frostburn(-16 → 8 HP/s)
  324: 'frostburn2T',  // Frostburn2(-50 → 25 HP/s)
  323: 'onFire3T',     // OnFire3(-30 → 15 HP/s)
  153: 'shadowFlameT', // ShadowFlame(-30 → 15 HP/s)
  204: 'oiledT',       // Oiled:六火系 DoT 翻倍(NPC.cs:93728)
  36: 'brokenArmorT',  // BrokenArmor:受击无视 20 防(:81919)
  203: 'betsysCurseT', // BetsysCurse:受击无视 40 防(:81922)
  189: 'daybreakT',    // Daybreak:单层 100 HP/s(层数模型登记 GAP)
  30: 'bleedT',        // Bleeding:-24 = 12 HP/s(:92598)
  375: 'hemorrhageT',  // Hemorrhage:-200 = 100 HP/s(:92610)
  169: 'javelinT',     // BoneJavelin:单层 3 HP/s(层数模型 GAP)
  337: 'spikeT',       // TentacleSpike:单层 3 HP/s(层数模型 GAP)
  344: 'butcherT',     // BloodButcherer:单层 4 HP/s(层数模型 GAP)
};

type StatusEnemy = { [field: string]: number | undefined };

/** 命中结算侧调用:按投射物型号掷骰并施加 debuff(AddBuff max 合并语义)。
 *  duration 掷骰 Next(durMin, durMax+1) tick → 秒(/60)。
 *  同 mut 组 = 互斥分支(单掷骰按累积概率选一,必中其一或全落空) */
export function applyProjStatus(projId: number | undefined, enemy: StatusEnemy): void {
  if (projId === undefined || projId < 0) return;
  const entries = TABLE[String(projId)];
  if (!entries) return;
  let pendingMut: { id: number; roll: number } | null = null;
  for (const en of entries) {
    let hit: boolean;
    if (en.mut !== undefined) {
      // 互斥组:同组共用一次掷骰,按累积 chance 区间判定本条是否被选中
      if (!pendingMut || pendingMut.id !== en.mut) pendingMut = { id: en.mut, roll: Math.random() };
      let lo = 0;
      hit = false;
      for (const g of entries) {
        if (g.mut !== en.mut) continue;
        const hi = lo + g.chance;
        if (g === en) { hit = pendingMut.roll >= lo && pendingMut.roll < hi; break; }
        lo = hi;
      }
    } else {
      hit = Math.random() < en.chance;
    }
    if (!hit) continue;
    const field = SUPPORTED[en.buff];
    if (!field) continue; // 未实装 buff,登记见上
    const ticks = en.durMin + Math.floor(Math.random() * (en.durMax - en.durMin + 1));
    const sec = ticks / 60;
    const cur = enemy[field] ?? 0;
    if (sec > cur) enemy[field] = sec;
  }
}

/** 武器浸剂对【投射物近战族】的命中施加（StatusNPC:10559-10583 开头段:
 *  (melee||whip) && meleeEnchant>0 → 按药剂施加。近战挥砍侧同表在
 *  Game.ts 挥击结算内,此函数供 WeaponProj 四族(链球/悠悠球/长矛/回旋镖)共用)。
 *  时长 = Player.cs:6141-6171 Next(a,b) 秒,max 合并 */
/** 冰霜盔甲引擎(StatusNPC :93712-93716):(melee||ranged) 命中且套装在身 →
 *  AddBuff(324 Frostburn2, 60×Next(5,15) tick=5-14s,max 合并)。
 *  魔法/召唤弹不吃。三挂点:挥砍(Game)/WeaponProj 近战四族/远程箭 */
export function applyFrostBurn(frostBurn: boolean, enemy: StatusEnemy): void {
  if (!frostBurn) return;
  const sec = 5 + Math.floor(Math.random() * 11); // 60×Next(5,15)t
  if (sec > (enemy.frostburn2T ?? 0)) enemy.frostburn2T = sec;
}

export function applyMeleeImbue(
  buffs: { has: (b: never) => boolean },
  enemy: StatusEnemy,
  partyFx?: () => void,
): void {
  const has = (bt: BuffType): boolean => buffs.has(bt as unknown as never);
  const max = (field: string, v: number): void => {
    if (v > (enemy[field] ?? 0)) enemy[field] = v;
  };
  if (has(BuffType.ImbueVenom)) max('venomT', 5 + Math.random() * 5);
  if (has(BuffType.ImbueCursed)) max('cursedT', 3 + Math.random() * 4);
  if (has(BuffType.ImbueFire)) max('onFireT', 3 + Math.random() * 4);
  if (has(BuffType.ImbueGold)) max('midasT', 2);
  if (has(BuffType.ImbueIchor)) max('ichorT', 10 + Math.random() * 10);
  if (has(BuffType.ImbueNano)) max('confusedT', 1 + Math.random() * 3);
  if (has(BuffType.ImbuePoison)) max('poisonT', 5 + Math.random() * 5);
  if (has(BuffType.ImbueParty)) partyFx?.();
}
