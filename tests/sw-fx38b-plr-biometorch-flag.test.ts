// SW-FX38b（2026-09-15）：.plr 角色 IO 火把神恩宠解锁旗（unlockedBiomeTorches）。
// 缺口定谳：原版 Player.unlockedBiomeTorches 是 .plr 字段流【单字节 bool】——
//   写侧 Serialize :55429-55431（紧跟 extraAccessory,后接 UsingBiomeTorches/ateArtisanBread/
//   ≥324 未命名旗/usedAegis×6）;读侧 Deserialize :55894-55898（release≥229 门）。
//   本仓曾①导入读后即弃②导出恒写 false = 旗不出档（角色跨世界丢解锁）。
// 测试方法论（防"两边同错"闭环）：字节偏移按 vanilla 字段尺寸独立累加（同源异写）,
//   exportPlr 密文用 node:crypto 解开后逐字节断言旗位与邻位（错位=档损坏级回归）;
//   导入侧用独立生成器全流喂 parsePlr（plr-import.test.ts 同法,非复用导出产物）。
import { describe, it, expect } from 'vitest';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { exportPlr, parsePlr, PLR_VERSION_1457 } from '../src/save/PlrImport';
import type { Appearance } from '../src/player/Appearance';
import type { SaveData } from '../src/save/serialize';

const KEY = Buffer.from('h3y_gUyZ', 'utf16le');   // Player.cs:779 ENCRYPTION_KEY
const encrypt = (plain: Uint8Array): Buffer => {
  const c = createCipheriv('aes-128-ecb', KEY, null);   // autoPadding=PKCS7(:55394)
  return Buffer.concat([c.update(Buffer.from(plain)), c.final()]);
};
const decryptAll = (cipher: Uint8Array): Buffer => {
  const d = createDecipheriv('aes-128-ecb', KEY, null);
  d.setAutoPadding(false);                        // 解密侧 Padding=None(:55713 域)
  return Buffer.concat([d.update(Buffer.from(cipher)), d.final()]);
};

const mkAppearance = (name = 'A'): Appearance => ({
  name, hair: 0, skinVariant: 0,
  hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
  shirtColor: { r: 10, g: 11, b: 12 }, undershirtColor: { r: 13, g: 14, b: 15 },
  pantsColor: { r: 16, g: 17, b: 18 }, shoeColor: { r: 19, g: 20, b: 21 },
  difficulty: 0, voiceVariant: 1, voicePitchOffset: 0,
});
const mkState = (unlockedBiomeTorches?: boolean): SaveData['player'] => ({
  hp: 100, x: 0, y: 0, inventory: [], selected: 0,
  unlockedBiomeTorches,
});

/** unlockedBiomeTorches 在 325 位流中的字节偏移——按 Serialize :55406-55431 字段尺寸
 *  独立累加（ASCII 单字符名,7bit 长度前缀 1 字节） */
function flagOffset(nameBytes = 1): number {
  return 4   // i32 version
    + 20     // FileMetadata(:IO/FileMetadata.cs 8+4+8)
    + 1 + nameBytes  // str name（7bit 长度前缀 + UTF-8）
    + 1      // difficulty
    + 8      // playTime ticks(:55408)
    + 4      // hair
    + 1      // hairDye
    + 1      // team(:55411)
    + 2      // hideVisible BitsByte×2(:55412-55423)
    + 1      // hideMisc(:55424)
    + 1      // skinVariant(:55425)
    + 4 * 4  // statLife/statLifeMax/statMana/statManaMax(:55426-55429)
    + 1;     // extraAccessory(:55429)
}

describe('SW-FX38b .plr unlockedBiomeTorches：导出字节位（Serialize :55430 序）', () => {
  it('旗位=extraAccessory 后一字节;邻位 UsingBiomeTorches/ateArtisanBread/≥324 旗恒 0', () => {
    for (const unlocked of [true, false]) {
      const bytes = exportPlr(mkAppearance(), mkState(unlocked));
      const plain = decryptAll(bytes);
      const off = flagOffset();
      expect(plain[off - 1], 'extraAccessory(缺省 false)').toBe(0);
      expect(plain[off], `unlockedBiomeTorches=${unlocked}`).toBe(unlocked ? 1 : 0);
      expect(plain[off + 1], 'UsingBiomeTorches(会话态,:55431)').toBe(0);
      expect(plain[off + 2], 'ateArtisanBread(:55432)').toBe(0);
      expect(plain[off + 3], '≥324 未命名旗(:55433)').toBe(0);
      expect(plain[off + 4], 'usedAegisCrystal(:55434)').toBe(0);
    }
  });
});

describe('SW-FX38b .plr unlockedBiomeTorches：导入位（Deserialize :55895 release≥229）', () => {
  /** 独立最小 325 全流生成器（读到临时槽为止;旗位由入参定）——同源异写 oracle */
  function buildV325(unlockedBiomeTorches: boolean): Uint8Array {
    const c: number[] = [];
    const w = {
      byte: (v: number) => { c.push(v & 0xff); return w; },
      bool: (v: boolean) => { c.push(v ? 1 : 0); return w; },
      i32: (v: number) => { const b = v | 0; c.push(b & 0xff, (b >>> 8) & 0xff, (b >>> 16) & 0xff, (b >>> 24) & 0xff); return w; },
      i64: (v: bigint) => { w.i32(Number(v & 0xffffffffn)); w.i32(Number((v >> 32n) & 0xffffffffn)); return w; },
      str: (s: string) => { const bs = Array.from(new TextEncoder().encode(s)); c.push(bs.length, ...bs); return w; },
    };
    const meta = 27981915666277746n | (3n << 56n);
    const lo = meta & 0xffffffffn, hi = (meta >> 32n) & 0xffffffffn;
    w.i32(325);
    w.i32(Number(lo)); w.i32(Number(hi)); w.i32(17); w.i32(0); w.i32(0);   // FileMetadata 20B
    w.str('A');
    w.byte(0);                                   // difficulty
    w.i64(0n);                                   // playTime
    w.i32(0);                                    // hair
    w.byte(0);                                   // hairDye
    w.byte(0);                                   // team
    w.byte(0); w.byte(0);                        // hideVisible
    w.byte(0);                                   // hideMisc
    w.byte(0);                                   // skinVariant
    w.i32(100).i32(100).i32(20).i32(20);         // life/max/mana/max
    w.bool(false);                               // extraAccessory(:55894)
    w.bool(unlockedBiomeTorches);                // ★:55895 unlockedBiomeTorches
    w.bool(false);                               // UsingBiomeTorches(:55896)
    w.bool(false);                               // ateArtisanBread(≥256)
    w.bool(false);                               // ≥324 未命名旗
    for (let i = 0; i < 6; i++) w.bool(false);   // usedAegis…×6(≥260)
    w.bool(false);                               // downedDD2(≥182)
    w.i32(0);                                    // taxMoney
    w.i32(0).i32(0);                             // deathsPve/Pvp
    for (let i = 0; i < 7; i++) { w.byte(255); w.byte(255); w.byte(255); }   // 七色
    const equip = () => { w.i32(0); w.byte(0); w.bool(false); };             // ≥322 带 fav
    const item = () => { w.i32(0); w.i32(0); w.byte(0); w.bool(false); };    // ≥114 带 fav
    for (let i = 0; i < 20; i++) equip();        // armor20
    for (let i = 0; i < 10; i++) equip();        // dye10
    for (let i = 0; i < 58; i++) item();         // inventory58
    for (let i = 0; i < 5; i++) { equip(); equip(); }                        // miscE/D 槽内交错
    for (let b = 0; b < 4; b++) for (let i = 0; i < 40; i++) item();         // banks×4
    w.byte(0);                                   // voidVaultInfo
    for (let i = 0; i < 44; i++) { w.i32(0); w.i32(0); }                     // buffs 44 对
    w.i32(-1);                                   // spawn 空
    w.bool(false);                               // hbLocked
    for (let i = 0; i < 13; i++) w.bool(false);  // hideInfo13
    w.i32(0);                                    // anglerQuestsFinished
    for (let i = 0; i < 4; i++) w.i32(0);        // DpadRadial
    for (let i = 0; i < 12; i++) w.i32(0);       // builderAccStatus[12]
    w.i32(0);                                    // bartenderQuestLog
    w.bool(false);                               // dead
    w.i64(0n);                                   // lastTimePlayerWasSaved
    w.i32(0);                                    // golfer
    w.bool(false);                               // ≥282 献祭标记
    w.i32(0);                                    // sacrifices N=0
    w.byte(0);                                   // 临时槽 bits(≥214)——解析器停止点
    return new Uint8Array(c);
  }

  it('旗=true → playerState.unlockedBiomeTorches===true（曾读后即弃）', () => {
    const p = parsePlr(encrypt(buildV325(true)));
    expect(p.version).toBe(PLR_VERSION_1457);
    expect(p.playerState.unlockedBiomeTorches).toBe(true);
  });
  it('旗=false → 严格 false（非 undefined）', () => {
    const p = parsePlr(encrypt(buildV325(false)));
    expect(p.playerState.unlockedBiomeTorches).toBe(false);
  });
});

describe('SW-FX38b .plr unlockedBiomeTorches：导出→导入 round-trip 等价', () => {
  it('true/false/缺省 三态往返等价', () => {
    for (const v of [true, false, undefined] as const) {
      const p = parsePlr(exportPlr(mkAppearance(), mkState(v)));
      expect(p.playerState.unlockedBiomeTorches, `源=${v}`).toBe(v === true);
    }
  });
  it('重导出幂等（导出→导入→再导出→再导入,旗保持）', () => {
    const first = parsePlr(exportPlr(mkAppearance(), mkState(true)));
    const again = exportPlr(first.appearance, first.playerState);
    expect(parsePlr(again).playerState.unlockedBiomeTorches).toBe(true);
  });
});
