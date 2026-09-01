/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=302, 实指令=67,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorSolar(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#4 op:0x01 */
let tmp4_0 = (-C[4]);
R[0] = tmp4_0;
/* inst#5 op:0x01 */
let tmp5_1 = C[24];
R[1] = tmp5_1;
/* inst#6 op:0x02 */
let tmp6_0 = R[0] + T[0];
let tmp6_1 = R[1] + T[1];
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x02 */
let tmp7_0 = T[0] + C[4];
R[4] = tmp7_0;
/* inst#8 op:0x01 */
let tmp8_1 = T[1];
R[5] = tmp8_1;
/* inst#9 op:0x01 */
let tmp9_0 = T[0];
R[8] = tmp9_0;
/* inst#10 op:0x02 */
let tmp10_1 = T[1] + C[0];
R[9] = tmp10_1;
/* inst#11 op:0x01 */
let tmp11_0 = T[0];
R[12] = tmp11_0;
/* inst#12 op:0x02 */
let tmp12_1 = T[1] + (-C[0]);
R[13] = tmp12_1;
/* inst#13 op:0x42 */
SAM[0](R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#14 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#15 op:0x42 */
SAM[0](R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#16 op:0x42 */
SAM[0](R[12], R[13], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#17 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#18 op:0x02 */
let tmp18_0 = R[0] + (-R[4]);
let tmp18_1 = R[1] + (-R[5]);
let tmp18_2 = R[2] + (-R[6]);
R[0] = tmp18_0;
R[1] = tmp18_1;
R[2] = tmp18_2;
/* inst#19 op:0x02 */
let tmp19_3 = R[1] + R[0];
R[11] = tmp19_3;
/* inst#20 op:0x02 */
let tmp20_3 = R[2] + R[11];
R[11] = tmp20_3;
/* inst#21 op:0x05 */
let tmp21_0 = R[11] * C[25];
R[0] = tmp21_0;
/* inst#22 op:0x02 */
let tmp22_0 = (-R[8]) + R[12];
let tmp22_1 = (-R[9]) + R[13];
let tmp22_2 = (-R[10]) + R[14];
R[4] = tmp22_0;
R[5] = tmp22_1;
R[6] = tmp22_2;
/* inst#23 op:0x02 */
let tmp23_3 = R[5] + R[4];
R[3] = tmp23_3;
/* inst#24 op:0x02 */
let tmp24_3 = R[6] + R[3];
R[3] = tmp24_3;
/* inst#25 op:0x05 */
let tmp25_1 = R[3] * C[25];
R[1] = tmp25_1;
/* inst#26 op:0x05 */
let tmp26_3 = R[1] * R[1];
R[3] = tmp26_3;
/* inst#27 op:0x04 */
let tmp27_3 = R[0] * R[0] + R[3];
R[3] = tmp27_3;
/* inst#28 op:0x02 */
let tmp28_3 = (-R[3]) + C[26];
R[3] = tmp28_3;
/* inst#29 op:0x07 */
let tmp29_0 = 1 / Math.sqrt(R[3]);
R[4] = tmp29_0;
/* inst#30 op:0x06 */
let tmp30_0 = 1 / R[4];
R[4] = tmp30_0;
/* inst#31 op:0x58 */
let tmp31_2 = R[3] >= 0 ? R[4] : C[24];
R[2] = tmp31_2;
/* inst#32 op:0x08 */
R[0] = R[0] * C[20] + R[1] * C[21] + R[2] * C[22];
/* inst#33 op:0x02 */
let tmp33_1 = R[0] + C[27];
R[1] = tmp33_1;
/* inst#34 op:0x05 */
let tmp34_1 = R[1] * C[23];
R[1] = tmp34_1;
/* inst#35 op:0x58 */
let tmp35_0 = R[0] >= 0 ? R[1] : C[28];
R[0] = sat(tmp35_0);
/* inst#36 op:0x04 */
let tmp36_1 = R[0] * C[29] + C[30];
R[1] = tmp36_1;
/* inst#37 op:0x05 */
let tmp37_0 = R[0] * R[0];
R[0] = tmp37_0;
/* inst#38 op:0x05 */
let tmp38_0 = R[1] * R[0];
R[0] = tmp38_0;
/* inst#39 op:0x02 */
let tmp39_0 = R[0] + R[0];
R[0] = tmp39_0;
/* inst#40 op:0x05 */
let tmp40_1 = R[0] * C[8];
R[1] = tmp40_1;
/* inst#41 op:0x01 */
let tmp41_0 = C[8];
R[4] = tmp41_0;
/* inst#42 op:0x04 */
let tmp42_0 = R[0] * R[4] + C[32];
R[0] = tmp42_0;
/* inst#43 op:0x02 */
let tmp43_0 = R[0] + R[0];
R[0] = sat(tmp43_0);
/* inst#44 op:0x05 */
let tmp44_2 = R[1] * (-C[27]);
R[2] = tmp44_2;
/* inst#45 op:0x0b */
let tmp45_0 = Math.max(V[0], V[3]);
let tmp45_1 = Math.max(V[1], V[3]);
let tmp45_2 = Math.max(V[2], V[3]);
R[4] = tmp45_0;
R[5] = tmp45_1;
R[6] = tmp45_2;
/* inst#46 op:0x12 */
let tmp46_0 = R[2] * R[4] + (1 - R[2]) * V[0];
let tmp46_1 = R[2] * R[5] + (1 - R[2]) * V[1];
let tmp46_2 = R[2] * R[6] + (1 - R[2]) * V[2];
R[8] = tmp46_0;
R[9] = tmp46_1;
R[10] = tmp46_2;
/* inst#47 op:0x04 */
let tmp47_2 = R[0] * C[29] + C[30];
R[2] = tmp47_2;
/* inst#48 op:0x05 */
let tmp48_0 = R[0] * R[0];
R[0] = tmp48_0;
/* inst#49 op:0x05 */
let tmp49_0 = R[2] * R[0];
R[0] = tmp49_0;
/* inst#50 op:0x05 */
let tmp50_2 = R[1] * C[31];
R[2] = sat(tmp50_2);
/* inst#51 op:0x04 */
let tmp51_3 = R[2] * C[29] + C[30];
R[3] = tmp51_3;
/* inst#52 op:0x05 */
let tmp52_2 = R[2] * R[2];
R[2] = tmp52_2;
/* inst#53 op:0x05 */
let tmp53_2 = R[3] * R[2];
R[2] = tmp53_2;
/* inst#54 op:0x01 */
let tmp54_0 = C[16];
let tmp54_1 = C[17];
let tmp54_2 = C[18];
R[4] = tmp54_0;
R[5] = tmp54_1;
R[6] = tmp54_2;
/* inst#55 op:0x04 */
let tmp55_0 = R[2] * C[12] + R[4];
let tmp55_1 = R[2] * C[13] + R[5];
let tmp55_2 = R[2] * C[14] + R[6];
R[4] = tmp55_0;
R[5] = tmp55_1;
R[6] = tmp55_2;
/* inst#56 op:0x12 */
let tmp56_0 = R[0] * C[26] + (1 - R[0]) * R[4];
let tmp56_1 = R[0] * C[26] + (1 - R[0]) * R[5];
let tmp56_2 = R[0] * C[26] + (1 - R[0]) * R[6];
R[12] = tmp56_0;
R[13] = tmp56_1;
R[14] = tmp56_2;
/* inst#57 op:0x05 */
let tmp57_3 = R[19] * R[1];
R[15] = tmp57_3;
/* inst#58 op:0x05 */
let tmp58_0 = R[12] * R[15];
let tmp58_1 = R[13] * R[15];
let tmp58_2 = R[14] * R[15];
R[0] = tmp58_0;
R[1] = tmp58_1;
R[2] = tmp58_2;
/* inst#59 op:0x01 */
let tmp59_3 = R[19];
R[3] = tmp59_3;
/* inst#60 op:0x0a */
let tmp60_0 = Math.min(R[0], C[26]);
let tmp60_1 = Math.min(R[1], C[26]);
let tmp60_2 = Math.min(R[2], C[26]);
let tmp60_3 = Math.min(R[3], C[26]);
R[4] = tmp60_0;
R[5] = tmp60_1;
R[6] = tmp60_2;
R[7] = tmp60_3;
/* inst#61 op:0x01 */
let tmp61_3 = V[3];
R[11] = tmp61_3;
/* inst#62 op:0x05 */
let tmp62_0 = R[8] * R[4];
let tmp62_1 = R[9] * R[5];
let tmp62_2 = R[10] * R[6];
let tmp62_3 = R[11] * R[7];
R[0] = tmp62_0;
R[1] = tmp62_1;
R[2] = tmp62_2;
R[3] = tmp62_3;
/* inst#63 op:0x02 */
let tmp63_0 = R[17] + R[16];
R[4] = tmp63_0;
/* inst#64 op:0x02 */
let tmp64_0 = R[18] + R[4];
R[4] = tmp64_0;
/* inst#65 op:0x05 */
let tmp65_0 = R[4] * C[25];
R[4] = tmp65_0;
/* inst#66 op:0x05 */
let tmp66_0 = R[4] * C[16];
let tmp66_1 = R[4] * C[17];
let tmp66_2 = R[4] * C[18];
R[4] = tmp66_0;
R[5] = tmp66_1;
R[6] = tmp66_2;
/* inst#67 op:0x05 */
let tmp67_0 = R[4] * C[22];
let tmp67_1 = R[5] * C[22];
let tmp67_2 = R[6] * C[22];
R[4] = tmp67_0;
R[5] = tmp67_1;
R[6] = tmp67_2;
/* inst#68 op:0x04 */
let tmp68_0 = R[16] * C[22] + R[4];
let tmp68_1 = R[17] * C[22] + R[5];
let tmp68_2 = R[18] * C[22] + R[6];
R[16] = tmp68_0;
R[17] = tmp68_1;
R[18] = tmp68_2;
/* inst#69 op:0x04 */
let tmp69_0 = R[16] * V[0] + R[0];
let tmp69_1 = R[17] * V[1] + R[1];
let tmp69_2 = R[18] * V[2] + R[2];
let tmp69_3 = R[19] * V[3] + R[3];
R[0] = tmp69_0;
R[1] = tmp69_1;
R[2] = tmp69_2;
R[3] = tmp69_3;
/* inst#70 op:0x01 */
let tmp70_0 = R[0];
let tmp70_1 = R[1];
let tmp70_2 = R[2];
let tmp70_3 = R[3];
O[0] = tmp70_0;
O[1] = tmp70_1;
O[2] = tmp70_2;
O[3] = tmp70_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

