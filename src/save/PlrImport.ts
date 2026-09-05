// 原版 .plr 角色档导入(2026-09-05)。
// 反编译标杆(唯一真值源):Terarria1457/Terraria/Player.cs
//   · InternalSavePlayerFile :55371 — Rijndael AES-128-ECB 加密,ENCRYPTION_KEY =
//     UTF-16LE("h3y_gUyZ")(:779),流头 int32 版本号(1.4.5.7=325)
//   · LoadPlayer :55713 — version≥135 带 FileMetadata(20B,:IO/FileMetadata.cs Read);
//     version>325 = LaterVersion 拒读;解密侧 Padding=None(密文尾部 PKCS7 垫余按
//     垃圾对待,字段流读不到即无影响)
//   · Deserialize :55787-56419 — 字段流唯一权威,本文件 reader 序 1:1 对齐。
//     支持域 version ∈ [124, 325](1.2,2013-10 起;更早档 armor/bank 布局与
//     字符串物品名表差异过大,概率≈0,直接拒)
//   · 读到 creativeTracker(≥218,定长)+临时物品槽(≥214)即停——其后 superCart/
//     Loadouts(≥262)/voice/_pendingRefunds(≥300)/oneTimeDialogues(≥310)对本仓
//     角色态无消费面(loadouts 是 1.4.5 三套装备方案,导入主装备即够),且
//     CreativePowerManager.LoadToPlayer 是变长注册表流,不读=不必移植
// 产物:Appearance + SaveData['player'](磁盘稳定 id 形——物品经
//   ITEM_STABLE_OF_INTERNAL 原版 netId→稳定 id;buff [vanillaId, 秒],
//   plr 的 buffTime 为 tick,/60 换算。形态契约见 CharacterStore.getState 注)
import { BinaryReaderLE } from '../wld/BinaryReaderLE';
import { ITEM_STABLE_OF_INTERNAL } from '../data/items';
import type { Appearance } from '../player/Appearance';
import type { SaveData } from './serialize';

// ---- AES-128-ECB 解密(纯 JS;WebCrypto 无 ECB)。仅解密路径,输出长度=输入长度 ----
// 正确性由 tests/plr-import.test.ts 与 node:crypto 同参对拍保证
const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
(() => {
  // FIPS-197 S 盒生成(幂元 ×3 + 仿射)
  const mul = (a: number, b: number) => {
    let p = 0;
    for (let i = 0; i < 8; i++) {
      if (b & 1) p ^= a;
      const hi = a & 0x80;
      a = (a << 1) & 0xff;
      if (hi) a ^= 0x1b;
      b >>= 1;
    }
    return p;
  };
  const INV = new Uint8Array(256);
  for (let i = 1; i < 256; i++) for (let j = 1; j < 256; j++) if (mul(i, j) === 1) { INV[i] = j; break; }
  for (let i = 0; i < 256; i++) {
    let x = INV[i];
    let s = x ^ 0x63;
    for (let k = 0; k < 4; k++) {
      x = ((x << 1) | (x >>> 7)) & 0xff;
      s ^= x;
    }
    SBOX[i] = s & 0xff;
  }
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
})();

/** xtime/mul 常量(逆 MixColumns 用 9/11/13/14) */
function gm(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

/** AES-128-ECB 解密(无填充剥离,块数=bytes/16)。输入必须 16 的倍数 */
export function aes128EcbDecrypt(input: Uint8Array): Uint8Array {
  if (input.length === 0 || input.length % 16 !== 0) throw new Error('plr: 密文长度非 16 字节对齐');
  const key = KEY16;
  // 逆轮密钥扩展(FIPS-197:44 word)
  const w = new Uint8Array(176);
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
    if (i % 16 === 0) {
      const a0 = t0;
      t0 = SBOX[t1] ^ rcon; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[a0];
      rcon = (rcon << 1) ^ ((rcon & 0x80) ? 0x1b : 0);
    }
    w[i] = w[i - 16] ^ t0; w[i + 1] = w[i - 15] ^ t1;
    w[i + 2] = w[i - 14] ^ t2; w[i + 3] = w[i - 13] ^ t3;
  }
  const out = new Uint8Array(input.length);
  const s = new Uint8Array(16);
  for (let off = 0; off < input.length; off += 16) {
    for (let i = 0; i < 16; i++) s[i] = input[off + i];
    // AddRoundKey(10)
    for (let i = 0; i < 16; i++) s[i] ^= w[160 + i];
    for (let round = 9; round >= 0; round--) {
      // InvShiftRows(状态列主序:s[r + 4c];行 r 左移 r → 逆右移 r)
      let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;              // 行1 右移1
      t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;          // 行2 右移2
      t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;                 // 行3 右移3
      // InvSubBytes
      for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
      // AddRoundKey(round)
      for (let i = 0; i < 16; i++) s[i] ^= w[round * 16 + i];
      if (round > 0) {
        // InvMixColumns(按列)
        for (let c = 0; c < 4; c++) {
          const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
          s[c * 4] = gm(a0, 14) ^ gm(a1, 11) ^ gm(a2, 13) ^ gm(a3, 9);
          s[c * 4 + 1] = gm(a0, 9) ^ gm(a1, 14) ^ gm(a2, 11) ^ gm(a3, 13);
          s[c * 4 + 2] = gm(a0, 13) ^ gm(a1, 9) ^ gm(a2, 14) ^ gm(a3, 11);
          s[c * 4 + 3] = gm(a0, 11) ^ gm(a1, 13) ^ gm(a2, 9) ^ gm(a3, 14);
        }
      }
    }
    out.set(s, off);
  }
  return out;
}
/** 原版 ENCRYPTION_KEY = new UnicodeEncoding().GetBytes("h3y_gUyZ")(Player.cs:779)
 *  = 8 字符 × UTF-16LE 2 字节 = 16 字节 AES-128 密钥 */
const KEY16 = (() => {
  const s = 'h3y_gUyZ';
  const k = new Uint8Array(16);
  for (let i = 0; i < 8; i++) { k[i * 2] = s.charCodeAt(i) & 0xff; k[i * 2 + 1] = s.charCodeAt(i) >> 8; }
  return k;
})();

// FileMetadata 魔数校验(:IO/FileMetadata.cs — u64 低 56 位恒 27981915666277746,
// 高 8 位=FileType;Player=3)。u64 读侧 20B:魔数 8 + Revision 4 + IsFavorite 8
const FILE_META_TOTAL = 20;
const META_MAGIC_LOW56 = 27981915666277746n;

export const PLR_VERSION_1457 = 325;
/** 支持域下限 = 1.2(2013-10):124 起字段序与 325 同构(armor20/dye10/inventory58) */
export const PLR_VERSION_MIN = 124;

export interface PlrImported {
  appearance: Appearance;
  /** SaveData['player'] 的磁盘稳定 id 形(x/y 留 0——原版 .plr 不存位置,
   *  进世界落点由世界 spawn 逻辑接管,与原版语义一致) */
  playerState: SaveData['player'];
  /** 文件版本号(诊断/审核用) */
  version: number;
}

type SavedItem = SaveData['player']['inventory'][number];

/** 原版 netId → 本仓稳定 id(未知 id=0 空物品——与原版 netDefaults(0) 同归宿) */
function stableOf(netId: number): number {
  if (netId <= 0) return 0;
  return ITEM_STABLE_OF_INTERNAL[netId] ?? 0;
}

/** 读一个 Item.DeserializeFrom 形(id+stack+prefix[+favorited])并按稳定 id 形落地 */
function readItem(r: BinaryReaderLE, readFavorite: boolean): SavedItem {
  const id = r.i32();
  const stack = r.i32();
  const prefix = r.byte();
  const favorited = readFavorite ? r.boolean() : false;
  const sid = stableOf(id);
  if (!sid) return null;
  return { id: sid, stack, favorited: favorited || undefined, prefix: prefix || undefined };
}

/** 解析 .plr 原始字节(密文)。失败抛 Error(消息面向用户展示) */
export function parsePlr(raw: Uint8Array): PlrImported {
  const plain = aes128EcbDecrypt(raw);
  const r = new BinaryReaderLE(plain);
  const version = r.i32();
  if (version > PLR_VERSION_1457) throw new Error('角色档版本比当前支持的更新(1.4.5.7)');
  if (version < PLR_VERSION_MIN) throw new Error('角色档过旧(仅支持 1.2 及以上)');
  if (version >= 135) {
    const meta = r.bytes(FILE_META_TOTAL);
    const dv = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const lo = dv.getBigUint64(0, true) & 0xFFFFFFFFFFFFFFn;   // 低 56 位(14×F)
    if (lo !== META_MAGIC_LOW56) throw new Error('非 Re-Logic 角色档(魔数不符)');
  }

  const name = r.string();
  // difficulty:≥17 byte;更早 boolean(硬核/软核)——支持域内恒 byte
  const difficulty = r.byte();
  if (version >= 138) r.i64();                       // playTime ticks
  let hair = r.i32();
  if (hair >= 228) hair = 0;
  const hairDye = version >= 82 ? r.byte() : 0;
  const team = version >= 283 ? r.byte() : 0;
  const hideVisible: boolean[] = new Array(10).fill(false);
  if (version >= 124) {
    const b1 = r.byte();
    for (let i = 0; i < 8; i++) hideVisible[i] = (b1 & (1 << i)) !== 0;
    const b2 = r.byte();
    for (let i = 0; i < 2; i++) hideVisible[i + 8] = (b2 & (1 << i)) !== 0;
  }
  if (version >= 119) r.byte();                      // hideMisc
  let skinVariant = r.byte();                        // ≥107(支持域内恒此路径)
  if (version < 161 && skinVariant === 7) skinVariant = 9;
  const statLife = r.i32();
  let statLifeMax = r.i32();
  if (statLifeMax > 500) statLifeMax = 500;
  let statMana = r.i32();
  let statManaMax = r.i32();
  if (statManaMax > 200) statManaMax = 200;
  if (statMana > 400) statMana = 400;
  const extraAccessory = version >= 125 ? r.boolean() : false;
  let unlockedBiomeTorches = false, ateArtisanBread = false;
  let usedAegisCrystal = false, usedAegisFruit = false, usedArcaneCrystal = false,
    usedGalaxyPearl = false, usedGummyWorm = false, usedAmbrosia = false;
  if (version >= 229) {
    unlockedBiomeTorches = r.boolean();
    r.boolean();                                     // UsingBiomeTorches(运行态不持久化)
    if (version >= 256) ateArtisanBread = r.boolean();
    if (version >= 324) r.boolean();                 // 1.4.5 新增未命名旗
    if (version >= 260) {
      usedAegisCrystal = r.boolean(); usedAegisFruit = r.boolean();
      usedArcaneCrystal = r.boolean(); usedGalaxyPearl = r.boolean();
      usedGummyWorm = r.boolean(); usedAmbrosia = r.boolean();
    }
  }
  if (version >= 182) r.boolean();                   // downedDD2EventAnyDifficulty(世界域)
  const taxMoney = version >= 128 ? r.i32() : 0;
  const deathsPve = version >= 254 ? r.i32() : 0;
  const deathsPvp = version >= 254 ? r.i32() : 0;
  const rgb = () => { const rr = r.byte(); const gg = r.byte(); const bb = r.byte(); return { r: rr, g: gg, b: bb }; };
  const hairColor = rgb(), skinColor = rgb(), eyeColor = rgb(), shirtColor = rgb(),
    undershirtColor = rgb(), pantsColor = rgb(), shoeColor = rgb();

  // 装备/染料/背包/银行(≥124 布局:armor20+dye10;≥322 多读 favorited)
  const favEquip = version >= 322;
  const armor: SavedItem[] = [];
  for (let i = 0; i < 20; i++) armor.push(readItem(r, favEquip));
  const dye: SavedItem[] = [];
  for (let i = 0; i < 10; i++) dye.push(readItem(r, favEquip));
  const inventory: SavedItem[] = [];
  for (let i = 0; i < 58; i++) inventory.push(readItem(r, version >= 114));
  const miscEquips: SavedItem[] = [], miscDyes: SavedItem[] = [];
  if (version >= 117) {
    if (version < 136) {
      // 旧序:槽内交错(E[i] 后紧跟 D[i];槽 1 跳过不写不读)——原版 :56073-56090
      for (let i = 0; i < 5; i++) {
        if (i !== 1) { miscEquips.push(readItem(r, false)); miscDyes.push(readItem(r, false)); }
        else { miscEquips.push(null); miscDyes.push(null); }
      }
    } else {
      // ≥136:两个独立段(E 5 件全部 → D 5 件全部)——原版 :56091-56110。
      // ★曾写成槽内交错 → 整段 9B 错位、banks 起点漂移(镜像对齐仪实锤)
      for (let i = 0; i < 5; i++) miscEquips.push(readItem(r, false));
      for (let i = 0; i < 5; i++) miscDyes.push(readItem(r, false));
    }
  }
  const banks: SavedItem[][] = [];
  for (let b = 0; b < 4; b++) {
    // bank1/2 ≥58(支持域内恒有);bank3 ≥182;bank4 ≥198(≥255 多 favorited)
    if (b === 2 && version < 182) { banks.push([]); continue; }
    if (b === 3 && version < 198) { banks.push([]); continue; }
    const items: SavedItem[] = [];
    for (let i = 0; i < 40; i++) items.push(readItem(r, b === 3 && version >= 255));
    banks.push(items);
  }
  if (version >= 199) r.byte();                      // voidVaultInfo

  // buffs(≥11;44 槽 ≥252):读到非零对为止,零对跳过继续(原版 :56222-56240 语义)
  const buffs: Array<[number, number]> = [];
  if (version >= 11) {
    let target = version >= 252 ? 44 : version < 74 ? 10 : 22;
    let got = 0;
    while (got < target) {
      const type = r.i32();
      const time = r.i32();
      if (type === 0) { target--; continue; }
      got++;
      if (time > 0) buffs.push([type, Math.max(1, Math.round(time / 60))]);  // tick→秒
    }
  }
  // spawn 点列表(-1 终止;本仓不消费,流必须对齐)
  for (let i = 0; i < 200; i++) {
    const x = r.i32();
    if (x === -1) break;
    r.i32(); r.i32(); r.string();
  }
  if (version >= 16) r.boolean();                    // hbLocked
  const hideInfo: boolean[] | undefined = version >= 115
    ? Array.from({ length: 13 }, () => r.boolean())
    : undefined;
  const anglerQuestsFinished = version >= 98 ? r.i32() : 0;
  if (version >= 162) { r.i32(); r.i32(); r.i32(); r.i32(); }     // DpadRadial
  if (version >= 164) {
    const n = version >= 230 ? 12 : version >= 197 ? 11 : version >= 167 ? 10 : 8;
    for (let i = 0; i < n; i++) r.i32();             // builderAccStatus
  }
  if (version >= 181) r.i32();                       // bartenderQuestLog
  let dead = false, respawnTimer = 0;
  if (version >= 200) {
    dead = r.boolean();
    if (dead) respawnTimer = Math.min(60000, Math.max(0, r.i32()));
  }
  if (version >= 202) r.i64();                       // lastTimePlayerWasSaved
  const golferScoreAccumulated = version >= 206 ? r.i32() : 0;
  if (version >= 218) {
    // creativeTracker → ItemSacrifices.Load(:ItemsSacrificedUnlocksTracker.cs:171)
    if (version >= 282) r.boolean();
    const n = r.i32();
    for (let i = 0; i < n; i++) { r.string(); r.i32(); }
  }
  if (version >= 214) {
    // LoadTemporaryItemSlotContents:BitsByte 门 + 各门开时一个 Item(无 favorited)
    const bb = r.byte();
    for (let i = 0; i < 4; i++) if (bb & (1 << i)) { r.i32(); r.i32(); r.byte(); }
  }
  // —— 到此为止:其后 superCart/Loadouts/voice/pendingRefunds/dialogues 不读 ——

  // voiceVariant/voicePitchOffset 在流中位于停止点之后(280/281,夹在 Loadouts 与
  // _pendingRefunds 之间——本仓不读该段),全版本由 skinVariant 奇偶派生
  // (泰拉瑞亚皮肤变体偶男奇女:0/2/4..=男→1,1/3/5..=女→2;原版 280- 建档同式)
  const appearance: Appearance = {
    name,
    hair,
    skinVariant,
    hairColor, skinColor, eyeColor, shirtColor, undershirtColor, pantsColor, shoeColor,
    difficulty: (difficulty === 0 || difficulty === 1 || difficulty === 2 || difficulty === 3) ? difficulty : 0,
    voiceVariant: (skinVariant % 2 === 1 ? 2 : 1),
    voicePitchOffset: 0,
  };

  const playerState: SaveData['player'] = {
    hp: Math.max(1, statLife), x: 0, y: 0,
    inventory,
    selected: 0,
    baseMaxHp: Math.max(100, statLifeMax),
    baseMaxMana: Math.max(20, statManaMax),
    mana: statMana,
    banks,
    armor, dye,
    miscEquips, miscDyes,
    buffs,
    taxMoney,
    golferScoreAccumulated,
    anglerQuestsFinished,
    hideInfo,
    hideVisibleAccessory: hideVisible,
    deathsPve, deathsPvp,
    team,
    dead, respawnTimer,
    hairDye,
    permanentUpgrades: {
      extraAccessory,
      usedAegisCrystal, usedAegisFruit, usedArcaneCrystal,
      usedGalaxyPearl, usedGummyWorm, usedAmbrosia,
    },
  };
  return { appearance, playerState, version };
}
