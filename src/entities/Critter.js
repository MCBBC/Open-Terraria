// 小动物实体：无害被动生物（兔/鸟/松鼠/萤火虫等，原版素材）
// 行为：闲逛（hop 跳行 / walk 爬行 / fly 飞行），玩家靠近时逃离；可被一击杀死
import { Entity } from './Entity';
import { CRITTER_BY_KEY } from '../data/critters';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { avoidWater } from './waterAvoid';
export class Critter extends Entity {
    constructor(key, x, y) {
        super();
        Object.defineProperty(this, "key", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: key
        });
        Object.defineProperty(this, "def", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "facing", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "animT", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "hopCd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 下次起跳倒计时
        Object.defineProperty(this, "wanderT", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 换向计时
        Object.defineProperty(this, "iframes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "target", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "perchState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 0 飞行 1 栖息中
        Object.defineProperty(this, "perchT", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 栖息剩余 tick
        Object.defineProperty(this, "perchCd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 200 + Math.floor(Math.random() * 300)
        }); // 下次想落地倒计时
        Object.defineProperty(this, "inWater", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        }); // 在水中（鸭子游水动画判定）
        Object.defineProperty(this, "swimLatch", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 游水显示滞回（浮水起伏跨出水面时不闪飞帧）
        Object.defineProperty(this, "flying", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        }); // 起飞逃离中（鸭子）
        Object.defineProperty(this, "wantLand", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        }); // 飞行中想降落
        Object.defineProperty(this, "shoreSeek", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 上岸倒计时（>0 锁定朝向岸走）
        Object.defineProperty(this, "idleRollT", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 100
        }); // 自发行为轮盘倒计时
        Object.defineProperty(this, "cruiseT", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 飞行巡航剩余 tick（降为 0 才进入降落）
        // 动画帧窗口（蝴蝶表含 8 物种 × 3 帧，只播本物种）
        Object.defineProperty(this, "animBase", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "animLen", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 0 = 用全表
        // 鸟类巡航：持久航向，偶尔小角度转向（直线巡航不像原地打转）
        Object.defineProperty(this, "heading", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (Math.random() - 0.5) * Math.PI * 2
        });
        Object.defineProperty(this, "headingT", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 120 + Math.floor(Math.random() * 200)
        });
        this.def = CRITTER_BY_KEY[key];
        this.w = this.def.w;
        this.h = this.def.h;
        this.x = x - this.w / 2;
        this.y = y - this.h;
        this.facing = Math.random() < 0.5 ? 1 : -1;
        this.hopCd = Math.floor(Math.random() * 60);
        // 蝴蝶：随机物种（表内 8 物种 × 3 帧），只播本物种的 3 帧
        if (this.def.npc === 356) {
            const species = Math.floor(Math.random() * 8);
            this.animBase = species * 3;
            this.animLen = 3;
        }
    }
    fixedUpdate(dt, game) {
        this.animT++;
        if (this.iframes > 0)
            this.iframes--;
        // 每帧刷新在水状态（此前只在 groundAI 里更新——起飞后不再跑 groundAI，
        // inWater 冻结为 true 导致飞行时渲染恒选游水帧）
        const st0 = game.world.store;
        this.inWater = st0.liquid[st0.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
        const player = game.player;
        const flee = !!player && !player.dead && this.def.fleeRange > 0 &&
            Math.hypot(player.cx - this.cx, player.cy - this.cy) < this.def.fleeRange;
        // 鸭子式两栖：水面游 / 地面走 / 低空飞 三态自发切换 + 受惊起飞
        if (this.def.fleeFly) {
            if (this.flying) {
                // 受惊一直飞；自发起飞先巡航 2.5-5 秒再降落（否则刚起飞就被重力拉回）
                if (flee) {
                    this.wantLand = false;
                    this.cruiseT = 120;
                }
                else if (this.cruiseT > 0) {
                    this.cruiseT--;
                    this.wantLand = false;
                }
                else
                    this.wantLand = true;
                this.flyMove(game, flee, player, this.wantLand);
                // 落水也是落点（水面停驻）——onGround 或 入水都结束飞行
                if (this.wantLand && (this.onGround || this.inWater)) {
                    this.flying = false;
                    this.wantLand = false;
                }
            }
            else {
                if (flee && (this.onGround || this.inWater)) {
                    this.flying = true;
                    this.vy = -3.2;
                    this.cruiseT = 120;
                    this.swimLatch = 0; // 起飞立即解除游水显示
                }
                else {
                    this.duckIdle(game);
                    this.groundAI(game, flee, player);
                }
            }
        }
        else if (this.def.kind === 'fly') {
            if (this.def.perch) {
                // 鸟类：偶尔落地栖息；玩家靠近立即起飞逃离
                if (this.perchState === 1) {
                    if (flee) {
                        this.perchState = 0;
                        this.vy = -2.5;
                    }
                    else if (--this.perchT <= 0) {
                        this.perchState = 0;
                        this.vy = -2;
                    }
                    else { // 栖息：站地不动
                        this.vx *= 0.7;
                        this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
                        moveAndCollide(this, game.world, this.vx, this.vy);
                        return;
                    }
                }
                this.flyAI(game, flee, player);
                // 飞行中偶尔找落点（只在开阔地表、不逃逃时）
                if (this.perchState === 0 && !flee && --this.perchCd <= 0 && this.onGround === false) {
                    this.perchCd = 300 + Math.floor(Math.random() * 400);
                    const gx = Math.floor(this.cx / TILE);
                    let gy = Math.floor(this.cy / TILE);
                    let solid = -1;
                    for (let k = 0; k < 24; k++, gy++) {
                        if (gy >= game.world.store.h)
                            break;
                        if (game.world.store.isSolid(gx, gy)) {
                            solid = gy;
                            break;
                        }
                    }
                    if (solid > 0)
                        this.target = { x: this.cx, y: (solid - 1) * TILE };
                }
                // 到达落点 → 栖息
                if (this.perchState === 0 && this.onGround && !flee && Math.abs(this.vx) < 0.3) {
                    this.perchState = 1;
                    this.perchT = 240 + Math.floor(Math.random() * 360);
                }
            }
            else {
                this.flyAI(game, flee, player);
            }
        }
        else {
            this.groundAI(game, flee, player);
        }
        // 游水滞回：浮水 bobbing 会瞬间跨出水面（inWater=false 且 onGround=false → 误选飞帧）。
        // 沾水后 20 tick 内保持游水显示，站稳地面才解除；飞行态不适用
        if (this.flying)
            this.swimLatch = 0;
        else if (this.inWater)
            this.swimLatch = 20;
        else if (this.onGround)
            this.swimLatch = 0;
        else if (this.swimLatch > 0)
            this.swimLatch--;
        // 防沉底兜底：没在飞却泡在深水里（浮力异常/卡住）→ 强制上浮
        if (!this.flying && this.def.water) {
            const st2 = game.world.store;
            const deep = st2.liquid[st2.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE) + 3)] > 80;
            if (deep)
                this.vy -= 0.3;
        }
        // 远离玩家清除
        if (player) {
            const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
            if (d > TILE * 70)
                this.dead = true;
        }
    }
    /** 鸭子自发行为轮盘：上岸 / 下水 / 起飞 低频切换（每 3-5 秒掷一次） */
    duckIdle(game) {
        if (--this.idleRollT > 0)
            return;
        this.idleRollT = 180 + Math.floor(Math.random() * 150);
        const st = game.world.store;
        const r = Math.random();
        if (this.inWater) {
            // 水面：30% 起飞 / 40% 找岸上岸 / 30% 继续漂
            if (r < 0.30) {
                this.flying = true;
                this.vy = -3;
                this.wantLand = false;
                this.cruiseT = 150 + Math.floor(Math.random() * 150);
                this.swimLatch = 0;
                return;
            }
            if (r < 0.70) {
                // 找最近的岸：两侧 8 格内找「无液体且有地面」的列
                for (let k = 2; k <= 8; k++) {
                    for (const dir of [-1, 1]) {
                        const ax = Math.floor(this.cx / TILE) + dir * k;
                        if (!st.inBounds(ax, 0))
                            continue;
                        let y = Math.floor(this.cy / TILE);
                        while (y < st.h - 2 && !st.isSolid(ax, y))
                            y++;
                        if (!st.inBounds(ax, y - 1))
                            continue;
                        if (st.liquid[st.idx(ax, y - 1)] <= 40) {
                            this.facing = dir;
                            this.shoreSeek = 60;
                            return;
                        }
                    }
                }
            }
        }
        else if (this.onGround) {
            // 地面：15% 低空起飞；前方 5 格内有水则 35% 下水
            if (r < 0.15) {
                this.flying = true;
                this.vy = -2.6;
                this.wantLand = false;
                this.cruiseT = 150 + Math.floor(Math.random() * 150);
                this.swimLatch = 0;
                return;
            }
            if (r < 0.50) {
                const dir = this.facing;
                for (let k = 1; k <= 5; k++) {
                    const ax = Math.floor(this.cx / TILE) + dir * k;
                    if (st.inBounds(ax, 0) && st.liquid[st.idx(ax, Math.floor(this.cy / TILE))] > 80) {
                        this.shoreSeek = 0; // 保持朝向走进水里
                        return;
                    }
                }
            }
        }
    }
    /** 地面 AI：闲逛跳行/爬行，玩家靠近逃离 */
    groundAI(game, flee, player) {
        const inWater = this.inWater; // fixedUpdate 已刷新
        if (flee && player)
            this.facing = player.cx < this.cx ? 1 : -1;
        else if (this.shoreSeek > 0) {
            // 上岸中：保持锁定方向（到岸后由 duckIdle/换向逻辑解除）
            this.shoreSeek--;
            if (!this.inWater)
                this.shoreSeek = 0;
        }
        else if (--this.wanderT <= 0) {
            this.wanderT = 90 + Math.floor(Math.random() * 150);
            if (Math.random() < 0.5)
                this.facing = -this.facing;
        }
        if (this.def.kind === 'hop' && this.def.water && !inWater) {
            // 两栖种（鸭子）岸上：持续踱步（原版鸭子是走路不是蹦），
            // 偶尔小跳——只在水里才用跳行推进
            this.vx = this.facing * this.def.speed * (flee ? 1.8 : 0.8);
            if (--this.hopCd <= 0 && this.onGround) {
                this.hopCd = 90 + Math.floor(Math.random() * 120);
                this.vy = -(2.2 + Math.random() * 0.6); // 偶尔轻跳一下
            }
        }
        else if (this.def.kind === 'hop') {
            // 跳行：静止蓄力 → 起跳（逃离时高频远跳）
            this.vx *= 0.8;
            if (--this.hopCd <= 0 && this.onGround) {
                this.hopCd = flee ? 18 : 50 + Math.floor(Math.random() * 60);
                this.vx = this.facing * this.def.speed * (flee ? 1.6 : 1);
                this.vy = -(3.2 + Math.random() * 0.8);
            }
        }
        else {
            this.vx = this.facing * this.def.speed * (flee ? 2.2 : 1);
        }
        // 可游泳生物（鸭子）：平稳浮水——小浮力 + 强阻尼，
        // 出水瞬间的微下落由滞回期游水帧遮盖，不再大幅上下弹跳。
        // 上岸推进：游泳中 onGround 恒 false、hop 不触发 → shoreSeek 时直接给水平游速
        if (this.def.water && inWater) {
            this.vy = (this.vy - 0.14) * 0.82;
            if (this.shoreSeek > 0)
                this.vx = this.facing * this.def.speed;
            else
                this.vx *= 0.94;
            moveAndCollide(this, game.world, this.vx, this.vy);
            return;
        }
        this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
        moveAndCollide(this, game.world, this.vx, this.vy);
        if (this.hitWall && this.onGround)
            this.facing = -this.facing;
    }
    /** 飞行 AI：绕巡航点飘，玩家靠近飞离 */
    flyAI(game, flee, player) {
        this.flyMove(game, flee, player, false);
    }
    /** 飞行移动核心。landing=true 时关闭悬停改用重力下落找地面 */
    flyMove(game, flee, player, landing) {
        const steer = 0.09;
        if (flee && player) {
            const dx = this.cx - player.cx, dy = this.cy - player.cy;
            const d = Math.hypot(dx, dy) || 1;
            this.vx += (dx / d) * steer * 3;
            this.vy += (dy / d) * steer * 3;
            this.facing = dx > 0 ? 1 : -1;
        }
        else if (this.def.perch || this.def.fleeFly) {
            // 鸟/鸭：持久航向直线巡航，每 2-5 秒小角度改向（±35°），飞出画面自然销毁
            if (--this.headingT <= 0) {
                this.headingT = 120 + Math.floor(Math.random() * 200);
                this.heading += (Math.random() - 0.5) * 1.2;
            }
            this.vx += Math.cos(this.heading) * steer;
            this.vy += Math.sin(this.heading) * steer * 0.4;
            this.facing = this.vx > 0 ? 1 : -1;
        }
        else {
            // 蝴蝶/萤火虫：小范围低空飘（不远离出生地太多）
            if (--this.wanderT <= 0) {
                this.wanderT = 50 + Math.floor(Math.random() * 100);
                this.target = {
                    x: this.cx + (Math.random() - 0.5) * 130,
                    y: this.cy + (Math.random() - 0.5) * 60,
                };
            }
            const t = this.target ?? { x: this.cx, y: this.cy };
            const dx = t.x - this.cx, dy = t.y - this.cy;
            const d = Math.hypot(dx, dy) || 1;
            this.vx += (dx / d) * steer;
            this.vy += (dy / d) * steer;
            this.facing = dx > 0 ? 1 : -1;
        }
        this.vx *= 0.96;
        this.vy *= 0.96;
        const spd = Math.hypot(this.vx, this.vy);
        const max = this.def.speed * (flee ? 2 : 1);
        if (spd > max) {
            this.vx = (this.vx / spd) * max;
            this.vy = (this.vy / spd) * max;
        }
        if (landing) {
            // 降落模式：重力下落 + 保留水平漂移，落地由外层接管（有意落水不避）
            this.vy = Math.min(this.vy + GRAVITY * 0.5, MAX_FALL_SPEED * 0.6);
            moveAndCollide(this, game.world, this.vx, this.vy);
            return;
        }
        // 通用飞行避水（def.avoidWater）：巡航/逃离中不扎进水里；鸭子保航向爬升
        if (this.def.avoidWater && avoidWater(this, game.world, !this.def.fleeFly))
            return;
        moveAndCollide(this, game.world, this.vx, this.vy);
        if (this.hitWall)
            this.vx = -this.vx * 0.6;
        if (this.hitHead)
            this.vy = -Math.abs(this.vy) * 0.6;
        if (this.onGround)
            this.vy = -Math.abs(this.vy) - 0.4;
    }
    /** 被击中即死：红色血粒子 + 死亡音效（原版小动物死亡走通用 NPC_Killed 槽） */
    hurt(game) {
        if (this.iframes > 0)
            return false;
        this.dead = true;
        game.spawnParticles(this.cx, this.cy, '#C03030', 6, 1.8);
        game.spawnParticles(this.cx, this.cy, '#8A1818', 4, 1.2);
        // 小动物死亡声：与史莱姆一致（NPC_Killed_1）；
        // 主角击杀与怪物碾压都走这里，两条路径音效完全一致
        game.playSfxFiles(['NPC_Killed_1'], 0.8);
        return true;
    }
    draw() { }
}
