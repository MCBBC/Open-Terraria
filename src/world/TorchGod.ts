// 原版 Torch God 彩蛋事件 1:1（Player.cs:17585-17770 + UpdateTorchLuck :17923-17939）：
//   触发（:17923-17939 门,五条件缺一不可）：torchGodCooldown≤0 && !unlockedBiomeTorches
//         && 点燃火把>100 && !happyFunTorchTime && y>worldSurface 且背包无 5043
//         （Torch God's Favor,:17928-17935 背包扫描）→ happyFunTorchTime=true
//   进行（每 tick,TryRecalculatingTorchLuck :17582-17587 短路 → TorchAttack）：
//         y < worldSurface → EndOngoing（批量复燃,无掉落 :17569-17578）；
//         AddBuff(80 Blackout,2t)（:17671;视野压暗走 updateLightDecay ×0.85）；
//         funTimer++ >20 → 每 21 tick：扫 ±100 tile 盒点燃火把（容量=maxTorchAttacks
//         =200,:2938）→ 无剩余或 attacks≥200 → 复燃全部+结束（attacks≥95 掉 5043
//         :17719-17724）；否则随机熄一根（frameX+=66）+ 向玩家发射 proj 949 TorchGod
//         （speed 8、射程=发射时距离 ai[1]、ai[0]=TorchID.Dust[样式]）；（余 1 根且
//         ≥95）|| attacks≥200 → funTimer=-180（3s 终幕延迟 :17761-17766）
//   冷却：结束后 3600 tick 不再触发（RelightTorches 设 torchGodCooldown=3600 :17648）
//   弹幕 AI_184（cs:40100）：直线飞行无追踪，射程(ai1)耗尽前 tileCollide=false、
//         之后撞块即毁；命中玩家伤 20（num8=20f :17744;本仓弹侧按 1457 难度档
//         40×multiplier,见 WeaponProj TorchGodProj 注）
//   ★664 无生成路径（全量核查：NewNPC/SetDefaults(664) 仅图鉴记账 Player.cs:37113
//         进世界已解锁/:44618 使用 5043——事件实体=弹幕 949 群+熄灭火把演出）。
//         图鉴记账在 5043 使用侧（Game.ts case 5043）+ 进世界已解锁回填，不在事件尾
// SW-BJ38（2026-09-09）：触发/攻击双扫描窗口基补 Math.floor——原版窗基=(int)Center/16
//   （:17867-17869 触发 ±40 / :17949-17951 攻击 ±100）,host.playerTile 是浮点中心,
//   分数下标进 TileStore.idx=typed array 全 undefined=整窗死读=事件永不触发
//   （实报:地下平台摆 75-90 支无事件;旧测试夹具 ptile 全整数掩盖本症）;
//   +abort()=EndOngoingTorchGodEvent 死亡出口（KillMe :39155-39157,Game.settlePlayerDeath 接线）
import type { TileStore } from './TileStore';
import { TILE_DEFS } from '../data/tiles';
import { TORCH_DUST_BY_STYLE } from './Torch';

export interface TorchGodHost {
  store: TileStore;
  worldSurface: number;
  /** 玩家 tile 坐标（中心像素/TILE 的浮点值）——扫描窗口由消费端 floor
   *  （原版 (int)Center/16 :17867-17869/:17949-17951）,弹道 aim 用浮点原值 */
  playerTile: () => { x: number; y: number } | null;
  /** :17924 门——unlockedBiomeTorches（5043 已用过）后事件永不再触发 */
  unlockedBiomeTorches: () => boolean;
  /** 背包是否持有原版物品（5043 Torch God's Favor） */
  hasVanillaItem: (vanillaId: number) => boolean;
  /** 发射火把弹幕（朝玩家，速度 8，射程 px，ai[0]=TorchID.Dust[被熄样式]） */
  spawnTorchBolt: (x: number, y: number, vx: number, vy: number, rangePx: number, dustType: number) => void;
  /** 掉落物品（原版 item id） */
  dropVanillaItem: (vanillaId: number, px: number, py: number) => void;
  /** 黑暗视野开关（buff 80 Blackout → updateLightDecay ×0.85） */
  setBlackout: (on: boolean) => void;
}

const TORCH_UNLIT_OFFSET = 66;
const MAX_ATTACKS = 200;

export class TorchGodEvent {
  active = false;
  /** torchGodCooldown（:17926 结束后 3600） */
  cooldown = 0;
  attacks = 0;
  private funTimer = 0;
  /** 本次事件熄灭的火把坐标（结束批量复燃，RelightTorches :17648-17660） */
  private unlit: Array<[number, number]> = [];
  private scanTick = 0;

  constructor(private host: TorchGodHost) {}

  /** Game.fixedUpdate 每 tick 调用 */
  update(): void {
    if (this.active) { this.step(); return; }
    if (this.cooldown > 0) { this.cooldown--; return; }
    // 触发扫描（UpdateTorchLuck :17604-17640 逐行累积 nearbyTorches 的净效果 =
    // 81×81 带（num2=40,:17611-17612）点燃计数；这里每 60t 直扫等价节流）
    if (++this.scanTick % 60 !== 0) return;
    const p = this.host.playerTile();
    if (!p || p.y <= this.host.worldSurface) return;
    // :17924 门——已解锁（用过 5043）永不再触发（★曾缺此门=解锁后摆满火把仍反复触发）
    if (this.host.unlockedBiomeTorches()) return;
    // :17928-17935 背包扫描——持有 5043 则不开事件（拿到奖励未用也压门）
    if (this.host.hasVanillaItem(5043)) return;
    const st = this.host.store;
    // 窗口基 = 原版 (int)Center/16 ±40（TryRecalculatingTorchLuck :17866-17871;
    // 1456 :17609-17614）——playerTile 是浮点中心（cx/TILE 恒带分数）,必须 floor
    // 再进 idx:分数下标 y*w+x 在 typed array 上恒 undefined = 整窗死读 = 触发
    // 永不成立（SW-BJ38 实报:地下摆 75-90 支永无事件;旧夹具 ptile 全整数掩盖本症）
    const px = Math.floor(p.x), py = Math.floor(p.y);
    let lit = 0;
    for (let x = Math.max(10, px - 40); x <= Math.min(st.w - 10, px + 40); x++) {
      for (let y = Math.max(10, py - 40); y <= Math.min(st.h - 10, py + 40); y++) {
        const i = st.idx(x, y);
        if (st.flags[i] && TILE_DEFS[st.type[i]]?.vanilla?.sheet === 4 && st.frameX[i] < TORCH_UNLIT_OFFSET) lit++;
      }
    }
    if (lit > 100) {
      this.active = true;
      this.attacks = 0;
      this.funTimer = 0;
      this.unlit.length = 0;
      this.host.setBlackout(true);
    }
  }

  /** EndOngoingTorchGodEvent（Player.cs:17834-17843;两处调用:死亡 KillMe :39155-39157、
   *  升回地表 TorchAttack :17935-17939）：仅事件进行中才收尾（happyFunTorchTime 门
   *  原样）——复燃全部 + 3600 冷却 + 关 Blackout,无掉落。SW-BJ38 补（死亡出口此前
   *  无接线:事件中死亡 → blackout 悬挂 + 熄炬不复原） */
  abort(): void {
    if (this.active) this.end();
  }

  private step(): void {
    const p = this.host.playerTile();
    // 回到地表 → EndOngoingTorchGodEvent（:17664-17668;1457 :TorchAttack surface 支 :17935-17939）
    if (!p || p.y <= this.host.worldSurface) { this.end(); return; }
    // AddBuff(80, 2)（每 tick 刷新的 Blackout）
    this.host.setBlackout(true);
    // TorchAttack 主体（:17669-17677）：funTimer ≤20 直接返回；>20 清零走一轮
    this.funTimer++;
    if (this.funTimer <= 20) return;
    this.funTimer = 0;
    const st = this.host.store;
    // 扫 ±100 tile 盒内点燃火把（:17683-17705；容量=_torchAttackPosX.Length=
    // maxTorchAttacks=200 :2938——★曾写 500 与原版容量不符）
    // 盒基同触发窗取整：(int)Center/16 ±100（TorchAttack :17949-17952）——
    // SW-BJ38 floor 修复（下方 aim 仍用浮点 p,原版 base.Center 不取整 :18012）
    const px = Math.floor(p.x), py = Math.floor(p.y);
    const lit: Array<[number, number]> = [];
    for (let x = Math.max(10, px - 100); x <= Math.min(st.w - 10, px + 100); x++) {
      for (let y = Math.max(10, py - 100); y <= Math.min(st.h - 10, py + 100); y++) {
        const i = st.idx(x, y);
        if (st.flags[i] && TILE_DEFS[st.type[i]]?.vanilla?.sheet === 4 && st.frameX[i] < TORCH_UNLIT_OFFSET) {
          lit.push([x, y]);
          if (lit.length >= MAX_ATTACKS) break;
        }
      }
      if (lit.length >= MAX_ATTACKS) break;
    }
    if (lit.length === 0 || this.attacks >= MAX_ATTACKS) {
      this.end(true);
      return;
    }
    // 随机熄一根（frameX += 66）+ 弹幕（:17733-17766）
    const [tx, ty] = lit[Math.floor(Math.random() * lit.length)];
    const ti = st.idx(tx, ty);
    st.frameX[ti] += TORCH_UNLIT_OFFSET;
    this.unlit.push([tx, ty]);
    this.attacks++;
    const sx = tx * 16 + 8, sy = ty * 16;
    // 瞄准玩家中心（:17754 vector=火把顶,(num5*16+8,num6*16);vector2=base.Center−vector
    // ——playerTile 已是中心像素/16 的浮点值,×16 即中心 px,★曾多 +8=瞄右肩 8px）
    const dx = p.x * 16 - sx, dy = p.y * 16 - sy;
    const dist = Math.hypot(dx, dy) || 1;
    // ai[0]=TorchID.Dust[frameY/22]（:17755-17756——尾迹/爆尘取色随被熄火把样式）
    const dustType = TORCH_DUST_BY_STYLE[Math.floor(st.frameY[ti] / 22)] ?? 6;
    this.host.spawnTorchBolt(sx, sy, (dx / dist) * 8, (dy / dist) * 8, dist, dustType);
    // （余 1 根且 ≥95）|| attacks≥200 → funTimer=-180（3s 终幕延迟,:17761-17766
    // ——★曾漏 attacks≥200 支=满容量时终幕提前 180t）
    if ((lit.length === 1 && this.attacks >= 95) || this.attacks >= MAX_ATTACKS) this.funTimer = -180;
  }

  /** 结束：批量复燃 + （≥95 时）掉 5043 + 3600 冷却（RelightTorches :17648-17660）。
   *  ★图鉴 664 记账不在此处（曾误挂=事件中止也记条目）——原版在 5043 使用侧
   *  RegisterKill（:44616-44620）+ 进世界已解锁回填（:37109-37116），见 Game.ts */
  private end(dropFavor = false): void {
    const st = this.host.store;
    for (const [x, y] of this.unlit) {
      const i = st.idx(x, y);
      if (st.flags[i] && TILE_DEFS[st.type[i]]?.vanilla?.sheet === 4 && st.frameX[i] >= TORCH_UNLIT_OFFSET) {
        st.frameX[i] -= TORCH_UNLIT_OFFSET;
      }
    }
    this.unlit.length = 0;
    this.active = false;
    this.host.setBlackout(false);
    this.cooldown = 3600;
    if (dropFavor && this.attacks >= 95) {
      const p = this.host.playerTile();
      if (p) this.host.dropVanillaItem(5043, p.x * 16, p.y * 16);
    }
  }
}
