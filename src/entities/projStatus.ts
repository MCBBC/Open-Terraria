// 投射物命中 → 敌怪 debuff(Projectile.StatusNPC 1:1,Projectile.cs:10555-11065;
// 由 StrikeNPC:12757 每次命中敌怪后调用)。表由 tools/extract-projstatus.mjs 从
// Terarria1456 源码提取:{"<projType>": [{buff, chance, durMin, durMax}]}(tick)。
// 复杂块(ai[1] 定向/套装门 setHuntressT2/配件门 frostBurn·magmaStone/区间门)未入表,
// 见提取脚本 SKIP 清单——后续按需人工补。
import tableJson from '../data/vanilla-projstatus.json';
import { BuffType } from '../stats/Buffs';

interface StatusEntry { buff: number; chance: number; durMin: number; durMax: number }
const TABLE = tableJson as unknown as Record<string, StatusEntry[]>;

/** Enemy 侧已实装的 buff 字段(秒)。GAP:30 Bleeding/36 BrokenArmor/44 Frostburn/
 *  137 Slimed/151 SoulDrain/153 ShadowFlame/169 BoneJavelin/183 StardustBleed/
 *  189 Daybreak/203 BetsysCurse/204 Oiled/323 OnFire3/324 Frostburn2/337 TentacleSpike/
 *  344 BloodButcherer/375 Hemorrhage——Enemy 无对应 DoT/减益字段,命中静默跳过
 *  (表数据完整,字段补齐后自动生效) */
const SUPPORTED: Record<number, string> = {
  24: 'onFireT',     // On Fire!(NPC.cs:92619 lifeRegen-8 = 4 HP/s)
  20: 'poisonT',     // Poisoned(-12 → 6 HP/s,:92590)
  70: 'venomT',      // Venom(-60 → 30 HP/s,:92706)
  39: 'cursedT',     // Cursed Inferno(onFire2,-48 → 24 HP/s,:92690)
  31: 'confusedT',   // Confused(TargetClosest direction 反转,:78569)
  69: 'ichorT',      // Ichor(防御 -15;repo 近似=armorPen 7,Enemy.ts:4132)
  72: 'midasT',      // Midas(掉钱 ×1.10-1.51,Enemy.ts:4286 rollCoins)
};

type StatusEnemy = { [field: string]: number | undefined };

/** 命中结算侧调用:按投射物型号掷骰并施加 debuff(AddBuff max 合并语义)。
 *  duration 掷骰 Next(durMin, durMax+1) tick → 秒(/60) */
export function applyProjStatus(projId: number | undefined, enemy: StatusEnemy): void {
  if (projId === undefined || projId < 0) return;
  const entries = TABLE[String(projId)];
  if (!entries) return;
  for (const en of entries) {
    if (Math.random() >= en.chance) continue;
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
