import { describe, it, expect } from 'vitest';
import { parseWld } from '../src/wld/WldParser';
import { BinaryReaderLE } from '../src/wld/BinaryReaderLE';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
// ================= 合成 v279 (1.4.4) .wld 固件 =================
class Writer {
    constructor() {
        Object.defineProperty(this, "out", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    u8(v) { this.out.push(v & 0xff); return this; }
    i16(v) { this.u8(v); this.u8(v >> 8); return this; }
    i32(v) { this.i16(v); this.i16(v >> 16); return this; }
    f32(v) {
        const dv = new DataView(new ArrayBuffer(4));
        dv.setFloat32(0, v, true);
        for (let i = 0; i < 4; i++)
            this.u8(dv.getUint8(i));
        return this;
    }
    f64(v) {
        const dv = new DataView(new ArrayBuffer(8));
        dv.setFloat64(0, v, true);
        for (let i = 0; i < 8; i++)
            this.u8(dv.getUint8(i));
        return this;
    }
    bool(v) { this.u8(v ? 1 : 0); return this; }
    str(s) {
        const bytes = new TextEncoder().encode(s);
        let len = bytes.length;
        while (len >= 0x80) {
            this.u8((len & 0x7f) | 0x80);
            len >>>= 7;
        }
        this.u8(len);
        for (const b of bytes)
            this.u8(b);
        return this;
    }
    bytes(arr) { for (let i = 0; i < arr.length; i++)
        this.u8(arr[i]); return this; }
}
function buildFixtureV279() {
    const VERSION = 279;
    const W = 4, H = 4;
    const w = new Writer();
    // -- 占位 section 头（写完各段后回填 pointers） --
    w.i32(VERSION);
    w.bytes(new TextEncoder().encode('relogic'));
    w.u8(2); // fileType = World（TEdit 枚举：Map=1, World=2）
    w.i32(1); // revision
    w.i32(0);
    w.i32(0); // favorite u64
    w.i16(10); // sectionCount
    const ptrPos = w.out.length;
    for (let i = 0; i < 10; i++)
        w.i32(0); // 占位
    // tileFrameImportant 位图：len 30，LSB-first（与 TEdit ReadBitArray 一致）
    const important = [4, 5, 10, 21];
    w.i16(30);
    const bits = new Uint8Array(4);
    for (const id of important)
        bits[id >> 3] |= 1 << (id & 7);
    w.bytes(bits);
    const pointers = [];
    const mark = () => pointers.push(w.out.length);
    // ---- header flags ----
    mark();
    w.str('测试世界').str('seed123');
    w.i32(0);
    w.i32(0); // worldGenVersion u64
    w.bytes(new Array(16).fill(1)); // guid
    w.i32(777); // worldId
    w.i32(0);
    w.i32(W * 16);
    w.i32(0);
    w.i32(H * 16); // bounds
    w.i32(H);
    w.i32(W); // tilesHigh, tilesWide
    w.i32(0); // gameMode
    w.bool(false);
    w.bool(false);
    w.bool(false);
    w.bool(false);
    w.bool(false);
    w.bool(false);
    w.bool(false);
    w.bool(false); // drunk..zenith (222..267)
    w.i32(1000);
    w.i32(1000); // creationTime i64
    w.u8(0); // moonType
    for (let i = 0; i < 3; i++)
        w.i32(0);
    for (let i = 0; i < 4; i++)
        w.i32(0);
    for (let i = 0; i < 3; i++)
        w.i32(0);
    for (let i = 0; i < 4; i++)
        w.i32(0);
    w.i32(0);
    w.i32(0);
    w.i32(0);
    w.i32(2);
    w.i32(2); // spawnX spawnY
    w.f64(20.5);
    w.f64(40.5);
    w.f64(13500); // ground/rock/time
    w.bool(true); // dayTime
    w.i32(0); // moonPhase
    w.bool(false);
    w.bool(false); // blood moon / eclipse
    w.i32(0);
    w.i32(0); // dungeon
    w.bool(false); // crimson
    for (let i = 0; i < 10; i++)
        w.bool(false); // downed bosses
    w.bool(false); // slime king (118)
    for (let i = 0; i < 7; i++)
        w.bool(false); // saved flags
    w.bool(false);
    w.bool(false); // orb smashed / meteor
    w.u8(0);
    w.i32(0);
    w.bool(false); // orbCount altarCount hardMode
    w.bool(false); // partyOfDoom (257)
    w.i32(0);
    w.i32(0);
    w.i32(0);
    w.f64(0); // invasion
    w.f64(0); // slimeRain (118)
    w.u8(0); // sundial (113)
    w.bool(false);
    w.i32(0);
    w.f32(0); // rain
    w.i32(0);
    w.i32(0);
    w.i32(0); // ore tiers
    for (let i = 0; i < 8; i++)
        w.u8(0); // bg
    w.i32(0);
    w.i16(0);
    w.f32(0); // clouds/wind
    w.i32(0); // angler count
    w.bool(false);
    w.i32(0);
    w.bool(false); // savedAngler/quest/stylist
    w.bool(false);
    w.bool(false); // taxCollector(140) golfer(201)
    w.i32(0);
    w.i32(0); // invasionSizeStart(107) cultistDelay(108)
    w.i16(0); // banners
    w.bool(false); // fastForwardTime(140)
    w.bool(false); // fishron
    w.bool(false);
    w.bool(false);
    w.bool(false); // martians/cultist/moonlord(140)
    for (let i = 0; i < 5; i++)
        w.bool(false); // holiday bosses
    for (let i = 0; i < 4; i++)
        w.bool(false); // celestial downed
    for (let i = 0; i < 4; i++)
        w.bool(false); // celestial active
    w.bool(false); // apocalypse
    w.bool(false);
    w.bool(false);
    w.i32(0);
    w.i32(0); // party(170)
    w.bool(false);
    w.i32(0);
    w.f32(0);
    w.f32(0); // sandstorm(174)
    w.bool(false);
    w.bool(false);
    w.bool(false);
    w.bool(false); // bartender(178)
    w.u8(0); // mushroomBg(194)
    w.u8(0); // underworldBg(215)
    w.u8(0);
    w.u8(0);
    w.u8(0); // bgTree2,3,4(195)
    w.bool(false); // combatBook(204)
    w.i32(0);
    w.bool(false);
    w.bool(false);
    w.bool(false); // lantern(207)
    w.i32(13);
    for (let i = 0; i < 13; i++)
        w.i32(0); // treetops(211)
    w.bool(false);
    w.bool(false); // forceH/X(212)
    w.i32(0);
    w.i32(0);
    w.i32(0);
    w.i32(0); // oreTiers(216)
    w.bool(false);
    w.bool(false);
    w.bool(false); // pets(217)
    w.bool(false);
    w.bool(false); // empress/queenSlime(223)
    w.bool(false); // deerclops(240)
    w.bool(false); // slimeBlue(250)
    for (let i = 0; i < 8; i++)
        w.bool(false); // unlocks(251)
    w.bool(false); // 259
    w.bool(false); // 260
    for (let i = 0; i < 7; i++)
        w.bool(false); // 261
    w.bool(false);
    w.u8(0); // 264
    // ---- tiles 段：4x4，列优先 ----
    // 列0: dirt×4（RLE type1 计数3）
    // 列1: y0=stone, y1=stone, y2=air+wall3, y3=air+liquid水
    // 列2: y0=torch(framed), y1..y3=air
    // 列3: y0..y1=air, y2=chest(framed U/V), y3=air
    mark();
    const tileByte = (b) => w.u8(b);
    // 列0: dirt no-wall: header1 = active(0x02), type 0(dirt), RLE type1 count 3 → header1 |= 0x40
    tileByte(0x02 | 0x40);
    w.u8(0);
    w.u8(3);
    // 列1 y0: stone active, RLE count1 → header1 |= 0x40 count1
    tileByte(0x02 | 0x40);
    w.u8(1);
    w.u8(1);
    // 列1 y2: air + wall(3) → header1 = 0x04, wall byte 3
    tileByte(0x04);
    w.u8(3);
    // 列1 y3: air + liquid water(type1) amount 200 → header1 = 0x08
    tileByte(0x08);
    w.u8(200);
    // 列2 y0: torch: active + framed
    tileByte(0x02);
    w.u8(4);
    w.i16(0);
    w.i16(0);
    // 列2 y1..y3: air RLE count2
    tileByte(0xC0);
    w.i16(2); // RLE type 3 → int16
    // 列3 y0: air RLE count 1 (type1)
    tileByte(0x40);
    w.u8(1);
    // 列3 y2: chest framed with UV
    tileByte(0x02);
    w.u8(21);
    w.i16(0);
    w.i16(0);
    // 列3 y3: air
    tileByte(0x00);
    // ---- chests 段 ----
    mark();
    w.i16(1); // total chests
    w.i16(2); // maxItems (v<294)
    w.i32(2);
    w.i32(2);
    w.str('木箱');
    w.i16(5);
    w.i32(8);
    w.u8(0); // slot0: 5×torch(id 8)
    w.i16(0); // slot1 empty
    // ---- signs 段（跳过） ----
    mark();
    w.i16(0);
    // ---- npcs 段 ----
    mark();
    w.i32(0); // shimmered count (268)
    w.bool(true); // town npc
    w.i32(17); // Guide spriteId
    w.str('Andrew');
    w.f32(32);
    w.f32(32);
    w.bool(false); // homeless
    w.i32(2);
    w.i32(2); // home
    w.u8(0); // variation flag (213)
    w.bool(false); // end town loop
    w.bool(false); // mobs end
    // 剩余 sections 占位（tileEntities / pressurePlates / townManager / bestiary / creativePowers）
    for (let i = 0; i < 5; i++)
        mark();
    // 回填 pointers
    const u8 = new Uint8Array(w.out);
    for (let i = 0; i < 10; i++) {
        const v = pointers[i] ?? 0;
        u8[ptrPos + i * 4] = v & 0xff;
        u8[ptrPos + i * 4 + 1] = (v >> 8) & 0xff;
        u8[ptrPos + i * 4 + 2] = (v >> 16) & 0xff;
        u8[ptrPos + i * 4 + 3] = (v >> 24) & 0xff;
    }
    return u8;
}
describe('.wld 解析器（v279 固件）', () => {
    const buf = buildFixtureV279();
    it('解析 header', () => {
        const wld = parseWld(buf);
        expect(wld.version).toBe(279);
        expect(wld.title).toBe('测试世界');
        expect(wld.tilesWide).toBe(4);
        expect(wld.tilesHigh).toBe(4);
        expect(wld.spawnX).toBe(2);
        expect(wld.groundLevel).toBeCloseTo(20.5);
        expect(wld.dayTime).toBe(true);
    });
    it('解码 tiles：RLE / 墙 / 液体 / framed', () => {
        const wld = parseWld(buf);
        const t = wld.tiles;
        const at = (x, y) => y * 4 + x;
        // 列0 全 dirt
        for (let y = 0; y < 4; y++)
            expect(t.type[at(0, y)]).toBe(0);
        // 列1
        expect(t.type[at(1, 0)]).toBe(1);
        expect(t.type[at(1, 1)]).toBe(1);
        expect(t.type[at(1, 2)]).toBe(0);
        expect(t.wall[at(1, 2)]).toBe(3);
        expect(t.type[at(1, 3)]).toBe(0);
        expect(t.liquid[at(1, 3)]).toBe(200);
        expect(t.liquidType[at(1, 3)]).toBe(1);
        // 列2 火把
        expect(t.type[at(2, 0)]).toBe(4);
        for (let y = 1; y < 4; y++)
            expect(t.type[at(2, y)]).toBe(0);
        // 列3 宝箱
        expect(t.type[at(3, 2)]).toBe(21);
        expect(t.type[at(3, 0)]).toBe(0);
    });
    it('解析 chests 与 npcs', () => {
        const wld = parseWld(buf);
        expect(wld.chests).toHaveLength(1);
        expect(wld.chests[0].x).toBe(2);
        expect(wld.chests[0].items[0]).toEqual({ id: 8, stack: 5 });
        expect(wld.chests[0].items[1]).toBeNull();
        expect(wld.npcs).toHaveLength(1);
        expect(wld.npcs[0].spriteId).toBe(17);
        expect(wld.npcs[0].name).toBe('Andrew');
    });
    it('转换为自有存档格式并加载', () => {
        const { save } = parseWldToSave(buf);
        expect(save.header.width).toBe(4);
        expect(save.header.wldVersion).toBe(279);
        const { world } = loadSave(JSON.stringify(save));
        expect(world.store.get(0, 0)).toBeGreaterThan(0); // dirt
        expect(world.chests).toHaveLength(1);
        expect(world.store.get(3, 2)).toBeGreaterThan(0); // chest
    });
});
describe('BinaryReaderLE', () => {
    it('7-bit 字符串', () => {
        const w = new Writer();
        w.str('你好世界');
        const r = new BinaryReaderLE(new Uint8Array(w.out));
        expect(r.string()).toBe('你好世界');
    });
});
