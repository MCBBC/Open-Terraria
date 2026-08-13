// 原版 Torch God 彩蛋事件 1:1（Player.cs:17585-17770 + UpdateTorchLuck :17923-17939）：
//   触发：y > worldSurface 且 81×41 窗口内点燃火把 >100 且背包无 5043
//         （Torch God's Favor）且 torchGodCooldown==0 → happyFunTorchTime
//   进行（每 tick）：y < worldSurface → EndOngoing（批量复燃）；AddBuff(80 Blackout,2t)
//         （视野压暗走 updateLightDecay ×0.85）；funTimer++ >20 → 每 21 tick：
//         扫 200×200 点燃火把 → 无剩余或 attacks≥200 → 复燃全部+结束（≥95 掉 5043）；
//         否则随机熄一根（frameX+=66）+ 向玩家发射 proj 949 TorchGod（伤 20、
//         speed 8、射程=发射时距离）；余 1 根且 ≥95 → funTimer=-180（3s 延迟结束）
//   冷却：结束后 3600 tick 不再触发（RelightTorches 设 torchGodCooldown=3600）
//   弹幕 AI_184（cs:40100）：直线飞行无追踪，射程(ai1)耗尽前 tileCollide=false、
//         之后撞块即毁；命中玩家 20 伤（无敌帧由 Player 侧处理）
import type { TileStore } from './TileStore';
import { TILE_DEFS } from '../data/tiles';

export interface TorchGodHost {
  store: TileStore;
  worldSurface: number;
  /** 玩家 tile 坐标 */
  playerTile: () => { x: number; y: number } | null;
  /** 背包是否持有原版物品（5043 Torch God's Favor） */
  hasVanillaItem: (vanillaId: number) => boolean;
  /** 发射火把弹幕（朝玩家，速度 8，伤害 20，射程 px） */
  spawnTorchBolt: (x: number, y: number, vx: number, vy: number, rangePx: number) => void;
  /** 掉落物品（原版 item id） */
  dropVanillaItem: (vanillaId: number, px: number, py: number) => void;
  /** 黑暗视野开关（buff 80 Blackout → updateLightDecay ×0.85） */
  setBlackout: (on: boolean) => void;
  /** 图鉴记账回调（:37109-37116——火把神条目 664 解锁） */
  onBestiaryUnlock?: (netId: number) => void;
}

const TORCH_UNLIT_OFFSET = 66;
const MAX_ATTACKS = 200;

export class TorchGodEvent {
  active = false;
  onBestiaryUnlock?: (netId: number) => void;
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
    // 81×41 窗口点燃计数；这里每 60t 直扫等价节流）
    if (++this.scanTick % 60 !== 0) return;
    const p = this.host.playerTile();
    if (!p || p.y <= this.host.worldSurface) return;
    if (this.host.hasVanillaItem(5043)) return;
    const st = this.host.store;
    let lit = 0;
    for (let x = Math.max(10, p.x - 40); x <= Math.min(st.w - 10, p.x + 40); x++) {
      for (let y = Math.max(10, p.y - 20); y <= Math.min(st.h - 10, p.y + 20); y++) {
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

  private step(): void {
    const p = this.host.playerTile();
    // 回到地表 → EndOngoingTorchGodEvent（:17664-17668）
    if (!p || p.y <= this.host.worldSurface) { this.end(); return; }
    // AddBuff(80, 2)（每 tick 刷新的 Blackout）
    this.host.setBlackout(true);
    // TorchAttack 主体（:17669-17677）：funTimer ≤20 直接返回；>20 清零走一轮
    this.funTimer++;
    if (this.funTimer <= 20) return;
    this.funTimer = 0;
    const st = this.host.store;
    // 扫 200×200 内点燃火把（:17683-17705）
    const lit: Array<[number, number]> = [];
    for (let x = Math.max(10, p.x - 100); x <= Math.min(st.w - 10, p.x + 100); x++) {
      for (let y = Math.max(10, p.y - 100); y <= Math.min(st.h - 10, p.y + 100); y++) {
        const i = st.idx(x, y);
        if (st.flags[i] && TILE_DEFS[st.type[i]]?.vanilla?.sheet === 4 && st.frameX[i] < TORCH_UNLIT_OFFSET) {
          lit.push([x, y]);
          if (lit.length >= 500) break; // _torchAttackPosX 容量上限近似
        }
      }
      if (lit.length >= 500) break;
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
    const dx = p.x * 16 + 8 - sx, dy = p.y * 16 - sy;
    const dist = Math.hypot(dx, dy) || 1;
    this.host.spawnTorchBolt(sx, sy, (dx / dist) * 8, (dy / dist) * 8, dist);
    // 余 1 根且 ≥95 → funTimer=-180（3s 后自然结束，:17761-17766）
    if (lit.length === 1 && this.attacks >= 95) this.funTimer = -180;
  }

  /** 结束：批量复燃 + （≥95 时）掉 5043 + 3600 冷却（RelightTorches :17648-17660） */
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
    // 图鉴记账（Player.cs:37109-37116:已用恩惠/带 unlockedBiomeTorches 进世界 →
    // 立即记 664 火把神条目——bestiary 条目永不解锁的根因,2026-08-13 补）
    this.onBestiaryUnlock?.(664);
    if (dropFavor && this.attacks >= 95) {
      const p = this.host.playerTile();
      if (p) this.host.dropVanillaItem(5043, p.x * 16, p.y * 16);
    }
  }
}
