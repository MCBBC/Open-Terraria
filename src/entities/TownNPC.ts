// 城镇 NPC：游走、夜间回家、对话气泡
// 贴图 = 原版 Images/NPC_{id}（Terarria1456 素材条），帧语义按原版 FindFrame 城镇分支
// （NPC.cs:69152+）：地面站定=帧0；腾空=帧1；行走帧 2..frames-extra-1 循环
// （frameCounter += |vx|*2+1 每 tick，>6 推进一帧，越界回卷帧2）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { openDoor, closeDoor as closeDoorTile } from '../world/Door';
import { TILE_BY_KEY as TILE_BY_KEY_DOOR_TILES } from '../data/tiles';
import { TOWN_NPC_IDS, VANILLA_NPCS } from '../data/vanillaNpcs';
import { newNpcName } from '../i18n/RandomText';

export interface NpcHome { x: number; y: number; }

export class TownNPC extends Entity {
  w = 20; h = 42;
  npcKey: string; // 'guide'
  /** 原版 NPCID（TOWN_NPC_IDS；Renderer 经 atlas.vnpc 取 NPC_{id}.png 贴图条） */
  vanillaId: number;
  facing = 1;
  /** 随机名字（NPC.getNewNPCNameInner 名字池；无池类型如守卫老人为空串） */
  givenName = '';
  animT = 0;
  frame = 0;       // 当前贴图帧（原版 frame.Y/帧高）
  frameT = 0;      // 行走帧累加器（≈原版 frameCounter）
  wanderT = 0;
  home: NpcHome | null = null;
  /** 定点站岗（守卫老人）：门口地带是山坡+塔心竖井,白天的自由游走会坠入地牢；
   *  原版观感也是整日守在门口走廊 */
  stationary = false;
  /** 被绑待救援（原版 BoundGoblin105/BoundWizard106/BoundMechanic123/WebbedStylist122/
   *  Golfer589：原地不动，右键解救 → savedXxx 旗标置位成为正式城镇 NPC） */
  bound = false;
  // ---- NPC 开关门（原版 AI_007，NPC.cs:54478 开门 / 54243 过门关门）----
  private closeDoor = false;
  private doorX = 0; private doorY = 0;
  /** 白天游走但不远离 home(守卫老人:锚地牢门口走廊,防走失) */
  leashHome = false;
  talkCooldown = 0;

  /** 生命（原版城镇 NPC 可被陷阱弹幕误伤：vanilla-npcs.json lifeMax 250 / defense 15） */
  hp: number;
  maxHp: number;
  iframes = 0;

  constructor(key: string, x: number, y: number) {
    super();
    this.npcKey = key;
    this.x = x;
    this.y = y - this.h;
    const town = TOWN_NPC_IDS[key];
    this.vanillaId = town?.id ?? 22; // 未登记 key 兜底向导贴图
    this.givenName = newNpcName(this.vanillaId);
    const v = VANILLA_NPCS[String(this.vanillaId)];
    this.maxHp = this.hp = v?.lifeMax ?? 250;
  }

  /** 被陷阱弹幕等命中：dmg - defense*0.5（下限 1），8 tick 无敌帧；
   *  死亡即移除——"重生"由入驻轮承担（原版 UpdateTime_SpawnTownNPCs：不在场且
   *  条件满足 → 重新入驻，≈次日回归），无需独立重生系统 */
  hurt(dmg: number, kbx: number, _kby: number, game: GameHooks): boolean {
    if (this.iframes > 0 || this.dead) return false;
    const def = VANILLA_NPCS[String(this.vanillaId)]?.defense ?? 15;
    dmg = Math.max(1, Math.round(dmg - def * 0.5));
    this.hp -= dmg;
    this.iframes = 8;
    game.addDamageNumber(this.cx, this.y, dmg, false, '#FFD060');
    this.vx += kbx * 0.6;
    if (this.hp <= 0) {
      this.dead = true;
      game.spawnParticles(this.cx, this.cy, '#C03030', 8, 2);
      game.spawnParticles(this.cx, this.cy, '#8A1818', 4, 1.2);
      game.playSfxFiles(['NPC_Killed_1'], 0.8);
    } else {
      game.playSfxFiles(['NPC_Hit_1'], 0.6);
    }
    return true;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.animT++;
    if (this.iframes > 0) this.iframes--;
    const world = game.world;

    // 被绑待救援：原地不动（仅重力落定），解救在 Game.talkToNearbyNpc
    if (this.bound) {
      this.vx = 0;
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, world, this.vx, this.vy);
      return;
    }

    let wantDir = 0;
    if (!this.stationary && world.clock.isDay) {
      // 白天家门口附近游走;leashHome 者离 home 超过 ~10 格时折返(守卫老人不离地牢)
      if (this.leashHome && this.home
        && Math.abs(this.cx - (this.home.x * TILE + 8)) > 10 * TILE) {
        wantDir = Math.sign(this.home.x * TILE + 8 - this.cx);
      } else {
        this.wanderT--;
        if (this.wanderT <= 0) {
          this.wanderT = 90 + Math.random() * 180;
          this.facing = Math.random() < 0.5 ? -1 : 1;
          if (Math.random() < 0.35) this.facing = 0;
        }
        wantDir = this.facing;
      }
    } else if (this.home) {
      // 夜间回家
      const dx = this.home.x * TILE + 8 - this.cx;
      if (Math.abs(dx) > TILE) wantDir = Math.sign(dx);
    }

    this.vx += wantDir * 0.06;
    this.vx = Math.max(-0.8, Math.min(0.8, this.vx));
    if (wantDir === 0) {
      // 原版驻留刹车（NPC.cs:54096-54106）：不走路时每 tick ±0.1 主动减速。
      // 缺此刹车时 facing=0（站立意图）仍以 0.8px/tick 惯性滑行且贴图不镜像
      // → 向右滑行显示朝左贴图（偶发"太空步"）
      if (this.vx > 0.1) this.vx -= 0.1;
      else if (this.vx < -0.1) this.vx += 0.1;
      else this.vx = 0;
    }
    if (this.onGround && this.hitWall && wantDir !== 0) this.vy = -6; // 跳台阶
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, world, this.vx, this.vy);
    if (this.hitWall) this.vx *= 0.5;
    if (wantDir !== 0) this.facing = wantDir;
    // 开关门（原版 54478-54500：撞到关着的门 → 1/10（或卡住必试）开门，两方向回退；
    // 54243-54252：走过门 >2 格关门，>4 格放弃）
    this.npcDoorUpdate(world, game);

    // ---- 原版 FindFrame 城镇分支（NPC.cs:70172-70262）----
    // 腾空=帧1；地面站定=帧0、计数清零；行走 frameCounter += |vx|*2+1，>6 推进，
    // 帧区间 2..frames-extra-1（越界回卷帧2）
    if (!this.onGround) {
      this.frame = 1;
      this.frameT = 0;
    } else if (Math.abs(this.vx) < 0.05) {
      this.frame = 0;
      this.frameT = 0;
    } else {
      const total = VANILLA_NPCS[String(this.vanillaId)]?.frames ?? 1;
      const extra = TOWN_NPC_IDS[this.npcKey]?.extra ?? 2;
      this.frameT += Math.abs(this.vx) * 2 + 1;
      if (this.frame < 2) this.frame = 2;
      if (this.frameT > 6) {
        this.frameT = 0;
        this.frame++;
      }
      if (this.frame >= total - extra) this.frame = 2;
    }

  }

  /** 城镇 NPC 开关门（原版 NPC.cs:54478-54500/54243-54252） */
  private npcDoorUpdate(world: import('../world/World').World, game: GameHooks) {
    const st = world.store;
    // 过门关门：中心距门 >2 格 → 关；>4 格或换层 → 放弃
    if (this.closeDoor) {
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (Math.abs(tx - this.doorX) > 2 || Math.abs(ty - this.doorY) > 4) {
        const doorType = st.type[st.idx(this.doorX, this.doorY)];
        const isStillDoor = doorType === (TILE_BY_KEY_DOOR_TILES['tall_gate_open'] ?? TILE_BY_KEY_DOOR_TILES['door_open'])
          || doorType === (TILE_BY_KEY_DOOR_TILES['door_open'] ?? -1);
        if (Math.abs(tx - this.doorX) <= 4 && isStillDoor) {
          closeDoorTile(st, this.doorX, this.doorY);
        }
        this.closeDoor = false;
      }
      return;
    }
    // 撞门开门：前方碰撞点是关着的门（tile 10/388 族）
    if (!this.hitWall) return;
    const fx = Math.floor((this.cx + this.facing * (this.w / 2 + 2)) / TILE);
    const fy = Math.floor((this.y + this.h - 8) / TILE);
    for (const dy of [0, -1]) {
      const x = fx, y = fy + dy;
      if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
      if (st.type[st.idx(x, y)] !== TILE_BY_KEY_DOOR_TILES['door_closed']) continue;
      if (Math.random() >= 0.1) return;   // 原版 Next(10)==0
      const before = st.type[st.idx(x, y)];
      const opened = openDoor(st, x, y, this.facing) || openDoor(st, x, y, -this.facing);
      if (opened && before !== st.type[st.idx(x, y)]) {
        this.closeDoor = true;
        this.doorX = x; this.doorY = y;
        game.playSfx('door_open', 0.8, this.cx, this.cy);
      }
      return;
    }
  }

  draw() { /* Renderer 统一绘制 */ }
}
