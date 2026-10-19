# 岛屋/地狱要塞/腐化裂隙/附魔剑圣地(1.4.0.5 反编译提取)

## A) IslandHouse(WorldGen.cs L48185-48365)
- 材料:外壳 **Sunplate 202**,室内墙 **Disc Wall 82**(无金砖变体,islandStyle 只影响喷泉/棕榈)
- 半宽 Next(7,12),高 Next(5,7);先在 x=i+(半宽+2)*dir 从 j-15..j+30 找实心→地板 y
- 外壳实心 202:x∈[i±(半宽+1)],y∈[y-高-1, y+2];内部挖空 x∈[i±半宽] y∈[y-高, y+1] 墙82
- 门:tile 10 **style 9(Skyware 门)** 在 i+(半宽+1)*dir 清 5×3;对侧补 202 柱
- 窗:两侧 Glass Wall 21(num4>10 为 3×3 否则 2×3)
- 宝箱:AddBuriedChest(i, y-3, contain, style **13 Skyware 箱**);contain 按序:0→159 气球、1→65 Starfury、2→158 马蹄铁,之后 Next(3);1/3 追加 2197 天空磨
- 家具:Skyware 桌 14/7 + 椅 15/10 两把(一把翻转)+ 3 横幅 91/7-9
- islandStyle>0:放 Water Fountain 207/islandStyle(1 沙漠+种棕榈 3-5、3 冰雪、4 腐化、5 猩红)
- 调用:"Floating Island Houses" pass(L8463)对非湖岛逐一 IslandHouse;岛间距 ≥360;y=min(Next(90,地面-100), worldSurfaceLow-50)

## B) HellFort(地狱要塞 L16550-16930;AddHellHouses L16068)
- 触发:x 从 100 扫到 w-100(中间 50%),j 从 h-40 向上找"上空下实";tileType=Next(75,77),**4/5 强制 75**(黑曜石砖,墙14);76 狱石砖墙13;i += Next(30,130)(1/10 再+0-200)
- **外形=5 列×10 行房间网格塔**:列2 在 i±Next(4,10),其余列依次外扩 Next(8,20);行距 Next(6,12);中央列必然全占(垂直主塔);2 轮各 1/3 概率生成上侧翼(列0-1)或下侧翼(列3-4)水平连排;无效列清空
- 绘制:占用格液体清零;**边缘格→实心砖;内部→墙+清空**
- 门:tile 10 **style 19 黑曜石门**,相邻列占用组合 3 格高洞(每对≤1扇+1/3 追加);最左/右列外侧门
- 平台口:tile 19 **style 13 黑曜石平台**,上下相邻层交界开 2-5 格宽
- 火把:200*(w/4200) 次,tile 4 **style 7 恶魔火把**(8 格内无其他)
- 陈设 4200000/w 次,13 选 1:黑曜石桌椅/工作台/花瓶105-49/书架101-4/床79-8/钢琴87-15/梳妆台88-9/沙发89-10/钟104-17/浴缸90-25/灯93-23/烛台100-25
- 挂画 420000/w:tile 240/242/245/246 各 style;横幅:3 个互不相同的 Next(16,22),1/3 各选 横幅91/黑曜石吊灯34-32/灯笼42-32
- Hellforge pass(L8627):w/200 个 **tile 77** 放墙13/14 房间地板
- 影子宝箱:Buried Chests pass,y>h-205 → style 4 锁定影子箱,loot 循环:220 Sunfury/112 Flower of Fire/218 Flamelash/274 Dark Lance/3019 Hellwing Bow/5010 Treasure Magnet

## C) 腐化裂隙(Corruption pass L6070;ChasmRunner L45779)
- **区域数 = w×0.00045(4200→2,6400→3),每区域恰好 1 条主裂隙**;i=Next(500, w-500),区域宽 i±(100-300)
- 逐列:i==区域中心 → 主裂隙 ChasmRunner(steps Next(150)+150=150-299, makeOrb);其他列 Next(35)==0 且冷却30 → 次级裂隙(steps 50-99)
- 主裂隙:X 速 ±0.01/步钳 ±0.3,**Y 速 0.5-2.5 恒向下**→近乎垂直;半径 7-11→钳 7-20(末步≥10),走廊宽 14-40
- 挖掘条件 剩余步数>5:菱形 r*0.5 置 inactive(**跳过 tile 31 珠/22 祭坛**);y>worldSurface+20 时**一次性**向左右各 ChasmRunnerSideways(steps 20-40)水平支洞;y>rockLayer → 停挖收尖
- 外壳两轮:菱形 r*1.1 置 active+tile 25(y>起+3..20 处墙3)
- 步数尽+makeOrb → AddShadowOrb 2×2(tile31,crimson frameX+36)
- Sideways:X 速 1-2 钳 0.5-2,Y ±0.5 拉回 j±20;结束 2/3 概率 TileRunner(22 恶魔祭坛小团)
- 伴随:表面沙→112、土→腐化草23、石→25、墙216/187→217/220、161→163、396/397→400/398;珠 ±13 黑檀石包壳(2/3 概率,L1<9+Next(11))+珠心 2-3 格空腔

## D) 附魔剑圣地(EnchantedSwordBiome.cs L16-85)
- 尝试次数/chance 由配置注入(代码无字面);origin.Y=worldSurface+Next(50,100),X 取左/右 30%
- Place:①origin±25 扫土石数≥1250 才行;②向上找实心面,柱内遇沙 53 失败;③**地下小屋**:Slime(20, xScale 0.8-1.3)清空洞穴+Mound(14,14) 土丘+洞缘草圈+灌水+墙68 花墙+藤蔓382;④1 格宽竖井(概率)通地表,井壁沙→397;⑤剑插土丘:真 _chanceOfRealSword→tile187/17,假→186/15
- 外形:地表 1 格宽竖井+地下约 40×40 水潭洞穴(草缘/花墙/藤蔓)+中央土丘上的剑
