// 家具样式帧布局权威表(TileObjectData StyleHorizontal/WrapLimit + Tiles_N.png 行带/尺寸双重实证)。
// 返回样式基偏移 [bx, by];物件格内偏移仍按 dx*18/dy*18 叠加。
// 布局来源:
//  42 灯笼:样式竖排 Y 步36;亮灭档 X 0/18(TileLightScanner case 42 实证)
//  33/49 蜡烛/水蜡烛:样式竖排 Y 步22(33 表 36×1412 实测)
//  34 吊灯:样式 Y 行54、wrap37 换列 X+108;亮灭块内 X +54(214×2000 实测)
//  100 烛台:样式竖排 Y 步72(skip2;142×2016 实测);亮灭 X(Wiring :1381)
//  93 路灯:样式竖排 Y 步110(70×2048 行带实测);亮灭 X 0/18
//  91 旗帜:样式横排 X 步54、wrap37 换行 Y+54(1998×162 实测)
//  240 墙饰 3×3:横排 X 步54、wrap36 换行(1944×162)
//  241 骨饰 4×3:竖排 Y 步54
//  242 画 6×4:竖排 Y 行72、wrap27 换列 X+108(324×1944)
//  245 画 2×3:横排 X 步36(1152×54)
//  246 画 3×2:竖排 Y 步36(54×1332)
//  其余(桌14/工作台18/钢琴87/雕像105 等 TileObjectData 显式 H):横排 X 步 fw*18
export function furnitureStyleBase(sheet: number, style: number, fw: number): [number, number] {
  switch (sheet) {
    case 42: return [0, style * 36];
    case 33: case 49: return [0, style * 22];
    case 34: return [Math.floor(style / 37) * 108, (style % 37) * 54];
    case 100: return [0, style * 72];
    case 93: return [0, style * 110];
    case 91: return [(style % 37) * 54, Math.floor(style / 37) * 54];
    case 240: return [(style % 36) * 54, Math.floor(style / 36) * 54];
    case 241: return [0, style * 54];
    case 242: return [Math.floor(style / 27) * 108, (style % 27) * 72];
    case 245: return [style * 36, 0];
    case 246: return [0, style * 36];
    default: return [style * fw * 18, 0];
  }
}
