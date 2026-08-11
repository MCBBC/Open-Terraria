// 原版星璇塔 / 天界入侵（Lunar Pillars / Lunar Events）1:1 移植（Terarria1456 / 1.4.5.6）。
// 反编译字段：塔 = NPC.LunarTowerSolar(517) / LunarTowerVortex(422) / LunarTowerNebula(507) /
// LunarTowerStardust(493)（aiStyle 94，见 Enemy.towerAI），事件总开关 NPC.LunarApocalypseIsUp，
// 护盾 NPC.ShieldStrengthTower{Solar,Vortex,Nebula,Stardust}。
//
// 源码锚点：
// - 触发 TriggerLunarApocalypse          WorldGen.cs:87371-87436（教徒 439 死亡，NPC.cs:80194-80197）
// - 收尾 UpdateLunarApocalypse           WorldGen.cs:87438-87493（四塔全灭 → StartImpendingDoom）
// - 月总倒计时 StartImpendingDoom        WorldGen.cs:87495-87506（3600t + Lang.misc[52] + 清教徒）
// - 倒计时递减/归零召月总                 Main.cs:64452-64459
// - 公告 MessageLunarApocalypse          WorldGen.cs:87523-87546（misc[43+已倒数]，BossOrEvent 色）
// - 扣盾 629 TowerDamageBolt 命中         Projectile.cs:69784-69819（盾-1、塔 ai[3]=1 闪光）
// - 发弹（本组怪死亡）                    NPC.cs:80080-80121
// - 塔死 downedTower_*                    NPC.cs:80122-80146
// - 护盾上限 ShieldStrengthTowerMax       NPC.cs:6723-6734（downedMoonlord ? 50 : 100）
// - 存档 WorldFile.cs:1352-1360 / 2220-2245（盾值不存；TowerActive=true 读档重置满盾）
//
// 状态挂 World.lunarEvent（运行时）。持久化只走 World.flags（downedTower*/towerActive*/
// lunarApocalypseUp——flags 整体进存档），盾值与倒计时**不存档**（对齐原版）。
import type { World } from './World';
import type { RNG } from '../core/rng';
import { Lang } from '../i18n/Lang';

/** 四塔 NPC id（NPCID.cs） */
export const TOWER_SOLAR = 517;
export const TOWER_VORTEX = 422;
export const TOWER_NEBULA = 507;
export const TOWER_STARDUST = 493;
export const TOWER_IDS = [TOWER_SOLAR, TOWER_VORTEX, TOWER_NEBULA, TOWER_STARDUST] as const;

export type TowerKey = 'solar' | 'vortex' | 'nebula' | 'stardust';
/** 塔 id → 内部键（WorldFile 字段名同源：TowerActiveSolar 等） */
export const TOWER_KEY: Record<number, TowerKey> = {
  [TOWER_SOLAR]: 'solar', [TOWER_VORTEX]: 'vortex',
  [TOWER_NEBULA]: 'nebula', [TOWER_STARDUST]: 'stardust',
};
const TOWER_CAP: Record<TowerKey, string> = {
  solar: 'Solar', vortex: 'Vortex', nebula: 'Nebula', stardust: 'Stardust',
};
export const TOWER_KEYS: TowerKey[] = ['solar', 'vortex', 'nebula', 'stardust'];
export function isTowerId(id: number | null | undefined): boolean {
  return id != null && id in TOWER_KEY;
}

/** 塔护盾/尘色（原版 ForceField 着色器 + 分塔尘埃色 127/229/242/135 的 CSS 近似；
 *  渲染端 drawTowerShield 与 Enemy.towerAI 死亡演出尘共用） */
export const TOWER_SHIELD_COLOR: Record<number, string> = {
  [TOWER_SOLAR]: '255,176,96',
  [TOWER_VORTEX]: '108,224,200',
  [TOWER_NEBULA]: '224,112,224',
  [TOWER_STARDUST]: '124,184,255',
};

/** LunarEventState 运行时形状（World.lunarEvent） */
export interface LunarEventState {
  /** NPC.LunarApocalypseIsUp */
  active: boolean;
  /** NPC.TowerActive{Solar,Vortex,Nebula,Stardust} */
  towerActive: Record<TowerKey, boolean>;
  /** NPC.ShieldStrengthTower*（不进存档） */
  shield: Record<TowerKey, number>;
  /** NPC.MoonLordCountdown / MaxMoonLordCountdown（不进存档；0=无倒计时） */
  moonLordCountdown: number;
  moonLordCountdownMax: number;
}

export function newLunarEventState(): LunarEventState {
  return {
    active: false,
    towerActive: { solar: false, vortex: false, nebula: false, stardust: false },
    shield: { solar: 0, vortex: 0, nebula: 0, stardust: 0 },
    moonLordCountdown: 0,
    moonLordCountdownMax: 0,
  };
}

/** ShieldStrengthTowerMax（NPC.cs:6723-6734）：LunarShieldPowerNormal=100，downedMoonlord 减半。
 *  本仓 downedMoonlord = flags['downed_398']（Game 击杀链通用置位 downed_<vanillaId>） */
export function shieldMax(w: World): number {
  return w.flags['downed_398'] ? 50 : 100;
}

/** Game 侧宿主回调（造塔/广播/清教徒/召月总——避免本模块反向依赖 Game） */
export interface LunarHost {
  /** 在 (tx,ty) tile 坐标生成塔 NPC（NewNPC 语义） */
  spawnTowerNpc(id: number, tx: number, ty: number): void;
  /** BroadcastText（颜色 = ChatColors；misc 文案 BossOrEvent 175/75/255、misc52 World 50/255/130） */
  broadcast(text: string, r: number, g: number, b: number): void;
  /** GetRidOfCultists（WorldGen.cs:87508-87521：移除 437/438/379） */
  clearCultists(): void;
}

/** flags ⇄ 运行时同步（写侧：状态变化后调用；flags 整体随存档落盘） */
function persist(w: World): void {
  const s = w.lunarEvent;
  for (const k of TOWER_KEYS) w.flags[`towerActive${TOWER_CAP[k]}`] = s.towerActive[k];
  w.flags['lunarApocalypseUp'] = s.active;
}

/** 读档回填（对齐 WorldFile.cs:2220-2245 尾段）：TowerActive=true 的塔盾值重置满盾；
 *  盾值/倒计时本身不存档。SaveFile.loadSaveData 在 flags 赋值后调用 */
export function applyLunarSave(w: World): void {
  const s = w.lunarEvent;
  s.active = !!w.flags['lunarApocalypseUp'];
  const max = shieldMax(w);
  for (const k of TOWER_KEYS) {
    s.towerActive[k] = !!w.flags[`towerActive${TOWER_CAP[k]}`];
    s.shield[k] = s.towerActive[k] ? max : 0;
  }
  s.moonLordCountdown = 0;
  s.moonLordCountdownMax = 0;
}

/** 区域 x1..x2 / y1..y2 是否全非实心（Collision.SolidTiles 近似——本仓无视 slope） */
function solidTiles(w: World, x1: number, x2: number, y1: number, y2: number): boolean {
  const st = w.store;
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      if (!st.inBounds(x, y)) continue;
      if (st.isSolid(x, y)) return true;
    }
  }
  return false;
}

/**
 * TriggerLunarApocalypse（WorldGen.cs:87371-87436，1:1）：
 * 四塔 id 洗牌分配到 4 个等距列（x = maxTilesX/5 ×(1+j)），每列 x 抖动 ±100 格，
 * 自 worldSurface 向下找首个非实心窗口（x±10 格 / 上 20 下 15 格净空），30 次尝试
 * 失败兜底 (列x, worldSurface-40)。塔就位后 TowerActive 四置位、盾值 = Max、
 * 播 MessageLunarApocalypse（misc[43+0] 天界入侵）。
 * 偏差：remix/getGood 深层支省略；PlayerLOS（与玩家视线）未接入 → 只按 SolidTiles 判窗
 * （触发时机教徒刚死、窗口在地表开阔带，与原版结果一致）。
 */
export function triggerLunarApocalypse(w: World, rng: RNG, host: LunarHost): void {
  const list = [TOWER_SOLAR, TOWER_VORTEX, TOWER_NEBULA, TOWER_STARDUST];
  const order: number[] = [];
  for (let i = 0; i < 4; i++) {
    order[i] = list[rng.int(0, list.length - 1)];   // Main.rand.Next(list.Count)
    list.splice(list.indexOf(order[i]), 1);
  }
  const colX = Math.floor(w.w / 5);                  // Main.maxTilesX / 5
  const surface = Math.floor(w.groundLevel);         // (int)Main.worldSurface
  for (let j = 0; j < 4; j++) {
    const num3 = colX * (1 + j);
    let placed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const jitter = rng.int(-100, 100);             // Main.rand.Next(-100, 101)
      for (let y = surface; y > 100; y--) {
        if (!solidTiles(w, num3 + jitter - 10, num3 + jitter + 10, y - 20, y + 15)) {
          host.spawnTowerNpc(order[j], num3 + jitter, y);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) host.spawnTowerNpc(order[j], num3, surface - 40);
  }
  const s = w.lunarEvent;
  s.towerActive.solar = s.towerActive.vortex = true;
  s.towerActive.nebula = s.towerActive.stardust = true;
  s.active = true;
  const max = shieldMax(w);
  s.shield.solar = s.shield.vortex = s.shield.nebula = s.shield.stardust = max;
  persist(w);
  messageLunarApocalypse(w, host);                   // MessageLunarApocalypse（misc[43]）
}

/** MessageLunarApocalypse（WorldGen.cs:87523-87546）：数已灭塔 n → Lang.misc[43+n]
 *  （43 天界入侵 / 44 头脑麻木 / 45 痛苦 / 46 阴森低语；47 需 n=4 此时 active 已 false 不可达） */
export function messageLunarApocalypse(w: World, host: LunarHost): void {
  if (!w.lunarEvent.active) return;
  let downed = 0;
  for (const k of TOWER_KEYS) if (!w.lunarEvent.towerActive[k]) downed++;
  host.broadcast(Lang.misc(43 + downed), 175, 75, 255);   // ChatColors.BossOrEvent
}

/**
 * UpdateLunarApocalypse（WorldGen.cs:87438-87493）：场上无对应塔 NPC → TowerActive 置 false；
 * 四塔全灭且无 398 → StartImpendingDoom(3600)。has = 场上是否存在该 id 的存活 NPC（调用方遍历）。
 */
export function updateLunarApocalypse(w: World, has: (id: number) => boolean, host: LunarHost): void {
  if (!w.lunarEvent.active) return;
  const s = w.lunarEvent;
  if (!has(TOWER_SOLAR)) s.towerActive.solar = false;
  if (!has(TOWER_VORTEX)) s.towerActive.vortex = false;
  if (!has(TOWER_NEBULA)) s.towerActive.nebula = false;
  if (!has(TOWER_STARDUST)) s.towerActive.stardust = false;
  persist(w);
  if (!s.towerActive.solar && !s.towerActive.vortex && !s.towerActive.nebula
    && !s.towerActive.stardust && !has(398)) {
    startImpendingDoom(w, 3600, host);
  }
}

/** StartImpendingDoom（WorldGen.cs:87495-87506）：关事件 + 倒计时 3600t（60s）+
 *  Lang.misc[52]（ChatColors.World 50/255/130）+ 清教徒 */
export function startImpendingDoom(w: World, countdownTime: number, host: LunarHost): void {
  const s = w.lunarEvent;
  s.active = false;
  s.moonLordCountdownMax = countdownTime;
  s.moonLordCountdown = countdownTime;
  persist(w);
  host.broadcast(Lang.misc(52), 50, 255, 130);
  host.clearCultists();
}

/** 塔真死（NPC.cs:80122-80146）：downedTower_X=true、TowerActive_X=false、
 *  UpdateLunarApocalypse + MessageLunarApocalypse（顺序 1:1——Update 可能触发 doom 关事件，
 *  随后的 Message 因 active=false 不播） */
export function onTowerKilled(w: World, towerId: number, has: (id: number) => boolean, host: LunarHost): void {
  const key = TOWER_KEY[towerId];
  if (!key) return;
  w.flags[`downedTower${TOWER_CAP[key]}`] = true;
  w.lunarEvent.towerActive[key] = false;
  persist(w);
  updateLunarApocalypse(w, has, host);
  messageLunarApocalypse(w, host);
}

/** ---- 扣盾归属表（NPC.cs:80080-80121：本组怪死亡 → 629 → 对应塔）----
 *  日耀 412/413/414/415/416/417/418/419/518 → 517；星旋 425/426/427/429 → 422；
 *  星云 420/421/423/424 → 507；星尘 402/405/407/409/411 → 493。
 *  （406/408/410/413/414/416/428 是分裂/伴生怪，不扣盾——不在表内即不扣。） */
export const MINION_TOWER: Record<number, TowerKey> = (() => {
  const m: Record<number, TowerKey> = {};
  for (const id of [412, 413, 414, 415, 416, 417, 418, 419, 518]) m[id] = 'solar';
  for (const id of [425, 426, 427, 429]) m[id] = 'vortex';
  for (const id of [420, 421, 423, 424]) m[id] = 'nebula';
  for (const id of [402, 405, 407, 409, 411]) m[id] = 'stardust';
  return m;
})();

/** 击杀怪是否扣盾（发 629 的门：对应塔盾 >0，NPC.cs:80089 等） */
export function isTowerMinion(vanillaId: number | null | undefined): boolean {
  return vanillaId != null && vanillaId in MINION_TOWER;
}

/** 本组怪死亡 → 扣盾 1（Projectile.cs:69784-69819 命中段 1:1）。
 *  返回被扣盾的塔 id（调用方负责视觉：塔 ai3=1 闪光 + 红色追踪弹尾迹）；
 *  flash = 扣盾前盾值非 0（原版命中时 shield!=0 才置塔 ai[3]=1）；null = 不扣（盾已空/非本组怪） */
export function onMinionKilled(w: World, vanillaId: number): { tower: number; flash: boolean } | null {
  const key = MINION_TOWER[vanillaId];
  if (!key) return null;
  const s = w.lunarEvent;
  const before = s.shield[key];
  if (before <= 0) return null;   // 原版发弹门：ShieldStrengthTower* > 0 才发 629
  s.shield[key] = Math.max(0, Math.min(shieldMax(w), before - 1));
  const towerId = TOWER_IDS.find((t) => TOWER_KEY[t] === key)!;
  return { tower: towerId, flash: true };
}

/** SceneMetrics.NPCEventZoneRadius（SceneMetrics.cs:31）= 250 格 */
export const TOWER_ZONE_RADIUS = 4000;

/** 月总倒计时递减（Main.cs:64452-64459）：>0 每 tick -1，归零由调用方召 398。
 *  返回 true = 本 tick 归零（调用方立即 SpawnOnPlayer(最近玩家, 398)） */
export function tickMoonLordCountdown(w: World): boolean {
  const s = w.lunarEvent;
  if (s.moonLordCountdown <= 0) return false;
  s.moonLordCountdown--;
  return s.moonLordCountdown <= 0;
}
