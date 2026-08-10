function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbToHex(r, g, b) {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}
export function shade(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(r * f, g * f, b * f);
}
export function mix(a, b, t) {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
function mat(base, light = 1.28, dark = 0.72, light2 = 1.45) {
    return { base, light: shade(base, light), light2: shade(base, light2), dark: shade(base, dark) };
}
export const MATS = {
    dirt: mat('#976B4B'),
    stone: mat('#808080', 1.25, 0.62),
    grass: mat('#3E9E42', 1.3, 0.6),
    grassDark: mat('#2E7D34', 1.3, 0.6),
    wood: mat('#A97D4E', 1.25, 0.7),
    woodDark: mat('#6B4A2B', 1.25, 0.7),
    leaves: mat('#2E8B3D', 1.35, 0.65),
    copper: mat('#C36927', 1.4, 0.6),
    iron: mat('#9A8C7A', 1.4, 0.6),
    silver: mat('#B8C4CE', 1.4, 0.7),
    gold: mat('#E8C34A', 1.4, 0.65),
    metal: mat('#8A8A96', 1.4, 0.6),
    sand: mat('#D8C87E', 1.2, 0.75),
    snow: mat('#E8F0F4', 1.08, 0.85),
    water: mat('#3D6FD1', 1.2, 0.75),
    torch: mat('#FDDD03', 1.3, 0.7),
    fire: mat('#FF8C2E', 1.3, 0.7),
    skin: mat('#E8B88A', 1.15, 0.8),
    cloth: mat('#5A6AC0', 1.25, 0.7),
    slimeGreen: mat('#5FD35F', 1.25, 0.7),
    slimeBlue: mat('#4FA8E0', 1.25, 0.7),
    zombieSkin: mat('#7A9660', 1.2, 0.7),
    eye: mat('#E8E8E8', 1.1, 0.7),
    eyeRed: mat('#C02020', 1.3, 0.7),
    ui: mat('#C8B088', 1.2, 0.7),
};
