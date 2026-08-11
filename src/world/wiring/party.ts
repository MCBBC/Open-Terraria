// 派对系统（BirthdayParty.cs 1:1 精简核——ManualParty 手动分支）。
// 天塔柱 455 电路触发（Wiring.cs:2037-2039）与右键（Player.cs:31809-31814）共用
// ToggleManualParty；入夜 CheckNight（:40-53）结束并粉字广播 Lang.misc[99]。
// PartyIsUp = ManualParty || GenuineParty（:26-34）。
// 【依赖登记】GenuineParty（NPC 生日自然派对：CheckMorning NaturalAttempt :62-143，
// 需城镇 NPC 生日/入住计数）与 CelebratingNPCs（派对帽 NPC + 彩带粒子，TownNPC 渲染层）
// 未接入——当前只有 ManualParty 链路生效。
export interface PartyState {
  /** BirthdayParty.ManualParty */
  manualParty: boolean;
}

export function newPartyState(): PartyState {
  return { manualParty: false };
}

/** BirthdayParty.PartyIsUp（:26-34；GenuineParty 恒 false，见文件头依赖登记） */
export function partyIsUp(s: PartyState): boolean {
  return s.manualParty;
}

/** ToggleManualParty（:145-163）：翻转 ManualParty，返回 PartyIsUp 是否变化 */
export function toggleManualParty(s: PartyState): boolean {
  const was = partyIsUp(s);
  s.manualParty = !s.manualParty;
  return was !== partyIsUp(s);
}

/** CheckNight（:40-53）：入夜结算——派对进行中则结束并要求广播 Lang.misc[99]
 *  （"派对时间结束！"，粉 255,0,160）。返回 true = 需要广播 */
export function partyCheckNight(s: PartyState): boolean {
  let flag = false;
  if (s.manualParty) {
    flag = true;
    s.manualParty = false;
  }
  return flag;
}

/** WorldClear（:182-190）：切世界/清档复位 */
export function partyWorldClear(s: PartyState): void {
  s.manualParty = false;
}
