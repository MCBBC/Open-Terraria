// 世界门面：TileStore + 元数据 + 实体容器 + 昼夜时钟
import { TileStore } from './TileStore';
import { T, TILE_DEFS } from '../data/tiles';
export class Clock {
    constructor(dayLengthMs) {
        Object.defineProperty(this, "timeOfDay", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0.3
        }); // 0-1，0=午夜 0.5=正午（起始上午 7:12 ≈ 0.3）
        Object.defineProperty(this, "dayCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "dayLengthMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.dayLengthMs = dayLengthMs;
    }
    tick(dtMs) {
        this.timeOfDay += dtMs / this.dayLengthMs;
        while (this.timeOfDay >= 1) {
            this.timeOfDay -= 1;
            this.dayCount++;
        }
    }
    get isDay() { return this.timeOfDay > 0.25 && this.timeOfDay < 0.75; }
    get dayFactor() {
        // 昼夜平滑系数：白天 1，夜晚 0.32（月光下地表仍可见，火把不再像贴在黑幕上），晨昏过渡
        const t = this.timeOfDay;
        if (t > 0.28 && t < 0.72)
            return 1;
        if (t >= 0.72 && t < 0.80)
            return 1 - (t - 0.72) / 0.08 * 0.68;
        if (t >= 0.80 || t < 0.20)
            return 0.32;
        return 0.32 + (t - 0.20) / 0.08 * 0.68;
    }
    get hourFloat() { return this.timeOfDay * 24; }
}
export class World {
    markExplored(cx, cy, radius) {
        this.exploredVersion++;
        const st = this.store;
        const x0 = Math.max(0, cx - radius), x1 = Math.min(st.w - 1, cx + radius);
        const y0 = Math.max(0, cy - radius), y1 = Math.min(st.h - 1, cy + radius);
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
                    this.explored[y * st.w + x] = 1;
                }
            }
        }
    }
    constructor(w, h, seed, name = '新世界') {
        Object.defineProperty(this, "store", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "seed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "spawnX", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "spawnY", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "groundLevel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "rockLevel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // tile 坐标
        /** 地狱顶（原版 UnderworldLayer = maxTilesY-200；TerrainPass 设定，SceneMetrics/BGM/背景共用） */
        Object.defineProperty(this, "lavaLine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "clock", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "chests", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        // Boss 进度旗标
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { downedEyeOfCthulhu: false, downedSkeletron: false, shadowOrbSmashed: false, hardMode: false }
        });
        // 树登记：砍树干时找到整棵树（roots → 范围）
        Object.defineProperty(this, "trees", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        /** 战争迷雾：1 = 已探索。按 tile 粒度。 */
        Object.defineProperty(this, "explored", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** 原版树样式数据（header treeX/treeStyle）：横向 4 区森林树冠样式 */
        Object.defineProperty(this, "treeX", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "treeStyle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: [0, 0, 0, 0]
        });
        /** 世界级生物群系常量(原版 header,生成期 Reset pass 掷出) */
        Object.defineProperty(this, "crimson", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        }); // true=猩红 false=腐化
        Object.defineProperty(this, "dungeonX", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 地牢位置
        /** 地牢入口地表 Y（原版 Main.dungeonY：CheckToSpawnDungeonEnemies 要求玩家在其 +40 格以下才刷地牢怪）。
         *  缺省 0=未知，使用处以 groundLevel 回退 */
        Object.defineProperty(this, "dungeonY", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "jungleX", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        }); // 丛林位置
        /** TreeTops 13 区域变体（v≥211 wld 权威；索引 0-3 森林/5 丛林/6 雪/7 神圣） */
        Object.defineProperty(this, "treeTops", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "exploredVersion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.store = new TileStore(w, h);
        this.explored = new Uint8Array(w * h);
        this.seed = seed;
        this.name = name;
        // 1 游戏日 = 30 现实分钟（24→40 后折中）
        this.clock = new Clock(30 * 60 * 1000);
    }
    get w() { return this.store.w; }
    get h() { return this.store.h; }
    get tiles() { return this.store; }
    /** 破坏一个 tile（含 framed 物体的锚点处理由调用方负责），返回掉落 item key */
    breakTileAt(x, y) {
        const t = this.store.get(x, y);
        if (t === 0)
            return null;
        const d = TILE_DEFS[t];
        this.store.setTile(x, y, 0);
        // v_ 图块无显式 drop → 回退同名放置物品(阶段5 自动注册)
        return d.drop ?? (d.key.startsWith('v_') ? 'place_' + d.key : null);
    }
    isSolidPx(px, py) {
        return this.store.isSolid(Math.floor(px / 16), Math.floor(py / 16));
    }
    /** 液体量（0-255）按像素坐标 */
    liquidAt(px, py) {
        return this.store.liquid[this.store.idx(Math.floor(px / 16), Math.floor(py / 16))];
    }
    registerTree(x, y, h) {
        this.trees.push({ x, y, h });
    }
}
export { T };
