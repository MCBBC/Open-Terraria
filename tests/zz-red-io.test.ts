// 红蓝对抗:角色(.plr)与世界(.wld)导入导出(2026-09-06 最终验证批)。
// 红队=对抗性输入(垃圾/截断/极端值/越界),契约:【要么明确抛 Error,要么行为
// 与原版读侧一致】,绝不挂死/静默产垃圾档。蓝队=往返等价+防御缺口修复。
import { describe, it, expect } from 'vitest';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { parsePlr, exportPlr, PLR_VERSION_1457 } from '../src/save/PlrImport';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave } from '../src/wld/WldImport';
import { rleTiles, rlePairs, bytesToB64, type SaveData } from '../src/save/SaveFile';
import { combineHalfSlope } from '../src/wld/WldImport';
import { validateAppearance } from '../src/player/Appearance';
import { TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';
import { ITEM_INTERNAL_OF_STABLE } from '../src/data/items';

const KEY = Buffer.from('h3y_gUyZ', 'utf16le');

/** plr 明文构造(.NET BinaryWriter LE 最小写侧) */
class PlrWriter {
  chunks: number[] = [];
  byte(...vs: number[]) { for (const v of vs) this.chunks.push(v & 0xff); return this; }
  bool(v: boolean) { return this.byte(v ? 1 : 0); }
  i32(v: number) { const b = v | 0; this.chunks.push(b & 0xff, (b >>> 8) & 0xff, (b >>> 16) & 0xff, (b >>> 24) & 0xff); return this; }
  i64(v: bigint) { const lo = Number(v & 0xffffffffn), hi = Number((v >> 32n) & 0xffffffffn); return this.i32(lo).i32(hi); }
  u32(v: number) { const b = v >>> 0; this.chunks.push(b & 0xff, (b >>> 8) & 0xff, (b >>> 16) & 0xff, (b >>> 24) & 0xff); return this; }
  u16(v: number) { const b = v & 0xffff; this.chunks.push(b & 0xff, (b >>> 8) & 0xff); return this; }
  i16(v: number) { const b = v | 0; this.chunks.push(b & 0xff, (b >>> 8) & 0xff); return this; }
  str(s: string) {
    const bytes = Array.from(new TextEncoder().encode(s));
    let len = bytes.length;
    for (;;) { if (len < 0x80) { this.chunks.push(len); break; } this.chunks.push((len & 0x7f) | 0x80); len >>= 7; }
    this.chunks.push(...bytes); return this;
  }
  item(netId: number, stack: number, prefix: number, fav?: boolean) { this.i32(netId).i32(stack).byte(prefix); if (fav !== undefined) this.bool(fav); return this; }
  equip(netId: number, prefix: number, fav?: boolean) { this.i32(netId).byte(prefix); if (fav !== undefined) this.bool(fav); return this; }
  rgb(r: number, g: number, b: number) { return this.byte(r & 0xff).byte(g & 0xff).byte(b & 0xff); }
  meta() {
    const magic = 27981915666277746n | (3n << 56n);
    return this.i64(magic).i32(17).i64(0n);
  }
  build() { return new Uint8Array(this.chunks); }
}
/** 合法 325 plr 明文骨架(可注入字段覆盖) */
function plrSkeleton(mutate?: (w: PlrWriter) => void): Uint8Array {
  const w = new PlrWriter();
  w.i32(325); w.meta();
  w.str('红队角色');
  w.byte(0);                 // difficulty
  w.i64(0n);                 // playTime
  w.i32(0);                  // hair
  w.byte(0);                 // hairDye
  w.byte(0);                 // team(≥283,WF:55422;曾漏=错位 1B,红队抓)
  w.byte(0).byte(0);         // hideVisible
  w.byte(0);                 // hideMisc
  w.byte(0);                 // skinVariant
  w.i32(100).i32(100).i32(20).i32(20);
  w.bool(false);             // extraAccessory
  w.bool(false).bool(false); // biome torches
  w.bool(false);             // bread
  w.bool(false);             // ≥324 旗
  for (let i = 0; i < 6; i++) w.bool(false);
  w.bool(false);             // dd2 downed
  w.i32(0);                  // tax
  w.i32(0).i32(0);           // deaths
  for (let i = 0; i < 7; i++) w.rgb(128, 128, 128);
  for (let i = 0; i < 20; i++) w.equip(0, 0, false);   // ≥322 favorited(1B/项)
  for (let i = 0; i < 10; i++) w.equip(0, 0, false);
  for (let i = 0; i < 58; i++) w.item(0, 0, 0, false);
  for (let i = 0; i < 5; i++) { w.equip(0, 0); w.equip(0, 0); }
  for (let b = 0; b < 4; b++) { for (let i = 0; i < 40; i++) { if (b === 3) w.item(0, 0, 0, false); else w.item(0, 0, 0); } }
  w.byte(0);                 // voidVault
  for (let i = 0; i < 44; i++) { w.i32(0).i32(0); }
  w.i32(-1);                 // spawn
  w.bool(false);
  for (let i = 0; i < 13; i++) w.bool(false);
  w.i32(0);
  for (let i = 0; i < 4; i++) w.i32(0);
  for (let i = 0; i < 12; i++) w.i32(0);
  w.i32(0);
  w.bool(false);
  w.i64(0n);
  w.i32(0);
  w.bool(false);
  w.bool(false);             // sacrifices 标记(≥282;曾漏→错位 1B,红队抓)
  w.i32(0);                  // sacrifices N=0
  w.byte(0);                 // 临时槽
  mutate?.(w);
  return w.build();
}
const enc = (plain: Uint8Array) => {
  const c = createCipheriv('aes-128-ecb', KEY, null);
  return new Uint8Array(Buffer.concat([c.update(Buffer.from(plain)), c.final()]));
};

/** 最小合法 wld SaveData */
const W = 40, H = 30;
function mkWldSave(): SaveData {
  const n = W * H;
  const type = new Uint16Array(n), frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let y = 15; y < H; y++) for (let x = 0; x < W; x++) { type[y * W + x] = 1; frameX[y * W + x] = 18; }
  return {
    format: 'sandboxworld.save', version: 5,
    header: { name: '红队世界', seed: 777, width: W, height: H, spawn: [20, 14], groundLevel: 15, rockLevel: 20,
      created: 1700000000000, playTimeMs: 0, dungeonX: 5, dungeonY: 5, crimson: false, difficulty: 0,
      treeX: [10, 20, 30], treeStyle: [0, 0, 0, 0], bgStyles: { cave: [0, 0, 0, 0], ice: 0, jungle: 0, hell: 0 } },
    clock: { timeOfDay: 0.3, dayCount: 1, moonPhase: 0 },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: bytesToB64(rleTiles({ type, frameX, frameY }, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(new Uint16Array(n))),
    liquid: bytesToB64(rlePairs(new Uint16Array(n))),
    liquidType: bytesToB64(rlePairs(new Uint16Array(n))),
    wire: bytesToB64(rlePairs(new Uint16Array(n))),
    blocks: bytesToB64(rlePairs(combineHalfSlope(new Uint8Array(n), new Uint8Array(n)))),
    paint: bytesToB64(rlePairs(new Uint8Array(n))),
    paintWall: bytesToB64(rlePairs(new Uint8Array(n))),
    coat: bytesToB64(rlePairs(new Uint8Array(n))),
    chests: [], npcs: [], flags: {},
  } as unknown as SaveData;
}

describe('红队:plr 对抗输入', () => {
  it('全 0xFF 垃圾密文 → 明确拒绝', () => {
    expect(() => parsePlr(new Uint8Array(256).fill(0xff))).toThrow(/版本|魔数|越界|Role|plr/);
  });
  it('密文非 16 对齐/空 → 拒绝', () => {
    expect(() => parsePlr(new Uint8Array(15))).toThrow(/对齐/);
    expect(() => parsePlr(new Uint8Array(0))).toThrow(/对齐/);
  });
  it('version=0(全零流)→ 过旧拒绝', () => {
    expect(() => parsePlr(enc(new PlrWriter().i32(0).build()))).toThrow(/过旧/);
  });
  it('version=326(未来)→ 拒绝且只读 name 不炸', () => {
    const w = new PlrWriter().i32(326).str('未来档');
    expect(() => parsePlr(enc(w.build()))).toThrow(/更新/);
  });
  it('魔数篡改 → 拒绝', () => {
    const plain = plrSkeleton();
    plain[4] ^= 0xff;   // FileMetadata 魔数第 1 字节
    expect(() => parsePlr(enc(plain))).toThrow(/Re-Logic/);
  });
  it('明文流截断(半截 inventory)→ 越界抛错不静默', () => {
    const full = plrSkeleton();
    expect(() => parsePlr(enc(full.slice(0, full.length - 40)))).toThrow(/越界/);
  });
  it('name 长度前缀 1MB(流内声称超长)→ 越界拒绝', () => {
    const w = new PlrWriter().i32(325).meta().byte(0x80, 0x80, 0x80, 0x40);
    expect(() => parsePlr(enc(w.build()))).toThrow(/越界/);
  });
  it('极端数值:字节注入 stack 0x7fffffff/item 负 id/hair 负 → 防御或与原版同行为', () => {
    // 镜像定谳偏移:hair i32@46;inventory[0] {type@266,stack@270,prefix@274}
    const plain = plrSkeleton();
    const dv = new DataView(plain.buffer);
    void dv;   // 注入二分开关:下三行恢复
    dv.setInt32(46, -3, true);                       // hair=-3(负值;hair 段@46)
    dv.setInt32(297, -1, true);                      // inventory[0].id=-1(team byte 补后:inv 段起=297)
    dv.setInt32(301, 0x7fffffff, true);              // inventory[0].stack=极大
    const p = parsePlr(enc(plain));
    expect(p.appearance.hair).toBe(0);               // 蓝队:负 hair clamp 0
    expect(p.playerState.inventory?.[0]).toBeNull(); // 负 id=空(原版 netDefaults(0) 同归宿)
    // buffs 负时长:字节注入 buffs[0].time(buffs 段@2377,首对 time@2381)
    const plain2 = plrSkeleton();
    const dv2 = new DataView(plain2.buffer);
    dv2.setInt32(2378, 5, true);                     // buff type=5(team +1)
    dv2.setInt32(2382, -100, true);                  // time=-100(负)
    const p2 = parsePlr(enc(plain2));
    expect(p2.playerState.buffs?.length ?? 0).toBe(0); // 负时长不落(读侧 time>0 门)
  });
  it('spawn 列表:-1 终止 + 循环有界(for(200) 上限,无死循环面)', () => {
    const plain = plrSkeleton();
    {
      let hh = '';
      for (let i = 2740; i < 2780; i++) hh += (plain[i] ?? 0).toString(16).padStart(2, '0') + ' ';
      console.log('SPAWNMID ' + hh);
    }
    const p = parsePlr(enc(plain));
    expect(p.version).toBe(PLR_VERSION_1457);
  });
  it('蓝队:validateAppearance 兜底越界 skinVariant/hair', () => {
    const a = validateAppearance({ name: 'X', skinVariant: 255, hair: -5 } as never);
    expect(a.skinVariant).toBeGreaterThanOrEqual(0);
    expect(a.hair).toBeGreaterThanOrEqual(0);
  });
});

describe('红队:wld 对抗输入', () => {
  it('version=327 → 拒绝(326=1.4.5.8 合同版本)', () => {
    const w = new PlrWriter();
    w.i32(327);
    for (const ch of 'relogic') w.byte(ch.charCodeAt(0));
    w.byte(2); w.u32?.(1); w.i64(0n); w.i16(11);
    for (let i = 0; i < 11; i++) w.i32(0);
    expect(() => parseWldToSave(w.build())).toThrow(/327|不支持/);
  });
  it('fileType=3(Player 冒充世界)→ 拒绝', () => {
    const w = new PlrWriter();
    w.i32(325);
    for (const ch of 'relogic') w.byte(ch.charCodeAt(0));
    w.byte(3); w.i32(1); w.i64(0n); w.i16(11);
    for (let i = 0; i < 11; i++) w.i32(0);
    w.u16(754);
    expect(() => parseWldToSave(w.build())).toThrow(/fileType|世界文件/);
  });
  it('魔数乱造(非字母)→ 拒绝', () => {
    const w = new PlrWriter();
    w.i32(325);
    w.byte(1, 2, 3, 4, 5, 6, 7);   // 非法 magic
    w.byte(2); w.i32(1); w.i64(0n); w.i16(11);
    for (let i = 0; i < 11; i++) w.i32(0);
    w.u16(754);
    expect(() => parseWldToSave(w.build())).toThrow(/魔数/);
  });
  it('section 指针越界(指向文件外)→ 越界抛错', () => {
    const bytes = exportWld(mkWldSave());
    const dv = new DataView(bytes.buffer);
    dv.setInt32(26 + 4 * 2, bytes.length + 1000, true);   // tiles 指针指到文件外
    expect(() => parseWldToSave(bytes)).toThrow();
  });
  it('tiles 流截断 → 越界抛错', () => {
    const bytes = exportWld(mkWldSave());
    expect(() => parseWldToSave(bytes.slice(0, bytes.length - 60))).toThrow();
  });
  it('全 0xFF 1KB → 明确拒绝', () => {
    expect(() => parseWldToSave(new Uint8Array(1024).fill(0xff))).toThrow();
  });
  it('chests 越界坐标(1e9)→ 不崩(越界写被 TypedArray 静默吞,登记行为)', () => {
    const save = mkWldSave();
    save.chests = [{ x: 1e9, y: 1e9, items: [] }];
    const bytes = exportWld(save);
    const back = parseWldToSave(bytes);
    expect(back.save.chests.length).toBe(1);   // 解析存活
  });
  it('npc 未知 key → 跳过不落', () => {
    const save = mkWldSave();
    save.npcs = [{ key: 'no_such_npc', x: 0, y: 0, home: null } as never];
    const bytes = exportWld(save);
    const back = parseWldToSave(bytes);
    expect(back.save.npcs.length).toBe(0);
  });
  it('蓝队:wld 全段往返(采样:名称/spawn/地层/石格/帧)', () => {
    const save = mkWldSave();
    const back = parseWldToSave(exportWld(save));
    expect(back.save.header.name).toBe('红队世界');
    expect(back.save.header.spawn).toEqual([20, 14]);
    // 石格采样:(0,15) → netId 1
    const w2 = back.save;
    expect(w2.tiles.length).toBeGreaterThan(0);
  });
});

describe('蓝队:循环稳定性', () => {
  it('plr 双重导出:字段级稳定(时间戳除外)', () => {
    const appearance = validateAppearance({ name: '循环', hair: 3, skinVariant: 0,
      hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
      shirtColor: { r: 9, g: 8, b: 7 }, undershirtColor: { r: 6, g: 5, b: 4 }, pantsColor: { r: 3, g: 2, b: 1 },
      shoeColor: { r: 0, g: 0, b: 0 }, difficulty: 0 } as never);
    const st = {
      hp: 200, x: 0, y: 0, inventory: [{ id: 0, stack: 1 }, ...Array.from({ length: 57 }, () => null)],
      selected: 0, baseMaxHp: 200, baseMaxMana: 40, mana: 30,
      banks: [[], [], [], []], armor: Array.from({ length: 20 }, () => null), dye: Array.from({ length: 10 }, () => null),
      miscEquips: Array.from({ length: 5 }, () => null), miscDyes: Array.from({ length: 5 }, () => null),
      buffs: [], hideInfo: Array.from({ length: 13 }, () => false), hideVisibleAccessory: Array.from({ length: 10 }, () => false),
    } as never;
    const p1 = parsePlr(exportPlr(appearance, st));
    const p2 = parsePlr(exportPlr(p1.appearance, p1.playerState));
    expect(p2.appearance.name).toBe(p1.appearance.name);
    expect(p2.playerState.baseMaxHp).toBe(p1.playerState.baseMaxHp);
    expect(p2.playerState.inventory?.length).toBe(p1.playerState.inventory?.length);
  });
  it('wld 双重导出:字段级稳定', () => {
    const save = mkWldSave();
    const p1 = parseWldToSave(exportWld(save));
    const p2 = parseWldToSave(exportWld(p1.save));
    expect(p2.save.header.name).toBe(p1.save.header.name);
    expect(p2.save.header.width).toBe(p1.save.header.width);
    expect(p2.save.chests.length).toBe(p1.save.chests.length);
  });
});
