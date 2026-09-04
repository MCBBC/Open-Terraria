// SW-AL1 2026-09-05 回归：beeWallPushDir 踢墙摄取器 OOB 语义钉死（=原版 false，非翻转 true）。
//  证：Main.tile 是裸 Tile[,]（Main.cs:1690），OOB 下标抛 IndexOutOfRange 被 SolidTile
//  try/catch 吞掉【返 false】（W.cs:70642-70655 catch 尾）；null→true 分支仅【界内】null
//  格可达（clearWorld W.cs:7088-7121 全量 new Tile()，仅 MP 客户端未流送段持 null）。
//  世界缘实体面：玩家位置钳制 Player.cs:24243-24314 / 弹幕触界 active=false 消散 P.cs:16789-16802。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { beeWallPushDir } from '../src/entities/WeaponProj';

const Y = 769;   // 31px 盒 → 行 48/49（与 sw-ad1 贴地口径同）

describe('SW-AL1 beeWallPushDir OOB=开敞（≡原版 SolidTile OOB 异常路径）', () => {
  it('右缘 8px 带：0px 档扫列 80=OOB 返 false → 三档全空走 Center 奇偶兜底（非推离）', () => {
    const w = new World(80, 60, 30);                        // 全空，列 79=世界最后格
    // x+w=1279（界内末 px）→ ri=trunc(1287/16)=80 OOB；li=77/76/75 全空气
    expect(beeWallPushDir(w.store, 1248, Y, 31, 1263.5)).toBe(0.5); // 78 偶→+0.5；OOB=true 会误推 −0.5
  });
  it('左缘 trunc 钉子：x=4 → li=trunc(−0.25)=0 扫到列 0（floor 会扫 −1 OOB 漏检）', () => {
    const w = new World(80, 60, 30);
    w.store.setTileSilent(0, 48, 1, 0, 0); w.store.setTileSilent(0, 49, 1, 0, 0);
    expect(beeWallPushDir(w.store, 4, Y, 31, 19.5)).toBe(0.5);      // 列 0 实心→左优先 +0.5（parity 1 奇=−0.5）
  });
});
