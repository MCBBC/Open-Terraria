/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=326, 实指令=59,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorShiftingPearlsands(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#10 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#11 op:0x01 */
let tmp11_0 = C[28];
let tmp11_1 = C[29];
R[4] = tmp11_0;
R[5] = tmp11_1;
/* inst#12 op:0x04 */
let tmp12_2 = T[1] * R[5] + (-C[25]);
R[6] = tmp12_2;
/* inst#13 op:0x05 */
let tmp13_2 = R[6] * C[0];
R[6] = tmp13_2;
/* inst#14 op:0x01 */
let tmp14_3 = C[36];
R[7] = tmp14_3;
/* inst#15 op:0x04 */
let tmp15_2 = R[6] * R[7] + C[4];
R[6] = tmp15_2;
/* inst#16 op:0x04 */
let tmp16_2 = R[6] * C[37] + C[38];
R[6] = tmp16_2;
/* inst#17 op:0x13 */
let tmp17_2 = R[6] - Math.floor(R[6]);
R[6] = tmp17_2;
/* inst#18 op:0x04 */
let tmp18_2 = R[6] * C[40] + C[41];
R[6] = tmp18_2;
/* inst#19 op:0x25 */
R[9] = Math.sin(R[6]);
/* inst#20 op:0x04 */
let tmp20_2 = R[9] * C[38] + C[38];
R[6] = tmp20_2;
/* inst#21 op:0x02 */
let tmp21_3 = R[1] + R[0];
R[7] = tmp21_3;
/* inst#22 op:0x02 */
let tmp22_3 = R[2] + R[7];
R[7] = tmp22_3;
/* inst#23 op:0x05 */
let tmp23_0 = R[7] * C[39];
R[0] = tmp23_0;
/* inst#24 op:0x04 */
let tmp24_0 = R[6] * C[44] + R[0];
R[0] = tmp24_0;
/* inst#25 op:0x04 */
let tmp25_1 = T[0] * R[4] + (-C[24]);
let tmp25_2 = T[1] * R[5] + (-C[25]);
R[1] = tmp25_1;
R[2] = tmp25_2;
/* inst#26 op:0x02 */
let tmp26_1 = R[1] + R[1];
let tmp26_2 = R[2] + R[2];
R[1] = tmp26_1;
R[2] = tmp26_2;
/* inst#27 op:0x04 */
let tmp27_0 = R[1] * C[8] + R[0];
R[0] = tmp27_0;
/* inst#28 op:0x01 */
let tmp28_1 = C[9];
R[5] = tmp28_1;
/* inst#29 op:0x04 */
let tmp29_1 = R[2] * R[5] + C[12];
R[1] = tmp29_1;
/* inst#30 op:0x05 */
let tmp30_0 = R[0] * C[43];
let tmp30_1 = R[1] * C[43];
R[4] = tmp30_0;
R[5] = tmp30_1;
/* inst#31 op:0x42 */
SAM[1]!(R[0], R[1], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#32 op:0x42 */
SAM[1]!(R[4], R[5], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#33 op:0x05 */
let tmp33_3 = R[7] * C[45];
R[15] = tmp33_3;
/* inst#34 op:0x04 */
let tmp34_3 = R[8] * C[46] + R[15];
R[15] = tmp34_3;
/* inst#35 op:0x02 */
let tmp35_3 = R[15] + C[47];
R[15] = tmp35_3;
/* inst#36 op:0x05 */
let tmp36_3 = R[15] * C[48];
R[15] = sat(tmp36_3);
/* inst#37 op:0x04 */
let tmp37_0 = R[15] * C[49] + C[50];
R[0] = tmp37_0;
/* inst#38 op:0x05 */
let tmp38_3 = R[15] * R[15];
R[15] = tmp38_3;
/* inst#39 op:0x05 */
let tmp39_3 = R[0] * R[15];
R[15] = tmp39_3;
/* inst#40 op:0x05 */
let tmp40_0 = V[0] * C[53];
let tmp40_1 = V[1] * C[53];
let tmp40_2 = V[2] * C[53];
R[0] = tmp40_0;
R[1] = tmp40_1;
R[2] = tmp40_2;
/* inst#41 op:0x04 */
let tmp41_0 = V[3] * C[54] + R[0];
let tmp41_1 = V[3] * C[54] + R[1];
let tmp41_2 = V[3] * C[54] + R[2];
R[0] = tmp41_0;
R[1] = tmp41_1;
R[2] = tmp41_2;
/* inst#42 op:0x04 */
let tmp42_0 = R[7] * C[42] + C[43];
R[4] = tmp42_0;
/* inst#43 op:0x04 */
let tmp43_1 = R[7] * C[51] + R[12];
R[5] = tmp43_1;
/* inst#44 op:0x02 */
let tmp44_1 = R[5] + C[52];
R[5] = tmp44_1;
/* inst#45 op:0x05 */
let tmp45_1 = R[5] * C[36];
R[5] = sat(tmp45_1);
/* inst#46 op:0x05 */
let tmp46_0 = R[4] * C[20];
let tmp46_1 = R[4] * C[21];
let tmp46_2 = R[4] * C[22];
R[8] = tmp46_0;
R[9] = tmp46_1;
R[10] = tmp46_2;
/* inst#47 op:0x05 */
let tmp47_0 = R[8] * V[0];
let tmp47_1 = R[9] * V[1];
let tmp47_2 = R[10] * V[2];
R[8] = tmp47_0;
R[9] = tmp47_1;
R[10] = tmp47_2;
/* inst#48 op:0x04 */
let tmp48_0 = C[16] * R[0] + (-R[8]);
let tmp48_1 = C[17] * R[1] + (-R[9]);
let tmp48_2 = C[18] * R[2] + (-R[10]);
R[0] = tmp48_0;
R[1] = tmp48_1;
R[2] = tmp48_2;
/* inst#49 op:0x04 */
let tmp49_0 = R[15] * R[0] + R[8];
let tmp49_1 = R[15] * R[1] + R[9];
let tmp49_2 = R[15] * R[2] + R[10];
R[0] = tmp49_0;
R[1] = tmp49_1;
R[2] = tmp49_2;
/* inst#50 op:0x02 */
let tmp50_0 = R[13] + C[55];
R[4] = tmp50_0;
/* inst#51 op:0x04 */
let tmp51_2 = R[14] * C[60] + C[61];
R[6] = tmp51_2;
/* inst#52 op:0x05 */
let tmp52_0 = R[4] * C[56];
R[4] = sat(tmp52_0);
/* inst#53 op:0x04 */
let tmp53_3 = R[4] * C[49] + C[50];
R[7] = tmp53_3;
/* inst#54 op:0x05 */
let tmp54_0 = R[4] * R[4];
R[4] = tmp54_0;
/* inst#55 op:0x05 */
let tmp55_0 = R[7] * R[4];
R[4] = tmp55_0;
/* inst#56 op:0x01 */
let tmp56_1 = C[57];
let tmp56_2 = C[58];
let tmp56_3 = C[59];
R[9] = tmp56_1;
R[10] = tmp56_2;
R[11] = tmp56_3;
/* inst#57 op:0x04 */
let tmp57_0 = R[4] * R[11] + C[32];
let tmp57_1 = R[4] * R[10] + C[33];
let tmp57_2 = R[4] * R[9] + C[34];
R[8] = tmp57_0;
R[9] = tmp57_1;
R[10] = tmp57_2;
/* inst#58 op:0x05 */
let tmp58_0 = R[6] * R[8];
let tmp58_1 = R[6] * R[9];
let tmp58_2 = R[6] * R[10];
R[8] = tmp58_0;
R[9] = tmp58_1;
R[10] = tmp58_2;
/* inst#59 op:0x05 */
let tmp59_0 = V[0] * (-C[52]);
let tmp59_1 = V[1] * (-C[52]);
let tmp59_2 = V[2] * (-C[52]);
R[12] = tmp59_0;
R[13] = tmp59_1;
R[14] = tmp59_2;
/* inst#60 op:0x04 */
let tmp60_0 = V[3] * C[46] + R[12];
let tmp60_1 = V[3] * C[46] + R[13];
let tmp60_2 = V[3] * C[46] + R[14];
R[12] = tmp60_0;
R[13] = tmp60_1;
R[14] = tmp60_2;
/* inst#61 op:0x04 */
let tmp61_0 = R[8] * R[12] + (-R[0]);
let tmp61_1 = R[9] * R[13] + (-R[1]);
let tmp61_2 = R[10] * R[14] + (-R[2]);
R[8] = tmp61_0;
R[9] = tmp61_1;
R[10] = tmp61_2;
/* inst#62 op:0x04 */
let tmp62_3 = R[5] * C[49] + C[50];
R[11] = tmp62_3;
/* inst#63 op:0x05 */
let tmp63_0 = R[5] * R[5];
R[4] = tmp63_0;
/* inst#64 op:0x05 */
let tmp64_3 = R[11] * R[4];
R[11] = tmp64_3;
/* inst#65 op:0x04 */
let tmp65_0 = R[11] * R[8] + R[0];
let tmp65_1 = R[11] * R[9] + R[1];
let tmp65_2 = R[11] * R[10] + R[2];
R[4] = tmp65_0;
R[5] = tmp65_1;
R[6] = tmp65_2;
/* inst#66 op:0x01 */
let tmp66_3 = V[3];
R[7] = tmp66_3;
/* inst#67 op:0x05 */
let tmp67_0 = R[3] * R[4];
let tmp67_1 = R[3] * R[5];
let tmp67_2 = R[3] * R[6];
let tmp67_3 = R[3] * R[7];
R[0] = tmp67_0;
R[1] = tmp67_1;
R[2] = tmp67_2;
R[3] = tmp67_3;
/* inst#68 op:0x01 */
let tmp68_0 = R[0];
let tmp68_1 = R[1];
let tmp68_2 = R[2];
let tmp68_3 = R[3];
O[0] = tmp68_0;
O[1] = tmp68_1;
O[2] = tmp68_2;
O[3] = tmp68_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

