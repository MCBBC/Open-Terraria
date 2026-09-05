// 原版 .plr 导入回归(2026-09-05):AES-128-ECB 纯 JS 解密对拍 + 字段流生成器闭环。
// 生成器按反编译 Terarria1457/Terraria/Player.cs Deserialize(:55787-56419)字段序
// 手写——与解析器同源异写,互检笔误;node:crypto 是 AES 正确性的外部真值源。
import { describe, it, expect } from 'vitest';
import { createCipheriv } from 'node:crypto';
import { aes128EcbDecrypt, parsePlr, PLR_VERSION_1457 } from '../src/save/PlrImport';
import { ITEM_STABLE_OF_INTERNAL } from '../src/data/items';

/** 原版 ENCRYPTION_KEY(Player.cs:779)='h3y_gUyZ' UTF-16LE */
const KEY = Buffer.from('h3y_gUyZ', 'utf16le');
expect(KEY.length).toBe(16);

/** .NET BinaryWriter(LE)最小写侧(仅本测试用) */
class Writer {
  private chunks: number[] = [];
  byte(v: number) { this.chunks.push(v & 0xff); return this; }
  bool(v: boolean) { return this.byte(v ? 1 : 0); }
  i32(v: number) {
    const b = v | 0;
    this.chunks.push(b & 0xff, (b >>> 8) & 0xff, (b >>> 16) & 0xff, (b >>> 24) & 0xff);
    return this;
  }
  i64(v: bigint) {
    const lo = Number(v & 0xffffffffn), hi = Number((v >> 32n) & 0xffffffffn);
    return this.i32(lo).i32(hi);
  }
  f32(v: number) {
    const dv = new DataView(new ArrayBuffer(4));
    dv.setFloat32(0, v, true);
    for (let i = 0; i < 4; i++) this.chunks.push(dv.getUint8(i));
    return this;
  }
  /** .NET BinaryWriter.WriteString:7bit 长度前缀 + UTF-8 */
  str(s: string) {
    const bytes = Array.from(new TextEncoder().encode(s));
    let len = bytes.length;
    for (;;) {
      if (len < 0x80) { this.chunks.push(len); break; }
      this.chunks.push((len & 0x7f) | 0x80);
      len >>= 7;
    }
    this.chunks.push(...bytes);
    return this;
  }
  /** item:netId+stack+prefix[+favorited] */
  item(netId: number, stack: number, prefix: number, fav?: boolean) {
    this.i32(netId).i32(stack).byte(prefix);
    if (fav !== undefined) this.bool(fav);
    return this;
  }
  rgb(r: number, g: number, b: number) { return this.byte(r).byte(g).byte(b); }
  build() { return new Uint8Array(this.chunks); }
}

/** FileMetadata 20B(u64 魔数[低 56 位=恒量,高 8 位=FileType 3]+u32 Revision+u64 favorites)——
 *  追加到传入 writer(debug4 教训:曾建新实例写完即丢,主流缺 20B 元数据=魔数不符) */
function fileMeta(w: Writer): Writer {
  const magic = 27981915666277746n | (3n << 56n);
  return w.i64(magic).i32(17).i64(0n);
}

/** 加密成 .plr 文件字节(模拟原版写盘:CBC 无——ECB+PKCS7 垫由 node:crypto 兜) */
function encrypt(plain: Uint8Array): Uint8Array {
  const c = createCipheriv('aes-128-ecb', KEY, null);   // 默认 autoPadding=true=PKCS7
  return Buffer.concat([c.update(Buffer.from(plain)), c.final()]);
}

describe('AES-128-ECB 纯 JS 解密', () => {
  it('与 node:crypto 同参对拍(含 PKCS7 垫——解密产出=明文+垫,前 N 字节相等)', () => {
    for (let round = 0; round < 32; round++) {
      const n = 16 * (1 + round * 7);
      const plain = new Uint8Array(n).map(() => (round * 31 + Math.floor(Math.random() * 251)) & 0xff);
      const cipher = encrypt(plain);
      const got = aes128EcbDecrypt(cipher);
      expect(Array.from(got.slice(0, n))).toEqual(Array.from(plain));
      expect(got.length).toBeGreaterThan(n);   // 垫字节未剥离(读流无影响)
    }
  });
  it('密文长度非 16 倍数抛错', () => {
    expect(() => aes128EcbDecrypt(new Uint8Array(15))).toThrow(/对齐/);
  });
});

describe('parsePlr 字段流(生成器闭环)', () => {
  const seedColors = [10, 20, 30, 40, 50, 60, 70] as const;
  const STABLE = (netId: number) => ITEM_STABLE_OF_INTERNAL[netId] ?? 0;

  /** 325 全量流(读侧会消费到临时槽为止;其后写 64B 垃圾模拟 Loadouts 等真实尾段) */
  function buildV325() {
    const w = new Writer();
    w.i32(325); fileMeta(w); // 版本+元数据
    w.str('旅行者');
    w.byte(3);                 // difficulty 旅程
    w.i64(12345678n);          // playTime
    w.i32(42);                 // hair
    w.byte(7);                 // hairDye
    w.byte(2);                 // team(≥283)
    w.byte(0b00000101); w.byte(0b00000010);   // hideVisible 8+2
    w.byte(0);                 // hideMisc(≥119)
    w.byte(1);                 // skinVariant=1(女)
    w.i32(380).i32(400);       // life/max
    w.i32(150).i32(200);       // mana/max
    w.bool(true);              // extraAccessory(≥125)
    w.bool(true).bool(false);  // unlockedBiomeTorches/UsingBiomeTorches(≥229)
    w.bool(true);              // ateArtisanBread(≥256)
    w.bool(true);              // ≥324 新旗
    for (let i = 0; i < 6; i++) w.bool(i % 2 === 0);   // usedAegis...×6(≥260)
    w.bool(true);              // downedDD2(≥182)
    w.i32(75);                 // taxMoney(≥128)
    w.i32(3).i32(1);           // deathsPVE/PVP(≥254)
    w.rgb(...seedColors.slice(0, 3) as unknown as [number, number, number]);
    w.rgb(11, 12, 13); w.rgb(21, 22, 23); w.rgb(31, 32, 33);
    w.rgb(41, 42, 43); w.rgb(51, 52, 53); w.rgb(61, 62, 63);
    // armor20+dye10(≥322 带 favorited)
    for (let i = 0; i < 20; i++) w.item(i === 0 ? 4344 : i === 3 ? 975 : 0, i + 1, i, i % 3 === 0);
    for (let i = 0; i < 10; i++) w.item(0, 0, 0, false);
    // inventory58(≥114 favorited)
    for (let i = 0; i < 58; i++) w.item(i === 0 ? 50 : i === 1 ? 999999 : 0, 999 - i, 0, i % 2 === 0);
    // miscEquips/miscDyes 5+5(≥136;读侧恒不读 favorited——写侧省略!)
    for (let i = 0; i < 5; i++) w.item(i === 2 ? 975 : 0, 1, 0);
    for (let i = 0; i < 5; i++) w.item(0, 0, 0);
    // bank×4(40 槽;bank4 ≥255 favorited——仅 bank4 显式传,b1-3 省略)
    for (let b = 0; b < 4; b++) {
      for (let i = 0; i < 40; i++) {
        if (b === 3) w.item(0, i, 0, i === 0);
        else w.item(b === 1 && i === 0 ? 166 : 0, i, 0);
      }
    }
    w.byte(1);                 // voidVaultInfo(≥199)
    // buffs(≥252 恒 44 对,写满;槽 0/1 非零,余全零)
    for (let i = 0; i < 44; i++) {
      if (i === 0) w.i32(1).i32(3600);
      else if (i === 1) w.i32(120).i32(7200);
      else w.i32(0).i32(0);
    }
    // spawn 列表:两则 + -1 终止
    w.i32(100).i32(200).i32(3).str('出生点').i32(300).i32(400).i32(0).str('家').i32(-1);
    w.bool(false);             // hbLocked(≥16)
    for (let i = 0; i < 13; i++) w.bool(i === 5);      // hideInfo(≥115)
    w.i32(17);                 // anglerQuestsFinished(≥98)
    for (let i = 0; i < 4; i++) w.i32(i);              // DpadRadial(≥162)
    for (let i = 0; i < 12; i++) w.i32(i);             // builderAcc(≥230 →12)
    w.i32(4);                  // bartenderQuestLog(≥181)
    w.bool(true).i32(300);     // dead+respawn(≥200)
    w.i64(999n);               // lastTimePlayerWasSaved(≥202)
    w.i32(55);                 // golfer(≥206)
    w.bool(true);              // sacrifices 标记(≥282)
    w.i32(2).str('item_0').i32(5).str('item_1').i32(9);  // sacrifices N=2(≥218)
    w.byte(0);                 // 临时槽 bits=0(≥214)
    // —— 解析器停止点 ——(其后 64B 垃圾=真实文件里的 Loadouts/voice/refunds 等)
    for (let i = 0; i < 64; i++) w.byte(i);
    return encrypt(w.build());
  }

  it('325 版:外观/六色/装备/银行/buff/统计往返', () => {
    const p = parsePlr(buildV325());
    expect(p.version).toBe(PLR_VERSION_1457);
    expect(p.appearance.name).toBe('旅行者');
    expect(p.appearance.difficulty).toBe(3);
    expect(p.appearance.hair).toBe(42);
    expect(p.playerState.hairDye).toBe(7);              // hairDye 是 playerState 字段(非外观)
    expect(p.appearance.skinVariant).toBe(1);
    expect(p.appearance.voiceVariant).toBe(2);          // 奇数变体=女
    expect(p.appearance.hairColor).toEqual({ r: 10, g: 20, b: 30 });
    expect(p.appearance.shoeColor).toEqual({ r: 61, g: 62, b: 63 });
    expect(p.playerState.hideVisibleAccessory?.[0]).toBe(true);
    expect(p.playerState.hideVisibleAccessory?.[9]).toBe(true);
    expect(p.playerState.baseMaxHp).toBe(400);
    expect(p.playerState.hp).toBe(380);
    expect(p.playerState.baseMaxMana).toBe(200);
    expect(p.playerState.mana).toBe(150);
    // 物品走稳定 id 映射
    expect(p.playerState.armor?.[0]?.id).toBe(STABLE(4344));
    expect(p.playerState.armor?.[3]?.id).toBe(STABLE(975));
    expect(p.playerState.armor?.[0]?.favorited).toBe(true);
    expect(p.playerState.armor?.[1]?.favorited).toBeUndefined();
    expect(p.playerState.inventory?.[0]?.id).toBe(STABLE(50));   // 铜币?按表自洽
    expect(p.playerState.inventory?.[1]).toBeNull();             // 999999 越界=空
    expect(p.playerState.inventory?.[0]?.stack).toBe(999);
    expect(p.playerState.banks?.[1]?.[0]?.id).toBe(STABLE(166)); // TNT 在 bank2
    expect(p.playerState.miscEquips?.[2]?.id).toBe(STABLE(975));
    expect(p.playerState.miscEquips?.[2]?.id).toBe(STABLE(975));
    expect(p.playerState.buffs).toEqual([[1, 60], [120, 120]]);  // tick/60
    expect(p.playerState.taxMoney).toBe(75);
    expect(p.playerState.deathsPve).toBe(3);
    expect(p.playerState.deathsPvp).toBe(1);
    expect(p.playerState.anglerQuestsFinished).toBe(17);
    expect(p.playerState.golferScoreAccumulated).toBe(55);
    expect(p.playerState.dead).toBe(true);
    expect(p.playerState.respawnTimer).toBe(300);
    expect(p.playerState.hideInfo?.[5]).toBe(true);
    expect(p.playerState.permanentUpgrades?.extraAccessory).toBe(true);
    expect(p.playerState.permanentUpgrades?.usedAegisCrystal).toBe(true);
    expect(p.playerState.permanentUpgrades?.usedAegisFruit).toBe(false);
    expect(p.playerState.team).toBe(2);
    expect(p.playerState.hairDye).toBe(7);
  });

  /** 279 版(1.4.4.9):无 322 favorited/324 旗/283 team/280-282/300+/310 段 */
  function buildV279() {
    const w = new Writer();
    w.i32(279); fileMeta(w);
    w.str('老档角色');
    w.byte(0);                 // difficulty
    w.i64(1n);                 // playTime
    w.i32(3);                  // hair
    w.byte(0);                 // hairDye
    // <283 无 team
    w.byte(0).byte(0);         // hideVisible
    w.byte(0);                 // hideMisc
    w.byte(0);                 // skinVariant 男
    w.i32(100).i32(100).i32(20).i32(20);
    w.bool(false);             // extraAccessory
    w.bool(false).bool(false); // biome torches(≥229)
    w.bool(false);             // ateArtisanBread(279≥256)
    // <324 无旗
    for (let i = 0; i < 6; i++) w.bool(false);
    w.bool(false);             // downedDD2
    w.i32(0);                  // taxMoney
    w.i32(0).i32(0);           // deaths×2
    w.rgb(1, 2, 3); w.rgb(4, 5, 6); w.rgb(7, 8, 9); w.rgb(10, 11, 12);
    w.rgb(13, 14, 15); w.rgb(16, 17, 18); w.rgb(19, 20, 21);
    for (let i = 0; i < 20; i++) w.item(0, 0, 0);   // <322 无 favorited
    for (let i = 0; i < 10; i++) w.item(0, 0, 0);
    for (let i = 0; i < 58; i++) w.item(0, 0, 0, false);
    for (let i = 0; i < 5; i++) w.item(0, 0, 0);
    for (let i = 0; i < 5; i++) w.item(0, 0, 0);
    for (let b = 0; b < 4; b++) {
      for (let i = 0; i < 40; i++) {
        if (b === 3) w.item(0, 0, 0, false);
        else w.item(0, 0, 0);
      }
    }
    w.byte(0);
    // buffs 44 槽(≥252)
    for (let i = 0; i < 44; i++) { w.i32(i === 0 ? 5 : 0).i32(i === 0 ? 60 : 0); }
    w.i32(-1);                 // spawn 空
    w.bool(false);
    for (let i = 0; i < 13; i++) w.bool(false);
    w.i32(0);
    for (let i = 0; i < 4; i++) w.i32(0);
    for (let i = 0; i < 12; i++) w.i32(0);
    w.i32(0);
    w.bool(false);
    w.i64(0n);
    w.i32(0);
    // ★279 无 282 标记位(解析器 version>=282 才读);creativeTracker 仍走(无标记位版)
    w.i32(0);                  // sacrifices N=0
    w.byte(0);                 // 临时槽
    for (let i = 0; i < 64; i++) w.byte(i);
    return encrypt(w.build());
  }

  it('279 版(1.4.4.9):门位差异正确对齐', () => {
    const p = parsePlr(buildV279());
    expect(p.version).toBe(279);
    expect(p.appearance.name).toBe('老档角色');
    expect(p.appearance.team ?? 0).toBe(0);
    expect(p.appearance.voiceVariant).toBe(1);          // skinVariant 0=男
    expect(p.playerState.armor?.[0]?.favorited).toBeUndefined();
    expect(p.playerState.banks?.[3]?.length).toBe(40);
    expect(p.playerState.banks?.[3]?.[0]?.favorited).toBeUndefined();  // 279<255
    expect(p.playerState.buffs).toEqual([[5, 1]]);
  });

  it('过新版本拒读(>325)', () => {
    const w = new Writer();
    w.i32(400).str('x');
    const enc = encrypt(w.build());
    expect(() => parsePlr(enc)).toThrow(/更新/);
  });

  it('魔数不符拒读(非 Re-Logic 档)', () => {
    const w = new Writer();
    w.i32(325);
    w.i64(123n).i32(0).i64(0n);   // FileMetadata 魔数错
    w.str('x');
    expect(() => parsePlr(encrypt(w.build()))).toThrow(/Re-Logic/);
  });
});
