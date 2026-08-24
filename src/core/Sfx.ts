// 音效：原版 wav 素材（public/sounds/）+ WebAudio 合成兜底。
// **按需加载 + 首播补播（2026-08-21）**：播放未命中缓存时后台 fetch+decode
// （bufferPromises 去重、failed 负缓存防 404 循环），★本次触发不再丢声——
// 旧实现 ensureBuffer 同步返回 null → playWavFile return false，首播静默/落合成，
// 解码完成后第二声起才命中真声（用户报"发射子弹第一声永远静默"根因）。
// 现 deferPlay 在解码完成后按原触发参数补播一次，playWavFile 返回 true 告知
// 调用方"有声可闻"（合成兜底/通用 hit 回退不叠加）；仅负缓存命中（加载失败过）
// 才返回 false 走合成。另在首次取得 AudioContext 时批量预热高频清单
// WARMUP_NAMES（枪族/挖掘/战斗/UI——Item_36/41 等此前不在世界载入预热面），
// 把补播窗提前到进世界前。定向预热仍用 preloadFiles（如 Boss 召唤前取咆哮声）。
// hit 敌人受击 / hurt 玩家受击 / pickup 拾取 / dig 挖掘 / place 放置 / drink 饮用 / chop 砍树 / splash 落水
// + killed 怪物死亡 / zombie 僵尸环境声 / roar Boss咆哮 / coin 拾币 / door_open door_close / tink 敲石 / shatter 玻璃破碎 / drown 溺水
export type SfxName =
  | 'hit' | 'hurt' | 'pickup' | 'dig' | 'place' | 'drink' | 'chop' | 'splash'
  | 'killed' | 'pkilled' | 'zombie' | 'roar' | 'coin' | 'door_open' | 'door_close' | 'tink' | 'shatter' | 'drown'
  | 'menuOpen' | 'menuClose' | 'menuTick'
  | 'unlock'
  | 'bowShoot'   // 原版 SoundID.Item5（弓弦，Item.cs case 99 UseSound）
  | 'throw'      // 原版 SoundID.Item1（手里剑/投掷刀 UseSound）
  | 'explosion'  // 原版 SoundID.Item14（爆炸通用：手雷/炸弹/炸药/巨石,Projectile.cs 20+ 处）
  | 'explosionGrenade'  // 原版 SoundID.Item62（榴弹族闷爆：手雷 30/火箭一型 133/二型 136/三型 139，
                        //   Projectile.cs:74471-74475/:74539-74543——Kill 按弹型分支）
  | 'rocketJet' | 'starboardJet'  // 原版 SoundID.Item13/Item24（妖精翅 4/星璇悬浮板 45 喷射音）
  | 'beeSummon'  // 原版 SoundID.Item173（Abeemination 蜂后召唤音，Player.cs:43185——Boss 召唤音唯一非 Roar 例外）
  | 'thunder'   // 原版 SoundID 43（Thunder_0-5，NewLightning 的 thunderDelay 归零时播）
  | 'mech'       // 原版 SoundID 28（Mech_0：器件右键切换音，Player.cs:31762/31799/31803）
  | 'portalOrange' | 'portalBlue' // 原版 Item_115 / Item_114（传送门弹撞块落门音，Projectile.cs:16675-16683）
  | 'dd2Flameburst'  // DD2_FlameburstTowerShot（Sounds/Custom/dd2_flameburst_tower_shot_0-2，AI_131 :65533）
  | 'dd2Ballista'    // DD2_BallistaTowerShot（AI_134 :65674）
  | 'dd2Explosive'   // DD2_ExplosiveTrapExplode（AI_138 :66104）
  | 'dd2Zap'         // DD2_LightningAuraZap（AI_137 :65947）
  | 'whipCrack'   // 原版 Item_152（DefaultToWhip UseSound——鞭甩响，Item.cs:47448）
  | 'summon'      // 原版 Item_44（召唤杖通用 UseSound）
  | 'eowDig'      // EOWDiggin（CreateTrackable("eow_dig") SoundID.cs:1151——EoW 三段掘地专属,
                  //   AI_006 :52389；此前误用 Dig_0/1/2 近似,2026-08-18 对齐）
  // ---- 液体六配对专属轨（SoundID.cs:823-827 CreateTrackable("liquids_*",3,Ambient)，原 Sounds/Custom/）----
  | 'liquidWaterLava'   // 水岩浆（TileChangeType.LavaWater）
  | 'liquidHoneyWater'  // 水蜂蜜
  | 'liquidHoneyLava'   // 岩浆蜂蜜
  | 'shimmerSplash'     // 微光×3：原版即 PlaySound(19,…,4) = Splash_4（case 19 style 4 音量 ×0.75，FILE_CASE_VOL 统一乘）
  // ---- 雕像宝箱怪三轨（SoundID.cs:1105/1107/1109 CreateTrackable，Sounds/Custom/）----
  | 'statueMimicScare'  // 唤醒惊吓（AI_126 :43878，音量 0.8）
  | 'statueMimicJump'   // 跳跃（:43892/:43900，音量 0.3）
  | 'statueMimicLaugh'  // 玩家死亡嘲笑 ×3 变体（:43928，音量 0.8）
  // ---- 枪族 UseSound（Item.cs：其余枪械通用 Item_11，此前已在库内）----
  | 'gunShot'      // SoundID.Item11 枪械通用
  | 'gunShotgun'   // SoundID.Item36 霰弹枪族 534/964/3788/4703
  | 'gunHandgun'   // SoundID.Item41 手枪族 164/219/1255/1929/2269/2270
  | 'record'      // SoundID.Item166（八音盒录音完成，Player.cs:15054）
  | 'mirror'      // SoundID.Item6（魔镜族 UseSound：Magic/Ice Mirror/Cell Phone/Shellphone :42297 族）
  | 'bombFuse'    // SoundID.BombFuse = CreateTrackable("fuse")（SoundID.cs:1153，引信嘶声循环 0.2 音量）
  | 'conch'       // SoundID.Item64（海螺族 UseSound：Magic/Demon Conch/Shellphone 海洋地狱款）
  | 'manaCrystal' // SoundID.Item29（LegacySoundStyle(2,29)：Item.cs:2657 物品 109 魔力水晶 UseSound
                  //   + ParticleOrchestrator.Spawn_ShimmerTownNPC :1756 城镇 NPC 微光到位音）
  // ---- 天气环境音循环轨（SceneState.cs:235-297 暴风雪双轨；SoundType.Ambient）----
  | 'blizzardStrong'    // blizzard_strong_loop（SoundID.cs:821 BlizzardStrongLoop，WithVolume(0.5)）
  | 'blizzardInside'    // blizzard_inside_building_loop（:819 BlizzardInsideBuildingLoop）
  | 'sandstormWind';    // ★登记缺失：原版沙暴无专属 wav（Sandstorm 只有视觉 shader + 风场 BGM），
                        //   全量 852 wav 中无 sandstorm/wind 条目——素材出现前 playLoop 恒 null

/** 天气环境音循环轨名（Weather.update 状态机 ↔ Sfx 循环句柄的接口面） */
export type WeatherLoopName = 'blizzardStrong' | 'blizzardInside' | 'sandstormWind';

/** 循环轨基础音量（SoundID 定义侧的 WithVolume，SfxName 注释同源） */
export const LOOP_BASE_VOL: Record<WeatherLoopName, number> = {
  blizzardStrong: 0.5,    // SoundID.cs:821 WithVolume(0.5f)
  blizzardInside: 1,      // :819 无 WithVolume → 1.0
  sandstormWind: 1,       // 素材缺失，占位
};

/** 循环音句柄（SceneState.cs:235-297 暴风雪双轨的常驻轨管理面：
 *  原版 PlayTrackedSound 拿 SlotId 后每帧改 Volume，轨不拆；此处同构） */
export interface SfxLoop {
  /** 停止并释放节点（幂等） */
  stop(): void;
  /** 目标音量 0-1（setTargetAtTime 平滑逼近 ~0.2s，防切换爆音） */
  setVolume(v: number): void;
  /** 节点是否仍在发声（含缓冲解码完成后起振；pending 期为 false） */
  readonly playing: boolean;
  /** 终态（stop() 或缓冲加载失败）——调用方可丢弃重建；
   *  非 dead 且 !playing = 解码在途，勿重建（否则每帧泄漏 GainNode） */
  readonly dead: boolean;
}

// 逻辑名 → 原版 wav 文件（多文件随机选 + 音高扰动；导出供测试/预热侧消费）
export const WAV_MAP: Record<SfxName, string[]> = {
  hit: ['NPC_Hit_1', 'NPC_Hit_2', 'NPC_Hit_3', 'NPC_Hit_4', 'NPC_Hit_5'],
  hurt: ['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2'],
  killed: ['NPC_Killed_1', 'NPC_Killed_2', 'NPC_Killed_3'],
  pkilled: ['Player_Killed'],
  // case 14 默认变体组 Main.rand.Next(3)（LegacySoundPlayer.cs:816）；音量 ×0.4 见 FILE_CASE_VOL
  zombie: ['Zombie_0', 'Zombie_1', 'Zombie_2'],
  // roar = boss 吼(Roar_0)——原版 NPC.cs 16 处 PlaySound(15,x,y,0) 全显式 style0;
  // 蠕虫掘地(:52393)/毁灭者(:50473)是 PlaySound(15,x,y) 无 style(style 默认 1)=Roar_1,
  // 走 playSfxWav('Roar_1') 直文件,勿用本键(曾随机二选一→一半概率播成 boss 唤醒音,
  // 2026-08-18 用户报"地底蠕虫音全变 boss 咆哮"修正)
  roar: ['Roar_0'],
  eowDig: ['eow_dig'],   // EoW 掘地专属轨（单文件;AI_006 :52389）
  pickup: ['Grab'],
  dig: ['Dig_0', 'Dig_1', 'Dig_2'],
  chop: ['Grass'],
  tink: ['Tink_0', 'Tink_1', 'Tink_2'],   // case21 Next(3) 全 3 变体(:927-939)
  place: ['Dig_0', 'Dig_1', 'Dig_2'],     // PlaySound(0)=Dig 全 3 变体(WorldGen.cs 放块)
  shatter: ['Shatter'],
  coin: ['Coin_0', 'Coin_1', 'Coin_2', 'Coin_3', 'Coin_4'],   // case38 Next(5)(:1354);Coins.wav 是 type18 掉落叮当(case18)勿混
  door_open: ['Door_Opened'],
  door_close: ['Door_Closed'],
  splash: ['Splash_0', 'Splash_1', 'Splash_2', 'Splash_3', 'Splash_4', 'Splash_5'],
  drown: ['Drown'],
  bowShoot: ['Item_5'],
  // 菜单 UI（原版 id 10=Menu_Open / id 11=Menu_Close / id 12=Menu_Tick）
  menuOpen: ['Menu_Open'],
  menuClose: ['Menu_Close'],
  unlock: ['Unlock'],   // SoundID 22 Unlock（箱解锁 Chest.cs:402/:476;神庙钥匙开锁同号）
  menuTick: ['Menu_Tick'],
  throw: ['Item_1'],
  explosion: ['Item_14'],
  explosionGrenade: ['Item_62'],  // 榴弹族闷爆（Kill :74471-74475/:74539-74543 弹型分支）
  rocketJet: ['Item_13'],  // SoundID.Item13（妖精翅 4 飞行喷射音，WingFrame :29034）
  starboardJet: ['Item_24'], // SoundID.Item24（星璇悬浮板 45 喷射音，:29716）
  // 2026-08-13 修正：素材提取管线把 Sounds/Custom/ 拍平进 public/sounds/ 根目录，
  // 此前带 'Custom/' 前缀的 fetch 恒 404（failed 静默无声）——改用平铺名
  dd2Flameburst: ['dd2_flameburst_tower_shot_0', 'dd2_flameburst_tower_shot_1', 'dd2_flameburst_tower_shot_2'],
  dd2Ballista: ['dd2_ballista_tower_shot_0', 'dd2_ballista_tower_shot_1', 'dd2_ballista_tower_shot_2'],
  dd2Explosive: ['dd2_explosive_trap_explode_0', 'dd2_explosive_trap_explode_1', 'dd2_explosive_trap_explode_2'],
  dd2Zap: ['dd2_lightning_aura_zap_0', 'dd2_lightning_aura_zap_1', 'dd2_lightning_aura_zap_2', 'dd2_lightning_aura_zap_3'],
  whipCrack: ['Item_152'],
  summon: ['Item_44'],
  beeSummon: ['Item_173'],
  thunder: ['Thunder_0', 'Thunder_1', 'Thunder_2', 'Thunder_3', 'Thunder_4', 'Thunder_5'],
  mech: ['Mech_0'],
  portalOrange: ['Item_115'],   // form 0（ai[1]==0 → Item115，Projectile.cs:16675-16683）
  portalBlue: ['Item_114'],     // form 1
  // 液体六配对专属轨（各 3 变体随机；SoundID.cs:823-827）
  liquidWaterLava: ['liquids_water_lava_0', 'liquids_water_lava_1', 'liquids_water_lava_2'],
  liquidHoneyWater: ['liquids_honey_water_0', 'liquids_honey_water_1', 'liquids_honey_water_2'],
  liquidHoneyLava: ['liquids_honey_lava_0', 'liquids_honey_lava_1', 'liquids_honey_lava_2'],
  shimmerSplash: ['Splash_4'],  // PlaySound(19,…,4)：微光配对固定 style 4（LegacySoundPlayer.cs:885 音量 ×0.75）
  // 雕像宝箱怪（Sounds/Custom/ 提取拍平；SoundID.cs:1105/1107/1109）
  statueMimicScare: ['statuemimic_scare'],
  statueMimicJump: ['statuemimic_jump'],
  statueMimicLaugh: ['statuemimic_laugh_0', 'statuemimic_laugh_1', 'statuemimic_laugh_2'],
  // 枪族（Item.cs UseSound；弓 Item_5 见 bowShoot）
  gunShot: ['Item_11'],
  gunShotgun: ['Item_36'],
  gunHandgun: ['Item_41'],
  record: ['Item_166'],
  mirror: ['Item_6'],
  bombFuse: ['Fuse'],   // Content/Sounds/Custom/fuse.xnb → Fuse.wav（自提取，1.42s 循环）
  conch: ['Item_64'],
  // Item bank cue 29（case 2 无专属音量修正——LegacySoundPlayer.cs:519-643，
  // 默认 ±0.06 音高抖动由 PITCH_CASE.Item_ 表达,R22 前的全局 0.92+rand×0.16≈±0.115 过抖已废）
  manaCrystal: ['Item_29'],
  // ---- 天气环境音循环（Sounds/Custom/ 提取拍平；SceneState.cs:235-297 双轨管理）----
  blizzardStrong: ['blizzard_strong_loop'],
  blizzardInside: ['blizzard_inside_building_loop'],
  sandstormWind: [],    // ★无素材（见 SfxName 注释）——playWav/playLoop 均安全短路
  // 以下无原版素材，走合成
  drink: ['Item_3'],  // SoundID.Item3(药水饮用/回忆药水起始音;Item_3.wav 在盘,合成兜底仅剩硬失败路径)
};

/** 高频预热清单（Sfx 首次取得 AudioContext 时经 preloadNames 批量 decode，
 *  不阻塞不发声）。按需加载体系下"清单外的首播"由 deferPlay 补播兜底（一个
 *  fetch+decode 往返的延迟），本预热把高频轨的补播窗提前到进世界前：
 *  - 枪族三件（Item_11/36/41）——世界载入预热面（Game.ts）只有 Item_11，
 *    霰弹/手枪族本局首射静默 = 用户报障直接缺口；
 *  - 菜单三件套——首手势即菜单点击，UISfx 与 Game.sfx 是两个实例，各自预热；
 *  - 战斗/挖掘/拾取/门/液体高频。全 98 个 WAV_MAP 文件均在盘（2026-08-21 核对），
 *    合计 PCM 约 10MB 量级，远小于单首 BGM。 */
export const WARMUP_NAMES: SfxName[] = [
  // UI（首手势即菜单点击）
  'menuOpen', 'menuClose', 'menuTick', 'unlock',
  // 战斗/挖掘/拾取高频
  'hit', 'hurt', 'killed', 'pkilled', 'pickup', 'dig', 'place', 'chop', 'tink',
  'shatter', 'coin', 'splash', 'drown', 'zombie', 'roar',
  'door_open', 'door_close', 'drink', 'mech',
  // 枪/弓/投掷/爆炸/召唤/鞭（"发射子弹首声静默"主面）
  'gunShot', 'gunShotgun', 'gunHandgun', 'bowShoot', 'throw', 'explosion',
  'explosionGrenade', 'summon', 'whipCrack',
];

/** 原版专属音量修正表（LegacySoundPlayer.PlaySound 各 case 内对 num2 的修正系数，
 *  Terarria1456/Terraria.Audio/LegacySoundPlayer.cs）。
 *  键 = wav 文件名（含变体号）；playWavFile 单点统一乘——playWav（逻辑名）、
 *  playFiles（per-NPC HitSound/DeathSound）、playSfxFile/playUseSound（Item_N 直播）
 *  全路径自动生效。未登记 = 1.0（绝大多数 case 无专属修正，调用方传 1 即原版语义）。 */
export const FILE_CASE_VOL: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  // case 14 ZombieMoan（:792-824）：默认组恒 ×0.4（:818）
  m.Zombie_0 = 0.4; m.Zombie_1 = 0.4; m.Zombie_2 = 0.4;
  // case 3 NPCHit（:645-671）：style 20-54 ×0.5（:648）、55/56 ×0.5（:660）、57 ×0.6（:656）；1-19 无修正
  for (let s = 20; s <= 54; s++) m[`NPC_Hit_${s}`] = 0.5;
  m.NPC_Hit_55 = 0.5; m.NPC_Hit_56 = 0.5; m.NPC_Hit_57 = 0.6;
  // case 4 NPCKilled（:672-694）：style 23-57 ×0.5（:675）、61/62 ×0.6（:679/:683）、
  //   10 已在播则跳过（:688——肉山尖啸去重,NPC_Killed_10 入 SINGLE_INSTANCE）
  for (let s = 23; s <= 57; s++) m[`NPC_Killed_${s}`] = 0.5;
  m.NPC_Killed_61 = 0.6; m.NPC_Killed_62 = 0.6;
  // case 2 Item（:519-643）：styles 53 ×0.75/55 ×0.75×0.75（:555-561）、37 ×0.5（:567）、
  //   52 ×0.35（:571）、157 ×0.7/158 ×0.8/159 ×0.75（:573-578/:587）、156 ×0.6（:625）、
  //   26/35/47 ×0.75（:634-637）、116/123 ×0.5（:536/:529）、124/125 ×0.65（:533）、
  //   129 ×0.6（:525）、176 ×0.9（:521）
  const itemVol: [number, number][] = [
    [26, 0.75], [35, 0.75], [47, 0.75], [37, 0.5], [52, 0.35], [53, 0.75],
    [55, 0.5625], [116, 0.5], [123, 0.5], [124, 0.65], [125, 0.65], [129, 0.6],
    [156, 0.6], [157, 0.7], [158, 0.8], [159, 0.75], [176, 0.9],
    [210, 0.35],   // R4-37：GlacierFang_Charging（LegacySoundPlayer.cs:579 case 210 ×0.35）
  ];
  for (const [s, v] of itemVol) m[`Item_${s}`] = v;
  // case 19 Splash（:870-909）：styles 2/3 ×0.75（:876-879）、4/5 ×0.75（:880-883，微光/岩浆对）
  m.Splash_2 = 0.75; m.Splash_3 = 0.75; m.Splash_4 = 0.75; m.Splash_5 = 0.75;
  // case 29 Zombie 怪物声（:1007-1049）：24-87 ×0.5、88-91 ×0.7、92 ×0.5、93-99 ×0.4、
  //   100/101 ×0.25、102/103 ×0.4、104 ×0.55
  for (let s = 24; s <= 87; s++) m[`Zombie_${s}`] = 0.5;
  // ★Roar_1 无文件级音量档:case15 style1(蠕虫掘地 :52393/:50473)num18=1 满响;
  //   0.25 是 style4(沙鲨游弋 :42661)调用点专属,由调用方显式传(bossAI_dd2)——
  //   曾按文件名统一乘 → 蠕虫掘地被压 1/4,2026-08-18 修正
  m.Zombie_109 = 0.3;  // case45 Dolphin(:1063 ×0.3)——海豚跃出声
  m.Zombie_7 = 0.4;    // case14 style542(:793-799 沙鲨出沙扑咬 = Zombie_7 ×0.4)
  for (let s = 88; s <= 91; s++) m[`Zombie_${s}`] = 0.7;
  m.Zombie_92 = 0.5;
  for (let s = 93; s <= 99; s++) m[`Zombie_${s}`] = 0.4;
  m.Zombie_100 = 0.25; m.Zombie_101 = 0.25;
  m.Zombie_102 = 0.4; m.Zombie_103 = 0.4; m.Zombie_104 = 0.55;
  // case 26 Mummy（:968-976）Zombie_3/4 ×0.9；case 30 Duck（:1105-1126）Zombie_10-12 ×0.75
  m.Zombie_3 = 0.9; m.Zombie_4 = 0.9;
  m.Zombie_10 = 0.75; m.Zombie_11 = 0.75; m.Zombie_12 = 0.75;
  // ---- R22 小动物/海鸟族十组档（2026-08-24 对拍 LegacySoundPlayer 各 case,1457 同行号）----
  //   此前整族缺档 → 小动物环境声响 3-7 倍（红队 R22 定罪高项）
  m.Zombie_13 = 0.35;                                        // case31 Frog(:1128-1134)
  for (let s = 14; s <= 19; s++) m[`Zombie_${s}`] = 0.15;    // case32 Bird(:1136-1148)
  m.Zombie_15 = 0.2;                                         // case33 鼠(:1203-1213)——覆盖上行的 15
  for (let s = 106; s <= 108; s++) m[`Zombie_${s}`] = 0.2;   // case44 Seagull(:1054-1061)
  for (let s = 110; s <= 114; s++) m[`Zombie_${s}`] = 0.9;   // case46 Owl(:1074-1092)
  for (let s = 115; s <= 117; s++) m[`Zombie_${s}`] = 0.5;   // case65(:1400-1411)
  for (let s = 118; s <= 120; s++) m[`Zombie_${s}`] = 0.3;   // case67 Cockatiel(:1147-1158)
  for (let s = 121; s <= 123; s++) m[`Zombie_${s}`] = 0.45;  // case66(:1183-1198)
  for (let s = 126; s <= 128; s++) m[`Zombie_${s}`] = 0.22;  // case68 Macaw(:1159-1170)
  for (let s = 129; s <= 130; s++) m[`Zombie_${s}`] = 0.2;   // case69 Toucan(:1171-1182)
  return m;
})();

/** 原版逐类型音高抖动表（LegacySoundPlayer.PlaySound 各 case 的 Pitch 随机式;
 *  R22 修复:旧实现全局一档 playbackRate=0.92+rand×0.16≈±0.115,与原版逐类型档
 *  系统性偏差——门 ±0.20/草 ±0.30/Item ±0.06/鸟 -0.70..+0.25/受击咆哮菜单等不抖）。
 *  键 = wav 文件名;值 = [lo,hi]（单位 0.01,含端点,XNA Next(lo,hi+1)*0.01 等价）。
 *  未登记文件 = 不抖（原版无 Pitch 赋值的 case 与现代 trackable 路径默认 PitchVariance=0 同语义;
 *  player_hit_* 宠物语音按 SoundID.cs WithPitchVariance(0.4) 登记 ±40）。
 *  显式 pitch 参数（乐器 musicPitch 直传,Player.cs:45928）仍优先于本表。 */
export const PITCH_CASE: Record<string, [number, number] | null> = (() => {
  const m: Record<string, [number, number] | null> = {};
  const put = (files: string[], v: [number, number] | null) => { for (const f of files) m[f] = v; };
  const rng = (prefix: string, lo: number, hi: number): string[] =>
    Array.from({ length: hi - lo + 1 }, (_, k) => `${prefix}${lo + k}`);
  // —— 无音高族（对应 case 无 Pitch 赋值）——
  put(['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2', 'Player_Killed',   // case1(:506)/case5(:699)
    'Menu_Open', 'Menu_Close', 'Menu_Tick',                               // case10/11/12(:753/:763/:773)
    'Shatter',                                                            // case13(:786)
    'Roar_0', 'Roar_1',                                                   // case15(:829-845)
    'Coins',                                                              // case18(:868)
    'Tink_0', 'Tink_1', 'Tink_2',                                         // case21(:927-939)
    'Unlock',                                                             // case22(:940-949)
    'Drown'], null);                                                      // case23(:950)
  put(['Zombie_0', 'Zombie_1', 'Zombie_2',                                // case14 ZombieMoan(:796-827)
    'Zombie_7', 'Zombie_21', 'Zombie_22', 'Zombie_23'], null);
  put(['Zombie_115', 'Zombie_116', 'Zombie_117'], null);                  // case65(:1400)
  put(['Female_Hit_0', 'Female_Hit_1', 'Female_Hit_2'], null);            // case20(:914-926)
  // —— ±0.10 档 Next(-10,11)×0.01 ——
  put(rng('Dig_', 0, 2), [-10, 10]);              // case0(:453)
  put(rng('NPC_Hit_', 1, 58), [-10, 10]);         // case3(:673)
  put(rng('NPC_Killed_', 1, 68), [-10, 10]);      // case4(:696)
  put(rng('Thunder_', 0, 5), [-10, 10]);          // case43(:479)
  put(['Grab',                                    // case7(:728)
    'Zombie_3', 'Zombie_4',                       // case26 Mummy(:978)
    'Mech_0',                                     // case28(:1008)
    'Zombie_109'], [-10, 10]);                    // case45 Dolphin(:1071)
  put(rng('Zombie_', 24, 104), [-10, 10]);        // case29 怪物语音库(:1051)
  put(rng('Zombie_', 110, 114), [-10, 10]);       // case46 Owl(:1091)
  put(['Splash_0', 'Splash_1', 'Splash_2', 'Splash_3'], [-10, 10]);  // case19 style0-3(:891)
  put(['Splash_4', 'Splash_5'], [-20, 0]);        // case19 style4/5 微光对(:887 低音高)
  put(['Grass'], [-30, 30]);                      // case6 chop(:717)
  put(['Door_Opened', 'Door_Closed'], [-20, 20]); // case8/9(:739/:750)
  put(rng('Coin_', 0, 4), [-8, 8]);               // case38 拾币(:1354 ±0.08)
  // —— 小动物/海鸟族（R22 随映射修正一并接入）——
  put(rng('Zombie_', 106, 108), [-70, 0]);        // case44 Seagull(:1059 -0.70..0)
  put(['Zombie_10', 'Zombie_11'], [-70, 0]);      // case30 Duck 常规(:1120)
  put(['Zombie_12'], [-40, 20]);                  // case30 Duck 稀有 12(:1124)
  put(['Zombie_13'], [-40, 20]);                  // case31 Frog(:1133)
  put(rng('Zombie_', 14, 19), [-70, 25]);         // case32 Bird(:1144 -0.70..+0.25)
  put(['Zombie_15'], [-10, 30]);                  // case33 鼠(:1212 -0.10..+0.30)
  put([...rng('Zombie_', 118, 120), ...rng('Zombie_', 126, 128), ...rng('Zombie_', 129, 130)],
    [-5, 5]);                                     // case67/68/69 鹦鹉族(:1156/:1168/:1180 ±0.05)
  put(['Zombie_121', 'Zombie_122', 'Zombie_123'], [-15, 15]);  // case66(:1200)
  // —— Item 音库：case2 默认 ±0.06（:635）;特例逐条 ——
  put(rng('Item_', 1, 211), [-6, 6]);
  m.Item_53 = [-40, -22];    // :616 Next(-20,-11)×0.02
  m.Item_55 = [22, 40];      // :619 反相档
  m.Item_132 = [-2, 2];      // :622 ×0.001
  m.Item_153 = [-15, 15];    // :625 ×0.003
  m.Item_156 = [-10, 10];    // :628 ×0.002
  m.Item_169 = [-86, -74];   // :642 默认档后 Pitch -= 0.8
  m.Item_26 = null; m.Item_35 = null; m.Item_47 = null;   // :634-637 Pitch=Main.musicPitch(乐器直传不随机)
  // —— 宠物史莱姆受击语音（SoundID.cs WithPitchVariance(0.4),vanillaNpcAmbience 表注同源）——
  put(['player_hit_balloon', 'player_hit_cat', 'player_hit_chicken', 'player_hit_chicken_rare',
    'player_hit_crow', 'player_hit_dog', 'player_hit_fairy', 'player_hit_frog',
    'player_hit_goat', 'player_hit_goblin', 'player_hit_retro', 'player_hit_turkey',
    'player_hit_undead', 'player_hit_vampire'], [-40, 40]);
  return m;
})();

/** PITCH_CASE 单点消费：返回该文件的播放速率倍率（2^pitch）。
 *  显式 pitch 直传跳过;表项 null → 恒 1（不抖）;缺省 → 恒 1（未登记=原版无抖动） */
export function pitchRateFor(file: string, explicitPitch?: number): number {
  if (explicitPitch != null) return 2 ** explicitPitch;
  const t = PITCH_CASE[file];
  if (!t) return 1;
  const roll = t[0] + Math.floor(Math.random() * (t[1] - t[0] + 1));
  return 2 ** (roll / 100);
}

// ---------------------------------------------------------------------------
// Ambient 环境音轨（独立音量轨）
// ---------------------------------------------------------------------------
// 原版双通道（互斥替换，非叠加）：
//  ① Legacy 路径：DoesSoundScaleWithAmbientVolume（LegacySoundPlayer.cs:1443-1461）
//     的 14 个 SoundID 走 Main.ambientVolume（:420-423 num2 *= ambientVolume），
//     其余走 Main.soundVolume（:427）；
//  ② 现代路径：CreateTrackable(..., SoundType.Ambient)（SoundID.cs:819-827）经
//     ActiveSound.DetermineIntendedVolume（ActiveSound.cs:150-153）按
//     SoundType.Ambient → ambientVolume。
// 成员 → wav 文件全集（LegacySoundPlayer 各 case 的 bank 索引）：
//   30 Duck→Zombie_10-12（:1101-1122）/ 31 Frog→Zombie_13（:1124-1134）/
//   32 Bird→Zombie_14（:1136-1148）/ 33 Critter→Zombie_15（:1199-1211）/
//   34 Waterfall→Liquid_0（:1248-1278 SoundLiquid[0] 跟踪循环）/
//   35 Lavafall→Liquid_1（:1280-1310）/ 39 Drip→Drip_0-2（:1354-1360）/
//   43 Thunder→Thunder_0-5（:457-477）/ 44 Seagull→Zombie_106-108（:1050-1057）/
//   45 Dolphin→Zombie_109（:1058-1068）/ 46 Owl→Zombie_110-114（:1070-1090）/
//   67 Cockatiel→Zombie_118-120（:1143-1154）/ 68 Macaw→Zombie_126-128（:1155-1166）/
//   69 Toucan→Zombie_129-130（:1167-1177）
//   + SoundType.Ambient trackable：blizzard 双轨 + liquids_* 六配对（SoundID.cs:819-827）
export const AMBIENT_FILES: ReadonlySet<string> = new Set([
  // SoundID 30/31/32/33（Duck/Frog/Bird/Critter，Zombie 音库）
  'Zombie_10', 'Zombie_11', 'Zombie_12', 'Zombie_13', 'Zombie_14', 'Zombie_15',
  // SoundID 34/35（Waterfall/Lavafall 跟踪循环）
  'Liquid_0', 'Liquid_1',
  // SoundID 39（Drip）
  'Drip_0', 'Drip_1', 'Drip_2',
  // SoundID 43（Thunder）
  'Thunder_0', 'Thunder_1', 'Thunder_2', 'Thunder_3', 'Thunder_4', 'Thunder_5',
  // SoundID 44/45/46（Seagull/Dolphin/Owl）
  'Zombie_106', 'Zombie_107', 'Zombie_108', 'Zombie_109',
  'Zombie_110', 'Zombie_111', 'Zombie_112', 'Zombie_113', 'Zombie_114',
  // SoundID 67/68/69（Cockatiel/Macaw/Toucan）
  'Zombie_118', 'Zombie_119', 'Zombie_120', 'Zombie_126', 'Zombie_127', 'Zombie_128',
  'Zombie_129', 'Zombie_130',
  // SoundType.Ambient trackable（SoundID.cs:819-827）
  'blizzard_strong_loop', 'blizzard_inside_building_loop',
  'liquids_water_lava_0', 'liquids_water_lava_1', 'liquids_water_lava_2',
  'liquids_honey_water_0', 'liquids_honey_water_1', 'liquids_honey_water_2',
  'liquids_honey_lava_0', 'liquids_honey_lava_1', 'liquids_honey_lava_2',
]);

/** 音轨分派（LegacySoundPlayer.cs:420-429 的 if/else 同构）：
 *  ambient 成员 → ambientVol（替换 master）；其余 → masterVol。
 *  播放链单点消费（playWavFile / startLoopFile / setRain），测试可直断言 */
export function trackVolumeFor(file: string, ambientVol: number, masterVol: number): number {
  return AMBIENT_FILES.has(file) ? ambientVol : masterVol;
}

// ---- 环境音 cue 斜坡状态机（LegacyAudioSystem.cs:219-274 1:1；风 cue45/雨 cue28 共用）----

/** Main.musicFade[i] + AudioTrack.IsPlaying 等价态 */
export interface AmbientCueState { fade: number; playing: boolean; }

/** 环境 cue 载体层（XACT AudioTrack 等价物）：增益面 + 解码缓冲 + 源节点 + 斜坡态。
 *  src 非空 ⇔ cue 在播（Reuse+Play 建新源 / Stop 停拆）——真起停语义非静音常驻 */
export interface CueLayer {
  gain: GainNode | null;
  buf: AudioBuffer | null;
  loading: boolean;
  src: AudioBufferSourceNode | null;
  cue: AmbientCueState;
}

/**
 * 单步推进环境 cue（每 tick 调用，60Hz）——UpdateAmbientCueState(:236-250) /
 * UpdateAmbientCueTowardStopping(:253-273) 逐分支同构：
 *  门开：systemVolume==0 → Immediate 停但 fade 冻结(:229-234)；!playing 按旧 fade
 *        起播(不递增,:236-241)；否则 fade +0.005 钳 1(:243-248)。
 *  门关：!playing → fade 清零(:255-258)；否则 fade −0.005，≤0 即停(:260-270)。
 * 返回本帧 SetVariable 音量 = fade × ambientVolume × level；null = 本帧不动音量
 * （未播放）。level 为 case 公式值 num7/num11（不含 ambient）。
 */
export function stepAmbientCue(
  st: AmbientCueState, level: number, ambient: number, gate: boolean,
): number | null {
  const sys = Math.max(0, Math.min(1, level)) * ambient;   // systemVolume = ambientVolume × num7
  if (gate) {
    if (sys === 0) {
      // :229-234 仅在播才 Stop(Immediate)；未播=原版整支 return 什么都不动（含音量）
      const was = st.playing;
      st.playing = false;
      return was ? 0 : null;
    }
    if (!st.playing) st.playing = true;                    // Reuse+Play，旧 fade 音量起播
    else st.fade = Math.min(1, st.fade + 0.005);           // musicFade 斜坡
  } else {
    if (!st.playing) {
      st.fade = 0;                                         // TowardStopping !IsPlaying 清零
      return null;
    }
    st.fade = Math.max(0, st.fade - 0.005);
    if (st.fade <= 0) {
      st.playing = false;                                  // Stop(Immediate)
      return 0;
    }
  }
  return st.fade * sys;
}

/** 声像接线单点：g → StereoPanner(pan) → destination（不支持时直连=中心）。
 *  pan ∈ [-1,1]（panOf 已钳）;恒过 panner 节点避免"后补 panner 双路出声" */
function connectPan(ctx: AudioContext, g: GainNode, pan: number): void {
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(ctx.destination);
  } else {
    g.connect(ctx.destination);
  }
}

// ---------------------------------------------------------------------------
// SoundPlayOverrides 对账（Terraria.Audio/SoundPlayOverrides.cs 全文 + 全调用点，
// 2026-08-20 审计核销）。★结论：原版**没有** SoundID→别的音效/音调的替换表——
// 结构体仅一个字段 `float? Volume`，是 PlayTrackedSound/PlayTrackedLoopedSound 的
// 按次音量覆写参数（SoundEngine.cs:121/:137 → SoundPlayer.cs:11/:28，>10000px
// 屏心粗筛丢弃 → ActiveSound 构造：Volume=1f → UseOverrides(ActiveSound.cs:36-42
// 有值即覆盖) → 首播 Sound.Volume = DetermineIntendedVolume(ActiveSound.cs:138-161)
// = clamp( 距离衰减(1−d/2500，非 global) × Style.Volume × Volume覆写 × 音轨
// (sound|ambient|music), 0, 1 )。覆写挂在 ActiveSound 实例上，SoundEngine.Update
// （SoundPlayer.cs:101-115）每帧重算——外部逐帧改 activeSound.Volume/Position
// 持续生效。
// 调用点全表（1456 全量 grep 恰好 1 条，即"覆写表"全集）：
//   Player.cs:28111-28114 吸血鬼种子阳光炽灼嘶声环 —— style=SoundID.VampireSizzle
//   （CreateTrackable("sizzle").WithVolume(1f)，SoundID.cs:1039，默认
//   SoundType.Sound → soundVolume=master）、position=玩家 Center、
//   loopingCondition=VampireSizzleTracker.IsActiveAndInGame（!gameMenu &&
//   vampireSeed && sunScorchCounter>0）、Volume 覆写=GetLerpValue(0,120,
//   sunScorchCounter,true)；此后每帧 activeSound.Volume=lerp / Position=Center
//   （:28117-28119）。一次性 PlayTrackedSound 路径全游戏零 override 调用方。
// 本仓接线（覆写即查表落地）：Player.updateSunScorchValues → GameHooks.
// startLoopSfx('sizzle', lerp, 1) → playLoopFile(vol=lerp[Volume 覆写],
// base=1[Style.Volume]) → startLoopFile 目标音量 = min(1, vol×base×
// trackVolumeFor(master))——乘区序与 DetermineIntendedVolume 逐项一致；
// 循环条件=counter 归零拆轨 ≈ loopingCondition。断言见 tests/sound-overrides.test.ts。
// 遗留（不 bind，登记）：非 global 轨的距离衰减/Pan 在本仓循环轨未建模——sizzle
// 对本机玩家恒 d≈0（相机跟人），仅"吸血鬼种子+联机存活态观战他人"边缘态有差。
// ---------------------------------------------------------------------------

// ---- 资源包音效覆盖（M13）----
// 包内 Sounds/<X>（wav/mp3/ogg）→ 键 'X'（sounds/<X>.wav 的 file 部分）。
// 优先级高于基础源；多包同键由 ResourcePackManager 按优先级序预合并后整表下发。
// 替换/清空时须驱逐各实例已解码缓冲与失败负缓存——否则已播过的声音钉死旧源。
const packSoundOverrides = new Map<string, Uint8Array>();
const sfxInstances = new Set<Sfx>();

/** 全量下发资源包音效覆盖（合并终态）。affected = 新旧键并集驱逐缓存。 */
export function applySfxPackOverrides(sounds: ReadonlyMap<string, Uint8Array>): void {
  const affected = new Set([...packSoundOverrides.keys(), ...sounds.keys()]);
  packSoundOverrides.clear();
  for (const [k, v] of sounds) packSoundOverrides.set(k, v);
  for (const inst of sfxInstances) inst.evictSoundCache(affected);
}

/** 测试/调试探针：当前覆盖表只读视图 */
export function sfxPackOverrideKeys(): string[] { return [...packSoundOverrides.keys()]; }

export class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();

  constructor() {
    sfxInstances.add(this);   // 资源包覆盖下发时的缓冲驱逐对象
  }

  /** 资源包覆盖变更：驱逐受影响键的解码缓冲与失败负缓存（下次播放重取当前源）。
   *  包级可见（applySfxPackOverrides 跨实例调用） */
  evictSoundCache(files: Iterable<string>): void {
    for (const f of files) {
      this.buffers.delete(f);
      this.failed.delete(f);
    }
  }

  /** 在途解码（Promise 去重：ensureBuffer 同步面 / deferPlay 补播 / 循环轨
   *  共用的单一加载管线，防并发重复 fetch） */
  private bufferPromises = new Map<string, Promise<AudioBuffer | null>>();
  /** 取回失败/不存在的文件（负缓存，防 404 每次重试）。
   *  ★限时而非永久（2026-08-24 秃鹫死音报障）：SW cache-miss + 瞬时网络失败
   *  （vite 重启/SW 版本切换清缓存窗口）会把文件打进 failed → 该文件【整场】
   *  回退合成音（低频音效如秃鹫 NPC_Killed_31 首次请求即踩空的典型场景）。
   *  失败时刻入 failAt，超过 RETRY 窗口后放行重新加载。真 404（数据错名）
   *  每 15s 多一次 fetch，代价可忽略。 */
  private failed = new Set<string>();
  private failedAt = new Map<string, number>();
  /** 负缓存重试窗口（ms） */
  private static FAILED_RETRY_MS = 15_000;
  /** 负缓存是否仍有效（窗口内 true；过期自动解除） */
  private failedFresh(file: string): boolean {
    if (!this.failed.has(file)) return false;
    const at = this.failedAt.get(file) ?? 0;
    if (performance.now() - at >= Sfx.FAILED_RETRY_MS) {
      this.failed.delete(file);
      this.failedAt.delete(file);
      return false;
    }
    return true;
  }
  private markFailed(file: string): void {
    this.failed.add(file);
    this.failedAt.set(file, performance.now());
  }
  muted = false;
  /** 主音量 0..1（M6 设置页） */
  master = 1;
  /** Ambient 环境音量 0..1（Main.ambientVolume，Main.cs:1413 默认 1f；config 键
   *  "VolumeAmbient" Main.cs:4159/4383）。环境音族按此轨替换 master（见
   *  AMBIENT_FILES 注释） */
  ambient = 1;
  /** 载入期静音门（Game 侧置位/解除）：afterWorldLoad 的 waterCheck 全图收敛期间，
   *  killTile/breakTile/合并音会以 listener=(0,0) 满响（"进世界音效爆发"根因）。
   *  只盖一次性播放入口（play/playWavFile/startTrackedLoop——playWav/playFiles
   *  漏斗进 playWavFile 已被盖）；循环轨（天气/BGM/雨声）不经此门 */
  suppress = false;

  /** 原版单实例"播着跳过"族(LegacySoundPlayer.cs case 15 :825-841:实例 State==Playing
   *  时 return null 不重触发)——仅 Roar:多段蠕虫(毁灭者 80 段各自掷 soundDelay)靠
   *  同槽互斥收敛为单声,否则每 10-20t 满响吼叫叠成音墙。NPC_Hit(case3)是 Stop-重播、
   *  NPC_Killed(case4)/僵尸族(case14/26/29)每次都播,均不在此列 */
  private static readonly SINGLE_INSTANCE = new Set(['Roar_0', 'Roar_1', 'NPC_Killed_10']);
  /** 单实例槽:file → 正在播的 source(onended 清) */
  private singlePlaying = new Map<string, AudioBufferSourceNode>();

  /** 按需取缓冲（同步面）：命中返回缓冲；未命中触发后台加载并同步返回 null。
   *  资源包覆盖优先（M13，AssetSourceController.UseResourcePacks 的音频源同语义）：
   *  包内 Sounds/<X> 先于 sprites/ 基础源查询——命中即用包字节，不走 fetch。 */
  private ensureBuffer(file: string): AudioBuffer | null {
    const buf = this.buffers.get(file);
    if (buf) return buf;
    if (this.failedFresh(file)) return null;
    const ctx = this.ensure(true);
    if (!ctx) return null;
    void this.ensureBufferAsync(file, ctx);   // 后台加载（bufferPromises 去重）
    return null;
  }

  /** 定向预热（不阻塞）：把指定 wav 后台取齐，播放时即命中 */
  preloadFiles(files: Iterable<string>) {
    for (const f of files) this.ensureBuffer(f);
  }

  /** 按逻辑名预热（WAV_MAP 展开到具体文件） */
  preloadNames(names: SfxName[]) {
    for (const n of names) for (const f of WAV_MAP[n] ?? []) this.ensureBuffer(f);
  }

  // ---- 环境 cue 双层（风 cue45 / 雨 cue28）：XACT AudioTrack 载体面 1:1 ----
  //  每层 = 增益节点 + 解码缓冲 + 源节点 + musicFade 状态机。★播放态转写：
  //  Reuse()+Play() = 新建 BufferSource 从头起播（XACT cue 重播语义，非"静音常驻"）；
  //  Stop(Immediate) = 源节点真停拆。波 bank 未备（buf 未解码）= LegacyAudioSystem
  //  :220 IsPrepared 早退 → 状态机整帧冻结（fade 不进不退）。加载失败静默。
  private cueLayers = {
    /** WindAmbience cue45（Main.cs:11723-11749）。★可闻边界 = worldSurface（最深谷列
     *  +25,TerrainPass.cs:206）非本地草皮线——高原山下挖矿仍判「地表」继续播风 */
    wind: { gain: null, buf: null, loading: false, src: null, cue: { fade: 0, playing: false } } as CueLayer,
    /** RainAmbience cue28（Main.cs:11700-11720 case28；基线 num11=0.5 是原版真态） */
    rain: { gain: null, buf: null, loading: false, src: null, cue: { fade: 0, playing: false } } as CueLayer,
  };

  /** 设置风声强度（每帧驱动）：level = case45 公式值 num7（含 shimmer/atmo⁴,不含
   *  ambient）;gate = |wind|≥20/50 && SurfaceAtmospherics */
  setWind(level: number, gate: boolean) {
    const ctx = this.ensure(true);
    if (!ctx) return;
    this.stepCue(this.cueLayers.wind, ctx, 'audios/music/Music_45.mp3', level, gate);
  }

  /** 设置雨声强度（每帧驱动）：level = case28 公式值 num11;gate = ZoneRain && !ZoneSnow */
  setRain(level: number, gate: boolean) {
    const ctx = this.ensure(true);
    if (!ctx) return;
    this.stepCue(this.cueLayers.rain, ctx, 'audios/music/Music_28.mp3', level, gate);
  }

  /** 单层推进（LegacyAudioSystem.UpdateAmbientCueState/TowardStopping 的载体半边） */
  private stepCue(L: CueLayer, ctx: AudioContext, file: string, level: number, gate: boolean): void {
    if (!L.gain) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(ctx.destination);
      L.gain = g;
      this.loadCueBuffer(ctx, L, file);
    }
    if (!L.buf) return;                       // :220 !WaveBank.IsPrepared → 整机冻结
    const was = L.cue.playing;
    const v = stepAmbientCue(L.cue, level, this.ambient, gate);
    if (!was && L.cue.playing) {              // :237-239 Reuse()+Play() 从头起播
      const src = ctx.createBufferSource();
      src.buffer = L.buf;
      src.loop = true;
      src.connect(L.gain!);
      src.start();
      L.src = src;
    } else if (was && !L.cue.playing && L.src) {   // :232/:269 Stop(Immediate) 停拆
      try { L.src.stop(); } catch { /* 已停 */ }
      L.src = null;
    }
    if (v !== null) this.setGainNow(L.gain.gain, v);
  }

  /** 波 bank 后台取齐（失败静默：buf 恒 null = 冻结无声，雨/风均为可选层） */
  private loadCueBuffer(ctx: AudioContext, L: CueLayer, file: string): void {
    if (L.loading) return;
    L.loading = true;
    fetch(file)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
      .then((buf) => { if (buf) L.buf = buf; })
      .catch(() => {});
  }

  /** 每帧 SetVariable("Volume") 同构：清调度后瞬时赋值（原版逐帧直写音量无平滑） */
  private setGainNow(p: AudioParam, v: number): void {
    const t = this.ctx!.currentTime;
    p.cancelScheduledValues(t);
    p.value = Math.max(0, v);
  }

  /** 环境音 cue 双轨全停（退世界/销毁时调用）：源节点停拆 + Immediate 静音 + 状态机
   *  归零。★review 修（2026-08-24）：stopWeatherLoops 原单次 setRain(0,false) 只走一帧
   *  渐熄步进、天气链已停更 → gain 滞留近满幅漏进菜单；风层此前更无退出静音路径
   *  （既有泄漏，大风天退世界风声长鸣）。跨世界不复用 fade（destroy「防下个世界
   *  复用旧状态」同语义）；解码缓冲保留（WaveBank 备妥态跨世界成立），下次起播
   *  从头开始——与原版 Stop 后 Reuse 一致 */
  stopAmbientCues(): void {
    for (const L of [this.cueLayers.wind, this.cueLayers.rain]) {
      L.cue = { fade: 0, playing: false };
      if (L.src) { try { L.src.stop(); } catch { /* 已停 */ } L.src = null; }
      if (L.gain) this.setGainNow(L.gain.gain, 0);
    }
  }


  /** 世界声距离衰减（LegacySoundPlayer.cs:160 SoundAttenuationDistance = 2500px） */
  static readonly ATTEN = 2500;
  /** 监听器（原版 Main.Camera.Center，相机中心非玩家）；Game 每帧更新。未进世界=(0,0) */
  private lx = 0; private ly = 0;
  setListener(x: number, y: number) { this.lx = x; this.ly = y; }
  /** 原版距离衰减（LegacySoundPlayer.cs:381-401）：dist ≥2500 → 不播；
   *  vol × (1 - dist/2500)。不传坐标（x=-1 语义）→ 全量（UI/玩家自身动作声） */
  private atten(vol: number, x?: number, y?: number): number {
    if (x == null || y == null) return vol;
    const d = Math.hypot(x - this.lx, y - this.ly);
    if (d >= Sfx.ATTEN) return 0;
    return vol * (1 - d / Sfx.ATTEN);
  }

  /** 原版声像（LegacySoundPlayer.cs:398）：pan = dx/(MaxWorldViewSize.X/2) 钳 ±1。
   *  MaxWorldViewSize=(1920,1200) 是恒常量（Main.cs:754-758），分母 = 960 非窗口宽。
   *  R22 补齐：旧实现全程无声像（单声道定位）。 */
  static readonly PAN_HALF_VIEW = 960;
  private panOf(x?: number, y?: number): number {
    if (x == null || y == null) return 0;
    return Math.max(-1, Math.min(1, (x - this.lx) / Sfx.PAN_HALF_VIEW));
  }

  // ---- 失焦音频闸（★缺口补齐 2026-08-25,最小对齐形态）----
  //  原版 UpdateAudio 头部(Main.cs:11193-11202):allowMusic=false → audioSystem.PauseAll()
  //  + SoundEngine.StopAmbientSounds();AllowMusic(FocusHelper.cs:85-91)=失焦时取
  //  Main.SettingPlayWhenUnfocused(Main.cs:268 默认 false)=失焦全静、后台播放是主动
  //  开关。Web 同构 = 全部 AudioContext suspend/resume(XACT Pause/Resume 与 WebAudio
  //  suspend 同为「冻结+原地续播」)。★PlayWhenUnfocused 设置项登记未接(最小形态,
  //  后台听歌需求落地时补 Options+Settings+l10n)。
  private static ctxRegistry = new Set<AudioContext>();
  private static visHooked = false;

  /** 各 AudioContext 创建点登记(Sfx.ensure / AudioSystem.audio)。短命实例(Game 级
   *  sfx)销毁时必须 releaseAudioContext 摘除,防死 ctx 被 Set 钉死(HMR 双实例/
   *  连续读档内存教训);长命实例(BGM/菜单)随 app 存活无需摘 */
  static registerAudioContext(c: AudioContext): void {
    Sfx.ctxRegistry.add(c);
  }

  /** 销毁时从失焦闸注册表摘除（Game.destroy 调用） */
  releaseAudioContext(): void {
    if (this.ctx) Sfx.ctxRegistry.delete(this.ctx);
  }

  private static liveCtxs(): AudioContext[] {
    return [...Sfx.ctxRegistry];
  }

  /** 失焦闸总开关：hidden=true 全部挂起(等价 PauseAll),false 续播(ResumeAll)。
   *  resume 被拒(iOS 低电量模式/无手势历史)时挂下一次 pointerdown 重试——
   *  AudioSystem.armUnlock 手势兜底同款 */
  static setAudioSuspension(hidden: boolean): void {
    for (const c of Sfx.liveCtxs()) {
      if (hidden) {
        if (c.state === 'running') void c.suspend().catch(() => {});
      } else if (c.state === 'suspended') {
        void c.resume().catch(() => {
          window.addEventListener('pointerdown', () => { void c.resume().catch(() => {}); }, { once: true });
        });
      }
    }
  }
  /** 页面级监听只挂一次(多实例/HMR 重跑防重);首个 ctx 创建时接线 */
  private static hookVisibilityOnce(): void {
    if (Sfx.visHooked) return;
    Sfx.visHooked = true;
    document.addEventListener('visibilitychange', () => {
      Sfx.setAudioSuspension(document.hidden);
    });
  }

  private ensure(silent = false): AudioContext | null {
    if (this.muted && !silent) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      Sfx.registerAudioContext(this.ctx);
      Sfx.hookVisibilityOnce();
    }
    // ★失焦闸配合：隐藏期间禁止自动 resume(否则网络回调等触发的 ensure 会拆闸)
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
    this.warmup();
    return this.ctx;
  }

  /** 高频预热（每实例一次）：首次取得 AudioContext 即后台 decode WARMUP_NAMES。
   *  触发点 = 该实例第一次任何播放/预热（菜单实例 UISfx.sfx 在首手势、
   *  Game.sfx 在世界载入 preloadNames 处）——把枪声等高频轨的按需加载窗
   *  提前到进世界前。静音时不取（解除静音后的首播再触发）。 */
  private warmed = false;
  private warmup(): void {
    if (this.warmed || this.muted) return;
    this.warmed = true;
    this.preloadNames(WARMUP_NAMES);
  }

  /** 播放原版 wav（随机变体 + 轻微音高扰动）；vol 0-1 */
  playWav(name: SfxName, vol = 1, x?: number, y?: number): boolean {
    const list = WAV_MAP[name];
    if (!list || !list.length) return false;
    return this.playWavFile(list[Math.floor(Math.random() * list.length)], vol, x, y);
  }

  /** 播放任意 wav 文件列表（随机选 + 音高扰动）；供怪物专属声效用 */
  playFiles(files: string[], vol = 1, x?: number, y?: number): boolean {
    if (!files.length) return false;
    return this.playWavFile(files[Math.floor(Math.random() * files.length)], vol, x, y);
  }

  /** 跟踪式循环音（SoundEngine.PlayTrackedLoopedSound 语义，AI_016 :44276 引信嘶声）:
   *  返回句柄 {stop, setPos}——setPos 按距离衰减刷新音量（ProjectileAudioTracker
   *  跟随弹体）。缓冲未就绪返回 null（调用方下 tick 重试即可）。 */
  startTrackedLoop(name: SfxName, vol: number, x: number, y: number): { stop(): void; setPos(px: number, py: number): void } | null {
    if (this.suppress) return null;          // 载入期静音门（见字段注释）
    const list = WAV_MAP[name];
    if (!list || !list.length) return null;
    const ctx = this.ensure();
    if (!ctx) return null;
    const buf = this.ensureBuffer(list[0]);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = pitchRateFor(list[0]);
    const g = ctx.createGain();
    g.gain.value = this.atten(vol, x, y) * this.master;
    src.connect(g);
    // 声像跟随（原版跟踪轨每次 PlaySound 重设 Pan=num3 同语义）
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = this.panOf(x, y);
      g.connect(panner);
      panner.connect(ctx.destination);
    } else {
      g.connect(ctx.destination);
    }
    src.start();
    return {
      stop: () => { try { src.stop(); } catch { /* 已停 */ } g.disconnect(); panner?.disconnect(); },
      setPos: (px: number, py: number) => {
        g.gain.value = this.atten(vol, px, py) * this.master;
        if (panner) panner.pan.value = this.panOf(px, py);
      },
    };
  }

  // ---- 环境循环轨（SoundEngine.PlayTrackedSound 语义：常驻节点 + 音量平滑跟随）----

  /** 异步取缓冲（单一加载管线：ensureBuffer 同步面 / deferPlay 首播补播 /
   *  循环轨"缓冲就绪后再起振"共用；bufferPromises 去重防并发重复 fetch）。
   *  资源包覆盖优先于 fetch（与 ensureBuffer 同语义）。 */
  private ensureBufferAsync(file: string, ctx: AudioContext): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(file);
    if (hit) return Promise.resolve(hit);
    if (this.failedFresh(file)) return Promise.resolve(null);
    const pending = this.bufferPromises.get(file);
    if (pending) return pending;
    const p = (async () => {
      try {
        const override = packSoundOverrides.get(file);
        const ab = override
          ? override.slice().buffer
          : await fetch(`sounds/${file}.wav`).then((r) => (r.ok ? r.arrayBuffer() : null));
        const decoded = ab ? await ctx.decodeAudioData(ab) : null;
        if (decoded) { this.buffers.set(file, decoded); this.failed.delete(file); this.failedAt.delete(file); return decoded; }
        this.markFailed(file);
        return null;
      } catch {
        this.markFailed(file);
        return null;
      } finally {
        this.bufferPromises.delete(file);
      }
    })();
    this.bufferPromises.set(file, p);
    return p;
  }

  /** 循环轨底层（任意 wav 文件 + 外部基础音量）；缓冲未就位时句柄先行返回，
   *  解码完成后自动起振——调用方无需重试 */
  private startLoopFile(file: string, vol: number, base: number): SfxLoop | null {
    const ctx = this.ensure();
    if (!ctx) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const st = {
      src: null as AudioBufferSourceNode | null,
      vol: Math.max(0, Math.min(1, vol)),
      base,
      started: false,
      stopped: false,
      failed: false,
    };
    const apply = () => {
      // 循环轨同款音轨分派（ActiveSound.cs:150-153 SoundType.Ambient → ambientVolume）
      const target = Math.min(1, st.vol * st.base * trackVolumeFor(file, this.ambient, this.master));
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
    };
    const handle: SfxLoop = {
      stop: () => {
        if (st.stopped) return;
        st.stopped = true;
        try { st.src?.stop(); } catch { /* 已停 */ }
        st.src?.disconnect();
        gain.disconnect();
      },
      setVolume: (v: number) => {
        st.vol = Math.max(0, Math.min(1, v));
        if (st.started && !st.stopped) apply();
      },
      get playing() { return st.started && !st.stopped; },
      get dead() { return st.stopped || st.failed; },
    };
    void this.ensureBufferAsync(file, ctx).then((buf) => {
      if (st.stopped) return;
      if (!buf) { st.failed = true; gain.disconnect(); return; }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start();
      st.src = src;
      st.started = true;
      apply();
    });
    return handle;
  }

  /**
   * 环境循环轨播放（SoundEngine.PlayTrackedSound 语义）：返回常驻句柄，
   * 音量经 setVolume 每帧跟随（天气状态机驱动）。默认音量 0.3（不吵）。
   * 无素材轨（如 sandstormWind）返回 null——调用方跳过即可，无需重试。
   */
  playLoop(name: WeatherLoopName, vol = 0.3): SfxLoop | null {
    const list = WAV_MAP[name];
    if (!list || !list.length) return null;
    return this.startLoopFile(list[0], vol, LOOP_BASE_VOL[name]);
  }

  /** 按文件名播放循环（沙暴等未来素材接入的备用口） */
  playLoopFile(file: string, vol = 0.3, base = 1): SfxLoop | null {
    return this.startLoopFile(file, vol, base);
  }

  /** 缓冲起振（playWavFile 即时路径与 deferPlay 补播共用的出声单点）：
   *  音高（PITCH_CASE 逐类型档,pitch 直传跳过）+ 音轨分派（LegacySoundPlayer.cs:420-429：
   *  ambient 成员 ×ambientVolume，其余 ×soundVolume(master)——替换而非叠加）+ 声像 +
   *  单实例占槽（onended=自然播完/stop 均触发,清槽后可重播） */
  private startBuffer(file: string, buf: AudioBuffer, vol: number, pitch?: number, pan = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitchRateFor(file, pitch);
    const g = ctx.createGain();
    g.gain.value = Math.min(1, vol * trackVolumeFor(file, this.ambient, this.master));
    src.connect(g);
    connectPan(ctx, g, pan);
    src.start();
    if (Sfx.SINGLE_INSTANCE.has(file)) {
      this.singlePlaying.set(file, src);
      src.onended = () => {
        if (this.singlePlaying.get(file) === src) this.singlePlaying.delete(file);
      };
    }
  }

  /** 首播补播（首声不丢，2026-08-21）：本次触发未命中缓存→ensureBuffer 已触发
   *  后台加载，解码完成后按原触发参数补播一次。门/互斥在补播时点重判
   *  （suppress 置位后排队的补播被拦——与即时路径同一门语义）；ctx 仍 suspended
   *  则挂 resume 后起振。加载失败（负缓存）则本次保持静默，后续触发经
   *  playWavFile false 走合成兜底（WAV_MAP 全 98 文件在盘，实际不达）。 */
  private deferPlay(file: string, ctx: AudioContext, vol: number, x: number | undefined, y: number | undefined, pitch: number | undefined, replace: boolean | undefined): void {
    void this.ensureBufferAsync(file, ctx).then((buf) => {
      if (!buf || this.suppress) return;
      if (!replace && Sfx.SINGLE_INSTANCE.has(file) && this.singlePlaying.has(file)) return;
      const fire = () => this.startBuffer(file, buf, vol, pitch, this.panOf(x, y));
      if (ctx.state === 'suspended') void ctx.resume().then(fire, fire);
      else fire();
    });
  }

  /** 按文件名直播。返回值 = "有声可闻"：已即时播出，或未命中缓存但已排队
   *  deferPlay 补播（返回 true——调用方的合成兜底/通用 hit 回退不叠加出声）；
   *  仅硬失败返回 false：载入静音门 / 静音 / 无 AudioContext / 距离衰减归零 /
   *  负缓存命中（该文件已知加载失败）。
   *  vol 语义 = 原版 volumeScale（调用方传 1 = 原版默认）；原版各 case 的专属
   *  音量修正（FILE_CASE_VOL）在此单点统一乘，调用方无需手传修正系数。
   *  pitch = XNA SoundEffectInstance.Pitch（-1..1，频率倍率 2^pitch）——乐器族
   *  （Player.cs:45928 Main.musicPitch 直传 PlaySound 第 4 参）需要逐音符变调，
   *  传该参时跳过默认 ±0.08 抖动（音符音高是语义本体，不容扰动）。
   *  replace = case 36 ForceRoar 语义（:1312-1325 直接 CreateInstance 覆盖槽、
   *  旧实例在 _trackedInstances 里继续自然播完）——无视互斥每次都播、槽位换绑
   *  新实例（旧 onended 因槽已换绑不误删）。case 15 调用勿传（保持播着跳过） */
  playWavFile(file: string, vol = 1, x?: number, y?: number, pitch?: number, replace?: boolean): boolean {
    if (this.suppress) return false;         // 载入期静音门（见字段注释）
    // 单实例互斥（case 15 Roar 播着跳过——见 SINGLE_INSTANCE 注释；case36 replace 豁免）
    if (!replace && Sfx.SINGLE_INSTANCE.has(file) && this.singlePlaying.has(file)) return false;
    const ctx = this.ensure();
    if (!ctx) return false;
    const v = this.atten(vol, x, y);
    if (v <= 0) return false;
    vol = v * (FILE_CASE_VOL[file] ?? 1);
    const buf = this.ensureBuffer(file);
    if (!buf) {
      if (this.failedFresh(file)) return false;   // 负缓存窗口内→合成兜底（过期自动重载）
      this.deferPlay(file, ctx, vol, x, y, pitch, replace);   // ★首播不丢
      return true;
    }
    this.startBuffer(file, buf, vol, pitch, this.panOf(x, y));
    return true;
  }

  play(name: SfxName, vol = 1, x?: number, y?: number) {
    if (this.suppress) return;               // 载入期静音门（见字段注释）
    // 优先原版素材，失败回退合成（master 在 playWavFile/osc 各自生效一次）。
    // 带坐标时衰减（atten），≤0 直接不播——合成回退也不触发
    if (x != null && y != null && this.atten(vol, x, y) <= 0) return;
    if (this.playWav(name, vol, x, y)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + delay + dur);
      g.gain.setValueAtTime(vol * this.master, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t + delay);
      o.stop(t + delay + dur);
    };
    switch (name) {
      case 'hit': osc('square', 320, 110, 0.09, 0.12); break;
      case 'chop': osc('triangle', 220, 80, 0.12, 0.16); break;
      case 'hurt': osc('sawtooth', 180, 60, 0.22, 0.14); break;
      case 'killed': osc('square', 260, 60, 0.25, 0.14); break;
      case 'pkilled': osc('sawtooth', 160, 40, 0.6, 0.18); break;
      case 'zombie': osc('sawtooth', 90, 55, 0.5, 0.1); break;
      case 'roar': osc('sawtooth', 70, 40, 0.9, 0.2); break;
      case 'eowDig': osc('square', 120, 70, 0.12, 0.08); break;   // 缺文件兜底(实体在库)
      case 'pickup': osc('sine', 520, 990, 0.09, 0.1); osc('sine', 780, 1320, 0.08, 0.06, 0.05); break;
      case 'dig': osc('square', 140, 90, 0.05, 0.06); break;
      case 'tink': osc('sine', 900, 500, 0.06, 0.08); break;
      case 'place': osc('triangle', 260, 120, 0.08, 0.12); break;
      case 'drink': osc('sine', 300, 620, 0.06, 0.08); osc('sine', 420, 780, 0.06, 0.07, 0.07); osc('sine', 560, 940, 0.06, 0.06, 0.14); break;
      case 'splash': osc('sine', 700, 200, 0.18, 0.1); break;
      case 'summon': {
        // 召唤杖 UseSound(Item_44)近似:短促"噗"——高频下扫正弦 + 一撮噪声气声
        osc('sine', 900, 260, 0.16, 0.14);
        osc('triangle', 1400, 500, 0.08, 0.06);
        break;
      }
      case 'whipCrack': {
        // 鞭响(Item_152)近似:高频噪声急促炸开 + 快速衰减
        const wDur = 0.12, wn = Math.floor(ctx.sampleRate * wDur);
        const wBuf = ctx.createBuffer(1, wn, ctx.sampleRate);
        const wd = wBuf.getChannelData(0);
        for (let i = 0; i < wn; i++) wd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / wn, 3);
        const wSrc = ctx.createBufferSource();
        wSrc.buffer = wBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1200;
        const wg = ctx.createGain();
        wg.gain.value = 0.18 * this.master;
        wSrc.connect(hp).connect(wg).connect(ctx.destination);
        wSrc.start(t);
        break;
      }
      case 'explosion': {
        // 噪声爆发近似(原版 Item_14):一次性白噪 buffer + 低频 thump。
        // ★曾无此分支:按需加载首播(wav 还在 fetch)完全静音 = "炸弹没有音效"主因
        const dur = 0.5, n = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(120, t + dur);
        const g = ctx.createGain();
        g.gain.value = 0.5 * this.master;
        src.connect(lp).connect(g).connect(ctx.destination);
        src.start(t);
        osc('sine', 90, 35, 0.35, 0.35); // 低频冲击
        break;
      }
      case 'coin': osc('sine', 990, 1400, 0.07, 0.08); osc('sine', 1320, 1760, 0.09, 0.06, 0.05); break;
      case 'door_open': osc('triangle', 180, 320, 0.12, 0.1); break;
      case 'door_close': osc('triangle', 320, 160, 0.1, 0.1); break;
      case 'shatter': osc('square', 1400, 300, 0.15, 0.1); break;
      case 'drown': osc('sine', 400, 90, 0.4, 0.1); break;
      case 'mirror': osc('sine', 700, 1900, 0.3, 0.06); osc('sine', 1400, 2800, 0.25, 0.04, 0.1); break;   // 魔镜闪烁上行
      case 'conch': osc('sine', 220, 330, 0.25, 0.08); osc('sine', 330, 440, 0.3, 0.06, 0.2); break;        // 海螺低鸣
    }
  }
}
