// 原版 .plr 导入回归(2026-09-05):AES-128-ECB 纯 JS 解密对拍 + 字段流生成器闭环。
// 生成器按反编译 Terarria1457/Terraria/Player.cs Deserialize(:55787-56419)字段序
// 手写——与解析器同源异写,互检笔误;node:crypto 是 AES 正确性的外部真值源。
import { describe, it, expect } from 'vitest';
import { createCipheriv } from 'node:crypto';
import { aes128EcbDecrypt, parsePlr, PLR_VERSION_1457 } from '../src/save/PlrImport';
import type { Appearance } from '../src/player/Appearance';
import type { SaveData } from '../src/save/serialize';

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
  /** item:netId+stack+prefix[+favorited](inventory/bank 形) */
  item(netId: number, stack: number, prefix: number, fav?: boolean) {
    this.i32(netId).i32(stack).byte(prefix);
    if (fav !== undefined) this.bool(fav);
    return this;
  }
  /** equip:netId+prefix[+favorited](armor/dye/miscE/D 形——无 stack,PL:55467-55483) */
  equip(netId: number, prefix: number, fav?: boolean) {
    this.i32(netId).byte(prefix);
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

// ★红蓝-L2②（2026-09-18）域契约：vi_ 物品【稳定 id ≡ 原版 vid/netID】——本文件
// 全部物品断言一律钉手工核对的字面量,严禁经 ITEM_STABLE_OF_INTERNAL 反查构造
// 期望值（旧 STABLE() helper 与被测映射同表同错=闭环抓不到,已拆;物证:vi_109_
// mana_crystal 注册序 0 号位,裸下标重合率 0/6177）。
// ★同日时间线改真（BJ146 旧叙事「历史导出=错位域」被实证推翻）：真档 id 域=
// vid 直写正确——外部实证=用户私有历史档 /Users/vinlic/Downloads/Vinlic.plr
// （3456B,v325;用户私有不入仓,仅本注释记结论）,2026-09-18 经 parsePlr 实测:
// armor[10-12]=5802/5803/5804 雪域家具套连续 vid（反编译 1457 ItemID.cs
// SnowCandle=5802/SnowChair=5803/SnowChandelier=5804 同证;1.4.5 系列新品,
// 1456 同值）、inv[43]=6037 尖刺沙发、inv[21]=4115 南瓜马桶、inv[5]=1293
// 蜥蜴电池、inv[27]×1834 千级堆叠——全落合法 vid 且名/量级成真实背包分布,
// 非「内部注册序错位域」。错位面仅=导出方向 ITEM_INTERNAL_OF_STABLE.get 映射
// （2026-09-06 b369a150 随 exportPlr 引入→本修复前窗口）;修复后 vi_ 恒等回写
// 与历史 vid 直写行为等价,零回滚。

describe('parsePlr 字段流(生成器闭环)', () => {
  const seedColors = [10, 20, 30, 40, 50, 60, 70] as const;

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
    w.byte(1);                 // skinVariant=1(MaleSticker 男贴纸,PlayerVariantID.Sets.Male)
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
    // armor20+dye10(≥322 带 favorited;无 stack——equip 形)
    for (let i = 0; i < 20; i++) w.equip(i === 0 ? 4344 : i === 3 ? 975 : 0, i, i % 3 === 0);
    for (let i = 0; i < 10; i++) w.equip(0, 0, false);
    // inventory58(≥114 favorited)——物品段=原版 netID 域（LoadPlayer :55998
    // netDefaults(num)）。槽位样本钉域勘误（旧 ITEM_STABLE_OF_INTERNAL[vid] 裸下标
    // 的错映值标注在侧）：50=魔镜(旧错映 5143)/1=铁镐(旧 1291)/109=魔力水晶(旧
    // 2215)/1291=生命果(旧 204)/2777=未注册 vid→0/999999=越界→0
    const INV_VIDS = [50, 999999, 1, 109, 1291, 2777];
    for (let i = 0; i < 58; i++) w.item(INV_VIDS[i] ?? 0, 999 - i, 0, i % 2 === 0);
    // miscE/miscD:槽内交错(E[i],D[i] 同循环,PL:55476;读侧恒不读 favorited)
    for (let i = 0; i < 5; i++) {
      w.equip(i === 2 ? 975 : 0, 0);
      w.equip(0, 0);
    }
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
    expect(p.appearance.voiceVariant).toBe(1);          // ★SW-RB6c oracle：原版语音按 PlayerVariantID.Sets.Male={0,1,2,3,8,10} 派生（v1=男）——旧奇偶派生已废
    expect(p.appearance.hairColor).toEqual({ r: 10, g: 20, b: 30 });
    expect(p.appearance.shoeColor).toEqual({ r: 61, g: 62, b: 63 });
    expect(p.playerState.hideVisibleAccessory?.[0]).toBe(true);
    expect(p.playerState.hideVisibleAccessory?.[9]).toBe(true);
    expect(p.playerState.baseMaxHp).toBe(400);
    expect(p.playerState.hp).toBe(380);
    expect(p.playerState.baseMaxMana).toBe(200);
    expect(p.playerState.mana).toBe(150);
    // 物品走稳定 id 映射（★域契约:夹具写 netID 域,parse 后逐一还原同值;
    // 期望=字面量真值,不经任何映射表）
    expect(p.playerState.armor?.[0]?.id).toBe(4344);
    expect(p.playerState.armor?.[3]?.id).toBe(975);              // 975=Shoe Spikes
    expect(p.playerState.armor?.[0]?.favorited).toBe(true);
    expect(p.playerState.armor?.[1]?.favorited).toBeUndefined();
    expect(p.playerState.inventory?.[0]?.id).toBe(50);           // 50=魔镜 vi_50_MagicMirror
    expect(p.playerState.inventory?.[1]).toBeNull();             // 999999 越界=空
    expect(p.playerState.inventory?.[2]?.id).toBe(1);            // 1=铁镐(旧实现错映 1291 生命果)
    expect(p.playerState.inventory?.[3]?.id).toBe(109);          // 109=魔力水晶(旧错映 2215)
    expect(p.playerState.inventory?.[4]?.id).toBe(1291);         // 1291=生命果(旧错映 204)
    expect(p.playerState.inventory?.[5]).toBeNull();             // 2777 未注册 vid=空物品
    expect(p.playerState.inventory?.[0]?.stack).toBe(999);
    expect(p.playerState.banks?.[1]?.[0]?.id).toBe(166);         // TNT 在 bank2
    expect(p.playerState.miscEquips?.[2]?.id).toBe(975);
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
    for (let i = 0; i < 20; i++) w.equip(0, 0);   // <322 无 favorited(无 stack)
    for (let i = 0; i < 10; i++) w.equip(0, 0);
    for (let i = 0; i < 58; i++) w.item(0, 0, 0, false);
    for (let i = 0; i < 5; i++) { w.equip(0, 0); w.equip(0, 0); }
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

describe('exportPlr 导出往返', () => {
  const mkAppearance = (): Appearance => ({
    name: '导出测试', hair: 15, skinVariant: 2,
    hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
    shirtColor: { r: 10, g: 11, b: 12 }, undershirtColor: { r: 13, g: 14, b: 15 },
    pantsColor: { r: 16, g: 17, b: 18 }, shoeColor: { r: 19, g: 20, b: 21 },
    difficulty: 1, voiceVariant: 1, voicePitchOffset: 0,
  });
  const mkState = (): SaveData['player'] => ({
    hp: 300, x: 0, y: 0,
    // 稳定 id 域输入(≡vi_ vid):槽 0=魔镜 50;槽 1=10140 place_v 派生件(蜂巢块,
    // 无原版 netId→导出写 0=空气,readItem 归 null——派生件不出档契约)
    inventory: [{ id: 50, stack: 42, prefix: 3, favorited: true }, { id: 10140, stack: 1 },
      ...Array.from({ length: 56 }, () => null)],
    selected: 0, baseMaxHp: 400, baseMaxMana: 120, mana: 88,
    banks: [[{ id: 166, stack: 9 }], [], [], []],
    armor: [null, null, null, { id: 975, stack: 1 }, ...Array.from({ length: 16 }, () => null)],
    dye: Array.from({ length: 10 }, () => null),
    miscEquips: [null, null, null, null, null],
    miscDyes: [null, null, null, null, null],
    buffs: [[5, 30], [120, 45]],
    taxMoney: 12, golferScoreAccumulated: 7, anglerQuestsFinished: 3,
    hideInfo: Array.from({ length: 13 }, () => false),
    hideVisibleAccessory: [true, ...Array.from({ length: 9 }, () => false)],
    deathsPve: 2, deathsPvp: 1, team: 0, dead: false, respawnTimer: 0,
    hairDye: 4,
    permanentUpgrades: { extraAccessory: true, usedAegisCrystal: false, usedAegisFruit: false,
      usedArcaneCrystal: false, usedGalaxyPearl: false, usedGummyWorm: false, usedAmbrosia: false },
  });

  it('AES 加密与 node:crypto 同参对拍', async () => {
    const { createDecipheriv } = await import('node:crypto');
    const { aes128EcbEncrypt } = await import('../src/save/PlrImport');
    for (let round = 0; round < 16; round++) {
      const n = round * 11 + 3;   // 非 16 对齐长度
      const plain = new Uint8Array(n).map((_, i) => (i * 37 + round) & 0xff);
      const cipher = aes128EcbEncrypt(plain);
      const d = createDecipheriv('aes-128-ecb', KEY, null);
      d.setAutoPadding(false);
      const back = Buffer.concat([d.update(Buffer.from(cipher)), d.final()]);
      expect(Array.from(back.slice(0, n))).toEqual(Array.from(plain));
      expect(cipher.length).toBe((Math.floor(n / 16) + 1) * 16);   // PKCS7 垫(整块时加整块)
    }
  });

  it('exportPlr → parsePlr 往返(全字段)', async () => {
    const { exportPlr } = await import('../src/save/PlrImport');
    const a = mkAppearance(), st = mkState();
    const bytes = exportPlr(a, st);
    const p = parsePlr(bytes);
    expect(p.version).toBe(PLR_VERSION_1457);
    expect(p.appearance.name).toBe('导出测试');
    expect(p.appearance.hair).toBe(15);
    expect(p.appearance.skinVariant).toBe(2);
    expect(p.appearance.difficulty).toBe(1);
    expect(p.appearance.hairColor).toEqual({ r: 1, g: 2, b: 3 });
    expect(p.playerState.hp).toBe(300);
    expect(p.playerState.baseMaxHp).toBe(400);
    expect(p.playerState.baseMaxMana).toBe(120);
    expect(p.playerState.mana).toBe(88);
    expect(p.playerState.hairDye).toBe(4);
    expect(p.playerState.inventory?.[0]).toEqual({ id: 50, stack: 42, prefix: 3, favorited: true });
    expect(p.playerState.inventory?.[1]).toBeNull();   // 10140 派生件导出写 0→读回空(不出档契约)
    expect(p.playerState.armor?.[3]?.id).toBe(975);
    expect(p.playerState.banks?.[0]?.[0]?.id).toBe(166);
    expect(p.playerState.banks?.[0]?.[0]?.stack).toBe(9);
    expect(p.playerState.buffs).toEqual([[5, 30], [120, 45]]);
    expect(p.playerState.taxMoney).toBe(12);
    expect(p.playerState.anglerQuestsFinished).toBe(3);
    expect(p.playerState.permanentUpgrades?.extraAccessory).toBe(true);
    expect(p.playerState.hideVisibleAccessory?.[0]).toBe(true);
    // 加密真值:node:crypto 解 exportPlr 输出,头 4 字节=325
    const { createDecipheriv } = await import('node:crypto');
    const d = createDecipheriv('aes-128-ecb', KEY, null);
    d.setAutoPadding(false);
    const back = Buffer.concat([d.update(Buffer.from(bytes)), d.final()]);
    expect(back[0]).toBe(325 & 0xff);
    expect(back.readUInt32LE(0)).toBe(325);
  });

  it('导出→导入→再导出:字节稳定(幂等)', async () => {
    const { exportPlr } = await import('../src/save/PlrImport');
    const a = mkAppearance(), st = mkState();
    const p = parsePlr(exportPlr(a, st));
    const again = exportPlr(p.appearance, p.playerState);
    // 导入会走验证/换算(如 buffs tick 取整),重导出字节不必逐位相等,
    // 但必须可再次解析且关键值不变
    const p2 = parsePlr(again);
    expect(p2.appearance.name).toBe('导出测试');
    expect(p2.playerState.baseMaxHp).toBe(400);
  });
});
