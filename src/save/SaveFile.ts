// 自有存档格式：JSON 外壳（人可读）+ RLE 二进制 tile 段（base64）
import type { World } from '../world/World';
import { World as WorldClass } from '../world/World';
import type { Player } from '../entities/Player';

// ---- varint / base64 工具 ----
// 性能(2026-08 审计 #2):RLE 输出此前是裸 number[](boxed,8B/元素,push 增长),
// 6400×1800 世界存档瞬时 64~192MB;现改为密度增长的 Uint8Array(varint 字节流,
// 输出字节与旧实现逐位一致,存档格式不变)
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

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

function readVarint(u8: Uint8Array, pos: { i: number }): number {
  let v = 0, shift = 0;
  while (pos.i < u8.length) {
    const b = u8[pos.i++];
    v |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return v;
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
    crimson?: boolean; dungeonX?: number; jungleX?: number;
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
  };
  npcs: Array<{ key: string; x: number; y: number; home: [number, number] | null }>;
  flags: Record<string, boolean>;
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

export function saveGame(world: World, player: Player, playTimeMs: number): string {
  const st = world.store;
  // 幽灵净化:存档格式不携带 active 位(加载时 type≠0 即激活),
  // 非活性格上的残留 type 必须归零,否则重读后全部变成浮空实体块
  for (let i = 0; i < st.type.length; i++) {
    if (!st.flags[i] && st.type[i] !== 0) st.type[i] = 0;
  }
  const data: SaveData = {
    format: 'sandboxworld.save',
    version: 2,
    header: {
      name: world.name, seed: world.seed, width: st.w, height: st.h,
      spawn: [world.spawnX, world.spawnY], groundLevel: world.groundLevel, rockLevel: world.rockLevel,
      lavaLine: world.lavaLine,
      treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
      crimson: world.crimson, dungeonX: world.dungeonX, jungleX: world.jungleX,
      created: Date.now(), playTimeMs,
    },
    clock: { timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount },
    tiles: bytesToB64(rleTiles(st)),
    walls: bytesToB64(rlePairs(st.wall)),
    liquid: bytesToB64(rlePairs(st.liquid)),
    liquidType: bytesToB64(rlePairs(st.liquidType)),
    wire: bytesToB64(rlePairs(st.wire)),
    chests: world.chests,
    player: {
      hp: player.hp, x: player.x, y: player.y,
      inventory: player.inv.slots, selected: player.inv.selected,
    },
    npcs: [],
    flags: world.flags,
  };
  return JSON.stringify(data);
}

export function loadSave(json: string): ReturnType<typeof loadSaveData> {
  return loadSaveData(JSON.parse(json) as SaveData);
}

/** 直接从内存 SaveData 构建(导入 .wld 路径用——跳过 stringify→parse 双拷贝,
 *  2026-08 审计 #3:该往返单次 20~50MB×2) */
export function loadSaveData(data: SaveData): { world: World; player: { hp: number; x: number; y: number; inventory: Array<{ id: number; stack: number } | null>; selected: number } } {
  const world = new WorldClass(data.header.width, data.header.height, data.header.seed, data.header.name);
  world.spawnX = data.header.spawn[0];
  world.spawnY = data.header.spawn[1];
  world.groundLevel = data.header.groundLevel;
  world.rockLevel = data.header.rockLevel;
  // 旧档缺 lavaLine（原版 UnderworldLayer = maxTilesY-200）
  world.lavaLine = data.header.lavaLine ?? data.header.height - 200;
  if (data.header.treeX) world.treeX = data.header.treeX;
  if (data.header.treeStyle) world.treeStyle = data.header.treeStyle;
  if (data.header.treeTops?.length) world.treeTops = data.header.treeTops;
  if (data.header.crimson !== undefined) world.crimson = data.header.crimson;
  if (data.header.dungeonX !== undefined) world.dungeonX = data.header.dungeonX;
  if (data.header.jungleX !== undefined) world.jungleX = data.header.jungleX;
  world.clock.timeOfDay = data.clock.timeOfDay;
  world.clock.dayCount = data.clock.dayCount;
  world.chests = data.chests;
  world.flags = data.flags;

  const st = world.store;
  // tiles
  {
    const u8 = b64ToBytes(data.tiles);
    const pos = { i: 0 };
    let i = 0;
    while (i < st.type.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const t = readVarint(u8, pos);
      let fx = 0, fy = 0;
      if (t !== 0) {
        fx = readVarint(u8, pos);
        fy = readVarint(u8, pos);
      }
      for (let k = 0; k < run && i < st.type.length; k++, i++) {
        st.type[i] = t; st.flags[i] = t !== 0 ? 1 : 0;
        st.frameX[i] = fx; st.frameY[i] = fy;
      }
    }
  }
  // walls（version<2 的旧档墙值迁移：1=土→2, 2=石→1, 3=木→4（现为原版 id））
  {
    const legacy = (data.version ?? 1) < 2;
    const migrate = (v: number) => (legacy ? (v === 1 ? 2 : v === 2 ? 1 : v === 3 ? 4 : v) : v);
    const u8 = b64ToBytes(data.walls);
    const pos = { i: 0 };
    let i = 0;
    while (i < st.wall.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = migrate(readVarint(u8, pos));
      for (let k = 0; k < run && i < st.wall.length; k++, i++) st.wall[i] = v;
    }
  }
  // wire 电路位（旧存档缺此字段 → 全 0 = 无导线，缺字段容忍同 liquidType）
  {
    const u8 = b64ToBytes(data.wire ?? '');
    const pos = { i: 0 };
    let i = 0;
    while (i < st.wire.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.wire.length; k++, i++) st.wire[i] = v;
    }
  }
  // liquid type（旧存档缺此字段 → 全 0，由液体模拟按 1=水 补全）
  {
    const u8 = b64ToBytes(data.liquidType ?? '');
    const pos = { i: 0 };
    let i = 0;
    while (i < st.liquidType.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.liquidType.length; k++, i++) st.liquidType[i] = v;
    }
  }
  // liquid
  {
    const u8 = b64ToBytes(data.liquid);
    const pos = { i: 0 };
    let i = 0;
    while (i < st.liquid.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.liquid.length; k++, i++) st.liquid[i] = v;
    }
  }
  return { world, player: data.player };
}
