// 自有存档格式：JSON 外壳（人可读）+ RLE 二进制 tile 段（base64）
import type { World } from '../world/World';
import { World as WorldClass } from '../world/World';
import type { Player } from '../entities/Player';

// ---- varint / base64 工具 ----
function writeVarint(out: number[], v: number) {
  v = v < 0 ? 0 : v;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

export function bytesToB64(bytes: number[]): string {
  const u8 = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
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
    spawn: [number, number]; groundLevel: number; rockLevel: number;
    created: number; playTimeMs: number;
    wldVersion?: number;
  };
  clock: { timeOfDay: number; dayCount: number };
  tiles: string;   // base64 RLE
  walls: string;
  liquid: string;
  liquidType: string;  // base64 RLE（0无 1水 2岩浆 3蜂蜜）
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;
  player: {
    hp: number; x: number; y: number;
    inventory: Array<{ id: number; stack: number } | null>;
    selected: number;
  };
  npcs: Array<{ key: string; x: number; y: number; home: [number, number] | null }>;
  flags: Record<string, boolean>;
}

export function rlePairs(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  const n = values.length;
  let i = 0;
  while (i < n) {
    const v = values[i];
    let run = 1;
    while (i + run < n && values[i + run] === v && run < 0x7fffffff) run++;
    writeVarint(out, run - 1);
    writeVarint(out, v);
    i += run;
  }
  return out;
}

export function rleTiles(st: { type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array }): number[] {
  const out: number[] = [];
  const n = st.type.length;
  let i = 0;
  while (i < n) {
    const t = st.type[i], fx = st.frameX[i], fy = st.frameY[i];
    let run = 1;
    while (i + run < n && st.type[i + run] === t && st.frameX[i + run] === fx && st.frameY[i + run] === fy) run++;
    writeVarint(out, run - 1);
    writeVarint(out, t);
    if (t !== 0) {
      writeVarint(out, fx);
      writeVarint(out, fy);
    }
    i += run;
  }
  return out;
}

export function saveGame(world: World, player: Player, playTimeMs: number): string {
  const st = world.store;
  const data: SaveData = {
    format: 'sandboxworld.save',
    version: 1,
    header: {
      name: world.name, seed: world.seed, width: st.w, height: st.h,
      spawn: [world.spawnX, world.spawnY], groundLevel: world.groundLevel, rockLevel: world.rockLevel,
      created: Date.now(), playTimeMs,
    },
    clock: { timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount },
    tiles: bytesToB64(rleTiles(st)),
    walls: bytesToB64(rlePairs(st.wall)),
    liquid: bytesToB64(rlePairs(st.liquid)),
    liquidType: bytesToB64(rlePairs(st.liquidType)),
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

export function loadSave(json: string): { world: World; player: { hp: number; x: number; y: number; inventory: Array<{ id: number; stack: number } | null>; selected: number } } {
  const data = JSON.parse(json) as SaveData;
  const world = new WorldClass(data.header.width, data.header.height, data.header.seed, data.header.name);
  world.spawnX = data.header.spawn[0];
  world.spawnY = data.header.spawn[1];
  world.groundLevel = data.header.groundLevel;
  world.rockLevel = data.header.rockLevel;
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
  // walls
  {
    const u8 = b64ToBytes(data.walls);
    const pos = { i: 0 };
    let i = 0;
    while (i < st.wall.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.wall.length; k++, i++) st.wall[i] = v;
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
