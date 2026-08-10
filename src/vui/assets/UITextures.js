let atlas = null;
export const UITextures = {
    setAtlas(a) { atlas = a; },
    /** 按白名单键取贴图（自动补 .png 后缀），缺失返回 null（控件须自兜底） */
    get(name) {
        return atlas?.vui(name) ?? atlas?.vui(`${name}.png`) ?? null;
    },
};
