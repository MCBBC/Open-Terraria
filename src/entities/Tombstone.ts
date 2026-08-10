// 墓碑实体：Player.DropTombstone + Projectile aiStyle 17（1.4.5.6）1:1。
//   Player.cs:38427-38467  款式按身家：≤10 万铜币 → 43（1/6）或 200+rand(6)；
//                           >10 万 → 527+rand(5)（金墓碑）；从玩家中心抛射
//                           （vx = rand(10..30)*0.1*击退方向 + 随机游走修正；vy = rand(-40..-20)*0.1 上抛）
//   Projectile.cs:23677-23718 aiStyle17 物理：vy+=0.2/帧；rotation+=vx*0.1（翻滚随位移）；
//                           落地（vy==0）vx*=0.98 摩擦；无弹跳。每帧检查底缘中心下方格：
//                           可放 2×2 墓碑(tile 85) → 放置 + 写碑文(死亡文本+日期) + 消失
//   style 映射（Projectile.cs:23696-23700）：43→0；201-205→1-5；527-531→6-10（Tiles_85 偶数列）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { MAX_FALL_SPEED } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { TILE_BY_KEY } from '../data/tiles';

/** 程序化像素墓碑贴图（16×22）——仅作贴图缺失时的兜底 */
let tombstoneCanvas: HTMLCanvasElement | null = null;
export function getTombstoneCanvas(): HTMLCanvasElement {
  if (!tombstoneCanvas) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 22;
    const x = c.getContext('2d')!;
    const stone = '#A8A8B4', dark = '#70707E', light = '#C4C4D0', en = '#585864';
    x.fillStyle = stone;
    x.fillRect(4, 2, 8, 2);
    x.fillRect(3, 4, 10, 10);
    x.fillRect(2, 14, 12, 3);
    x.fillStyle = dark;
    x.fillRect(1, 17, 14, 2);
    x.fillRect(2, 19, 12, 1);
    x.fillStyle = light;
    x.fillRect(3, 5, 1, 11);
    x.fillStyle = dark;
    x.fillRect(12, 5, 1, 11);
    x.fillStyle = en;
    x.fillRect(6, 6, 4, 1);
    x.fillRect(5, 9, 6, 1);
    x.fillRect(6, 12, 4, 1);
    tombstoneCanvas = c;
  }
  return tombstoneCanvas;
}

/** DropTombstone 款式选择 → 原版 style（0-10） */
function pickStyle(coinsOwned: number): number {
  const roll = Math.floor(Math.random() * 6); // Main.rand.Next(6)
  let type: number;
  if (coinsOwned <= 100000) {
    type = roll !== 0 ? 200 + roll : 43;
  } else {
    type = 527 + Math.floor(Math.random() * 5);
  }
  // Projectile.cs:23696-23700 的 type→style 换算
  if (type === 43) return 0;
  if (type >= 201 && type <= 205) return type - 200;
  return type - 527 + 6; // 527-531 → 6-10
}

/** 原版长日期（en: "MMMM d, yyy"；zh culture: ToLongDate） */
function longDate(): string {
  return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export class Tombstone extends Entity {
  w = 14; h = 14;
  angle = 0;             // 翻滚角（aiStyle17：rotation += vx*0.1，落地随摩擦冻结）
  /** 原版墓碑样式 0-10（Tiles_85 的 2×2 样式块起点列 = style*2） */
  style = 0;
  /** 碑文（原版 miscText = 死亡文本 + "\n" + 日期；安放时写入 world.signs） */
  readonly epitaph: string;
  /** 落格安放的墓碑 tile 左上角（安放成功后有效；渲染/交互用） */
  placedAt: { x: number; y: number } | null = null;

  constructor(x: number, y: number, coinsOwned: number, deathText: string, hitDirection: number) {
    super();
    this.style = pickStyle(coinsOwned);
    this.epitaph = `${deathText}\n${longDate()}`;
    // DropTombstone L38446-38449：随机游走修正直到 |num|≥2（范围 ±3.5）
    let num = (Math.floor(Math.random() * 71) - 35) * 0.1;
    while (num < 2 && num > -2) num += (Math.floor(Math.random() * 61) - 30) * 0.1;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = (Math.floor(Math.random() * 21) + 10) * 0.1 * hitDirection + num;
    this.vy = (Math.floor(Math.random() * 21) - 40) * 0.1; // -2 .. -4 上抛
  }

  fixedUpdate(dt: number, game: GameHooks) {
    // aiStyle17（Projectile.cs:23677-23686）：落地摩擦 → 翻滚 → 重力
    if (this.vy === 0) this.vx *= 0.98;
    this.angle += this.vx * 0.1;
    // aiStyle17 专用重力 0.2/帧（Projectile.cs:23681，非全局 GRAVITY 0.36）
    this.vy = Math.min(this.vy + 0.2, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
    // 落格检查（L23689-23717）：底缘中心下方格可放墓碑 → 放置 + 碑文 + 消失
    const bx = Math.floor((this.x + this.w / 2) / 16);
    const by = Math.floor((this.y + this.h - 4) / 16); // 脚下贴地的行
    const top = by - 1;                                 // 2×2 物件顶行（底行与脚对齐）
    if (this.tryPlace(game, bx, top)) {
      this.dead = true;
      return;
    }
    void dt;
  }

  /** TileObject.CanPlace(85) 近似：2×2 全空 + 底下两格实心支撑 */
  private tryPlace(game: GameHooks, x: number, y: number): boolean {
    const st = game.world.store;
    const tid = TILE_BY_KEY['tombstone_v'];
    if (tid === undefined) return false;
    if (x < 1 || y < 1 || x + 1 >= st.w || y + 2 >= st.h) return false;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (st.isActive(x + dx, y + dy)) return false;
      }
    }
    if (!st.isSolid(x, y + 2) || !st.isSolid(x + 1, y + 2)) return false;
    // 放置（TileObject.Place 帧语义：frameX = style*36 + dx*18，frameY = dy*18）
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        st.setTile(x + dx, y + dy, tid, this.style * 36 + dx * 18, dy * 18);
      }
    }
    this.placedAt = { x, y };
    game.world.signs.push({ x, y, text: this.epitaph });
    game.playSfx('dig');
    return true;
  }

  draw() { /* Renderer 统一绘制 */ }
}
