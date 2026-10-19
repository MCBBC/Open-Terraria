# 制作城镇 NPC mod 工作流(GLM娘实验批沉淀,2026-10-04)

> 本篇为实战工作流;API 全表见 [mod-dev-guide.md](mod-dev-guide.md)。

> 首例:GLM娘(`mods/glmgirl/`,mod id `glmgirl`,NPC id **800**)。
> 全链已实弹验证:装载→实体化(TownNPC)→行走→对话→F6 召唤→存档键→金标零漂移。
> 探针:`scripts/_glmgirl-mod-probe.mjs`(15 断言)。工具:根级 `imagegen/`(gpt-image-2.5-sunburst)。

## 0. 前置认知(帧预算模型——先背再动刀)

城镇NPC贴图 = **40×56/帧的纵向帧条**,默认朝左(渲染端翻转画右向)。
帧号语义由代码消费,帧数与分区**必须自洽**:

| 帧号 | 语义 | 消费点 |
| --- | --- | --- |
| 0 | 站立空闲(\|vx\|<0.05) | TownNPC.updateWalkFrame |
| 1 | 腾空/跳 | 同上(onGround=false) |
| 2 .. frames−extra−1 | 行走循环 | 同上(frameT>\|vx\|·2+1 累进,越界回卷 2) |
| frames−attack−3 | 坐姿 | townNpcBaseFrame−3 |
| frames−attack .. frames−1 | 攻击 4 帧 | attackFrame(base..base+3) |
| base−5..base−1 | 社交/表演带(可留空填充) | socialFrame(无社交 AI 不消费) |

三个声明必须联动:**`frames`(json)= 竖条帧数;`extraFrames`(json)= frames−行走区末−1;
`TOWN_ATTACK_FRAME_COUNT`** 不用声明——mod 走 `extraFrames` 缺省启发式 `max(2, frames−16)`。
GLM娘:frames=26, extraFrames=10 → 行走 2..15、坐 19、攻击 22..25。**自制帧表按此预算画**。

## 1. 素材管线(imagegen/ 内,~6 张图成本)

```
cd imagegen && npm i          # openai + pngjs(首次)
cd glm-npc
node prep.mjs <参照图> ref.png            # 裁掉参照图底部文字等杂物
node ../edit.mjs -i ref.png "<姿势条提示词>" --background transparent --size 1536x1024 --out poses
node pixelize.mjs ../out/poses.png out     # 切分→降采样→量化→40×56 帧
node ../edit.mjs -i ../out/poses.png "<步态提示词>" ... --out walk4   # 4 帧步态(可选)
node pixelize.mjs ../out/walk4.png out-walk4
node assemble.mjs out out-walk4 sheet.png head.png    # 26 帧竖条 + 24×24 头贴
```

### 1.1 姿势条提示词要点(实测有效)

- **「块状网格把戏」是成败手**:要求 `CHUNKY BLOCKY pixel art ... large uniform square blocks
  of IDENTICAL size in a strict grid, like a 64x64 pixel image blown up 16 times,
  NO anti-aliasing/gradients/glow/shadow/blur`——模型画在大格网上,降采样才不糊。
  平滑插画的直接缩放=糊成一团(首版教训)。
- **紫色等关键色要"大面积"**:「the entire lower half of the hair is BRIGHT SATURATED
  PURPLE」。发梢一点点紫会被降采样平均掉(实测底稿紫系 10.2%→成片 3.1%)。
- 六姿势一行:站(持 Z 牌)/走A/走B/跳/坐/掷;`facing LEFT`、`feet on the same ground line`、
  `wide gaps`(留切分空隙)、`transparent background`。

### 1.2 pixelize.mjs 的坑(全部踩过,勿重蹈)

- **α 辉光晕**:生成图有半透明暗晕(α 8~200),按 `ALPHA_SEG=128` 一刀切,晕不进采样;
  覆盖率判边(≥0.35)替代"平均α阈值"(α 已二值化后失效)。
- **框式积分端点必须 ceil**:`floor(端点)===floor(起点)` 时整落单格的像素区间为空
  → 内部像素全漏采(实测 55323 实体px 只投出 1497 样)。这是首版糊成黑团的真凶。
- **α 语义变更后反预乘必须删**:拿原始字节当除法分母会把颜色整体除到黑。
- **饱和补偿** `SAT_BOOST=1.55`:盒式均值混色洗紫,HSL 的 S 拉回后再量化。
- 切分 = α 连通域(BFS),漂浮小件(掷出的星)并入水平最近的大簇;`|` 优先级低于 `<`,
  勿写 `(p/W)|0 < x`(会把 y 框整列刷掉——用过 Math.floor(p/W) 规避)。

### 1.3 行走节奏(少姿势的降频术)

原版行走帧率钉死(frameT += |vx|·2+1,>6 推帧),14 槽直铺 4 姿势 = 极端姿势 6.6 次/秒
来回切 = "匆忙震荡"(用户实评)。**同帧保持(hold)降频**:assemble.mjs 的
`HOLD=[0,0,1,1,2,2,3,3]`(触地A×2→过渡×2→触地B×2→过渡×2),交替率砍半。
想要更顺滑就多生成中间姿势,槽位照 HOLD 思路排布。

## 2. mod 包声明(零代码)

```
game/mods/<你的mod>/
  mod.json                     # {id, name, version, api:1, side:"both"}
  content/npcs/<key>.json
  textures/npc/<texture>.png   # 26帧竖条 40×1456
  textures/npc/<head>.png      # 24×24 头贴
  i18n/zh-Hans.json            # {"TownChat":{"1":"台词",...}}
  i18n/en-US.json
node scripts/build-glmgirl-mod.mjs   # 打包范式:fflate zipSync → mods/dist/<id>.swmod
```

`content/npcs/*.json` 关键字段(GLM娘完整例见 `mods/glmgirl/content/npcs/glm_girl.json`):

```json
{ "key": "glm_girl", "name": "GLM娘", "aiStyle": 7,
  "lifeMax": 250, "damage": 10, "defense": 15, "knockBackResist": 0.5,
  "width": 18, "height": 40,
  "frames": 26, "extraFrames": 10,
  "friendly": true, "townNPC": true,
  "HitSound": "NPCHit1", "DeathSound": "NPCDeath1",
  "texture": "npc/glm_girl.png", "head": "npc/head.png",
  "portrait": "npc/portrait.png" }
```

可选字段:`portrait`(对话头像,200×200)、`arrival`(入驻条件,见 §5)。

- **aiStyle 7 = 城镇AI**(TownNPC 类内 1:1 移植,不读 json 的 aiStyle——字段仍须填 7)。
- `townNPC: true` 触发运行时注册面(见 §3),`extraFrames` 显式声明优先于启发式。
- 打包自检:mod.json 必须在 zip 根;目录条目/__MACOSX 会被 pack.ts 忽略。

## 3. ModLoader 已补的链(2026-10-04 实验批,mod 作者零代码)

| 缺口 | 修刀 | 锚 |
| --- | --- | --- |
| 帧数断链(懒meta只读静态json→整条当一帧) | vnpc 懒meta回退 `vanillaNpc(id)?.frames` | SpriteAtlas.ts(vnpc) |
| 实体化断链(townNPC 旗无人消费→永远 Enemy) | `registerModTownNpc(key,id,extra,modId)`:挂 TOWN_NPC_IDS/extra/头贴索引三链 | vanillaNpcs.ts + register.ts |
| 入驻断链(prio 链硬编码 vanilla key) | `modTownArrivalEntries(has)` 垫链尾(★本仓分歧:mod 内容面;vanilla 优先序零扰动,条件=不在场即候选) | Game.ts 入驻链尾 |
| 对话断链(townNpcChat 逐 vanillaId 分支) | `id≥800` → `Mods.<modId>.TownChat.<n>` 池(1..n 连续,Lang.has 探界;池空='……'兜底) | Game.ts townNpcChat 头 |
| i18n 不合并(pack 的 i18n/*.json 无人消费) | `languageManager.mergeModLangPack`(装载后 overlay+切语言重 overlay) | loader.ts + LanguageManager.ts |
| F6 面板看不到(模块载入期快照) | `appendModSummonEntries`(运行时追加;空查询视图 mod 段插 Boss 后) | DebugSummonPanel.ts + register.ts |

连带生效:debugSpawnNpc(800) 反查 townKey 出 TownNPC、住房UI行/地图图标(头贴索引 54 自增)、
名牌(Lang.npcName→modNpcName)、图鉴(chat 解锁支)、存档键 round-trip(townNpcsForSave 按 npcKey)。

## 4. 验证(探针范式)

```sh
# 私有静默实例(并行会话约定:禁 kill 5199,先 pgrep 确认端口)
SW_PORT=5201 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5201 nohup npx vite > /tmp/vite-5201.log 2>&1 &
# 全链 15 断言(装包→reload→装载→实体化→行走带→渲染采样→头贴→对话池→入驻链→存档→F6)
SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_glmgirl-mod-probe.mjs
# 收尾 kill 自己的 52xx(先 pgrep)
```

探针要点(新 NPC 复制改 id 即用):`page.evaluate` 里 import 必须带 `.ts` 全名(vite dev
无扩展名=第二实例判例);欢迎覆层先点「我已知晓」再截图/交互;`allocation.npcs` 是 Map,
页面侧读要 `Object.fromEntries`;行走采样允许帧 1(腾空合法),硬判据=**永不越行走区上界**;
渲染断言 = `camera.worldToScreen(cx, y+h)` 处 40×56 getImageData 非空占比。
金标闸门:`npc-frame-golden`/`npc-stats-golden`/`debug-tools`/`mod-*` 全绿=零漂移
(★运行时注册面禁模块顶层调用,测试进程外才安全)。

## 5. 登记债清偿记录(2026-10-04 第二批,18 断言全绿)

三笔首批发债已全部补齐并实弹验证(探针 §⑩ 三断言 + 对话头像目检):

- **G6 对话头像 ✓**:content 声明 `"portrait": "npc/xxx.png"`(建议 200×200,与原版
  Portrait_* 同尺寸)。assets 注入阶段转 blob objectURL 登记
  `npcPortraits.registerModPortraitUrl`,`portraitUrl` 对 mod id 优先查表——Detailed
  模式 `<img>` 直用;CloseUp/Retro 仍用本体帧 0 现算。生成范式:
  `node ../edit.mjs -i ref.png "<块状胸像提示词>" --out portrait-src` +
  `node portrait.mjs ../out/portrait-src.png portrait.png 200`。
- **入驻条件面 ✓**:content 声明 `"arrival": { "minTownNpcs": 4, "requiresNpc":
  ["merchant"], "worldFlag": "downedEyeOfCthulhu" }`(字段可选,AND 语义;全缺省=
  不在场即候选)。消费点 = `modTownArrivalEntries(has, ctx)`,语境由 Game 入驻轮注入
  (num40 口径/hasKey 匹配 shell key 或 mod 全键/world.flags)。语义锚:人数门=染料商 4
  (Main.cs:65510)、requiresNpc=护士要求商人(:65461)、worldFlag=史莱姆族解锁旗。
- **mod i18n $变体键 ✓**:`overlayModPackInto` 镜像 loadPackJson 的
  `Key$variant → variations` 分支,`tryGetVariation(base, variant)` 可取(探针双变体验证)。

剩余登记(非债,边界说明):

- **社交/表演带**:mod NPC 无社交 AI 分支,帧 16..21 区填充站姿;接 L2 钩后再细化。
- **对话头像变体**:mod 头像无微光/派对变体臂(`_shimmer` 后缀族为原版静态资产);
  shimmered 时回落常态头像。
- **探针纪律**:截图类脚本在独立浏览器里必须先装包+reload(全新 KvStore=mod 不在,
  白拍;F6「无匹配」与 portrait 空拍两次实证)。

## 6. 缺 mod 读档降级 + 住房分配(用户实报修复,2026-10-04 第三批)

用户实报两症:**卸载 mod 后读档,遗留 NPC 变身向导**;连带「无法为 GLM娘 分配住房」
(变身后面板里不再有 GLM娘 行可选=连带表象,mod 在位时分配链本通——专项探针
`scripts/_glmgirl-housing-probe.mjs` 4 断言:面板行/assign 受理/home 落位/守卫三态)。

根因与修刀:

- **变身根因**:读档重建链 `new TownNPC(n.key,…)`(Game.ts 城镇NPC恢复段)对未注册
  key 落 ctor 的 `?? 22` 兜底=静默变身向导。修 = 重建前 `townNpcKeyRestorable(key)`
  守卫(vanillaNpcs.ts),未注册 **丢弃**并计数日志——tML 同款降级语义(缺内容 NPC 不
  生成;物品域同构 `??0` 空气)。重装 mod 后经入驻链(自然/手动)重新入住;下次存档
  不再序列化=记录自愈。
- **住房链 id 无感确认**:housingCheckAt/scoreRoom/RoomNeeds(按 TileID)/
  npcHousingCategory(800→0 城镇档)全链对 mod id 无感;面板行 =
  `housingHeadRows` 活实体 × `TOWN_NPC_HEAD_INDEX`(运行时注册 54,且 54 在静态
  HEAD_LIST_ORDER 表内)——链上无第二处快照病。
- **Enemy 域边界登记**:mod 敌怪(非城镇)缺 mod 读档的降级是另一条链
  (`Enemy.fromVanilla` 占位 def),归 ModLoader Enemy 域,本批不动。
