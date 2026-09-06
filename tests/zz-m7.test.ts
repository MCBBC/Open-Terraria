// 机器对账:写侧逐段字节计数 vs 读侧逐段 pos(同一骨架,双向 diff)
import { it } from 'vitest';
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

  // 这里只对账【写侧段表自身】:相邻段差=该段字节数,与期望字节数逐一断言
  const expect: Record<string, number> = {
    ver: 4, meta: 24, name: 25, diff: 26, play: 34, hair: 38, hairDye: 39, hideVis: 41,
    hideMisc: 42, skinVar: 43, stats: 59, extraAcc: 60, torch2: 62, bread: 63, flag324: 64,
    aegis6: 70, dd2downed: 71, tax: 75, deaths: 83, colors: 104, armor: 224, dye: 284,
    inventory: 864, misc: 914, banks: 2394, voidVault: 2395, buffs: 2747, spawn: 2751,
    hbLocked: 2752, hideInfo: 2765, angler: 2769, dpad: 2785, builderAcc: 2833,
    bartender: 2837, dead: 2838, lastTime: 2846, golfer: 2850, sacFlag: 2851, sacN: 2855, tempSlots: 2856,
  };
  const bad = S.filter(([s, p]) => expect[s] !== undefined && expect[s] !== p);
  throw new Error('AUDIT total=' + w.len() + ' bad=' + JSON.stringify(bad) + ' all=' + S.map(([s, p]) => `${s}=${p}`).join(' '));
});
