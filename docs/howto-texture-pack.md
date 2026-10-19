# 原版材质包(资源包)支持与工坊导入(2026-10-12)

> 实测样本:Waifu texture pack/娘化材质包正式版(Steam 创意工坊 3293723058,3029 文件)。
> 端到端已验证:导入→启用→**重启持久恢复**→游戏内 NPC 娘化渲染(`shots/waifu-npc.png`)。

## 1. 研究结论(先定谳)

- **原版材质包形态**(Terraria 1.4 ResourcePack.cs):目录或 zip,根 = `pack.json`
  (Name/Author/Description/Version)+ `icon.png?` + `Content/**`;Content 下
  `Images/<资产名>.png`(平铺命名 NPC_474/Item_4888/Gore_320/Player_0_4/Armor_Head_184…)、
  `Images/UI/**`、`Sounds/**`、`Music/Music_<id>.<ext>`、`Fonts/**`、`Localization/`。
- **工坊本地目录**:`<Steam根>/steamapps/workshop/content/105600/<entryId>/`
  (105600=Terraria;macOS `~/Library/Application Support/Steam`)。订阅即散目录,非 zip。
- **本仓资源包系统(M13)本就是原版语义 1:1**——zip 根 pack.json+Content/**、
  `packPaths.ts` 映射表覆盖平铺族/UI 子目录展平/Armor 双写/音乐音效字体。
  **"退役"裁决:被退役的是素材重制面板(RemotionPanel,sw-remaster-pack 自创格式)
  的用户入口**;RemotionRuntime 注入引擎保留(资源包与其共用底座),存量 remaster 包
  静默应用不失效。

## 2. 三条导入通道(本批新增两)

| 通道 | 形态 | 链路 |
| --- | --- | --- |
| zip 上传(既有) | .zip | `importPack(File/bytes)` → `readResourcePack` |
| **文件夹导入**(新) | 目录选区(webkitdirectory) | `importPackFromFiles(files, name)` → `readResourcePackFromFiles`(免 zip 往返;持久化借 `PackFormat.zipStore` 回封 STORED zip,启动恢复链零改动)。★回封必须用 `normalizePackFilePaths` 归一后路径——v1 回封带 webkitRelativePath 外层目录前缀,刷新后 `stripContentRoot` 不认 = "缺 pack.json"(用户实报,round-trip 单测定谳) |
| **桌面工坊扫描**(新) | Steam 订阅目录 | `desktop/main.mjs` 路由 `/resourcepacks-workshop/index.json`(扫 `workshop/content/105600/*/` 含 pack.json 的包;候选根穷举 mac/win/linux/SteamLibrary 多库盘 vdf 粗解)+ `/<id>/pack.zip`(手写 STORED zip 现打包)→ 客户端既有 zip 通道 |

标题菜单「素材包」入口现开**原版资源包页**(zip+文件夹导入/启停/调序/卸载)。

## 3. 手写 STORED zip 三坑(桌面壳无 fflate,自含实现踩过)

1. `Array.flat()` **不展平 TypedArray**(Uint8Array 非 Array 子类)——拼接必须手动
   `out.set(part, pos)` 逐段拷贝,flat 后仍是数组对象=产物乱码。
2. 本地/中央头段**必须写文件名字节**(`lh.set(name, 30)` / `ch.set(name, 46)`)——
   只写 nameLen 不拷名=条目无名,解析端全跳。
3. **pack.json 要进包体文件面**(解析端必需文件;manifest 解析与入包两不误)。

## 4. 消费侧覆盖(实测)

- ✓ 生效:NPC_(本体帧表)、Item_、Gore_、Armor_Head/Legs(纸娃娃 vui)、**Sounds**
  (2026-10-12 补:工坊包音效=原版 .xnb 形态——`XnbAudio.decodeXnbSoundToWav` 解
  非压缩 XNB v5 容器(7bit 字符串 readers + **7bit shared/objects 计数**——初版误读
  u32 多吞 6 字节,19/19 布局票选定谳:formatSize@67+dataSize@89+尾部 loop/loop/
  duration 3×u32)+ SoundEffect 对象 formatSize+WAVEFORMATEX+PCM,提 PCM 包 RIFF
  头喂 Sfx 覆盖面;仅 PCM(formatTag=1),LZX 压缩位/ADPCM 跳过登记;Waifu 实测
  19/19 全解,**性能=0.08ms/整轮 19 张**(容器 subarray 零拷贝+PCM 单次 memmove),
  parse 结果按行缓存(loadParsed)零重复解码,Sfx 键=原版茎名直配(Female_Hit_0
  等,本仓命名同源))、Images/UI/**(含 Cursor)、Music(M13 既有)、Fonts、
  Tile_/Wall_(重烘链)。
  ★第五坑(用户实报"受击不播音效"):`.xnb` 扩展名在 mapPackAsset 剥掉后,
  parseFromEntries 的解码分派(按 `.xnb` 后缀判)永不触发 → **原始 XNB 字节直进
  Sfx 覆盖表** → decodeAudioData 拒收 EncodingError → markFailed 负缓存 → 静默
  且不回退原版。修 = 映射保留扩展名、解码后去尾;**Sfx override 解码失败现回退
  原版 fetch**(旧=markFailed 静默——坏键吃掉原版声;opus/mp3 双失败才负缓存)。
  取证探针:
  `_sfx-playback-probe.mjs`(覆盖表头字节全 RIFF + AudioBufferSourceNode.start
  实录启播时长)。
  **TownNPCs 档案族**(2026-10-12 v2:包内 `TownNPCs/` 子目录=完整档案名家族——
  `<Name>_<Variant>.png`(Default/_Party/_Transformed)→ vanilla/ 同名键;
  `Shimmered/<...>` → vanilla/Shimmered_<...>;`Portraits/Portrait_<X>.png` →
  objectURL 名键注册(npcPortraits.PACK_PORTRAIT_URL_BY_NAME,含 _shimmer 微光
  变体);**城镇 NPC 本体+对话头像全链生效**。root `NPC_<id>.png` 派生别名保留
  (兼容只发原版名的包;包自带档案名时显式键优先)。曾实现的 NPC_Head 派生头像
  已撤(用户指正:包自带真头像,且派生放大过度)。
- ✓ 页面观感:hint 白亮(自有类 .sw-rp-hint——.sw-set-hint 样式挂 Settings style
  标签,本入口未注入);信息页「取消」=关整框(onClose 贯通,原=回主列不动框)。
- ✓ 防线:全透明 sheet 注入被拒(该包故意留白的 Acc_Back_3/17/22/23 等,回退原版
  ——坏包防线正确工作,控制台有拒绝日志属预期)。
- ✗ 登记债:**玩家本体换肤**——包内 `Player_<variant>_<part>.png` 为逐皮肤部件合成系,
  本仓玩家 = 自烘焙角色表(`角色/Player.png`,Player_0..22 命名精灵),两形态不同构;
  需"包分件 → 角色表重烘焙"映射层(v2)。

## 4b. 材质类别开关(2026-10-12 用户需求:部分应用)

- **每包**独立 12 类开关:城镇NPC/怪物与Boss/物品/玩家/护甲与服饰/图块与墙体/
  弹幕/碎屑/界面与光标/音效/音乐/其他。**缺省全开**(未存类别=全开,零迁移)。
- 存储 = `PackRow.categories`(Partial<cat,boolean>,缺项=开),随注册表持久化。
- 应用 = `applyAll` 合并期过滤(`catOn(row, keyCategory(key))`),关停键不进
  merged/音效/音乐覆盖;**差量回退** = `appliedImageKeys` 台账(上轮注入 − 本轮
  合并)→ `restoreFiles`(清映射+回原版)——重放只加不减的旧病(关类别后位图
  驻留 vimages)由台账差量解决。
- 分类器 = `packPaths.packKeyCategory`(NPC_<id> 按 TOWN_NPC_PROFILE 分流城镇/
  怪物——id 表经 `setTownProfileIds` 注入保持 packPaths 零数据依赖)。
- UI = 资源包页启用行 ⚙ → 行下展开类别复选(仅列该包实际覆盖的类别,
  `packCategoriesOf`),勾选即存即应用。★齿轮=开合切换(面板按需构建——v1
  无条件挂载[默认开]+齿轮只删不建[关后永打不开],用户实报两症一并修)。
- 探针 = `_rp-cats-probe.mjs`:关 town → 本体内容与原版文件**逐像素相等**
  (diffPct=0);重开 → 娘化(diffPct=41);关 sfx → 音效覆盖 19→0→19。
  ★指标教训:屏幕饱和度采样被向导走动+光照污染(627 介于 484/969),
  权威信号 = 注入位图 vs 原版文件逐像素比对。

## 5. 探针

`scripts/_waifu-pack-probe.mjs`:工坊目录→zip→importPack→enable→**reload 持久**→
进世界向导截图。桌面工坊路由已单测(扫描本机真实工坊→zip→`unzip -t`→既有解析器
3734 图全映射,关键族 ✓)。

## 6. 玩家换肤债清偿(2026-10-12 同批)

包内玩家分件 `Player_<variant>_<clothStyle>.png`(如 Player_0_0=40×1118 皮肤合成条)
的**消费侧在 vui**(PaperDoll 逐部件合成+CopyVariant 链,SW-BJ21;本仓烘焙管线
vanilla-atlas.mjs 玩家段同样归 vanilla-ui/)——`packPaths.ts` 根级规则补
`ROOT_VUI_PLAYER_RE` 双写(vanilla/ + vanilla-ui/),映射数 3734→3823(+89 分件)。
`UITextures.get→atlas.vui→ensureUiImage` 注入优先(`uiimages.get(path)` 先手),
PaperDoll 合成缓存键无贴图身份、boot 先于首烘=天然吃到新件。实测:玩家头部白发票
面即包件(原版=棕发)。✗ 未覆盖:`Player_<n>.png` 单下划线族仍走 vanilla/(非本族)。

## 7. 安装步骤(交付话术)

**桌面版(Steam 订阅即装)**:① Steam 已订阅材质包 → ② 启动游戏(桌面壳)→ 启动链
自动扫描工坊并导入启用(日志 `[resourcepacks] 工坊包已导入并启用`)→ ③ 进世界即生效。
重装/启停/类别开关:标题菜单「材质包」→ 原版资源包页(启用行 ⚙ 展开类别)。

**Web 版**:① 标题菜单「材质包」→ ② 「导入文件夹」选中工坊包目录
(`.../workshop/content/105600/3293723058`)或「上传资源包(.zip)」→ ③ 点右侧列表
启用 → ④ 进世界生效(重启持久)。

**存量坏行清理**:若曾由旧通道导入过缺 pack.json 的包(启动日志
`包 XXX 解析失败(跳过)`),在材质包页找到该行点「卸载」,再走上述通道重装即可。

## 8. 入口与样式(2026-10-12 补)

- 标题菜单「资源包」按钮 = `TitleMenu.ts` 按钮 + `mainFlow.onAssetPacks` 动态 import
  ResourcePackPage(遮罩+卡体+右上关闭,RemasterPanel 同观感)。
- ★`ResourcePackPage.RESOURCE_PACK_PAGE_CSS` 的注入点原挂 Settings 资源包栏,
  2026-08-27 摘除时一并消失——`buildResourcePackPage` 现自注入(id=sw-rp-style,幂等;
  用户实报"样式没生效"定谳)。并行会话同期补了同名菜单键/入口,撞车无害(译名
  「资源包」从之)。

