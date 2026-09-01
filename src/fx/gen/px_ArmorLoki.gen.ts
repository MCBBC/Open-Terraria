/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=232, 实指令=46,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorLoki(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x01 */
let tmp5_0 = C[36];
let tmp5_1 = C[37];
R[0] = tmp5_0;
R[1] = tmp5_1;
/* inst#6 op:0x04 */
let tmp6_0 = T[0] * R[0] + (-C[32]);
let tmp6_1 = T[1] * R[1] + (-C[33]);
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x02 */
let tmp7_0 = R[0] + (-C[12]);
let tmp7_1 = R[1] + (-C[13]);
R[0] = tmp7_0;
R[1] = tmp7_1;
/* inst#8 op:0x05 */
let tmp8_2 = R[1] * C[20];
R[2] = tmp8_2;
/* inst#9 op:0x04 */
let tmp9_0 = R[0] * C[16] + (-R[2]);
R[4] = tmp9_0;
/* inst#10 op:0x05 */
let tmp10_1 = R[1] * C[16];
R[1] = tmp10_1;
/* inst#11 op:0x04 */
let tmp11_1 = R[0] * C[20] + R[1];
R[5] = tmp11_1;
/* inst#12 op:0x02 */
let tmp12_0 = R[4] + C[12];
let tmp12_1 = R[5] + C[13];
R[0] = tmp12_0;
R[1] = tmp12_1;
/* inst#13 op:0x02 */
let tmp13_1 = R[1] + C[24];
R[1] = tmp13_1;
/* inst#14 op:0x04 */
let tmp14_0 = R[0] * C[40] + C[41];
R[0] = tmp14_0;
/* inst#15 op:0x13 */
let tmp15_0 = R[0] - Math.floor(R[0]);
R[0] = tmp15_0;
/* inst#16 op:0x04 */
let tmp16_0 = R[0] * C[42] + C[43];
R[0] = tmp16_0;
/* inst#17 op:0x25 */
R[5] = Math.sin(R[0]);
/* inst#18 op:0x04 */
let tmp18_0 = R[1] * C[40] + C[41];
R[0] = tmp18_0;
/* inst#19 op:0x13 */
let tmp19_0 = R[0] - Math.floor(R[0]);
R[0] = tmp19_0;
/* inst#20 op:0x04 */
let tmp20_0 = R[0] * C[42] + C[43];
R[0] = tmp20_0;
/* inst#21 op:0x25 */
R[9] = Math.sin(R[0]);
/* inst#22 op:0x02 */
let tmp22_0 = T[0] + C[8];
let tmp22_1 = T[1] + C[9];
R[0] = tmp22_0;
R[1] = tmp22_1;
/* inst#23 op:0x0a */
let tmp23_1 = Math.min(C[4], R[1]);
R[13] = tmp23_1;
/* inst#24 op:0x01 */
let tmp24_0 = R[0];
R[12] = tmp24_0;
/* inst#25 op:0x02 */
let tmp25_0 = T[0] + C[0];
let tmp25_1 = T[1] + C[1];
R[0] = tmp25_0;
R[1] = tmp25_1;
/* inst#26 op:0x0a */
let tmp26_1 = Math.min(C[4], R[1]);
R[17] = tmp26_1;
/* inst#27 op:0x01 */
let tmp27_0 = R[0];
R[16] = tmp27_0;
/* inst#28 op:0x42 */
SAM[0](R[12], R[13], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#29 op:0x42 */
SAM[0](R[16], R[17], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#30 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#31 op:0x04 */
let tmp31_0 = R[5] * R[9] + R[3];
R[0] = tmp31_0;
/* inst#32 op:0x0a */
let tmp32_3 = Math.min(R[0], C[44]);
R[7] = tmp32_3;
/* inst#33 op:0x05 */
let tmp33_0 = R[7] * C[28];
let tmp33_1 = R[7] * C[29];
let tmp33_2 = R[7] * C[30];
R[4] = tmp33_0;
R[5] = tmp33_1;
R[6] = tmp33_2;
/* inst#34 op:0x0b */
let tmp34_0 = Math.max(R[15], R[3]);
R[8] = tmp34_0;
/* inst#35 op:0x02 */
let tmp35_0 = R[17] + R[16];
R[0] = tmp35_0;
/* inst#36 op:0x02 */
let tmp36_0 = R[18] + R[0];
R[0] = tmp36_0;
/* inst#37 op:0x04 */
let tmp37_0 = R[0] * (-C[45]) + R[8];
R[0] = tmp37_0;
/* inst#38 op:0x05 */
let tmp38_0 = R[4] * R[0];
let tmp38_1 = R[5] * R[0];
let tmp38_2 = R[6] * R[0];
let tmp38_3 = R[7] * R[0];
R[4] = tmp38_0;
R[5] = tmp38_1;
R[6] = tmp38_2;
R[7] = tmp38_3;
/* inst#39 op:0x58 */
let tmp39_0 = R[0] >= 0 ? R[4] : C[46];
let tmp39_1 = R[0] >= 0 ? R[5] : C[46];
let tmp39_2 = R[0] >= 0 ? R[6] : C[46];
let tmp39_3 = R[0] >= 0 ? R[7] : C[46];
R[0] = tmp39_0;
R[1] = tmp39_1;
R[2] = tmp39_2;
R[3] = tmp39_3;
/* inst#40 op:0x04 */
let tmp40_0 = R[19] * (-C[47]) + C[44];
R[4] = tmp40_0;
/* inst#41 op:0x05 */
let tmp41_0 = R[0] * R[4];
let tmp41_1 = R[1] * R[4];
let tmp41_2 = R[2] * R[4];
let tmp41_3 = R[3] * R[4];
R[4] = tmp41_0;
R[5] = tmp41_1;
R[6] = tmp41_2;
R[7] = tmp41_3;
/* inst#42 op:0x05 */
let tmp42_0 = R[4] * C[48];
let tmp42_1 = R[5] * C[48];
let tmp42_2 = R[6] * C[48];
let tmp42_3 = R[7] * C[48];
R[4] = tmp42_0;
R[5] = tmp42_1;
R[6] = tmp42_2;
R[7] = tmp42_3;
/* inst#43 op:0x58 */
let tmp43_0 = R[0] >= 0 ? R[4] : C[46];
let tmp43_1 = R[1] >= 0 ? R[5] : C[46];
let tmp43_2 = R[2] >= 0 ? R[6] : C[46];
let tmp43_3 = R[3] >= 0 ? R[7] : C[46];
R[0] = tmp43_0;
R[1] = tmp43_1;
R[2] = tmp43_2;
R[3] = tmp43_3;
/* inst#44 op:0x02 */
let tmp44_0 = R[16] + R[0];
let tmp44_1 = R[17] + R[1];
let tmp44_2 = R[18] + R[2];
let tmp44_3 = R[19] + R[3];
R[0] = tmp44_0;
R[1] = tmp44_1;
R[2] = tmp44_2;
R[3] = tmp44_3;
/* inst#45 op:0x0a */
let tmp45_0 = Math.min(R[0], C[44]);
let tmp45_1 = Math.min(R[1], C[44]);
let tmp45_2 = Math.min(R[2], C[44]);
let tmp45_3 = Math.min(R[3], C[44]);
R[4] = tmp45_0;
R[5] = tmp45_1;
R[6] = tmp45_2;
R[7] = tmp45_3;
/* inst#46 op:0x0b */
let tmp46_0 = Math.max(V[0], V[3]);
let tmp46_1 = Math.max(V[1], V[3]);
let tmp46_2 = Math.max(V[2], V[3]);
R[0] = tmp46_0;
R[1] = tmp46_1;
R[2] = tmp46_2;
/* inst#47 op:0x12 */
let tmp47_0 = C[41] * R[0] + (1 - C[41]) * V[0];
let tmp47_1 = C[41] * R[1] + (1 - C[41]) * V[1];
let tmp47_2 = C[41] * R[2] + (1 - C[41]) * V[2];
R[8] = tmp47_0;
R[9] = tmp47_1;
R[10] = tmp47_2;
/* inst#48 op:0x01 */
let tmp48_3 = V[3];
R[11] = tmp48_3;
/* inst#49 op:0x05 */
let tmp49_0 = R[4] * R[8];
let tmp49_1 = R[5] * R[9];
let tmp49_2 = R[6] * R[10];
let tmp49_3 = R[7] * R[11];
R[0] = tmp49_0;
R[1] = tmp49_1;
R[2] = tmp49_2;
R[3] = tmp49_3;
/* inst#50 op:0x01 */
let tmp50_0 = R[0];
let tmp50_1 = R[1];
let tmp50_2 = R[2];
let tmp50_3 = R[3];
O[0] = tmp50_0;
O[1] = tmp50_1;
O[2] = tmp50_2;
O[3] = tmp50_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

