/**
 * GetMeleeCollisionData 玩家接触侧全量移植（NPC.cs:96111-96280，Terarria1457）。
 *
 * 原版消费方 Update_NPCCollision（Player.cs:31557-31668）单循环语义：
 *   ①specialHitSetter 缺省 General，接触族 {396,397,398,400,401·636} 先行改 BossNoCheese
 *     （:31571-31587 —— 本仓 player/HurtCooldownBuckets.ts npcContactBucketId）；
 *   ②npcRect=npc.Hitbox、damageMultiplier=1 → GetMeleeCollisionData(rectangle,i,
 *     ref specialHitSetter, ref damageMultiplier, ref npcRect)（:31597-31600）——本函数
 *     亲读移植面：变形/替换接触盒 + 接触伤害乘区 +（仅 576/577 帧窗）specialHitSetter=2；
 *   ③`rectangle.Intersects(npcRect)`（:31601）后才结算；
 *   ④乘区消费点 = `num4 = Main.DamageVar(npc.damage × damageMultiplier, −luck)`
 *     （:31624）——【 Hurt 前】的非掷骰基准，banner(:31626-28)/thorns/cactus 反射
 *     (:31605-31668 A1 面)/resistCold(:31657-59) 全部以它为共同基准；本仓对位 =
 *     damageVar(def.damage × multiplier, −luck) 进 Game.damagePlayer 漏斗。
 *
 * 各分支锚（1457 NPC.cs 行号逐条）：else-if 链顺序即移植顺序，一怪只走一支：
 *   96114-96127  430-436（ArmedZombie 族）+591 ArmedTorchZombie：ai[2]>5（AI_003
 *                近战挥击窗，:58840-58910 驱动）→ 接触盒朝向侧加宽 34px（spriteDirection）
 *                且 ×1.25——无相交门，加宽恒生效（原盒为子集）。
 *   96128-96141  494-495 Crawdad/Crawdad2：同支 18px / ×1.25（驱动同 :58858 联合条件）。
 *   96143-96144  400 MoonLordFreeEye 真眼：npcRect=default ⇒ 永不相交（真眼不造成
 *                任何接触伤——上轮已接我方挥击侧 Game.ts:22352-22364 与此对称）。
 *   96146-96158  460 Butcher 屠夫专盒：30×14，X=(int)Center.X（direction<0 左移身宽）、
 *                Y=(int)position.Y+height−20（脚部 −20px）；命中该盒才替换并 ×1.35，
 *                未命中原盒照常（×1.0 全身判定）。
 *   96161-96167  417 SolarSroller：ai[0]==6（日耀滚动态）∧ ai[3]∈(0,4)（AI_039 撞击
 *                尘爆子计数 ：29724-29756 弹跳窗）→ CenteredRectangle(Center,100²)
 *                （Utils.cs:961-964 (int)(c−size/2) 截断形）替换 + ×1.35。
 *   96170-96182  466 Psycho 精神病人：30×8 @脚部−32，命中替换 + ×1.75。
 *   96185-96235  576/577 DD2Ogre T2/T3：frame.Y∈[15,18]（FindFrame case 576/577
 *                NPC.cs:68354-68399 的 ai0>0&&ai1==0 近挥窗内格）→ specialHitSetter=2
 *                【先于相交判定置位】：近挥格无论擦没擦到专盒都换 LegacyUnused2 桶，
 *                擦到才再换 npcRect+×1.75。专盒几何（num3=X 向偏置×direction、
 *                num4=Y 补偿、Y=(int)Center.Y−Height+num4）逐字照录：
 *                  y15→120×30 (num4=24) | y16→120×60 (num3=10) |
 *                  y17→100×90 (num3=50) | y18→100×50 (num3=90,num4=10)
 *   96239-96251  552-554 DD2Goblin T1-T3：ai[0]∈(0,24)（AI_107 近战前摇倒计尾段，
 *                :64363-64367 e.ai0=num5 起手倒数）→ 34×14 @脚部−20 替换 + ×1.35。
 *   96253-96278  668 Deerclops：npcRect.Height−=80 无条件（下半身接触裁剪，帧门外）；
 *                frame.Y==15 ∧ ai[0]!=4 → 64×180 斧臂盒：X=(int)Center.X−(−42)×
 *                direction（=Center.X+42×direction）、Y=(int)Center.Y−180+80，
 *                命中替换；无乘区。
 *
 * 数值口径：C# (int) 截断一律 Math.trunc；Rectangle.Intersects 严格重叠四式与
 * Entity.aabbOverlaps 同构（边缘相贴=不相交）。spriteDirection/direction 对四类源型
 * （ArmedZombie/Crawdad=fighterAI 走动画逐拍 spriteDirection=direction；Butcher/
 * Psycho/DD2 族 FindFrame 显式同写）恒等 ⇒ 单入口 direction 一参双用有证明。
 */

export interface ContactBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 求解入参（Enemy 投影：坐标世界像素 px）。 */
export interface MeleeCollisionInput {
  vanillaId: number;
  ai0: number;
  ai1?: number;
  ai2?: number;
  ai3?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 原 npc.direction（±1）。 */
  direction: -1 | 1;
  /** 原 npc.spriteDirection——本批四源型已证 ≡ direction（文件头注），独立字段保形。 */
  spriteDirection?: -1 | 1;
  /** 原 FindFrame 帧索引（仅 576/577、668 消费；null=引擎未落盘→按窗外处理）。 */
  frameY?: number | null;
}

export interface MeleeCollisionResult {
  /** 变形后的接触盒；null = 原版 npcRect=default（永不相交，type 400）。 */
  rect: ContactBox | null;
  damageMultiplier: number;
  /** specialHitSetter 覆写：null=维持调用方缺省桶；数值=覆盖值（当前仅 2=LegacyUnused2）。 */
  specialHitSetterOverride: number | null;
}

/** Rectangle.Intersects 四不等式（严格重叠；两轴同时半开区间交叠才算），与
 *  Entity.aabbOverlaps 字面对齐。 */
export function boxesIntersect(a: ContactBox, b: ContactBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const trunc = Math.trunc;

/**
 * 完整 else-if 链 1:1。victim 为玩家像素盒（Update_NPCCollision 的 rectangle 参数）。
 */
export function getMeleeCollisionData(
  victim: ContactBox,
  e: MeleeCollisionInput,
): MeleeCollisionResult {
  const t = e.vanillaId;
  const ai2 = e.ai2 ?? 0;
  const sdir = e.spriteDirection ?? e.direction;
  // 初值 = npc.Hitbox 投影（:31598 rectangle 域的 npcRect 同源）
  let rect: ContactBox = { x: e.x, y: e.y, w: e.w, h: e.h };
  let mult = 1;
  let special: number | null = null;

  if ((t >= 430 && t <= 436 || t === 591) && ai2 > 5) {
    const num = 34;                                    // :96116
    if (sdir < 0) {
      rect.x -= num;                                   // :96119
    }
    rect.w += num;                                     // :96120/:96124
    mult *= 1.25;                                      // :96126
  } else if ((t === 494 || t === 495) && ai2 > 5) {
    const num2 = 18;                                   // :96129
    if (sdir < 0) {
      rect.x -= num2;                                  // :96133
    }
    rect.w += num2;                                    // :96134/:96138
    mult *= 1.25;                                      // :96140
  } else if (t === 400) {
    return { rect: null, damageMultiplier: 1, specialHitSetterOverride: null };  // :96143-96144
  } else if (t === 460) {
    const box: ContactBox = { x: trunc(e.x + e.w / 2), y: 0, w: 30, h: 14 };
    if (e.direction < 0) box.x -= box.w;               // :96151-96153
    box.y = trunc(e.y) + e.h - 20;                     // :96154（Y=(int)pos.Y+height−20）
    if (boxesIntersect(victim, box)) {
      rect = box;
      mult *= 1.35;                                    // :96157-96158
    }
  } else if (t === 417 && e.ai0 === 6 && (e.ai3 ?? 0) > 0 && (e.ai3 ?? 0) < 4) {
    // Utils.CenteredRectangle(Center,(100,100))：(int)(cx−50),(int)(cy−50),100,100
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;       // Center 浮点直读（截断只作用结果位）
    const box: ContactBox = { x: trunc(cx - 50), y: trunc(cy - 50), w: 100, h: 100 };
    if (boxesIntersect(victim, box)) {
      rect = box;
      mult *= 1.35;                                    // :96165-96167
    }
  } else if (t === 466) {
    const box: ContactBox = { x: trunc(e.x + e.w / 2), y: 0, w: 30, h: 8 };
    if (e.direction < 0) box.x -= box.w;               // :96175-96177
    box.y = trunc(e.y) + e.h - 32;                     // :96178（脚部−32）
    if (boxesIntersect(victim, box)) {
      rect = box;
      mult *= 1.75;                                    // :96181-96182
    }
  } else if (t === 576 || t === 577) {
    // Rectangle rectangle4 = new Rectangle(0,0,30,8);switch(frame.Y)：y15/16/17/18 四档
    const frameY = e.frameY ?? null;
    let box: ContactBox | null = null;
    if (frameY != null) {
      switch (frameY) {
        case 15:
          special = 2;                                  // :96195-96198
          box = { x: 0, y: 0, w: 120, h: 30 };          // Width=120,Height=30,num4(offsetY)=24
          break;
        case 16:
          special = 2;                                  // :96201-96204
          box = { x: 0, y: 0, w: 120, h: 60 };          // num3(offsetX)=10
          break;
        case 17:
          special = 2;                                  // :96207-96210
          box = { x: 0, y: 0, w: 100, h: 90 };          // num3=50
          break;
        case 18:
          special = 2;                                  // :96213-96218
          box = { x: 0, y: 0, w: 100, h: 50 };          // num3=90,num4=10
          break;
        default:
          box = null;                                   // flag=false：窗内未驱动的帧序
          break;
      }
      if (box) {
        const ox = [0, 10, 50, 90][frameY - 15];         // num3
        const oy = [24, 0, 0, 10][frameY - 15];          // num4
        const dir = e.direction as -1 | 1;
        box.x = trunc(e.x + e.w / 2) - ox * dir;         // :96224 X=Center.X−num3×direction
        if (dir < 0) box.x -= box.w;                     // :96225-96227
        box.y = trunc(e.y + e.h / 2) - box.h + oy;       // :96228 Y=Center.Y−Height+num4
        if (boxesIntersect(victim, box)) {
          rect = box;
          mult *= 1.75;                                  // :96231-96235
        }
      }
    }
  } else if ((t === 552 || t === 553 || t === 554) && e.ai0 > 0 && e.ai0 < 24) {
    const box: ContactBox = { x: trunc(e.x + e.w / 2), y: 0, w: 34, h: 14 };
    if (e.direction < 0) box.x -= box.w;               // :96243-96245
    box.y = trunc(e.y) + e.h - 20;                     // :96246
    if (boxesIntersect(victim, box)) {
      rect = box;
      mult *= 1.35;                                    // :96249-96251
    }
  } else {
    if (t !== 668) {
      return { rect, damageMultiplier: mult, specialHitSetterOverride: special };  // :96255-96258
    }
    rect.h -= 80;                                      // :96260 无条件裁剪下半身
    if (e.frameY === 15 && e.ai0 !== 4) {              // :96262-96273（ai[0]==4 拒支）
      const dir = e.direction as -1 | 1;
      const box: ContactBox = { x: trunc(e.x + e.w / 2), y: 0, w: 64, h: 180 };
      box.x = trunc(e.x + e.w / 2) - (-42) * dir;      // :96271 num5=−42 ⇒ +42×direction
      if (dir < 0) box.x -= box.w;                     // :96272-96274
      box.y = trunc(e.y + e.h / 2) - box.h + 80;       // :96275 num6=80
      if (boxesIntersect(victim, box)) {
        rect = box;                                    // 无乘区（本支不动 mult）
      }
    }
  }
  return { rect, damageMultiplier: mult, specialHitSetterOverride: special };
}
