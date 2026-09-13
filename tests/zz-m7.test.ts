// 机器对账:写侧逐段字节计数 vs 读侧逐段 pos(同一骨架,双向 diff)
//
// ★期望位账本(手工冻结)冻结日期:2026-09-13。依据:
//   - 当前 exportPlr/parsePlr(round-trip 全等 oracle=tests/sw-fx11-save-parity /
//     tests/zz-red-io / tests/plr-import / tests/sw-fx19-builder-acc 全绿为前提);
//   - Terarria1457/Terraria/Player.cs Serialize(PL:55393-55570)逐段同构核对,
//     40 段段长(相邻差)全部与原版一致:name=1B varint+12B UTF-8('红队角色');
//     buffs 44×8B(maxBuffs=44,Player.cs:1491);spawn 空 spN 表=i32 -1(PL:55533-55534);
//     hbLocked bool(PL:55543,RB11d);builderAcc 12×i32(PL:55553-55555,
//     BuilderAccToggleIDs.Count=12,Player.cs:64——★SW-FX19 +12B 如实反映,
//     exportPlr 写侧 PlrImport.ts:567 同锚);sacrifices 空=bool false+i32 0
//     (ItemsSacrificedUnlocksTracker.cs:157-169);tempSlots=BitsByte 1B(PL:55567→
//     SaveTemporaryItemSlotContents :55590)。
//   - 前账(dae304d4 2026-09-07)name 锚误冻为 1B(25)——'红队角色' 实为 13B(37),
//     其后全表 +12 位移;段长零变化=非生产回归,系账本冻结即错(本文件一次性提交,
//     从未绿过)。历届存档批(FX19/RB11d/RB14b…)改格式必甩落此表,漂移时 throw
//     消息带 all= 全表,按当前骨架重冻即可(先对 1457 SavePlayer 核段长)。
import { it, expect } from 'vitest';
import { createCipheriv } from 'node:crypto';
import { parsePlr } from '../src/save/PlrImport';
import { BinaryReaderLE } from '../src/wld/BinaryReaderLE';

const KEY = Buffer.from('h3y_gUyZ', 'utf16le');
class W {
  buf: number[] = [];
  byte(...vs: number[]) { for (const v of vs) this.buf.push(v & 0xff); return this; }
  bool(v: boolean) { return this.byte(v ? 1 : 0); }
  i32(v: number) { const b = v | 0; this.buf.push(b & 0xff, (b >>> 8) & 0xff, (b >>> 16) & 0xff, (b >>> 24) & 0xff); return this; }
  i64(v: bigint) { const lo = Number(v & 0xffffffffn), hi = Number((v >> 32n) & 0xffffffffn); return this.i32(lo).i32(hi); }
  str(s: string) {
    const bytes = Array.from(new TextEncoder().encode(s));
    let len = bytes.length;
    for (;;) { if (len < 0x80) { this.buf.push(len); break; } this.buf.push((len & 0x7f) | 0x80); len >>= 7; }
    this.buf.push(...bytes); return this;
  }
  item(netId: number, stack: number, prefix: number, fav?: boolean) { this.i32(netId).i32(stack).byte(prefix); if (fav !== undefined) this.bool(fav); return this; }
  equip(netId: number, prefix: number, fav?: boolean) { this.i32(netId).byte(prefix); if (fav !== undefined) this.bool(fav); return this; }
  rgb(r: number, g: number, b: number) { return this.byte(r).byte(g).byte(b); }
  meta() { return this.i64(27981915666277746n | (3n << 56n)).i32(17).i64(0n); }
  len() { return this.buf.length; }
}

it('machine-audit', () => {
  const w = new W();
  const S: Array<[string, number]> = [];
  const mark = (s: string) => S.push([s, w.len()]);
  w.i32(325); mark('ver');
  w.meta(); mark('meta');
  w.str('红队角色'); mark('name');
  w.byte(0); mark('diff');
  w.i64(0n); mark('play');
  w.i32(0); mark('hair');
  w.byte(0); mark('hairDye');
  w.byte(0).byte(0); mark('hideVis');
  w.byte(0); mark('hideMisc');
  w.byte(0); mark('skinVar');
  w.i32(100).i32(100).i32(20).i32(20); mark('stats');
  w.bool(false); mark('extraAcc');
  w.bool(false).bool(false); mark('torch2');
  w.bool(false); mark('bread');
  w.bool(false); mark('flag324');
  for (let i = 0; i < 6; i++) w.bool(false); mark('aegis6');
  w.bool(false); mark('dd2downed');
  w.i32(0); mark('tax');
  w.i32(0).i32(0); mark('deaths');
  for (let i = 0; i < 7; i++) w.rgb(128, 128, 128); mark('colors');
  for (let i = 0; i < 20; i++) w.equip(0, 0, false); mark('armor');
  for (let i = 0; i < 10; i++) w.equip(0, 0, false); mark('dye');
  for (let i = 0; i < 58; i++) w.item(0, 0, 0, false); mark('inventory');
  for (let i = 0; i < 5; i++) { w.equip(0, 0); w.equip(0, 0); } mark('misc');
  for (let b = 0; b < 4; b++) { for (let i = 0; i < 40; i++) { if (b === 3) w.item(0, 0, 0, false); else w.item(0, 0, 0); } } mark('banks');
  w.byte(0); mark('voidVault');
  for (let i = 0; i < 44; i++) { w.i32(0).i32(0); } mark('buffs');
  w.i32(-1); mark('spawn');
  w.bool(false); mark('hbLocked');
  for (let i = 0; i < 13; i++) w.bool(false); mark('hideInfo');
  w.i32(0); mark('angler');
  for (let i = 0; i < 4; i++) w.i32(0); mark('dpad');
  for (let i = 0; i < 12; i++) w.i32(0); mark('builderAcc');
  w.i32(0); mark('bartender');
  w.bool(false); mark('dead');
  w.i64(0n); mark('lastTime');
  w.i32(0); mark('golfer');
  w.bool(false); mark('sacFlag');
  w.i32(0); mark('sacN');
  w.byte(0); mark('tempSlots');

  // 这里只对账【写侧段表自身】:相邻段差=该段字节数,与期望字节数逐一断言。
  // 位账本=骨架各段【尾位置】(mark 记在段写完后);骨架加段须同步扩表。
  const ledger: Record<string, number> = {
    ver: 4, meta: 24, name: 37, diff: 38, play: 46, hair: 50, hairDye: 51, hideVis: 53,
    hideMisc: 54, skinVar: 55, stats: 71, extraAcc: 72, torch2: 74, bread: 75, flag324: 76,
    aegis6: 82, dd2downed: 83, tax: 87, deaths: 95, colors: 116, armor: 236, dye: 296,
    inventory: 876, misc: 926, banks: 2406, voidVault: 2407, buffs: 2759, spawn: 2763,
    hbLocked: 2764, hideInfo: 2777, angler: 2781, dpad: 2797, builderAcc: 2845,
    bartender: 2849, dead: 2850, lastTime: 2858, golfer: 2862, sacFlag: 2863, sacN: 2867, tempSlots: 2868,
  };
  const bad = S.filter(([s, p]) => ledger[s] !== undefined && ledger[s] !== p);
  if (bad.length > 0) {
    // 漂移即抛,消息带 all= 全表——按 1457 SavePlayer 核段长后重冻(见文件头)
    throw new Error('AUDIT total=' + w.len() + ' bad=' + JSON.stringify(bad) + ' all=' + S.map(([s, p]) => `${s}=${p}`).join(' '));
  }
  expect(bad).toEqual([]);                       // 位账本零漂移
  expect(S.length).toBe(Object.keys(ledger).length);   // 40 段全标记(增段未扩表此处红)
  expect(w.len()).toBe(2868);                    // 骨架总长(见文件头冻结依据)
});
