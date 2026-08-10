export function newGenState(w, h) {
    return {
        worldSurface: Math.floor(h * 0.3), worldSurfaceLow: 0, worldSurfaceHigh: 0,
        rockLevel: Math.floor(h * 0.42), rockLevelLow: 0, rockLevelHigh: 0,
        waterLine: Math.floor(h * 0.35), lavaLine: h - 200,
        beachDistance: Math.max(24, Math.floor(w * 0.06)),
        crimson: false,
        oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 },
        dungeonSide: 1, dungeonX: 0, dungeonLocation: 0, dungeonY: 0, jungleX: 0,
        snowOriginLeft: 0, snowOriginRight: 0,
        beachLeftEnd: 0, beachRightStart: 0,
        treeX: [0, 0, 0], treeStyle: [0, 0, 0, 0], genTrees: [],
        mCaveX: new Int32Array(1024), mCaveY: new Int32Array(1024), numMCaves: 0,
        snowMinX: null, snowMaxX: null, snowTop: 0, snowBottom: 0,
        jungleBounds: null,
        evilZones: [],
        undergroundDesert: null,
        pyramidSpots: [],
        floatingIslands: [],
    };
}
