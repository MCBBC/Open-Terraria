/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=193, 实指令=42,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorReflective(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#3 op:0x01 */
let tmp3_0 = (-C[4]);
R[0] = tmp3_0;
/* inst#4 op:0x01 */
let tmp4_1 = C[12];
R[1] = tmp4_1;
/* inst#5 op:0x02 */
let tmp5_0 = R[0] + T[0];
let tmp5_1 = R[1] + T[1];
R[0] = tmp5_0;
R[1] = tmp5_1;
/* inst#6 op:0x02 */
let tmp6_0 = T[0] + C[4];
R[4] = tmp6_0;
/* inst#7 op:0x01 */
let tmp7_1 = T[1];
R[5] = tmp7_1;
/* inst#8 op:0x01 */
let tmp8_0 = T[0];
R[8] = tmp8_0;
/* inst#9 op:0x02 */
let tmp9_1 = T[1] + C[0];
R[9] = tmp9_1;
/* inst#10 op:0x01 */
let tmp10_0 = T[0];
R[12] = tmp10_0;
/* inst#11 op:0x02 */
let tmp11_1 = T[1] + (-C[0]);
R[13] = tmp11_1;
/* inst#12 op:0x42 */
SAM[0](R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#13 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#14 op:0x42 */
SAM[0](R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#15 op:0x42 */
SAM[0](R[12], R[13], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#16 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#17 op:0x02 */
let tmp17_0 = R[0] + (-R[4]);
let tmp17_1 = R[1] + (-R[5]);
let tmp17_2 = R[2] + (-R[6]);
R[0] = tmp17_0;
R[1] = tmp17_1;
R[2] = tmp17_2;
/* inst#18 op:0x02 */
let tmp18_3 = R[1] + R[0];
R[11] = tmp18_3;
/* inst#19 op:0x02 */
let tmp19_3 = R[2] + R[11];
R[11] = tmp19_3;
/* inst#20 op:0x05 */
let tmp20_0 = R[11] * C[13];
R[0] = tmp20_0;
/* inst#21 op:0x02 */
let tmp21_0 = (-R[8]) + R[12];
let tmp21_1 = (-R[9]) + R[13];
let tmp21_2 = (-R[10]) + R[14];
R[4] = tmp21_0;
R[5] = tmp21_1;
R[6] = tmp21_2;
/* inst#22 op:0x02 */
let tmp22_3 = R[5] + R[4];
R[3] = tmp22_3;
/* inst#23 op:0x02 */
let tmp23_3 = R[6] + R[3];
R[3] = tmp23_3;
/* inst#24 op:0x05 */
let tmp24_1 = R[3] * C[13];
R[1] = tmp24_1;
/* inst#25 op:0x05 */
let tmp25_3 = R[1] * R[1];
R[3] = tmp25_3;
/* inst#26 op:0x04 */
let tmp26_3 = R[0] * R[0] + R[3];
R[3] = tmp26_3;
/* inst#27 op:0x02 */
let tmp27_3 = (-R[3]) + C[14];
R[3] = tmp27_3;
/* inst#28 op:0x07 */
let tmp28_0 = 1 / Math.sqrt(R[3]);
R[4] = tmp28_0;
/* inst#29 op:0x06 */
let tmp29_0 = 1 / R[4];
R[4] = tmp29_0;
/* inst#30 op:0x58 */
let tmp30_2 = R[3] >= 0 ? R[4] : C[12];
R[2] = tmp30_2;
/* inst#31 op:0x08 */
R[0] = R[0] * C[8] + R[1] * C[9] + R[2] * C[10];
/* inst#32 op:0x02 */
let tmp32_1 = R[0] + C[15];
R[1] = tmp32_1;
/* inst#33 op:0x05 */
let tmp33_1 = R[1] * C[16];
R[1] = tmp33_1;
/* inst#34 op:0x58 */
let tmp34_0 = R[0] >= 0 ? R[1] : C[17];
R[0] = sat(tmp34_0);
/* inst#35 op:0x04 */
let tmp35_1 = R[0] * C[18] + C[19];
R[1] = tmp35_1;
/* inst#36 op:0x05 */
let tmp36_0 = R[0] * R[0];
R[0] = tmp36_0;
/* inst#37 op:0x05 */
let tmp37_0 = R[1] * R[0];
R[0] = tmp37_0;
/* inst#38 op:0x02 */
let tmp38_0 = R[0] + R[0];
R[0] = tmp38_0;
/* inst#39 op:0x05 */
let tmp39_0 = R[0] * R[0];
R[0] = tmp39_0;
/* inst#40 op:0x05 */
let tmp40_0 = R[19] * R[0];
R[0] = tmp40_0;
/* inst#41 op:0x05 */
let tmp41_1 = R[18] * C[20];
let tmp41_2 = R[17] * C[20];
let tmp41_3 = R[16] * C[20];
R[1] = tmp41_1;
R[2] = tmp41_2;
R[3] = tmp41_3;
/* inst#42 op:0x04 */
let tmp42_0 = R[0] * R[16] + R[3];
let tmp42_1 = R[0] * R[17] + R[2];
let tmp42_2 = R[0] * R[18] + R[1];
R[16] = tmp42_0;
R[17] = tmp42_1;
R[18] = tmp42_2;
/* inst#43 op:0x05 */
let tmp43_0 = R[16] * V[0];
let tmp43_1 = R[17] * V[1];
let tmp43_2 = R[18] * V[2];
let tmp43_3 = R[19] * V[3];
R[0] = tmp43_0;
R[1] = tmp43_1;
R[2] = tmp43_2;
R[3] = tmp43_3;
/* inst#44 op:0x01 */
let tmp44_0 = R[0];
let tmp44_1 = R[1];
let tmp44_2 = R[2];
let tmp44_3 = R[3];
O[0] = tmp44_0;
O[1] = tmp44_1;
O[2] = tmp44_2;
O[3] = tmp44_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

