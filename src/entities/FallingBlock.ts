// 下落沙族(原版 Projectile 31/56/67/71/179/241/411-414/812 SandBallFalling 系,
// aiStyle 10 = AI_010):
// 沙族图块失去下方支撑 → 转为下落投射物:初速 0.41、重力 0.41/tick、rot+0.1、
// vy 封顶 10(Projectile.cs:58999-59002 重力/:59075-59082 旋转+封顶,初速=
// SpawnFallingBlockProjectile WorldGen.cs:87355 NewProjectile 0.41+ai[0]=1 →
// 首拍 0.82),
// 命中实体按 GetSandfallProjData 档结算伤害(缺省 10,钱币堆 330-333 档 dmg=0;
// penetrate = -1,同敌冷却;friendly+hostile 双向——砸怪也砸玩家),
// 落到实心格上变回原 tile。见 Game.checkFallingSand(触发侧)。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import { TILE_BY_KEY, TILE_DEFS, VANILLA_TILE_ID } from '../data/tiles';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import type { TileStore } from '../world/TileStore';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { hitCritters, hitTownNpcs, playerCanHitEnemy } from './projTargets';
import { hostileProjectileDamage, mainDifficulty } from '../stats/ScaleStats';

// 落格门用原版 TileID → 本仓 id 换算（★本仓 tile id ≠ 原版 TileID,2026-08-25 修正）
const T_RAIL = VANILLA_TILE_ID.get(314);      // MinecartTrack
const T_CONV_L = VANILLA_TILE_ID.get(421);    // ConveyorBeltLeft
const T_CONV_R = VANILLA_TILE_ID.get(422);    // ConveyorBeltRight
const T_STALAC = VANILLA_TILE_ID.get(165);    // CaveDecos 钟乳石

// Main.tileSolid ∩ Main.tileSolidTop 九件套（Main.cs:8031-8032/9797-9800/10118-10119/
// 10126-10136——tileSolid 真值且 tileSolidTop 的全部成员;本仓 def.solid 对九件恒 false）
const TILE_SOLID_TOP_SHEETS = new Set([19, 239, 380, 427, 435, 436, 437, 438, 439]);
/** Main.tileSolid 代理：def.solid（tileSolid∧!tileSolidTop 域）∪ 九件套（tileSolid∧
 *  tileSolidTop）。家具（tileSolid=false∧tileSolidTop=true,如桌 18）不在此列——
 *  与 "def.solid||def.platform" 朴素代理的分野（BBMSF :87884 arm2 判据点）。 */
const tileSolidOf = (t: number): boolean => {
  const d = TILE_DEFS[t];
  if (!d) return false;
  if (d.solid === true) return true;
  return d.platform === true && TILE_SOLID_TOP_SHEETS.has(d.vanilla?.sheet ?? -1);
};

/** WorldGen.BlockBelowMakesSandFall（WorldGen.cs:87868-87893）1:1：判定 (bx,by) 下方格
 *  是否"会使沙再塌"（true=撑不住）。nactive()=active∧!inActive（Tile.cs:242-248
 *  `(sTileHeader&0x60)==32`——hasTile+!isActuated,与 liquid/checkingLiquid 无关）；
 *  越界=vanilla null/j≥maxTilesY-1 早退 false（:87871-87879）。
 *  ★终审④（2026-09-04）三消费位单源：FallingBlock 落地 flag2（Projectile.cs:79268）
 *  + Game 沙队支撑判定（SpawnFallingBlockProjectile :87328 同门）。 */
export function blockBelowMakesSandFall(st: TileStore, bx: number, by: number): boolean {
  if (!st.inBounds(bx, by + 1)) return false;                            // :87871-87879
  if (!st.hasTile(bx, by + 1) || st.isActuated(bx, by + 1)) return true; // :87880-87883 !tile.nactive()
  const below2Nact = by + 2 < st.h && st.hasTile(bx, by + 2) && !st.isActuated(bx, by + 2);
  const b1 = st.idx(bx, by + 1);
  // :87884-87887 `!tile[j+2].nactive() && (!tile.active() || !Main.tileSolid[tile.type])`
  if (!below2Nact && !(st.hasTile(bx, by + 1) && tileSolidOf(st.type[b1]))) return true;
  // :87888-87891 `tile.active() && tile.type == 165`（钟乳石）
  if (st.hasTile(bx, by + 1) && st.type[b1] === T_STALAC) return true;
  return false;
}

/** num18 兜底件表（Projectile.Kill aiStyle 10 :79122-79222 × GetSandfallProjData
 *  WorldGen.cs:87797-87837 复合换算：TileID.Sets.Falling 集（TileID.cs:395 =
 *  53/234/112/116/224/123/330-333/495,全部命中显式分支,default=53→31）→ 落块弹型 →
 *  Kill 表 num18）。SpawnFallingBlockProjectile 恒 ai[0]=1（WorldGen.cs:87352）→
 *  31 档 num18=169（:79133-79136 的 ai[0]==2 免掉落档=蚁狮敌弹档不适用;传送带重挂
 *  :79262-79265 仅 type==31 生效且同值 169=对本路径 no-op）。 */
const FALLING_TILE_DROP_ITEM = new Map<number, number>([
  [53, 169], [112, 370], [116, 408], [123, 424], [224, 1103], [234, 1246],
  [330, 71], [331, 72], [332, 73], [333, 74], [495, 4090],
]);

export class FallingBlock extends Entity {
  w = 10; h = 10; // 原版 width/height = 10(vanilla-projectiles.json 全沙族一致)
  tileKey: string;
  rot = 0;
  /** 本块是否已砸过玩家(每块只结算一次,防同帧多 hit) */
  private hitPlayer = false;
  /** 同敌冷却 tick(原版穿透弹 per-NPC 免疫帧语义) */
  private hitCd = new Map<number, number>();
  life = 3600;
  static readonly DAMAGE = 10; // GetSandfallProjData 缺省档（WorldGen.cs:87798 dmg=10）
  static readonly GRAV = 0.41; // AI_010 :58999-59002 ai[0]==1 → vy += 0.41/tick（B-2）
  /** vy 封顶（Projectile.cs:59075-59082 非 736-738 支恒达 else：vy>10 → 10） */
  static readonly VY_CAP = 10;
  /** 出生初速（SpawnFallingBlockProjectile WorldGen.cs:87355 NewProjectile 0f,0.41f
   *  + :87358 ai[0]=1f → 首拍 AI_010 再 +0.41 = 0.82;B-2 对齐） */
  static readonly SPAWN_VY = 0.41;
  /** GetSandfallProjData（WorldGen.cs:87797-87837）零伤档：钱币堆 330-333 → 弹
   *  411-414 dmg=0（:87824-87831,B-3）——砸实体不结算伤害（shell 堆 495→812 仍 10） */
  private static readonly ZERO_DMG_SHEETS = new Set([330, 331, 332, 333]);
  /** 本块弹的 NewProjectile damage 参数（GetSandfallProjData 按型档,缺省 10） */
  readonly dmg: number;

  constructor(x: number, y: number, tileKey: string) {
    super();
    this.x = x; this.y = y;
    this.tileKey = tileKey;
    const tid0 = TILE_BY_KEY[tileKey];
    const sheet0 = tid0 !== undefined ? TILE_DEFS[tid0]?.vanilla?.sheet : undefined;
    this.dmg = sheet0 !== undefined && FallingBlock.ZERO_DMG_SHEETS.has(sheet0)
      ? 0 : FallingBlock.DAMAGE;
    this.vy = FallingBlock.SPAWN_VY;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    // 上一帧中心格（落地放置格,见下方落地段注释）
    const prevTx = Math.floor((this.x + this.w / 2) / TILE);
    const prevTy = Math.floor((this.y + this.h / 2) / TILE);
    this.vy = Math.min(this.vy + FallingBlock.GRAV, FallingBlock.VY_CAP);
    this.x += this.vx;
    this.y += this.vy;
    this.rot += 0.1;                                   // :59077（非 736-738 支恒达 else）
    // 冷却推进
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    const st = game.world.store;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!st.inBounds(tx, ty)) { this.dead = true; return; }

    // ---- 命中实体(先于落地判定:穿过实体继续坠,penetrate -1) ----
    // 玩家(hostile 方向;attacker 仅 Enemy 型,沙块不传)
    const p = game.player;
    if (!this.hitPlayer && p && !p.dead && this.aabbOverlaps(p)) {
      this.hitPlayer = true;
      // Damage_EVP：GetSandfallProjData 档伤害（缺省 10=P31 hostile 弹），命中再过乘区×2
      game.damagePlayer(hostileProjectileDamage(this.dmg, mainDifficulty(game.world)) * 2, this.cx, this.cy);
    }
    // 敌人 + 小动物 + 城镇 NPC(friendly 方向;原版巨石碾压 NPC,hurt iframes 兜连击)
    hitTownNpcs(this, game, this.dmg, Math.sign(this.vx) * 2);
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const cd = this.hitCd.get(e.id) ?? 0;
      if (cd > 0) continue;
      this.hitCd.set(e.id, 20);
      e.hurt(this.dmg, 0, 0, game);
    }
    if (hitCritters(this, game)) { /* 小动物被砸即死,块继续坠 */ }

    // ---- 落地:变回 tile(原版 Projectile.Kill aiStyle==10 :79117-79310 等价)----
    // ★终审④（2026-09-04）落点几何对齐+被占/flag2 掉件面 1:1。死亡格=TileCollision
    //  钳位后弹心格（Projectile.cs:79120-79121 (int)((position.Y+height/2)/16)）。
    //  直落弹（SpawnFallingBlockProjectile vx=0、初速 0.41、vy 封顶 10 :87355/:59078-59081）
    //  钳位几何（Collision.cs:2299-2460）：全实心/平台/家具顶/底坡3-4=盒底钳到面顶
    //  （:2388-2404;底坡无 flag2 豁免:2361-2371）→ 钳位中心=面顶-5 → 死亡格=面格
    //  上一格=上一帧中心格（恒等）。★恒等论证锚（B-2 重推演 2026-09-04）=单拍位移
    //  <格宽 16px：vy 封顶 10（:59078-59081,本仓 VY_CAP=10）<16 ⇒ 上一帧中心格至多
    //  高出现帧中心格 1 格,而落地判定=中心格入面即死 ⇒ 上一帧中心必在死亡面上一格
    //  ——旧 GRAV0.3/cap16 时代"cap16 恰好=一格下限"的论证由 cap10<16 收紧为更稳
    //  同格恒等（恒等式对 [0,16) 内一切 vy 成立,与重力系数无关）;顶坡1-2 flag2 豁免
    //  竖钳（:2372-2383）→ 先被 AI_010 :59044-59052 SlopeTile 拍平+position.Y-=16 →
    //  等效钳在拍平方格顶（同上一格）;半砖=碰撞盒折半（:2350-2354 vector4.Y+=8）→
    //  钳位中心=面顶+3 ∈面格内 → 死亡格=半砖格本身（:79243 半砖上移支 velocity.Y
    //  已被 TileCollision 清 0=死支,R2' F2 同谳）→ 格 active 走 outer else :79298-79301。
    //  掉件面：被占=RequestNewItem(Center)（:79298-79301）;flag2/放置失败=
    //  Center+(0,-2)（:79293-79296）;flag2=:79250-79272 死亡格下方 active 且
    //  （rail 314 ∥ 传送带 421/422 ∥ BlockBelowMakesSandFall→blockBelowMakesSandFall）。
    //  ★修正史:初版"向上扫第一个空位"→沙抬到草/仙人掌上方悬空叠放(用户实报
    //  "蚁狮沙堆叠在草上/仙人掌断缝");二版把放置条件钉在碰撞格上→中心入实心恒被占
    //  =下落沙【永不落格】的隐性回归;2026-08-25 按上一帧中心格落格。
    if (st.isSolid(tx, ty) || st.isPlatform(tx, ty)) {
      const tid = TILE_BY_KEY[this.tileKey];
      // 死亡格与钳位中心（掉件锚）:半砖落面 → 死亡格=半砖格本身,钳位中心=面顶+8-5
      const surfHalf = st.half[st.idx(tx, ty)] !== 0;
      const dtx = surfHalf ? tx : prevTx;
      const dty = surfHalf ? ty : prevTy;
      const clampCy = surfHalf ? ty * TILE + 8 - this.h / 2 : ty * TILE - this.h / 2;
      // num18（Falling 集 tile → 弹型 → num18,见 FALLING_TILE_DROP_ITEM 表注）;
      // 掉件键缺失=静默无掉（与 Game.onProjectileDeath AISTYLE10 支 dropKey 守卫同口径）
      const sheet = tid !== undefined ? TILE_DEFS[tid]?.vanilla?.sheet : undefined;
      const dropItem = sheet !== undefined ? (FALLING_TILE_DROP_ITEM.get(sheet) ?? 0) : 0;
      const drop = (py: number) => {
        const dropKey = dropItem > 0 ? VANILLA_ITEM_KEY_BY_ID[dropItem] : undefined;
        if (dropKey) game.spawnDrop(this.x + this.w / 2, py, dropKey);
      };
      // flag2（:79250-79273）：死亡格下方 active 且（rail ∥ 传送带 ∥ BBMSF;
      // 三支 vanilla 为并列 if,布尔并集同判）
      let flag2 = false;
      if (st.inBounds(dtx, dty + 1) && st.hasTile(dtx, dty + 1)) {
        const bs = st.type[st.idx(dtx, dty + 1)];
        if (bs === T_RAIL || bs === T_CONV_L || bs === T_CONV_R) flag2 = true;
        if (blockBelowMakesSandFall(st, dtx, dty)) flag2 = true;
      }
      // :79247 `!Main.tile[num15,num16].active() && num17>=0`（落块弹 num17 恒≥0,
      //  109 过远档不经本实体）;幽灵格（flags=0,type≠0）=未激活=可落格（裸 active() 门）
      if (tid !== undefined && st.inBounds(dtx, dty) && !st.hasTile(dtx, dty)) {
        if (!flag2) {
          st.setTile(dtx, dty, tid, 0, 0);
          // :79278-79287 放置成功 → 下方半砖/坡面拍平（SlopeTile）——顶坡落面
          //  vanilla 由 AI_010 :59044-59052 先拍;此处为 Kill 尾统一面,两支同效
          if (st.inBounds(dtx, dty + 1)) {
            const bi = st.idx(dtx, dty + 1);
            if (st.flags[bi] && (st.half[bi] !== 0 || st.slope[bi] !== 0)) st.setSlope(dtx, dty + 1, 0);
          }
          // ★无声（2026-09-03 F5 音效录制定罪）：原版沙落回格【不播任何声音】——
          //  aiStyle 10 Kill 落格支(:79248-79310)无 PlaySound,WorldGen.PlaceTile
          //  (:59833-60450)全程零 PlaySound。曾播 'dig'×0.6 且不传坐标=距离衰减
          //  失效（F5 audio.sfx 环实锤:Dig_0/1/2 无坐标满响,计数与落沙潮吻合）
          // 沙堆到仙人掌旁 → 仙人掌支撑复查(原版 TileFrame case 80 → CheckCactus
          // 级联;沙坡/沙堆改变邻接后悬托仙人掌须断根——用户实报"仙人掌悬在沙坡上")
          const CAC = TILE_BY_KEY['v_80_cactus'];
          if (CAC !== undefined) {
            for (const [ax, ay] of [[dtx, dty - 1], [dtx - 1, dty], [dtx + 1, dty], [dtx - 1, dty - 1], [dtx + 1, dty - 1]] as const) {
              if (st.inBounds(ax, ay) && st.get(ax, ay) === CAC) {
                game.fellCactus?.(ax, ay);
                break;
              }
            }
          }
        } else if (dropItem > 0) {
          drop(clampCy - 2);                       // flag2 不放置仍掉件（:79293-79296 Center+(0,-2)）
        }
      } else if (dropItem > 0) {
        drop(clampCy);                             // 死亡格被占（含半砖落面）→ :79298-79301 Center
      }
      this.dead = true;   // 落地终局:放置/掉件/纯消失（num18=0 型被占,原版同 :79298 num18 门）
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(实体循环在世界变换内):取该 tile 的原版表首帧,随下落旋转
    const ctx = r.ctx;
    if (!ctx || !r.atlas) return;
    const tid = TILE_BY_KEY[this.tileKey];
    const sheet = tid !== undefined ? TILE_DEFS[tid]?.vanilla?.sheet : undefined;
    if (sheet === undefined) return;
    const fr = r.atlas.vframeAt(sheet, 0, 0);
    if (!fr) return;
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -8, -8, 16, 16);
    ctx.restore();
  }
}
