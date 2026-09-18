// 拍板#11A（2026-09-18，RB15c「bestiary 读侧分叉」债收口）——bestiary 段两读侧行为钉锁。
//
// ★定谳复核（本件开工亲测探针 + 原版源码亲读，推翻 RB15c 补腿的机制归属）：
//  1.「parseWldToSave（存档域）缺 bestiary 段=拒载」不成立——parseWldToSave
//    （WldImport.ts:484）就是调 WldParser.parseWld，两读侧【同一函数】；探针实测
//    bestiary 整段缺（slice@pointers[8]=bestiary 起点）两侧均不抛、bestiary 落空。
//  2. RB15c zz-red-io 补腿「slice(0,pointers[7])=bestiary 整段缺 → 抛(bestiary count
//    读 EOF)」系段表错位误读：pointers[7]=压力板尾=townManager 起点（fx35
//    buildWldWithTail 回钉序 marks[2]→pointers[8]=townManager 尾=bestiary 起点；
//    探针字节面 i32@p[7]=0=townManager 计数 / i32@p[8]=1=bestiary Kills 计数双证）。
//    该 slice 抛 越界 的真身=townRooms 段读（WldParser 无 try/catch）读 EOF，与
//    bestiary 无关——bestiary 块自带 try/catch（FX35「脏段容错」），EOF 被吞。
//  3. 原版读侧语义（Terarria1457/Terraria.IO/WorldFile.cs）：LoadBestiary（:3417-3420
//    →BestiaryUnlocksTracker.Load）无内部容错；LoadWorld_Version2 在 LoadBestiary 后
//    对账 `Position != positions[9]` → BadSectionPointer【整档拒载】（:1840-1846），
//    截断则 EndOfStreamException 直传。即原版对 bestiary 缺失/损坏=拒。
//  4. 本仓两读侧对 bestiary 缺失/损坏=容错（FX35 刻意偏差，catch 注「脏段容错：保已
//    解析桶」）——与原版分向，系已登记刻意偏差；本测试将其钉锁为契约（防未来单侧
//    加严/放宽漂移），对 townManager 缺失=拒载同样钉锁（原版 LoadTownManager
//    positions[8] 对账 :1832-1836 同向）。
// 变异判别力（本文件两条红证，见 tail 注）：MUT-1 摘 WldParser bestiary try/catch
//  →「损坏容错」腿红；MUT-2 给 townRooms 段加 try/catch（容错越权放宽）→「townManager
//  缺失必抛」腿红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave, combineHalfSlope } from '../src/wld/WldImport';
import { parseWld } from '../src/wld/WldParser';
import { rleTiles, rlePairs, bytesToB64, type SaveData } from '../src/save/SaveFile';
import { TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';

const VANILLA_WF = join(dirname(__dirname), '..', 'Terarria1457', 'Terraria.IO', 'WorldFile.cs');

const W = 40, H = 30;
function mkWldSave(bestiary?: SaveData['bestiary']): SaveData {
  const n = W * H;
  const type = new Uint16Array(n), frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let y = 15; y < H; y++) for (let x = 0; x < W; x++) { type[y * W + x] = 1; frameX[y * W + x] = 18; }
  return {
    format: 'sandboxworld.save', version: 5,
    header: { name: '图鉴容错探针', seed: 777, width: W, height: H, spawn: [20, 14], groundLevel: 15, rockLevel: 20,
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
    bestiary,
  } as unknown as SaveData;
}

/** 段表读取（头 26B 元数据 + 11×i32 pointers,与 WldExport SaveHeaderPointers 同构） */
function pointersOf(bytes: Uint8Array): number[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p: number[] = [];
  for (let i = 0; i < 11; i++) p.push(dv.getInt32(26 + i * 4, true));
  return p;
}

describe('拍板#11A:bestiary 段两读侧行为钉锁（游戏路径 parseWld ≡ 存档域 parseWldToSave）', () => {
  it('段表归属锚:pointers[8]=bestiary 起点（Kills 计数+首键字节面,防 RB15c 错位复辟）', () => {
    const bytes = exportWld(mkWldSave({ k: { Zombie: 3 }, s: ['Slime'], c: ['Guide'] }));
    const p = pointersOf(bytes);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getInt32(p[8], true)).toBe(1);            // bestiary Kills count=1
    expect(Array.from(bytes.slice(p[8] + 4, p[8] + 5))[0]).toBe(6); // 7bit 前缀 'Zombie'(6B)
    expect(dv.getInt32(p[7], true)).toBe(0);            // p[7]=townManager 起点计数=0
  });

  it('bestiary 整段缺失（slice@pointers[8]）:两读侧均不抛且行为一致（存档域 bestiary=undefined）', () => {
    const bytes = exportWld(mkWldSave({ k: { Zombie: 3 }, s: ['Slime'], c: ['Guide'] }));
    const p = pointersOf(bytes);
    const cut = bytes.slice(0, p[8]);   // 保到 bestiary 起:bestiary+creativePowers+footer 缺
    // 游戏路径
    let gErr: unknown = null, gBestiary: unknown;
    try { gBestiary = parseWld(cut).bestiary; } catch (e) { gErr = e; }
    expect(gErr, '游戏路径竟拒载=FX35 容错被摘(与存档域分叉)').toBeNull();
    expect(gBestiary).toEqual({ k: {}, s: [], c: [] });
    // 存档域
    let sErr: unknown = null, sBestiary: unknown;
    try { sBestiary = (parseWldToSave(cut).save as { bestiary?: unknown }).bestiary; } catch (e) { sErr = e; }
    expect(sErr, '存档域竟拒载=RB15c 判词形态复辟(与游戏路径分叉)').toBeNull();
    expect(sBestiary).toBeUndefined();   // 空桶三元归一 undefined(WldImport:1031)
  });

  it('bestiary 段内损坏（Sights 计数谎报 99,段尾指针完好）:两读侧均容错且结果逐字一致', () => {
    const bytes = exportWld(mkWldSave({ k: { Zombie: 3 }, s: ['Slime'], c: ['Guide'] }));
    const p = pointersOf(bytes);
    // 布局: i32 nK=1 + (str Zombie + i32 3) + i32 nS@p[8]+15 + ... —— 谎报 nS=99
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    dv.setInt32(p[8] + 15, 99, true);
    // 游戏路径:读越界被 catch 吞=保已解析桶;循环界 r.pos<pointers[9] 内吞相邻字节
    let gErr: unknown = null, gBestiary: unknown;
    try { gBestiary = parseWld(bytes).bestiary; } catch (e) { gErr = e; }
    expect(gErr, '游戏路径竟拒载=脏段容错被摘').toBeNull();
    // 存档域:同函数同结果
    let sErr: unknown = null, sBestiary: unknown;
    try { sBestiary = (parseWldToSave(bytes).save as { bestiary?: unknown }).bestiary; } catch (e) { sErr = e; }
    expect(sErr, '存档域竟拒载=与游戏路径分叉').toBeNull();
    expect(sBestiary).toEqual(gBestiary);   // 两读侧逐字一致(含容错产物)
    expect((gBestiary as { k: Record<string, number> }).k['Zombie']).toBe(3);   // 已解析桶保住
  });

  it('townManager 整段缺失（slice@pointers[7]）:两读侧均必抛（RB15c 补腿真身归正）', () => {
    const bytes = exportWld(mkWldSave({ k: { Zombie: 3 }, s: ['Slime'], c: ['Guide'] }));
    const p = pointersOf(bytes);
    const cut = bytes.slice(0, p[7]);   // p[7]=townManager 起点:townRooms+尾段全缺
    let gErr: unknown = null, sErr: unknown = null;
    try { parseWld(cut); } catch (e) { gErr = e; }
    try { parseWldToSave(cut); } catch (e) { sErr = e; }
    expect(gErr, '游戏路径竟容错 townManager 缺失=对原版 LoadTownManager positions[8] 对账分向').toBeTruthy();
    expect(sErr, '存档域竟容错 townManager 缺失=与游戏路径分叉').toBeTruthy();
    expect(String(gErr)).toMatch(/越界/);
    expect(String(sErr)).toMatch(/越界/);
  });

  it('原版语义锚:LoadBestiary 无 try/catch+positions[9] 对账拒载（容错=本仓刻意偏差的源码前提）', () => {
    const src = readFileSync(VANILLA_WF, 'utf8');
    const i = src.indexOf('public static void LoadBestiary(');
    expect(i).toBeGreaterThan(-1);                                   // 段加载入口在位
    const body = src.slice(i, i + 200);
    expect(body).not.toContain('try');                               // 无内部容错=损坏/截断直传
    const j = src.indexOf('LoadBestiary(reader, _versionNumber);');
    const tail = src.slice(j, j + 200);
    expect(tail).toContain('positions[9]');                          // 段尾 Position 对账
    expect(tail).toContain('BadSectionPointer');                     // 不符=整档拒载
  });
});
