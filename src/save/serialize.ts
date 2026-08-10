// 存档序列化纯核心(无任何 DOM/World 依赖——save.worker.ts 直接引用,
// 主线程 SaveFile.ts 与存档 worker 共用同一份字节级实现,输出逐位一致)。
// 性能(2026-08 审计 #2):RLE 输出为密度增长 Uint8Array(varint 字节流)。

class ByteWriter {
  buf = new Uint8Array(1 << 16);
  len = 0;
  private grow(need: number) {
    if (this.len + need <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + need) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  varint(v: number) {
    v = v < 0 ? 0 : v;
    this.grow(5);  // 32 位 varint 至多 5 字节
    while (v >= 0x80) {
      this.buf[this.len++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.buf[this.len++] = v;
  }
  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

export function bytesToB64(u8: Uint8Array): string {
  // 分块拼接(8192)避免逐字符 += 的 ConsString 链;输出与逐字符版一致
  let s = '';
  const CH = 8192;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)) as unknown as number[]);
  }
  return btoa(s);
}

// ---- 正式 RLE 格式 ----
// tiles 每条目: varint(run-1) varint(type) [varint(frameX) varint(frameY) 仅当 type!=0]
// walls/liquid: varint(run-1) varint(value)

export interface SaveData {
  format: 'sandboxworld.save';
  version: number;
  header: {
    name: string; seed: number; width: number; height: number;
    spawn: [number, number]; groundLevel: number; rockLevel: number; lavaLine?: number;
    crimson?: boolean; dungeonX?: number; dungeonY?: number; jungleX?: number;
    treeX?: number[]; treeStyle?: number[]; treeTops?: number[];
    created: number; playTimeMs: number;
    wldVersion?: number;
  };
  clock: { timeOfDay: number; dayCount: number };
  tiles: string;   // base64 RLE
  walls: string;
  liquid: string;
  liquidType: string;  // base64 RLE（0无 1水 2岩浆 3蜂蜜）
  wire?: string;       // base64 RLE 电路位（bit0-3 四色线 bit4 致动器 bit5 已致动；旧档缺此字段=全 0）
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;
  player: {
    hp: number; x: number; y: number;
    inventory: Array<{ id: number; stack: number } | null>;
    selected: number;
    baseMaxHp?: number;   // 生命上限（水晶之心/生命果扩容；旧档缺省 100）
    baseMaxMana?: number; // 魔力上限（魔力水晶扩容；旧档缺省 20）
    mana?: number;        // 当前魔力
    banks?: Array<Array<{ id: number; stack: number } | null>>; // 玩家储物×4（29/97/463/491；旧档缺省全空）
  };
  npcs: Array<{ key: string; x: number; y: number; home: [number, number] | null }>;
  signs?: Array<{ x: number; y: number; text: string }>; // 墓碑碑文（旧档缺省无）
  flags: Record<string, boolean>;
}

/** 序列化所需的 tilestore 视图(worker 路径=副本包装;主线程=活存储) */
export interface SaveStoreView {
  type: Uint16Array; flags: Uint8Array;
  frameX: Uint16Array; frameY: Uint16Array;
  wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; wire: Uint8Array;
}
/** 序列化所需的世界元数据(全部可结构化克隆) */
export interface SaveMeta {
  name: string; seed: number; w: number; h: number;
  spawnX: number; spawnY: number; groundLevel: number; rockLevel: number; lavaLine?: number;
  treeX?: number[]; treeStyle?: number[]; treeTops?: number[];
  crimson?: boolean; dungeonX?: number; dungeonY?: number; jungleX?: number;
  timeOfDay: number; dayCount: number;
  chests: SaveData['chests']; signs?: SaveData['signs']; flags: Record<string, boolean>;
}

export function rlePairs(values: ArrayLike<number>): Uint8Array {
  const out = new ByteWriter();
  const n = values.length;
  let i = 0;
  while (i < n) {
    const v = values[i];
    let run = 1;
    while (i + run < n && values[i + run] === v && run < 0x7fffffff) run++;
    out.varint(run - 1);
    out.varint(v);
    i += run;
  }
  return out.bytes();
}

export function rleTiles(st: { type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array }): Uint8Array {
  const out = new ByteWriter();
  const n = st.type.length;
  let i = 0;
  while (i < n) {
    const t = st.type[i], fx = st.frameX[i], fy = st.frameY[i];
    let run = 1;
    while (i + run < n && st.type[i + run] === t && st.frameX[i + run] === fx && st.frameY[i + run] === fy) run++;
    out.varint(run - 1);
    out.varint(t);
    if (t !== 0) {
      out.varint(fx);
      out.varint(fy);
    }
    i += run;
  }
  return out.bytes();
}

/** 存档序列化主体。幽灵净化在视图上就地执行(主线程=活存储原语义;
 * worker=副本,净化不影响游戏内状态,存档字节一致) */
export function serializeSave(
  st: SaveStoreView, meta: SaveMeta,
  player: SaveData['player'], playTimeMs: number,
): string {
  // 幽灵净化:存档格式不携带 active 位(加载时 type≠0 即激活),
  // 非活性格上的残留 type 必须归零,否则重读后全部变成浮空实体块
  for (let i = 0; i < st.type.length; i++) {
    if (!st.flags[i] && st.type[i] !== 0) st.type[i] = 0;
  }
  const data: SaveData = {
    format: 'sandboxworld.save',
    version: 2,
    header: {
      name: meta.name, seed: meta.seed, width: meta.w, height: meta.h,
      spawn: [meta.spawnX, meta.spawnY], groundLevel: meta.groundLevel, rockLevel: meta.rockLevel,
      lavaLine: meta.lavaLine,
      treeX: meta.treeX, treeStyle: meta.treeStyle, treeTops: meta.treeTops,
      crimson: meta.crimson, dungeonX: meta.dungeonX, dungeonY: meta.dungeonY, jungleX: meta.jungleX,
      created: Date.now(), playTimeMs,
    },
    clock: { timeOfDay: meta.timeOfDay, dayCount: meta.dayCount },
    tiles: bytesToB64(rleTiles(st)),
    walls: bytesToB64(rlePairs(st.wall)),
    liquid: bytesToB64(rlePairs(st.liquid)),
    liquidType: bytesToB64(rlePairs(st.liquidType)),
    wire: bytesToB64(rlePairs(st.wire)),
    chests: meta.chests,
    player,
    npcs: [],
    signs: meta.signs,
    flags: meta.flags,
  };
  return JSON.stringify(data);
}
