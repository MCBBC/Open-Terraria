// 全量素材差异扫描：terraria-assets（原版 1.4.5.6 解包）vs 本仓已消费素材。
// 产出：docs/asset-gap-report.md + docs/asset-gap-report.json
//
// 用法：node scripts/asset-gap-scan.mjs [--min-list=N]（每类缺失清单截断长度，默认全量）
//
// 判定"已消费"的四条通道：
//   ① 文件级：public/sprites/vanilla/<同名>.png
//   ② UI 展平：public/sprites/vanilla-ui/<路径下划线展平>.png（含子目录）
//   ③ 别名表：已知改名（如 Backgrounds/Ambience/Meteor → Background_Meteor）
//   ④ 数据级：Item_{id}（Item_Atlas_0/1 打包图集，vanilla.json items 全量 5456 条覆盖）
// 每类缺失附【原因+关联机制系统】标注（规则表见 CATEGORY_RULES）。
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const ASSETS = join(ROOT, '..', 'terraria-assets');
const OUT_DIR = join(ROOT, 'docs');

function walk(dir, base = dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

// ---------- 1) 原版清单 ----------
const vanillaImages = walk(join(ASSETS, 'Images')).filter((p) => p.endsWith('.png'));
const vanillaSounds = walk(join(ASSETS, 'Sounds')).filter((p) => p.endsWith('.wav'));

// ---------- 2) 本仓清单 ----------
const ourVanilla = new Set(walk(join(ROOT, 'public', 'sprites', 'vanilla')));
const ourUiRaw = walk(join(ROOT, 'public', 'sprites', 'vanilla-ui'));
const ourUi = new Set(ourUiRaw);
const ourUiFlat = new Set(ourUiRaw.map((p) => p.replace(/\//g, '_')));
const ourSounds = new Set(walk(join(ROOT, 'public', 'sounds')));
const ourPortraits = new Set(walk(join(ROOT, 'public', 'sprites', 'portraits')));
const ourL10n = new Set(walk(join(ROOT, 'public', 'l10n')));

// 数据级：Item_Atlas 打包覆盖全量物品图标（vanilla.json items 条数）
const vanillaJson = JSON.parse(readFileSync(join(ROOT, 'public', 'sprites', 'vanilla.json'), 'utf8'));
const itemCount = Object.keys(vanillaJson.items ?? {}).length;

// ---------- 3) 别名表（原版路径/名 → 本仓名） ----------
const ALIAS = {
  'Backgrounds/Ambience/Meteor.png': 'Background_Meteor.png', // 天幕流星（本仓改名）
};
// Backgrounds/*.* 的通用候选：Background_<名>、<父目录>_<名>、<名>
function aliasCandidates(rel) {
  const list = [];
  const name = basename(rel, '.png');
  const parent = basename(dirname(rel));
  if (dirname(rel) !== '.') {
    list.push(`${parent}_${name}.png`);
    list.push(`Background_${name}.png`);
    list.push(`${name}.png`);
  }
  return list;
}

// ---------- 4) 分类规则表（原因 + 关联机制） ----------
// 规则顺序即匹配顺序；每条：test(rel/name) → { cat, reason, mechanism }
const rules = [
  { re: /^Item_\d+\.png$/, cat: 'Item_*（物品图标）', reason: `数据级全量消费（Item_Atlas 打包，vanilla.json ${itemCount} 条）`, mechanism: '物品系统——已覆盖', dataLevel: true },
  { re: /^Gore_\d+\.png$/, cat: 'Gore_*（死亡碎块）', reason: '仅 boss 专属/特殊 gore 已接线（~60 张），常规怪碎片未做', mechanism: '⭐ Gore 碎块系统——部分实装（缺全量化）' },
  { re: /^Glow_\d+\.png$/, cat: 'Glow_*（发光覆层）', reason: '仅月总族/已实装 Boss 的 Glow 表已接，全量发光叠层未做', mechanism: '⭐ Glow 叠层系统——部分实装' },
  { re: /^Extra_(\d+)\.png$/, cat: 'Extra_*（杂项机制表）', reason: '已接 ~40 张（派对帽/月总肢体/荷兰船/表情等）；缺失项=对应 Main.cs 专属绘制分支的 NPC/系统未移植', mechanism: '⭐ 逐 id 机制——多数关联未实装系统（需人工对号）' },
  { re: /^Projectile_\d+\.png$/, cat: 'Projectile_*（投射物表）', reason: '文件级全量已拷', mechanism: '投射物系统——素材已覆盖（AI 按需接入）' },
  { re: /^NPC_\d+(_Alt_\d+)?\.png$/, cat: 'NPC_*（怪物/城镇表）', reason: '全量已拷（719 张 ≥ 原版 717）', mechanism: 'NPC 系统——素材已覆盖' },
  { re: /^NPC_Head(_Boss)?_\d+\.png$/, cat: 'NPC_Head*（头像/旗帜头）', reason: '城镇头像+Boss 头已拷（旗帜头索引表已全 8 史莱姆）', mechanism: '旗帜/图鉴头像——已覆盖' },
  { re: /^Buff_\d+\.png$/, cat: 'Buff_*（Buff 图标）', reason: '388/389 已拷（差集见清单）', mechanism: 'Buff 系统——素材已覆盖' },
  { re: /^Tiles_\d+(_\d+)?\.png$/, cat: 'Tiles_*（图块表）', reason: '白名单 753 条 tile 表全量已拷', mechanism: '图块系统——已覆盖' },
  { re: /^Wall_\d+\.png$/, cat: 'Wall_*（墙表）', reason: '白名单 366 条墙表全量已拷', mechanism: '墙系统——已覆盖' },
  { re: /^ItemFlame_.*\.png$/, cat: 'ItemFlame_*（火把火苗）', reason: '火把族动态火苗覆层未接（火把光已用其它路径）', mechanism: '⭐ ItemFlame 火苗系统——未实装' },
  { re: /^Cloud_\d+\.png$/, cat: 'Cloud_*（云）', reason: '0-3 常规云已接；9-21 雨云/风暴云未拷', mechanism: '⭐ 天气视觉（雨/风暴云渲染）——未实装' },
  { re: /^Waterfall_\d+\.png$/, cat: 'Waterfall_*（瀑布胶片）', reason: '0-14/25-27 主表已接（21/28），差集见清单', mechanism: '瀑布系统——基本覆盖' },
  { re: /^Moon_.*\.png$/, cat: 'Moon_*（月亮）', reason: 'moonType 0-8+霜/南瓜已接', mechanism: '月亮系统——已覆盖' },
  { re: /^(Sun|Cloud_Alpha)\.png$/, cat: 'Sun/云底', reason: 'Sun 已接', mechanism: '天空系统——已覆盖' },
  { re: /^Liquid_\d+\.png$/, cat: 'Liquid_*（液体）', reason: '0-14 全量已接', mechanism: '液体系统——已覆盖' },
  { re: /^Tree_(Tops|Branches)_\d+\.png$/, cat: 'Tree_*（树冠/树枝）', reason: '32 样式全量已拷', mechanism: '树系统——已覆盖' },
  { re: /^Wings_\d+\.png$/, cat: 'Wings_*（翅膀）', reason: '52 张已拷（vanilla 51，超集）', mechanism: '翅膀系统——已覆盖' },
  { re: /^(Acc_|Armor_)/, cat: 'Acc_*/Armor_*（穿戴表）', reason: '经 vanilla-ui 消费（748 键）；差集=未实装配件/盔甲样式', mechanism: '⭐ 纸娃娃穿戴样式——部分实装（差集需人工）' },
  { re: /^Player_/, cat: 'Player_*（角色部件）', reason: '发型 228+帽发 228+身体帧表/manifest 经 vanilla-ui 已拷', mechanism: '角色系统——已覆盖' },
  { re: /^Shimmer_.*/, cat: 'Shimmer_*（微光特效）', reason: '微光转化/实体染色已实装，专用覆层表未全接', mechanism: '⭐ 微光视觉覆层——部分实装' },
  { re: /^Rune_[A-Z].*\.png$/, cat: 'Rune_*（符文石）', reason: '符文石未实装', mechanism: '⭐ 符文石系统——未实装' },
  { re: /^Trash/, cat: 'Trash（垃圾桶 UI）', reason: '背包垃圾桶未实装', mechanism: '⭐ 背包垃圾桶——未实装' },
  { re: /^Mount/, cat: 'Mount_*（坐骑）', reason: '坐骑系统未实装（猪鲨/海盗船/独角兽/驯鹿等）', mechanism: '⭐ 坐骑系统——未实装' },
  { re: /^Chain/, cat: 'Chain*（链条族）', reason: 'Chain41-43 已接（幽灵链）；其余=墙链/宝石链/血肉墙市长链等装饰链', mechanism: '链条渲染族——部分实装（差集需人工）' },
  { re: /^Flame_/, cat: 'Flame_*（火焰族）', reason: 'Flame.png 已接（岩浆宽限条）；UI 火焰动画/蓝焰等未取', mechanism: '火焰渲染族——部分实装' },
  { re: /^LiquidSlope/, cat: 'LiquidSlope_*（液体斜坡）', reason: '液体渲染为直角矩形，斜面贴合表未接', mechanism: '⭐ 液体斜坡渲染——未实装' },
  { re: /^BackPack_/, cat: 'BackPack_*', reason: '背包展开态贴图（旅商主题背包）', mechanism: '背包 UI 主题——未实装' },
  { re: /^Map_/, cat: 'Map_*（全屏地图）', reason: '全屏地图仅 Default 皮肤', mechanism: '⭐ 全屏地图皮肤——未实装' },
  { re: /^Gem(Check|Chain|lock|Lock)/, cat: 'Gem 检测/锁/链', reason: '宝石大件装饰（宝石检测器/锁链）', mechanism: '杂项机制——未实装（需人工）' },
  { re: /^Gem(Blue|Green|Red|Purple|Orange|Yellow|White|Rainbow)/, cat: 'Gem_*（大宝石）', reason: '大宝石装饰件', mechanism: '杂项装饰——未实装' },
  { re: /^Inventory_/, cat: 'Inventory_*（背包 UI）', reason: '背包 UI 已自研原版样式；原版 Inventory_ 族未逐张取', mechanism: '背包 UI——自研替代（视觉差异可忽略）' },
  { re: /^Cage/, cat: 'Cage*（小动物笼）', reason: '笼子物品在库但放置态渲染（笼顶/栖木）未接', mechanism: '⭐ 小动物笼放置渲染——未实装' },
  { re: /^Xmas/, cat: 'Xmas_*（圣诞）', reason: '圣诞节日 UI/礼物图标', mechanism: '节日系统——未实装' },
  { re: /^GolemLights/, cat: 'GolemLights（石巨人灯光）', reason: '石巨人入场灯光演出未接', mechanism: 'Boss 入场演出——未实装' },
  { re: /^Rudolph/, cat: 'Rudolph（驯鹿）', reason: '驯鹿坐骑（圣诞礼物）', mechanism: '⭐ 坐骑系统——未实装' },
  { re: /^Wires_/, cat: 'Wires_*（电路图标）', reason: '电路系统已实装；Wires_ 点阵图标族未取', mechanism: '电路 UI 图标——未取（功能已覆盖）' },
  { re: /^(jellyfishBowl|BirdBowl|WaterBowl)/, cat: '鱼缸/水碗', reason: '观赏鱼缸放置渲染', mechanism: '杂项放置物——未实装' },
  { re: /^(House|Lock|Logo|Sun_|Sunset|Star_|Star|Chat_|Eye|Bone_|AntlionBody|BeetleOrb|Black_Tile|Blind|Dest|Golf)/, cat: '散装机制小图', reason: '散件（Boss 部件/装饰/成就星/UI 图标）', mechanism: '杂项——逐文件需人工' },
];

// 子目录类（Backgrounds/Misc/UI/TownNPCs/Accessories/Armor/SplashScreens）
const dirRules = [
  { dir: 'Backgrounds/Ambience', cat: 'Backgrounds/Ambience（天空环境实体）', reason: '仅 Meteor（天幕流星）已接', mechanism: '⭐ AmbientSky 天空实体系统——仅 1/N（天空水母/鸟群/流星雨视觉等未做）' },
  { dir: 'Backgrounds', cat: 'Backgrounds/*（群系背景）', reason: 'BiomeBackground 已接主群系；差集=地狱层细节/圣殿/微光湖等背景层', mechanism: '⭐ 群系背景——部分实装（差集需人工）' },
  { dir: 'UI/Minimap', cat: 'UI/Minimap（小地图皮肤）', reason: '9 款皮肤全量已接', mechanism: '小地图系统——已覆盖' },
  { dir: 'UI/Map', cat: 'UI/Map（全屏地图皮肤）', reason: '全屏地图皮肤未接（全屏地图本身在库，仅 Default）', mechanism: '⭐ 全屏地图皮肤——未实装' },
  { dir: 'UI/Bestiary', cat: 'UI/Bestiary（图鉴）', reason: '图鉴 UI 已接部分；差集=图鉴页框/图标细节', mechanism: '图鉴 UI——部分实装' },
  { dir: 'UI/Creative', cat: 'UI/Creative（旅程模式）', reason: '旅程模式 UI（研究/时间倍率面板）未全接', mechanism: '⭐ 旅程模式 UI——部分实装' },
  { dir: 'UI/CharCreation', cat: 'UI/CharCreation（角色创建）', reason: '角色创建已接；差集=发色预设等细节', mechanism: '角色创建 UI——部分实装' },
  { dir: 'UI/PlayerResourceSets', cat: 'UI/资源条', reason: 'Classic/Fancy 已接', mechanism: '资源条系统——已覆盖' },
  { dir: 'TownNPCs', cat: 'TownNPCs（城镇 NPC 变体）', reason: '_Party 全量已接；_Shimmered=微光变体、_Transformed=动物学家狼人态未实装', mechanism: '⭐ 城镇 NPC 变体（微光/变身）——未实装' },
  { dir: 'Misc/MoonExplosion', cat: 'Misc/MoonExplosion（月总登场爆炸）', reason: '月总召唤爆炸演出（骨骼飞散）未接', mechanism: '⭐ 月总登场演出——未实装' },
  { dir: 'Misc/NebulaSky', cat: 'Misc/星云天空', reason: '星云塔天空层（背景+行星+浮岩）未接', mechanism: '⭐ 月塔战天空效果——部分实装（天幕色已接，装饰层未做）' },
  { dir: 'Misc/SolarSky', cat: 'Misc/日耀天空', reason: '日耀塔天空层（耀斑/行星）未接', mechanism: '⭐ 月塔战天空效果——装饰层未做' },
  { dir: 'Misc/StarDustSky', cat: 'Misc/星尘天空', reason: '星尘塔天空层（星空+行星）未接', mechanism: '⭐ 月塔战天空效果——装饰层未做' },
  { dir: 'Misc/Sunflare', cat: 'Misc/Sunflare（日耀耀斑）', reason: '日耀耀斑光效未接', mechanism: '⭐ 日耀光效——未实装' },
  { dir: 'Misc/Sky_Slime', cat: 'Misc/Sky_Slime（史莱姆雨天空）', reason: '史莱姆雨天空降史莱姆视觉（机制在，天幕装饰未做）', mechanism: '史莱姆雨视觉装饰——未实装' },
  { dir: 'Misc', cat: 'Misc/*（杂项）', reason: 'water_* 已接；差集=波纹/高尔夫轮廓等装饰细节', mechanism: '⭐ 杂项——逐文件需人工' },
  { dir: 'SplashScreens', cat: 'SplashScreens（启动画面）', reason: '主菜单背景已用部分（封面图集）；原版启动闪屏未接', mechanism: '主菜单/闪屏——部分实装' },
  { dir: 'UI', cat: 'UI/*（界面）', reason: 'vanilla-ui 白名单 170 项在库；差集=未实装界面（全屏地图/创造模式/合影模式等）', mechanism: '⭐ UI 系统——差集逐目录需人工' },
];

// 音效规则（前缀分组）
const soundRules = [
  { re: /^Music(_|\.)/, cat: 'Sounds/Music*', reason: 'BGM 走独立 cue 管线（xwb 提取 104 曲）', mechanism: '音乐系统——另管线已覆盖', dataLevel: true },
  { re: /^Custom\/dd2_/, cat: 'Sounds/Custom/dd2_*', reason: '13 张已接（塔音/出怪门音）；差集=Betsy 全组+各敌怪 hurt/death/施法音未接线', mechanism: '⭐ DD2 敌怪音效——差集需接线' },
  { re: /_(loop|Loop)\.wav$/, cat: 'Sounds/*（环境音循环）', reason: '雨/暴风雪/沙暴环境音循环未接', mechanism: '⭐ 天气环境音（loop）系统——未实装' },
  { re: /^Custom\/(abigail|chester|deadcells|whip|fairy_aqua|imp|spider|laser|lavablob|birb|harp|grenadefish|snotgun|horse|slimeballoon|eldritch|phantom|gato|ghost|dragon|possession|tiger_frog|celestial_crate|largegem|resonating|wizardrevive|spider_egg|temple|townNPC|skeletonmerchant|travelingmerchant|torch_god)/, cat: 'Sounds/Custom/*（召唤物/专属武器音）', reason: '随从/专属武器/城镇 NPC 专属音效未接线', mechanism: '⭐ 音效接线（SfxName 表）——差集需人工' },
  { re: /^(Item|NPC|Zombie|Player|Coins|Ambient|Digit|ICY|Roar|Scary|MaxMana|Menu|Unlock|Sound|Grass|Sand|Splash|Tink|Duck|Bird|lihzahrd|mech|Moon_Lord|boss)/, cat: 'Sounds/*（效果音）', reason: '295 张已拷；差集=SfxName 键表未覆盖的音效', mechanism: '⭐ 音效接线（SfxName 表）——差集需人工' },
];

// ---------- 5) 判定 ----------
function haveImage(rel) {
  const name = basename(rel);
  if (ALIAS[rel]) return ourVanilla.has(ALIAS[rel]);
  if (ourVanilla.has(rel) || ourVanilla.has(name)) return true;
  const flat = rel.replace(/\//g, '_');
  if (ourUiFlat.has(flat)) return true;
  for (const c of aliasCandidates(rel)) if (ourVanilla.has(c)) return true;
  // TownNPCs 头像走 portraits/
  if (rel.startsWith('TownNPCs/Portraits/') && ourPortraits.has(basename(rel))) return true;
  return false;
}

function classify(rel, isSound) {
  const name = basename(rel);
  for (const r of isSound ? soundRules : rules) {
    if (r.re.test(isSound ? rel : name)) return r;
  }
  if (!isSound) {
    for (const r of dirRules) {
      if (rel === r.dir || rel.startsWith(r.dir + '/')) return r;
    }
  }
  return isSound
    ? { cat: 'Sounds/*（未分组）', reason: '散装音效（具体物品/事件专属）', mechanism: '⭐ 音效接线——差集需人工' }
    : { cat: '散装机制小图（兜底）', reason: '散件（染料调色盘/鱼线/减益覆层/专属机制图层：宝石大件/飞毯/光盘/荧光瓶等）', mechanism: '杂项——逐文件需人工' };
}

function scan(files, isSound) {
  const groups = new Map();
  for (const rel of files) {
    const rule = classify(rel, isSound);
    const have = rule.dataLevel ? true : (isSound
      ? ourSounds.has(basename(rel)) || ourSounds.has(rel) || [...ourSounds].some((s) => basename(rel) === basename(s))
      : haveImage(rel));
    if (!groups.has(rule.cat)) {
      groups.set(rule.cat, { cat: rule.cat, reason: rule.reason, mechanism: rule.mechanism, total: 0, have: 0, missing: [] });
    }
    const g = groups.get(rule.cat);
    g.total++;
    if (have) g.have++;
    else g.missing.push(rel);
  }
  return [...groups.values()].sort((a, b) => b.missing.length - a.missing.length);
}

const imageGroups = scan(vanillaImages, false);
const soundGroups = scan(vanillaSounds, true);

// ---------- 6) 报告 ----------
const all = [...imageGroups, ...soundGroups];
const sumVanilla = all.reduce((s, g) => s + g.total, 0);
const sumHave = all.reduce((s, g) => s + g.have, 0);
const sumMissing = all.reduce((s, g) => s + g.missing.length, 0);

const md = [];
md.push('# 原版素材差异扫描报告（terraria-assets vs 本仓）');
md.push('');
md.push(`- 生成：${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
md.push(`- 原版素材：${vanillaImages.length} 图 + ${vanillaSounds.length} 音`);
md.push(`- 已消费：${sumHave}（含数据级 Item 图集整类）`);
md.push(`- **缺失：${sumMissing}**`);
md.push('');
md.push('> 判定通道：①sprites/vanilla 同名文件 ②vanilla-ui 展平键 ③别名表 ④数据级（Item_Atlas 打包）');
md.push('> 标 ⭐ 的"关联机制"= 本仓确有系统级缺口的家族；"需人工"= 无法自动归因。');
md.push('');
md.push('## 总表（按缺失数降序）');
md.push('');
md.push('| 分类 | 原版 | 已有 | 缺失 | 缺失原因 | 关联机制 |');
md.push('|---|---|---|---|---|---|');
for (const g of all) {
  md.push(`| ${g.cat} | ${g.total} | ${g.have} | ${g.missing.length} | ${g.reason} | ${g.mechanism} |`);
}
md.push('');
md.push('## 缺失明细');
for (const g of all) {
  if (!g.missing.length) continue;
  md.push('');
  md.push(`### ${g.cat}（缺 ${g.missing.length}）`);
  md.push(`- 原因：${g.reason}`);
  md.push(`- 关联机制：${g.mechanism}`);
  const show = g.missing.slice(0, 400);
  md.push('');
  md.push('```');
  md.push(...show);
  if (g.missing.length > show.length) md.push(`… 其余 ${g.missing.length - show.length} 条见 JSON`);
  md.push('```');
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'asset-gap-report.md'), md.join('\n'), 'utf8');
writeFileSync(join(OUT_DIR, 'asset-gap-report.json'), JSON.stringify({ generated: Date.now(), summary: { vanillaImages: vanillaImages.length, vanillaSounds: vanillaSounds.length, have: sumHave, missing: sumMissing }, groups: all }, null, 2), 'utf8');

console.log(`原版 ${vanillaImages.length} 图 + ${vanillaSounds.length} 音 → 已消费 ${sumHave}，缺失 ${sumMissing}`);
console.log('Top 缺失类:');
for (const g of all.filter((x) => x.missing.length).slice(0, 12)) {
  console.log(`  ${String(g.missing.length).padStart(5)}  ${g.cat}  → ${g.mechanism}`);
}
console.log('报告：docs/asset-gap-report.md / .json');
