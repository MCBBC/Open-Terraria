// mod 音乐注册表(BGM 面,2026-10-08)。原版 BGM=数字 MusicID(AudioSystem.playMusic
// → audios/music/Music_<id>.mp3);mod 音乐无此域——本表给 mod 声明的曲目分配
// **独立数字槽位**,AudioSystem 按槽位源 URL 取字节(SW 同路缓存 sprites/mods/...,
// warmModAssetsCache 已暖全部 pack 文件含 .ogg)。
// 设计纪律:
//   ① 零 import(纯表)——Audio.ts 可安全引用,无装载环;
//   ② 槽位域 5000+(原版 MusicID 最大 104;62-88 TOW 族/音量修正式无交集);
//   ③ id=注册序(main.js 注册序确定 ⇒ 跨装载稳定;与 tiles/npcs 字典序分配不同域,
//      音乐走运行时 API 注册面,无 content json 声明需求);
//   ④ fail-fast 重复注册(对齐 hooks 同款纪律)。
export const MOD_MUSIC_ID_BASE = 5000;

interface ModMusicEntry { url: string; key: string }
const byId = new Map<number, ModMusicEntry>();
const byKey = new Map<string, number>();
let nextId = MOD_MUSIC_ID_BASE;

/** 注册曲目并返回槽位 id。file=pack 相对路径(sounds/Music/xxx.ogg)。 */
export function registerModMusic(modId: string, key: string, file: string): number {
  const fullKey = key.startsWith('mod_') ? key : `mod_${modId}_${key}`;
  if (byKey.has(fullKey)) throw new Error(`[mod-music] 重复注册: ${fullKey}`);
  const id = nextId++;
  byId.set(id, { url: `sprites/mods/${modId}/${file}`, key: fullKey });
  byKey.set(fullKey, id);
  return id;
}

/** AudioSystem.buffer 源解析:mod 槽位 → SW 缓存 URL;非 mod id → null(走原版路径) */
export function modMusicSource(id: number): string | null {
  return byId.get(id)?.url ?? null;
}

/** 全键 → 槽位 id(菜单主题/绑定解析用;未知键 null) */
export function modMusicIdOfFull(fullKey: string): number | null {
  return byKey.get(fullKey) ?? null;
}

// ---- 菜单主题音乐(CalamityMainMenu.GetMusicFromMusicMod("CalamityTitle") 同构:
//      标题屏覆盖原版标题曲;进世界由环境选曲接管) ----
let menuMusicKey: string | null = null;
/** hooks.registerMenuTheme 消费(全键;同注册覆盖) */
export function setMenuMusicKey(fullKey: string | null): void { menuMusicKey = fullKey; }
/** 标题曲覆盖 id(null=原版标题曲) */
export function menuMusicId(): number | null {
  return menuMusicKey ? byKey.get(menuMusicKey) ?? null : null;
}

// ---- Boss 曲绑定(CalamityMod.Music boss 换曲同构:mod boss 活动期覆盖事件曲) ----
const bossBindings: Array<{ modId: string; npcRef: number | string; musicKey: string | number }> = [];
const bossMusicById = new Map<number, number>();

/** 原始绑定(api 面即时调用;npc 字符串键→装载尾 resolveModBossMusic 解析,
 *  数字=原版 id 直存;musicKey=sw.music 返回的槽位 id 或注册键) */
export function registerModBossMusic(modId: string, npcRef: number | string, musicKey: string | number): void {
  bossBindings.push({ modId, npcRef, musicKey });
}

/** register.ts 应用 plan 后逐 mod 调用:npc 键 → 分配 id 解析(musicKey 已在
 *  sw.music 注册序先行的约定下解析;fail-loud 暴露缺引用) */
export function resolveModBossMusic(
  modId: string,
  npcResolve: (fullKey: string) => number | undefined,
): void {
  for (const b of bossBindings) {
    if (b.modId !== modId) continue;
    const musicId = typeof b.musicKey === 'number'
      ? b.musicKey
      : modMusicIdOfFull(b.musicKey.startsWith('mod_') ? b.musicKey : `mod_${modId}_${b.musicKey}`);
    if (musicId == null) throw new Error(`[mod-music] bossMusic 引用未注册曲目: ${b.musicKey}`);
    let npcId: number | null = null;
    if (typeof b.npcRef === 'number') npcId = b.npcRef;
    else {
      const full = b.npcRef.startsWith('mod_') ? b.npcRef : `mod_${modId}_${b.npcRef}`;
      const v = npcResolve(full);
      if (v === undefined) throw new Error(`[mod-music] bossMusic 引用未注册 NPC: ${b.npcRef}`);
      npcId = v;
    }
    bossMusicById.set(npcId!, musicId);
  }
}

/** Boss 曲查询(Game 事件曲扫描消费;未绑定 → null=原版槽位链照走) */
export function modBossMusicFor(npcId: number): number | null {
  return bossMusicById.get(npcId) ?? null;
}

/** 测试重置(与 _resetModHooksForTests 同纪律) */
export function _resetModMusicForTests(): void {
  byId.clear(); byKey.clear(); nextId = MOD_MUSIC_ID_BASE;
  menuMusicKey = null;
  bossBindings.length = 0;
  bossMusicById.clear();
}
