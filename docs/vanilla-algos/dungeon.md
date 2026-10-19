# 原版地牢生成完整算法(1.4.0.5 反编译提取)

入口:MakeDungeon(L18006-18844),走廊 DungeonHalls(L20255),房间 DungeonRoom(L20622),竖井 DungeonStairs(L19855),入口塔 DungeonEnt(L20726)。

## 核心:走廊-房间随机游走
- 主题 `num1 = Next(3)`(再丢弃一次 Next(3)!):0=蓝41/墙7,1=绿43/墙8,2=粉44/墙9;裂砖 481/482/483
- 强度:dxStrength1=Next(25,30), dyStrength1=Next(20,25), dxStrength2=Next(35,50), dyStrength2=Next(10,15)
- 预算 num3 = maxTilesX/60 + Next(0, maxTilesX/180)
- 主循环:每 5 步 1/3 概率 → 1/2 分支(保存位置→DungeonHalls×2+DungeonRoom→恢复)/1/2 直接 DungeonRoom;否则 DungeonHalls
- **DungeonHalls**:半径 Next(4,6),步数 Next(35,80);1/5 裂砖走廊;1/5 宽走廊(半径×2步数/2);方向:四向可用性扫描→丢弃一次 Next(4)→do-while 选向;水平速度 ±1(1/3 加 y=±0.2),竖直 num1++ 且 2/3 加 x 漂移 ±Next(10,20)*0.1;边界强制(x>w-200 向左等,x∈[w/2,0.75w] 向左);每步外框 ±(num1+4+Next(6)) 填砖(仅非地牢墙!),内缩1填墙,内部 ±(num1*0.5+num9) 挖空(num9=Next(1,3),概率 1/(num1+1) 等);漂移每 Next(10,20) 步反向
- **DungeonRoom**:尺寸 Next(15,30),步数 Next(10,20),初速 (±1,±1)*0.1,加速度 ±0.05 clamp ±1;每步外框 ±(num1*0.8+5) 填砖,内部 ±num1*0.5 挖空;记房间极值 L/R/T/B
- **DungeonStairs**(到地表):半径 Next(5,9),步数 Next(10,30);方向 (±1,-1),水平速度 1+Next(0,200)*0.01(2/3)或 Next(50,76)*0.01,1/6 y=-2;中线回拉;到 worldSurface-5 且上方墙=0 → 出口+土丘 TileRunner(土 25-35×10-20 addTile)
- **DungeonEnt**(入口塔):清 ±60 液体;主塔段(dx1/dy1):边界 X±(dx1*0.6+Next(2,5)) × Y±(dy1*0.6+...),填砖+墙;垛口左右 5+Next(4) 宽 3+Next(3) 高;顶齿:齿高 1+Next(2) 周期 2+Next(4) 锯齿;塔身下延到 worldSurface;内框 0.5 清空(入口厅);外塔段(dx2/dy2)同构只填远侧半;门洞 15×3 清空+PlaceTile(门10, style 13);塔外砖坡 100 列斜坡
- 坑陷阱 DungeonPitTrap:预算 maxTilesX*2,成功一次 +1500;半宽 Next(8,19) 深 Next(19,46);假地板层(上方 30 行内无地牢砖);边界一圈+交错尖刺 48;1/8 注水(第一个必注)
- 尖刺:两轮(水平带/竖直带),数量 maxTilesX/100,长 Next(5,13)
- 门候选:房间左右边第一个空点;生成:±10 找 span 3-19,PlaceTile(10, style 13 或彩 16/17/18)
- 平台:走廊竖井终点+房间上下边,跨度 10(浅 20),tile 19,frameY 7→108/8→144/9→126
- 五大特殊宝箱(金箱21 style23-27 / 锁定箱467 style13):Piranha Gun/Vampire Knives/Rainbow Gun/Staff of Frost Hydra/Locked gold
- 房间金箱序列:Muramasa→Cobalt Shield→Aqua Scepter→Blue Moon→Magic Missile→Valor→Golden Key(浅于 worldSurface+50 强制金钥匙 style0)→Handgun 循环
- 家具四件套:Lights(烛台42/吊灯34+开关136+wire)/Traps(飞镖137)/GroundFurniture(14种:桌椅/工作台/雕像/书架/床/钢琴/梳妆台/长椅/浴缸/灯/烛台/落地钟)/Pictures(画240/241)/Banners(旗91)

## 关键移植要点
- 填砖只覆盖"非地牢墙"(!wallDungeon[wall],墙 7/8/9/94-99)——结构可叠加
- RNG 丢弃调用必须保留(主题后的 Next(3)、选向前的 Next(4))
- num1(步数计数)与 num3(半径)勿混淆;num1=0 后走廊停止挖空只铺壳
