/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=292, 实指令=65,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_LitNature(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#3 op:0x01 */
let tmp3_0 = T[0];
R[0] = tmp3_0;
/* inst#4 op:0x02 */
let tmp4_1 = T[1] + (-C[24]);
R[1] = tmp4_1;
/* inst#5 op:0x01 */
let tmp5_0 = T[0];
R[4] = tmp5_0;
/* inst#6 op:0x02 */
let tmp6_1 = T[1] + C[24];
R[5] = tmp6_1;
/* inst#7 op:0x01 */
let tmp7_0 = (-C[28]);
R[8] = tmp7_0;
/* inst#8 op:0x01 */
let tmp8_1 = C[55];
R[9] = tmp8_1;
/* inst#9 op:0x02 */
let tmp9_0 = R[8] + T[0];
let tmp9_1 = R[9] + T[1];
R[8] = tmp9_0;
R[9] = tmp9_1;
/* inst#10 op:0x02 */
let tmp10_0 = T[0] + C[28];
R[12] = tmp10_0;
/* inst#11 op:0x01 */
let tmp11_1 = T[1];
R[13] = tmp11_1;
/* inst#12 op:0x01 */
let tmp12_0 = C[52];
let tmp12_1 = C[52];
R[16] = tmp12_0;
R[17] = tmp12_1;
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
SAM[1](R[16], R[17], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#18 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[20] = sm2Scr[0];
R[21] = sm2Scr[1];
R[22] = sm2Scr[2];
R[23] = sm2Scr[3];
/* inst#19 op:0x0a */
let tmp19_0 = Math.min(R[7], R[3]);
R[8] = tmp19_0;
/* inst#20 op:0x0a */
let tmp20_0 = Math.min(R[11], R[8]);
R[0] = tmp20_0;
/* inst#21 op:0x0a */
let tmp21_0 = Math.min(R[15], R[0]);
R[4] = tmp21_0;
/* inst#22 op:0x02 */
let tmp22_0 = (-R[4]) + C[57];
R[0] = tmp22_0;
/* inst#23 op:0x02 */
let tmp23_0 = T[4] + (-C[40]);
let tmp23_1 = T[5] + (-C[41]);
R[4] = tmp23_0;
R[5] = tmp23_1;
/* inst#24 op:0x5a */
R[1] = R[4] * R[4] + R[5] * R[5] + C[55];
/* inst#25 op:0x07 */
let tmp25_1 = 1 / Math.sqrt(R[1]);
R[1] = tmp25_1;
/* inst#26 op:0x05 */
let tmp26_0 = R[4] * R[1];
let tmp26_1 = R[5] * R[1];
R[4] = tmp26_0;
R[5] = tmp26_1;
/* inst#27 op:0x02 */
let tmp27_0 = (-T[4]) + C[48];
let tmp27_1 = (-T[5]) + C[49];
R[8] = tmp27_0;
R[9] = tmp27_1;
/* inst#28 op:0x5a */
R[1] = R[8] * R[8] + R[9] * R[9] + C[55];
/* inst#29 op:0x07 */
let tmp29_1 = 1 / Math.sqrt(R[1]);
R[1] = tmp29_1;
/* inst#30 op:0x05 */
let tmp30_0 = R[8] * R[1];
let tmp30_1 = R[9] * R[1];
R[8] = tmp30_0;
R[9] = tmp30_1;
/* inst#31 op:0x06 */
let tmp31_1 = 1 / R[1];
R[1] = tmp31_1;
/* inst#32 op:0x5a */
R[2] = R[4] * R[8] + R[5] * R[9] + C[59];
/* inst#33 op:0x05 */
let tmp33_2 = R[2] * C[60];
R[2] = sat(tmp33_2);
/* inst#34 op:0x04 */
let tmp34_0 = R[0] * C[61] + R[2];
R[0] = tmp34_0;
/* inst#35 op:0x05 */
let tmp35_2 = R[19] * C[50];
R[2] = tmp35_2;
/* inst#36 op:0x05 */
let tmp36_0 = R[0] * R[2];
R[0] = tmp36_0;
/* inst#37 op:0x05 */
let tmp37_2 = R[1] * C[58];
R[2] = sat(tmp37_2);
/* inst#38 op:0x04 */
let tmp38_1 = R[1] * (-C[56]) + C[57];
R[1] = tmp38_1;
/* inst#39 op:0x05 */
let tmp39_2 = R[2] * R[1];
R[2] = tmp39_2;
/* inst#40 op:0x58 */
let tmp40_1 = R[1] >= 0 ? R[2] : C[55];
R[1] = tmp40_1;
/* inst#41 op:0x05 */
let tmp41_1 = R[1] * R[1];
R[1] = tmp41_1;
/* inst#42 op:0x05 */
let tmp42_0 = R[0] * R[1];
R[0] = tmp42_0;
/* inst#43 op:0x05 */
let tmp43_1 = T[0] * C[44];
let tmp43_2 = T[1] * C[45];
R[1] = tmp43_1;
R[2] = tmp43_2;
/* inst#44 op:0x13 */
let tmp44_0 = R[1] - Math.floor(R[1]);
let tmp44_1 = R[2] - Math.floor(R[2]);
R[4] = tmp44_0;
R[5] = tmp44_1;
/* inst#45 op:0x02 */
let tmp45_1 = R[1] + (-R[4]);
let tmp45_2 = R[2] + (-R[5]);
R[1] = tmp45_1;
R[2] = tmp45_2;
/* inst#46 op:0x02 */
let tmp46_1 = R[1] + C[52];
let tmp46_2 = R[2] + C[52];
R[1] = tmp46_1;
R[2] = tmp46_2;
/* inst#47 op:0x02 */
let tmp47_0 = R[1] + (-C[36]);
let tmp47_1 = R[2] + (-C[37]);
R[4] = tmp47_0;
R[5] = tmp47_1;
/* inst#48 op:0x02 */
let tmp48_1 = (-R[1]) + C[0];
let tmp48_2 = (-R[2]) + C[1];
R[1] = tmp48_1;
R[2] = tmp48_2;
/* inst#49 op:0x0a */
let tmp49_2 = Math.min(R[2], C[53]);
R[6] = tmp49_2;
/* inst#50 op:0x01 */
let tmp50_1 = C[53];
let tmp50_3 = C[55];
R[9] = tmp50_1;
R[11] = tmp50_3;
/* inst#51 op:0x58 */
let tmp51_2 = C[4] >= 0 ? R[6] : R[9];
R[2] = tmp51_2;
/* inst#52 op:0x0a */
let tmp52_0 = Math.min(R[5], R[2]);
R[8] = tmp52_0;
/* inst#53 op:0x58 */
let tmp53_2 = C[8] >= 0 ? R[8] : R[2];
R[2] = tmp53_2;
/* inst#54 op:0x0a */
let tmp54_1 = Math.min(R[1], R[2]);
R[5] = tmp54_1;
/* inst#55 op:0x58 */
let tmp55_1 = C[12] >= 0 ? R[5] : R[2];
R[1] = tmp55_1;
/* inst#56 op:0x0a */
let tmp56_0 = Math.min(R[4], R[1]);
R[8] = tmp56_0;
/* inst#57 op:0x58 */
let tmp57_1 = C[16] >= 0 ? R[8] : R[1];
R[1] = tmp57_1;
/* inst#58 op:0x13 */
let tmp58_2 = R[1] - Math.floor(R[1]);
R[2] = tmp58_2;
/* inst#59 op:0x02 */
let tmp59_1 = R[1] + (-R[2]);
R[1] = tmp59_1;
/* inst#60 op:0x05 */
let tmp60_1 = R[1] * C[54];
R[1] = tmp60_1;
/* inst#61 op:0x58 */
let tmp61_1 = C[20] >= 0 ? R[1] : R[11];
R[1] = tmp61_1;
/* inst#62 op:0x05 */
let tmp62_0 = R[0] * R[1];
R[0] = tmp62_0;
/* inst#63 op:0x05 */
let tmp63_0 = R[23] * C[32];
let tmp63_1 = R[23] * C[33];
let tmp63_2 = R[23] * C[34];
R[4] = tmp63_0;
R[5] = tmp63_1;
R[6] = tmp63_2;
/* inst#64 op:0x01 */
let tmp64_3 = R[23];
R[7] = tmp64_3;
/* inst#65 op:0x04 */
let tmp65_0 = R[4] * R[0] + R[20];
let tmp65_1 = R[5] * R[0] + R[21];
let tmp65_2 = R[6] * R[0] + R[22];
let tmp65_3 = R[7] * R[0] + R[23];
R[0] = tmp65_0;
R[1] = tmp65_1;
R[2] = tmp65_2;
R[3] = tmp65_3;
/* inst#66 op:0x05 */
let tmp66_0 = R[0] * V[0];
let tmp66_1 = R[1] * V[1];
let tmp66_2 = R[2] * V[2];
let tmp66_3 = R[3] * V[3];
R[0] = tmp66_0;
R[1] = tmp66_1;
R[2] = tmp66_2;
R[3] = tmp66_3;
/* inst#67 op:0x01 */
let tmp67_0 = R[0];
let tmp67_1 = R[1];
let tmp67_2 = R[2];
let tmp67_3 = R[3];
O[0] = tmp67_0;
O[1] = tmp67_1;
O[2] = tmp67_2;
O[3] = tmp67_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

