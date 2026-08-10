// MapColors（生成期预览的 tile→色公共逻辑）确定性测试
import { describe, it, expect } from 'vitest';
import { mapColor24 } from '../src/render/MapColors';
import { World } from '../src/world/World';
import { T, TILE_DEFS } from '../src/data/tiles';
function hex(c) {
    return '#' + c.toString(16).padStart(6, '0').toUpperCase();
}
describe('mapColor24', () => {
    it('优先级：实体 tile > 液体 > 墙 > 天空', () => {
        const w = new World(4, 4, 1, 't');
        const st = w.store;
        const x = 1, y = 1;
        // 天空
        expect(hex(mapColor24(st, x, y))).toBe('#7EB6E8');
        // 墙
        st.setWallSilent(x, y, 1);
        expect(hex(mapColor24(st, x, y))).not.toBe('#7EB6E8');
        // 液体覆盖墙
        st.setLiquid(x, y, 255, 1);
        expect(hex(mapColor24(st, x, y))).toBe('#3D6FD1');
        // 岩浆
        st.setLiquid(x, y, 255, 2);
        expect(hex(mapColor24(st, x, y))).toBe('#E8622C');
        // 实体 tile 覆盖液体
        st.setTileSilent(x, y, T.STONE);
        expect(hex(mapColor24(st, x, y))).toBe(TILE_DEFS[T.STONE].mapColor.toUpperCase());
    });
    it('液体需 >40 才显示（原版 Minimap 同阈值）', () => {
        const w = new World(2, 2, 1, 't');
        w.store.setLiquid(0, 0, 20, 1);
        expect(hex(mapColor24(w.store, 0, 0))).toBe('#7EB6E8');
        w.store.setLiquid(0, 0, 41, 1);
        expect(hex(mapColor24(w.store, 0, 0))).toBe('#3D6FD1');
    });
});
