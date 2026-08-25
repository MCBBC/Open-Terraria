import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const f = require('/tmp/recon/_coverage-final.json');
const cov = require('/tmp/recon/_coverage-audit.json');
const L = [];
const push = (...s) => L.push(...s);

push('# 武器全量覆盖清查报告(weapon-coverage-audit)', '',
  '生成:2026-08-25 · 全集=R26 权威表 `tools/golden/vanilla-shoot-table.json`(796 id,1458 基准,diff1457=0),',
  '与各轮审计材料(red-team r26-r31 / blue-team r26-r31 / batch5 整合 / docs 三份武器审计 / item-audit 全功能账 /',
  'vanillaItemCombat.ts 专支注释)交叉定档;再做全量数据面逐字段 diff。脚本:`game/scripts/_coverage-audit.mjs`',
  '(提取+diff+族归属+弹道痕迹)、`_coverage-classify.mjs`(三档分类+风险分级);中间产物 `/tmp/recon/_coverage-audit.json`、`_coverage-final.json`。', '',
  '## 一、总表', '');
const c = f.counts;
push('| 集合 | 总数 | A 行为级深审 | B 族代表/数据面 | C 从未检查 |', '|---|---|---|---|---|');
push('| shoot 表武器(golden 796) | ' + c.total + ' | ' + c.A + ' | ' + c.B + ' | ' + c.C + ' |');
push('| 纯近战无弹(damage>0 & shoot=0,另列) | ' + c.pureMelee + ' | ' + c.pmA + ' | ' + c.pmB + ' | ' + c.pmC + ' |', '');
push('按战斗类别 × 档位:', '', '| 类别 | A | B | C |', '|---|---|---|---|');
for (const cls of ['melee', 'ranged', 'magic', 'summon', 'other']) {
  push('| ' + cls + ' | ' + (f.byClassTier[cls + '/A'] ?? 0) + ' | ' + (f.byClassTier[cls + '/B'] ?? 0) + ' | ' + (f.byClassTier[cls + '/C'] ?? 0) + ' |');
}
push('',
  '- **A=' + c.A + '**:行为级逐把对拍过。来源:red r27(魔法前期20)/r28(魔法中期15)/r29(远程多发+达标样板35)/r30(近战投掷在册8)/r31(鞭18+召唤在册7+哨兵6)/docs weapon-audit-0822 总账77/R26 点名件(6153 等)。含蓝队延伸修复件。',
  '- **B=' + c.B + '**:族代表覆盖或曾有专项数据面审计(item-audit 武器442/召唤31 功能面✅、R29 单发弓基线、R30 四族代表、钩爪 grappleHooks 全量表、坐骑 itemMount 表、钓鱼竿族、R31 召唤注册批点名、R26 multishotPerCycle 点名、3384 firePortalGun 专支)。',
  '- **C=' + c.C + '**:从未被任何一轮单独看过的零散件——**Golem Fist 型漏网鱼所在档**(1297 本轮定位:A 档,AI_ANCHORED 族注释+数据面全等;真正漏网的是下面这批)。',
  '- 纯近战 C=77 **全部是工具**(镐/锤/斧/战斧),真剑类无一漏网(全在 item-audit 442 内)。',
  '',
  '## 二、C 类风险分级', '',
  '高风险 ' + f.cRows.filter(r => r.risk === '高').length + '(melee 35 + magic 3 + ranged 2)/ 中风险 ' + f.cRows.filter(r => r.risk === '中').length + ' / 低风险 ' + f.cRows.filter(r => r.risk === '低').length,
  '',
  '### 高风险完整名单(独特 aiStyle 无代表 / 数据面整缺 / 专支未消费)', '',
  '| vid | 名称 | dmg | 弹/族 | 风险依据 | 原版锚(1458 Item.cs case) |', '|---|---|---|---|---|---|');
const anchors = {
  3098: ':28650(AI_020 锯族)', 2773: ':26487', 2778: '月主四锯区段', 2783: '月主四锯区段', 3463: '月主四锯区段',
  1232: '叶绿锯区段', 1231: '叶绿钻区段', 579: 'Drax 区段(:15600 前后)', 2342: '锯齿鲨区段',
  2798: '激光钻(:30xxx,ai75 持械变体)', 383: ':5xxx 金属锯区段', 384: '', 385: '', 386: '', 387: '', 388: '',
  1190: '', 1196: '', 1197: '', 1203: '', 1204: '', 1189: '',
  2774: '', 2779: '', 2784: '', 3464: '月主四钻区段',
  2777: '', 2780: '', 2781: '', 2782: '', 2785: '', 2786: '', 3462: '', 3465: '', 3466: '(九件 NO_DATA 月主工具)',
  6154: ':47435 DefaultToMagicWeapon(1116,42,5)', 6155: ':47447 DefaultToStaff(1117,8,55,30)+SetWeaponValues(150,10,10)',
  5065: ':40613(+GetFarthestSpawnPositionOnLine 专支)', 4343: '', 4344: '(纸飞机,Item.cs :39xxx)',
};
for (const r of f.cRows.filter(r => r.risk === '高')) {
  push('| ' + r.id + ' | ' + r.name + ' | ' + r.damage + ' | ' + r.kind + '/ai' + r.ai + (r.shoot ? '→' + r.shoot : '') + ' | ' + r.why + ' | ' + (anchors[r.id] || '—') + ' |');
}
push('', '### 中风险(共享族但特殊字段组合 / 非武器杂件降序列)', '');
for (const r of f.cRows.filter(r => r.risk === '中')) push('- ' + r.id + ' ' + r.name + ': ' + r.why);
push('', '> 低风险 137 条=纯数值变体(同族不同材质档)+glowstick 白名单件,清单见 `_coverage-final.json`。', '');

push('## 三、数据面全量对账 diff(golden 1458 表 ↔ 我方 vanilla-itemcombat.json+EXTRACT_PATCH+whips)', '',
  '对账字段:damage/useTime/useAnimation/mana/shoot/shootSpeed/useSound/autoReuse/knockBack。',
  '**useSound 零差异**(golden 有值的 779 件与我方 vanilla-itemusesound.json 全等;17 件我方缺键=NO_DATA 组+1457 新杖,见 §五)。', '',
  'diff 共 ' + cov.diffs.length + ' 条,裁定如下:', '',
  '### 真实数值 bug(须修,共 1 条)', '',
  '- **496 IceRod knockBack:golden 2 vs 我方 0** —— 1458 Item.cs case 496(:7282)::7297 `knockBack = 0f` 后 :7299 再赋 `knockBack = 2f`,C# 顺序语义终值=2。R26 权威表章节已定罪("仅 1 项真差"),至今未修。一行修。', '',
  '### 数据面整缺(我方 json 无条目/缺字段)');
push('', '| vid | 名称 | 缺失 | 定性 |', '|---|---|---|---|');
const missNote = {
  4682: 'Release Doves 新奇品(consumable,number=3 专支)', 4702: 'Release Lantern 新奇品(shoot 855 亦缺)',
  4765: 'Tree Globe(useSound Item_106)', 4766: 'World Globe(同上)', 5285: 'Moon Globe(shoot 996 亦缺)',
};
for (const d of cov.diffs.filter(d => d.ours === '<缺>' && !d.tag)) {
  push('| ' + d.id + ' | ' + (cov.names[d.id] ?? d.id) + ' | ' + d.field + '(golden=' + JSON.stringify(d.golden) + ') | ' + (missNote[d.id] ?? '—') + ' |');
}
push('', '### 良性差异(golden 提取器缺口,我方 EXTRACT_PATCH 更全——方向相反非 bug)', '',
  'golden 对辅助方法形参赋值(DefaultTo*/SetWeaponValues)同样不解析,下列 golden<缺>/我方有值 条目均系我方按源码行号回填过:');
for (const d of cov.diffs.filter(d => d.golden === '<缺>' && d.tag === 'EXTRACT_PATCH')) push('- ' + d.id + ' ' + (cov.names[d.id] ?? '') + ' ' + d.field + ': golden=' + JSON.stringify(d.golden) + ' 我方=' + JSON.stringify(d.ours));
push('', '- 4956 Zenith / 5669 真铜短剑 useTime: golden<缺> / 我方=10(useTime=anim/3 算式,EXTRACT_PATCH)——同上良性。', '',
  '### 语义等价(autoReuse 显式 false vs undefined)');
for (const d of cov.diffs.filter(d => d.field === 'autoReuse' && d.golden === false && !d.tag)) push('- ' + d.id + ' ' + (cov.names[d.id] ?? '') + ': golden=false / 我方缺省(falsy 等价)');

writeFileSync('/tmp/recon/weapon-coverage-audit.md', L.join('\n'));
console.log('part1 written,', L.length, 'lines');
