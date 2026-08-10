/** MusicID（Terraria.ID/MusicID.cs；音频文件 audios/music/Music_<id>.ogg） */
export const MUSIC = {
    None: 0, OverworldDay: 1, Eerie: 2, OverworldNight: 3, Underground: 4,
    Boss1: 5, TitleClassic: 6, JungleDay: 7, Corruption: 8, Hallow: 9,
    UndergroundCorruption: 10, UndergroundHallow: 11, Boss2: 12, Boss3: 13,
    Snow: 14, SpaceNight: 15, Crimson: 16, Golem: 17, OverworldDayAlt: 18,
    Rain: 19, Ice: 20, Desert: 21, OceanDay: 22, Dungeon: 23, Plantera: 24,
    Boss5: 25, Temple: 26, Eclipse: 27, RainAmbience: 28, Mushroom: 29,
    PumpkinMoon: 30, UndergroundAlt: 31, FrostMoon: 32, UndergroundCrimson: 33,
    LunarPillars: 34, PirateInvasion: 35, Underworld: 36, MartianMadness: 37,
    MoonLord: 38, GoblinArmy: 39, Sandstorm: 40, OldOnesArmy: 41, SpaceDay: 42,
    OceanNight: 43, WindyDay: 44, WindAmbience: 45, TownDay: 46, TownNight: 47,
    SlimeRain: 48, OverworldDayRemix: 49, TitleIntro: 50, Title: 51, Storm: 52,
    Graveyard: 53, UndergroundJungle: 54, JungleNight: 55, QueenSlime: 56,
    EmpressOfLight: 57, DukeFishron: 58, MorningRain: 59, TitleAlt: 60,
    UndergroundDesert: 61, JourneysEnd: 89, Deerclops: 90, Aether: 91,
    Destroyer: 92, KingSlime: 93, LunaticCultist: 94, QueenBee: 96, Twins: 97,
    SkeletronPrime: 98, EaterOfWorlds: 99, Skeletron: 104,
};
export function newMusicState() {
    return { ugMusic: 0, dayMusic: 0 };
}
/** 太空系数（Main.cs:12466-12469）：(centerY/16 - (65+10*(w/4200)^2)) / (worldSurface/5)；<1 = 太空层 */
export function spaceFactor(centerY, maxTilesX, worldSurface) {
    return (centerY / 16 - (65 + 10 * (maxTilesX / 4200) ** 2)) / (worldSurface / 5);
}
/** 按环境选曲（优先级链同 Main.cs:12470-12913；remixWorld/天气/事件分支省略） */
export function pickMusic(inp) {
    const s = inp.scene;
    const lavaLine = inp.lavaLine;
    const halfScreen = 400; // 原版 screenHeight/2（AssumedConstantScreenSize 1200/2≈600，本仓库视口 800/2）
    const belowHalf = inp.centerY > inp.worldSurface * 16 + halfScreen; // 原版 Center.Y > worldSurface*16 + screenHeight/2
    // Boss（原版屏幕附近 Boss 旗标链 → Boss1；EoC 即 5）
    if (inp.bossNearby)
        return MUSIC.Boss1;
    // 城镇曲（L12602-12609：≥3 城镇 NPC 且非墓地；无雨风判定省略）
    if (s.townNPCCount >= 3 && !s.zoneGraveyard) {
        return inp.isDay ? MUSIC.TownDay : MUSIC.TownNight;
    }
    // 地狱（L12614）
    if (inp.centerY > lavaLine * 16)
        return MUSIC.Underworld;
    // 太空（L12618）
    if (spaceFactor(inp.centerY, inp.maxTilesX, inp.worldSurface) < 1) {
        return inp.isDay ? MUSIC.SpaceDay : MUSIC.SpaceNight;
    }
    // 神庙墙（L12622）
    if (s.zoneTemple)
        return MUSIC.Temple;
    // 地牢（L12626）
    if (s.zoneDungeon)
        return MUSIC.Dungeon;
    // 蘑菇地（L12630：bgStyle==9 地表或地下 style 2 —— 均由 ZoneGlowshroom 驱动）
    if (s.zoneGlowshroom)
        return MUSIC.Mushroom;
    // 腐化/猩红（L12634-12665：双邪恶共存按计数分主，深度分地表/地下曲）
    if (s.zoneCorrupt) {
        if (s.zoneCrimson)
            return belowHalf ? MUSIC.UndergroundCrimson : MUSIC.Crimson;
        return belowHalf ? MUSIC.UndergroundCorruption : MUSIC.Corruption;
    }
    if (s.zoneCrimson)
        return belowHalf ? MUSIC.UndergroundCrimson : MUSIC.Crimson;
    // 陨石（L12667）
    if (s.zoneMeteor)
        return MUSIC.Eerie;
    // 墓地（L12671）
    if (s.zoneGraveyard)
        return MUSIC.Graveyard;
    // 地下沙漠（L12675）/ 沙漠（L12679）
    if (s.zoneUndergroundDesert)
        return MUSIC.UndergroundDesert;
    if (s.zoneDesert)
        return MUSIC.Desert;
    // 丛林（L12683-12724：岩石层下 54 深地丛林；否则昼 7 夜 55）
    if (s.zoneJungle) {
        if (inp.centerY > inp.rockLevel * 16 + halfScreen)
            return MUSIC.UndergroundJungle;
        return inp.isDay ? MUSIC.JungleDay : MUSIC.JungleNight;
    }
    // 雪原（L12725-12746：地下 20 冰雪，地表 14）
    if (s.zoneSnow)
        return belowHalf ? MUSIC.Ice : MUSIC.Snow;
    // 地下分支（L12747：y ≥ surface+half 且非海洋）
    const ocean = inp.ocean ?? s.zoneBeach;
    if (belowHalf && !ocean) {
        if (s.zoneHallow)
            return MUSIC.UndergroundHallow;
        // 普通地下 4/31 随机（L12762-12788：仅当两曲都不在播时重掷——由调用方 state 模拟）
        if (inp.state.ugMusic === 0)
            inp.state.ugMusic = Math.random() < 0.5 ? MUSIC.Underground : MUSIC.UndergroundAlt;
        return inp.state.ugMusic;
    }
    // 神圣地表（L12806-12816 白天分支）
    if (inp.isDay && s.zoneHallow)
        return MUSIC.Hallow;
    // 海洋（L12836-12857）
    if (ocean)
        return inp.isDay ? MUSIC.OceanDay : MUSIC.OceanNight;
    // 森林昼夜（L12862-12910：白天 1/18 随机粘性；夜晚 3）
    if (inp.isDay) {
        if (inp.state.dayMusic === 0)
            inp.state.dayMusic = Math.random() < 0.5 ? MUSIC.OverworldDay : MUSIC.OverworldDayAlt;
        return inp.state.dayMusic;
    }
    return MUSIC.OverworldNight;
}
