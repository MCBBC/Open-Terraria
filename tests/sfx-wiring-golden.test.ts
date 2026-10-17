// 音效接线覆盖金标（2026-08-25 音频全面接线批）：
// public/sounds 的每个 wav 必须落在至少一个消费面上。覆盖集全部走【运行时解析器】
// 求精确值,不做文本模糊匹配（文本法两坑:驼峰 NPCHit16 对不上 stem;轨前缀动态
// 选变体 abigail_cry_0-2 只有点名处无完整 stem——都靠解析器展开才准）：
//   ① src 字面量整词匹配（直名 playSfxWav('Xxx_0') 等）
//   ② vanilla-itemusesound.json 全量条目 → 确定性解析（Item_N 直取;命名轨经
//     vanillaSoundFiles 展开整组——★勿用 itemUseSoundWav,它对命名轨返回随机
//     单变体=曾致"变体级抖动"假象,2026-08-26 收口勘误）
//   ③ vanilla-npcs.json 全 NPC HitSound/DeathSound → vanillaSoundFiles()
//   ④ vanilla-soundtracks.json 轨键被 src 点名的（soundTrackFiles('k')）→ 整组文件
//   ⑤ Sfx WAV_MAP/AMBIENT_FILES 值集 + vanillaNpcAmbience 四表 range 展开
// 未覆盖集必须与 UNWIRED_ALLOWLIST 快照完全一致：接线一批缩一批，到 [] 后永久钉死。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IDLE_SOUNDS, CHATTER_SOUNDS, CRITTER_SOUNDS, PET_SLIME_HIT_VOICES } from '../src/data/vanillaNpcAmbience';
import { WAV_MAP, AMBIENT_FILES } from '../src/core/Sfx';
import { vanillaSoundFiles, soundTrackFiles } from '../src/data/vanillaNpcs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** UNWIRED_ALLOWLIST——2026-08-26 音频全面接线批收官:**空**。
 *  863 wav 全覆盖;余量分账:B3_PENDING(宿主待移植挂账)/DEAD_SLOTS(vanilla 死素材,
 *  逐条证据)。历史基线 139→70→…→0,过程快照见 /tmp/sfx-uncovered.json */
const UNWIRED_ALLOWLIST: string[] = [];

/** B3 待办挂账（非死素材!宿主子系统未移植,落地后即接线删除）——与
 *  UNWIRED_ALLOWLIST 分列但同样排除出增长判定。
 *  player_hit_default / player_death_retro 已随语音系统批（2026-08-26,
 *  PlayerVoice.ts voiceOverride 全支+PlayDeathSound）接线清出;
 *  剩余挂账仅 Chester 宠物箱(容器交互待扩展) */
/** B3_PENDING——2026-08-26 清空:chester×4 已随宠物容器批接线(Game.ts 右键链/
 *  跟随关门/PetFollower 开盖帧段;Main.cs:38411-38476/:38656/:31244-31330),
 *  本桶机制留作空表备用 */
const B3_PENDING: string[] = [];

/** 原版自身零引用的死素材（vanilla 全树无任何调用面 → 本仓永不接线）——
 *  从 uncovered 计算中排除,不占白名单额度。证据逐条：
 *  - Zombie_5：LegacySoundPlayer case14 全 switch 索引穷举零命中（default Next(3)=0..2、
 *    style542=7、style489/586=21..24；case26 Next(3,5)=3..4——5 号槽全库无写入方）
 *  - Zombie_87 / Zombie_101：case29 样式普查三基线（1456/1457/1458）一致缺失——
 *    1458 段内 style 常量最大 86,101 无 PlaySound(29,…,101) 调用点
 *  - NPC_Killed_68：SoundID.cs:412 定义后全树零引用（case4 消费上限 62）
 *  - Zombie_121 / Zombie_122 / Zombie_123：宿主弹型 75 HappyBomb 1458 已无生成路径
 *    （Projectile.cs:47802 触发链存在但不可达——case66 音档随之不可达）
 *
 *  ★B1 DD2/联动批追加（原版孤儿集,即 VANILLA_ORPHANS 概念——并入本桶机制），
 *  均经 Terarria1457 全树 grep 确证定义后零调用面：
 *  - dd2_monk_staff_ground_miss_0/1/2：SoundID.cs:1010
 *    DD2_MonkStaffGroundMiss=CreateTrackable(…,3) 定义后全树零引用（同族
 *    GroundImpact :1008 有消费,miss 组无任何 PlaySound/PlayTrackedSound 调用方——
 *    天鞭 4259 未移植前的宿主缺口,宿主落地时须复核原版是否真播此组再转回白名单）
 *  - deadcells_mushroom_jump：SoundID.cs:1110 WithVolume(0.35) 定义后全树零调用
 *  - deadcells_mushroom_land：SoundID.cs:1108 同上（DeadCellsMushroomBoi 宿主
 *    NPC 未移植;其 TargetFound 编排粒子有引用而这两条音轨无）
 *  - pal_chillet_attack：SoundID.cs:1084 WithVolume(0.35) 定义后全树零调用
 *    （PalChillet :1082/PalChilletJoy :1083 有消费,Attack 变体槽空置） */
const DEAD_SLOTS: string[] = [
  // ★Run 翻案(2026-10-17,同日两折):Maples 退役刀曾把 Run 入桶判死——判据
  //  =全树 grep PlaySound(SoundID.Run)/PlaySound(17 零命中。实为字面 grep 盲区:
  //  原版消费走 hermesStepSound 结构体数字域(PlayerFrame :36229-36231 每帧重置
  //  SoundType=17/Cooldown=9;legs==140 Djinn's Curse :36243-36245 覆写 2/24/6),
  //  SpawnFastRunParticles :20358-20361 PlaySound(hermesStepSound.SoundType,·,·,
  //  SoundStyle)——grep 抓不到数字域赋值链。用户亲测原版有效+反编译逐行复核定谳:
  //  Run 是活功能(SoundID.cs:56 Run=17;LegacySoundPlayer :236 Load("Sounds/Run")
  //  +case17 :857 播放臂)。本仓接线=Player.ts spawnFastRunParticles 头部
  //  (2026-10-17 修刀,旧实现误键 Item_17+误嵌普通支)。
  'Zombie_5',
  'Zombie_87',
  'Zombie_101',
  'NPC_Killed_68',
  'Zombie_121',
  'Zombie_122',
  'Zombie_123',
  // ---- B1 批追加孤儿（证据见上）----
  'dd2_monk_staff_ground_miss_0',
  'dd2_monk_staff_ground_miss_1',
  'dd2_monk_staff_ground_miss_2',
  'deadcells_mushroom_jump',
  'deadcells_mushroom_land',
  'pal_chillet_attack',
  // ---- 音频对账总收口追加（2026-08-26）----
  // Roar_2：数组[3]（LegacySoundPlayer.cs:116/:229）第三槽全库无 style=2 消费——
  //   track15 显式 style0(NPC.cs 16 处)+默认 1(:50625/:52542)+style4→Roar_1@0.25vol
  //   (:831-835);track36 ForceRoar 仅 0/-1(:20555/:1317-1323)。定谳 vanilla-unused
  'Roar_2',
  // dd2_etherian_portal_dryad_touch：唯一消费=DD2Film.cs:207 DryadPortalFade 首帧,
  //   而 CinematicManager.PlayFilm 无任何 DD2Film 注册方(CinematicManager.cs:20)——
  //   原版本体不可达的过场资产(本仓亦无 cinematics 系统)
  'dd2_etherian_portal_dryad_touch',
  ];

/** 并行会话作业区豁免——2026-08-26 收口清空:所谓"抖动"真凶是金标②面走
 *  itemUseSoundWav 的随机单变体返回,改确定性解析后该族全部稳定覆盖,豁免机制
 *  留作空表备用（后续并行施工期可临时添前缀） */
const PARALLEL_CLAIMED_PREFIXES: string[] = [];


/** 注释剥离（状态机,尊重引号串——防 URL 'http://' 误伤）：金标语料只认代码,
 *  注释里的名字（"Zombie_"+k 示例/轨名罗列）既不该算接线也不该豁免检查。
 *  ★2026-08-26 假绿通道封堵:此前注释与音量/音高表键都会误判覆盖 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; i += 2; out += ' '; continue; }
      if (c === '/' && d === '*') { state = 'block'; i += 2; out += ' '; continue; }
      if (c === "'" || c === '"' || c === '`') { state = `str${c}`; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += '\n'; } i++; continue; }
    if (state === 'block') { if (c === '*' && d === '/') { state = 'code'; out += ' '; i += 2; } else { if (c === '\n') out += '\n'; i++; } continue; }
    // 字符串态:保留内容(模板串允许嵌套 ${} 里再进 code 态的复杂场景从简——按原样保留)
    if (c === state[3]) { state = 'code'; out += c; i++; continue; }
    if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
    out += c; i++;
  }
  return out;
}

/** Sfx.ts 内部直名接线（文件整体排除出语料后的补偿面——该文件的
 *  FILE_CASE_VOL/PITCH_CASE 键是假绿源头,WAV_MAP/AMBIENT_FILES 已走 face⑤ 导入） */
const SFX_INTERNAL_WIRED = ['Item_18', 'Item_19'];

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (/\.(ts|mts)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('sfx wiring golden', () => {
  it('每个 wav 都有消费点（或进入已知未接线白名单）', () => {
    // ★IIIII215b 陈旧口径修复（非判例变更）：09-04 opus 迁移批（scripts/encode-sounds-opus.mjs）
    //   后 public/sounds 为生成物目录（.opus+.mp3,零 .wav）——本金标语料面自迁移日起
    //   恒红（wavs.length=0）,此处改读 .opus 生成物,stem 语义与覆盖判定不变。
    const wavs = readdirSync(`${ROOT}/public/sounds`)
      .filter((f) => f.endsWith('.opus'))
      .map((f) => f.replace(/\.opus$/, ''));
    expect(wavs.length).toBeGreaterThan(800);

    const srcFiles = walkTs(`${ROOT}/src`);
    // ★Sfx.ts 整文件排除出语料:其音量/音高表键(FILE_CASE_VOL/PITCH_CASE)曾构成
    //   假绿通道;真实消费面已由 face⑤(WAV_MAP/AMBIENT_FILES 导入值)承担,
    //   文件内仅有的直名接线(Item_18/19 轮换)经 SFX_INTERNAL_WIRED 显式补面
    const srcCorpus = [
      ...Object.values(WAV_MAP).flat(),
      ...AMBIENT_FILES,
      ...SFX_INTERNAL_WIRED,
      ...srcFiles
        .filter((p) => !p.endsWith('core/Sfx.ts'))
        .map((p) => stripComments(readFileSync(p, 'utf8'))),
    ].join('\n \n');
    const lowerCorpus = srcCorpus.toLowerCase();

    // ① 直名字面量 + ④ 被 src 点名的声轨键整组展开
    const tracks: Record<string, string[]> = JSON.parse(
      readFileSync(`${ROOT}/src/data/vanilla-soundtracks.json`, 'utf8'),
    );
    const covered = new Set<string>();
    for (const f of Object.values(WAV_MAP).flat()) covered.add(f);
    for (const f of AMBIENT_FILES) covered.add(f);

    interface AmbSpec { range?: [number, number]; files?: string[]; sound?: string;
      pool?: string[]; rare?: { denom: number; files: string[] }; }
    const pushSpec = (s: unknown) => {
      if (!s || typeof s !== 'object') return;
      const spec = s as AmbSpec;
      if (spec.range) for (let n = spec.range[0]; n <= spec.range[1]; n++) covered.add(`Zombie_${n}`);
      if (typeof spec.sound === 'string') covered.add(spec.sound);
      if (Array.isArray(spec.files)) for (const x of spec.files) if (typeof x === 'string') covered.add(x);
      // B2 批新增面：ChatterSpec.pool（多文件均匀随机）/CritterSoundSpec.rare.files
      // （稀有变体独立掷）——消费点在 Enemy.ambientSoundTick
      if (Array.isArray(spec.pool)) for (const x of spec.pool) if (typeof x === 'string') covered.add(x);
      if (Array.isArray(spec.rare?.files)) for (const x of spec.rare.files) covered.add(x);
    };
    Object.values(IDLE_SOUNDS).forEach(pushSpec);
    Object.values(CHATTER_SOUNDS).forEach(pushSpec);
    Object.values(CRITTER_SOUNDS).forEach(pushSpec);
    Object.values(PET_SLIME_HIT_VOICES).forEach(pushSpec);

    // ② usesound 数据面（确定性解析:★勿走 itemUseSoundWav——它对命名轨返回
    //   随机单变体,是金标"变体级抖动"的真凶;此处按 json 原值展开整组）
    const USES: Record<string, unknown> = JSON.parse(
      readFileSync(`${ROOT}/src/data/vanilla-itemusesound.json`, 'utf8'),
    );
    for (const raw of Object.values(USES)) {
      const s = String(raw);
      if (/^Item_\d+$/.test(s)) { covered.add(s); continue; }
      for (const g of vanillaSoundFiles(s) ?? []) covered.add(g);
    }

    // ③ per-NPC hit/death 面
    const NPCS: Record<string, { HitSound?: string | null; DeathSound?: string | null }> =
      JSON.parse(readFileSync(`${ROOT}/public/sprites/vanilla-npcs.json`, 'utf8'));
    for (const v of Object.values(NPCS)) {
      for (const n of [v.HitSound, v.DeathSound]) {
        const files = vanillaSoundFiles(n);
        if (files) for (const f of files) covered.add(f);
      }
    }

    // ④ 轨键点名面：soundTrackFiles('<key>') / '<key>' 出现于 src 才算接
    for (const [key, files] of Object.entries(tracks)) {
      if (lowerCorpus.includes(key.toLowerCase())) for (const f of files) covered.add(f);
    }

    // ① 直名整词匹配（大小写不敏感;词边界防 run⊂running）
    for (const w of wavs) {
      const re = new RegExp(`(?<![a-zA-Z0-9_])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9])`);
      if (re.test(srcCorpus)) covered.add(w);
    }

    const coveredLower = new Set([...covered].map((s) => s.toLowerCase()));
    // 动态族规则：stem 去掉尾部 _N 后,若语料里出现 `<prefix>_` 紧跟模板/字符串
    // 边界（`Zombie_${93+…}` 形）——整族视为已接（动态选变体覆盖全组）。
    const dynRe = (prefix: string) =>
      new RegExp(`(?<![a-zA-Z0-9_])${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_['"\`+$]`);
    const allUncovered = wavs.filter((w) => {
      if (coveredLower.has(w.toLowerCase())) return false;
      const m = w.match(/^(.*)_\d+$/);
      if (m && dynRe(m[1]).test(srcCorpus)) return false;
      return true;
    });
    // 并行作业区成员单列(不参与增长判定,防施工噪声打红全仓测试);
    // DEAD_SLOTS = 原版零引用死素材(永不接线,证据见上);B3_PENDING = 待移植子系统
    // 宿主音(单独挂账)——三者均排除出 uncovered 计算
    const claimed = (w: string) => PARALLEL_CLAIMED_PREFIXES.some((p) => w.startsWith(p));
    const dead = new Set(DEAD_SLOTS.map((s) => s.toLowerCase()));
    const b3 = new Set(B3_PENDING.map((s) => s.toLowerCase()));
    const uncovered = allUncovered
      .filter((w) => !claimed(w) && !dead.has(w.toLowerCase()) && !b3.has(w.toLowerCase()))
      .sort();
    // ★单向子集语义（非 toEqual 全等）：并行会话会独立缩小未覆盖集（如 DD2 轨
    // 随时在接），本闸门只保证【未接线集不增长】——新 wav 不接即红;别人缩小
    // 覆盖永远放行。全批清偿后 UNWIRED_ALLOWLIST 清空即成双向钉死。
    // 诊断面:每次运行都把当前未覆盖集落盘(/tmp),供清偿批直接消费,
    // 免去解析 vitest diff 输出。
    try { writeFileSync('/tmp/sfx-uncovered.json', JSON.stringify(allUncovered.sort(), null, 1)); } catch { /* 非诊断环境 */ }
    const allow = new Set([...UNWIRED_ALLOWLIST].map((s) => s.toLowerCase()));
    const regrew = uncovered.filter((w) => !allow.has(w.toLowerCase()));
    expect(regrew).toEqual([]);
    expect(uncovered.length).toBeLessThanOrEqual(UNWIRED_ALLOWLIST.length);
    // 白名单里已被别人接掉的条目顺手清出（防快照腐化,失败信息给出该删哪些）
    const stale = [...UNWIRED_ALLOWLIST].filter(
      (a) => !uncovered.some((u) => u.toLowerCase() === a.toLowerCase()),
    );
    expect(stale).toEqual([]);
  });
});
