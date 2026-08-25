import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const f = require('/tmp/recon/_coverage-final.json');
const cov = require('/tmp/recon/_coverage-audit.json');
const L = [];
const push = (...s) => L.push(...s);

push('', '## 四、分支型武器(number>1 / branches)与多弹链缺口', '');
push('golden 表 number>1 或带 branches 的 18 件(消费须回读 branches[].raw,number 是折算值):', '',
  '| vid | 名称 | shoots/number | 我方现状 | 覆盖 |', '|---|---|---|---|---|');
const msNote = {
  679: 'R29 已修(SHOTGUN_PELLETS 6 弹丸)', 2623: 'BubbleGun 泡体链,未单独审',
  3065: 'StarWrath 三发,未单独审', 3531: 'R31 星尘龙 volley 已核',
  3542: 'R28 散射已修(number=10 系弹侧)', 3546: 'FireworksLauncher 未单独审',
  3779: 'R28 已修', 3787: 'SkyFracture R26 点名 multishotPerCycle,行为未单审',
  3788: 'R29 已修(4片+661黑爆)', 4262: 'MysticCoilSnake 未单独审(宠物蛇)',
  4682: '数据面整缺(C 类)', 4703: 'R29 已修(角向扰动)', 5451: 'JimsDrone 未单独审',
  5461: 'KillingDeck 未单独审', 5667: '帕鲁哨兵(R31 注册批)', 5738: '遥控车 未单独审',
  6154: 'C 高风险(unique ai196)', 6174: '帕鲁哨兵(R31 注册批)',
};
for (const m of cov.multiShotGaps) {
  push('| ' + m.id + ' | ' + (cov.names[m.id] ?? m.id) + ' | [' + m.goldenShoots + ']/' + m.number +
    (m.overrideShoot != null ? ' ov=' + m.overrideShoot : '') + ' | ours shoot=' + m.oursShoot + ' | ' + (msNote[m.id] ?? '—') + ' |');
}
push('', '## 五、vanilla-itemcombat.json 完全无条目的 12 件(missingInOurs)', '',
  '九件月主工具(Nebula/Solar/Stardust 的斧/锤/镐,dmg 80-110 的挥砍伤害工具)+ 纸飞机×2 + PrincessWeapon:', '');
for (const id of cov.missingInOurs) push('- ' + id + ' ' + (cov.names[id] ?? id));
push('', '- 5065 PrincessWeapon 是真魔法武器(shoot 950 + mana18 + GetFarthestSpawnPositionOnLine 专支),必须回填;九件工具影响挥砍伤/F1 桥;纸飞机/新奇品低优先。', '');

push('## 六、其他机械检查结论', '',
  '- useSound:golden 有值件与我方 vanilla-itemusesound.json 全等(0 diff);缺键 17 件=NO_DATA 组+1457 新杖(6152/6153/6154/6155/6161/6164/6171/6173——EXTRACT_PATCH 注记有 UseSound 但 json 键未落,注册批需补)。',
  '- whips:vanilla-whips.json 18 条与 golden/R31 IsAWhip 集完全一致,零 diff。',
  '- EXTRACT_PATCH:39 个手工键与 golden 零真冲突(diff 方向均为 golden 缺、我方更全)。',
  '- 弹道实现痕迹:796 件的 shoot proj 在 src 非 data 代码中 token 命中率 100%(无"数据有、代码无"死弹)。',
  '- 实现存在性:vanilla.json 自动注册覆盖全部 6174 件 → 掉落反查链全通(R30/R31 报告中"掉落被吞"已由注册批解决)。', '');

push('## 七、补齐批次建议(红蓝轮次切分)', '',
  '### 批次 A:数据面小 diff 清欠(蓝队直修,<半天)', '',
  '1. 496 IceRod knockBack 0→2(Item.cs:7299,R26 已定罪未修)。',
  '2. 九件月主工具回填(2777/2780/2781/2782/2785/2786/3462/3465/3466,Item.cs case 区段)+ 5065 PrincessWeapon 回填(Item.cs:40613)。',
  '3. 新奇品五件回填:4682/4702/4765/4766/5285(useTime/useAnimation/autoReuse/shoot)。',
  '4. usesound 缺键 17 件补齐(vanilla-itemusesound.json)。',
  '5. recon-item 闸门扩列 channel/reuseDelay 两字段(R30§7/R31§A① 立案在案)随批落地。', '',
  '### 批次 B:红队 R32 —— aiStyle20 锯钻族 channel 伤害面(26 件=高风险 C 全部 melee 簇)', '',
  '对象:3098 屠夫锯/2773·2778·2783·3463 四月锯/383·384·387 三金属锯/1190·1197·1204 钯·山铜·钛锯/1232 叶绿锯/579 Drax/385·386·388 钴·秘银·精金钻/1231 叶绿钻/1203·1204 钛钻/1189 钯钻/1196·1197 山铜钻/2774·2779·2784·3464 四月钻/2342 锯齿鲨 + 2798 激光钻(ai75 持械变体)。',
  '锚:AI_020 持械弹族 Projectile.cs SetDefaults(aiStyle20);items.ts 工具侧持械支已有(252/509),武器侧伤害结算/channel 打断/meleeSpeed 缩放未审。一轮整族扫完。', '',
  '### 批次 C:红队 R33 —— 1457 新武器与独弹魔法件(高风险 C)', '',
  '对象:6154 Petalstorm(ai196 独弹)/6155 LightningStrike(ai203)/5065 PrincessWeapon(专支定位弹)/4062 ThunderStaff+6171 BejeweledStaff(ai29 宝石激光变体)/2795 LaserMachinegun(ai75 channel——现仅 item-audit 功能面✅,R26 曾判未实装,须核实现状)/3852 BookStaff 行为面复核(TAIL_SILENCE_WIN 已接部分)。',
  '锚:§一高风险表(Item.cs:47435/:47447/:40613 等)。', '',
  '### 批次 D:红队 R34 —— 分支型抽验 + 帕鲁/召唤残余', '',
  '对象:3787 SkyFracture(multishotPerCycle 行为面)/3065 StarWrath 三发/3546 FireworksLauncher/2623 BubbleGun/5451 JimsDrone/5461 KillingDeck/4262 MysticCoilSnake/5738 RemoteControlCar;召唤 6148/6149/6161/6164(帕鲁×2·陶罐·禁装 minion,R31 注册后仍只到家族层)。', '',
  '### 批次 E:低风险扫尾(可并入任意轮抽查包)', '',
  '- melee 低风险 ~77 件纯数值工具(F1 挥砍伤桥抽 10 件);other/C 94 件非武器杂件按功能面抽查(中风险降序列已带〔非武器杂件〕标记);glowstick 六件白名单实测一次。', '');

push('## 八、方法学备注(供复核)', '',
  '- A/B/C 定档材料:red-team-r26/r27/r28/r29/r30/r31.md;blue-team-r26..r31+batch5-integration.md(延伸件并入 A);docs/weapon-audit-2026-08-22.md(77 id 总账→A);docs/item-audit.md 武器442/召唤31/工具95(B 数据面);docs/weapon-proj-audit-2026-08-13.md(族级);weapon-fx-audit(全 565 射弹武器皮层——C 档也非裸奔);vanillaItemCombat.ts EXTRACT_PATCH/专支注释(1226/1227/3384/4956/5669/949 等=曾个别处理证据)。',
  '- 已知偏差:master0822 的 77 id 由表格首列数字 token 提取,可能漏个别只在行文中提及的 id(方向=把 A 误降 B/C,保守方向,不虚增覆盖)。',
  '- Golem Fist 1297 定位:A 档(AI_ANCHORED 族注释+combatWeapon spear 分流在案,数据面全等)——其"漏网"是审计史漏网而非实现缺失;C 档 254 件才是真正从未被看的集合。',
  '- 本报告全程只读;脚本 _coverage-audit.mjs/_coverage-classify.mjs 可重跑复核。', '');

appendFileSync('/tmp/recon/weapon-coverage-audit.md', L.join('\n'));
console.log('part2 appended,', L.length, 'lines');
