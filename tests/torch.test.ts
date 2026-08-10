import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { torchAnchorFrame, torchStillAnchored } from '../src/world/Torch';
import { T, TILE_BY_KEY } from '../src/data/tiles';

// 火把锚定（TileObjectData tile4 + TileObject.CanPlace 1:1）
function mkStore(w = 8, h = 8): TileStore {
  const st = new TileStore(w, h);
  return st;
}

describe('火把锚定（torchAnchorFrame）', () => {
  it('底锚优先：下方实心 → frameX 0（TileObject base 先于 alternates）', () => {
    const st = mkStore();
    st.setTile(4, 4, T.STONE);
    expect(torchAnchorFrame(st, 4, 3)).toBe(0);
  });

  it('左锚：无地面但左邻实心 → frameX 22（AnchorLeft）', () => {
    const st = mkStore();
    st.setTile(3, 3, T.STONE);
    expect(torchAnchorFrame(st, 4, 3)).toBe(22);
  });

  it('右锚：仅右邻实心 → frameX 44（AnchorRight）', () => {
    const st = mkStore();
    st.setTile(5, 3, T.STONE);
    expect(torchAnchorFrame(st, 4, 3)).toBe(44);
  });

  it('墙锚：无任何方块支撑但有背景墙 → frameX 0（AnchorWall，直立贴墙）', () => {
    const st = mkStore();
    st.setWallSilent(4, 3, TILE_BY_KEY['stone'] ?? 1);
    expect(torchAnchorFrame(st, 4, 3)).toBe(0);
  });

  it('无锚点 → -1（放置拒绝）', () => {
    const st = mkStore();
    expect(torchAnchorFrame(st, 4, 3)).toBe(-1);
  });

  it('支撑消失掉落（torchStillAnchored）：挖掉地板后直立火把掉、有墙仍留', () => {
    const st = mkStore();
    st.setTile(4, 4, T.STONE);
    st.setTile(4, 3, T.TORCH, 0, 0);
    expect(torchStillAnchored(st, 4, 3, 0)).toBe(true);
    st.setTile(4, 4, 0); // 挖掉地板
    expect(torchStillAnchored(st, 4, 3, 0)).toBe(false);
    st.setWallSilent(4, 3, 1); // 贴墙 → 留住
    expect(torchStillAnchored(st, 4, 3, 0)).toBe(true);
  });

  it('侧锚火把：挖掉侧块即失去支撑', () => {
    const st = mkStore();
    st.setTile(3, 3, T.STONE);
    st.setTile(4, 3, T.TORCH, 22, 0);
    expect(torchStillAnchored(st, 4, 3, 22)).toBe(true);
    st.setTile(3, 3, 0);
    expect(torchStillAnchored(st, 4, 3, 22)).toBe(false);
  });
});
