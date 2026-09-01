/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=138, 实指令=28,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorNebula(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x05 */
let tmp3_0 = T[0] * C[0];
let tmp3_1 = T[1] * C[1];
R[4] = tmp3_0;
R[5] = tmp3_1;
/* inst#4 op:0x13 */
let tmp4_2 = R[5] - Math.floor(R[5]);
let tmp4_3 = R[4] - Math.floor(R[4]);
R[6] = tmp4_2;
R[7] = tmp4_3;
/* inst#5 op:0x02 */
let tmp5_0 = R[4] + (-R[7]);
let tmp5_1 = R[5] + (-R[6]);
R[4] = tmp5_0;
R[5] = tmp5_1;
/* inst#6 op:0x01 */
let tmp6_0 = C[4];
let tmp6_1 = C[5];
R[8] = tmp6_0;
R[9] = tmp6_1;
/* inst#7 op:0x04 */
let tmp7_0 = R[4] * R[8] + (-C[8]);
let tmp7_1 = R[5] * R[9] + (-C[9]);
R[4] = tmp7_0;
R[5] = tmp7_1;
/* inst#8 op:0x01 */
let tmp8_1 = C[13];
R[9] = tmp8_1;
/* inst#9 op:0x04 */
let tmp9_1 = R[5] * R[9] + C[28];
R[5] = tmp9_1;
/* inst#10 op:0x05 */
let tmp10_0 = R[4] * C[12];
R[4] = tmp10_0;
/* inst#11 op:0x02 */
let tmp11_0 = R[4] + R[4];
R[4] = tmp11_0;
/* inst#12 op:0x05 */
let tmp12_1 = R[5] * C[33];
R[9] = tmp12_1;
/* inst#13 op:0x02 */
let tmp13_1 = R[1] + R[0];
R[5] = tmp13_1;
/* inst#14 op:0x02 */
let tmp14_1 = R[2] + R[5];
R[5] = tmp14_1;
/* inst#15 op:0x05 */
let tmp15_1 = R[5] * C[32];
R[5] = tmp15_1;
/* inst#16 op:0x04 */
let tmp16_0 = R[5] * C[4] + R[4];
R[8] = tmp16_0;
/* inst#17 op:0x42 */
SAM[1](R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#18 op:0x02 */
let tmp18_0 = R[8] + C[34];
R[4] = tmp18_0;
/* inst#19 op:0x05 */
let tmp19_2 = R[5] * R[4];
R[6] = tmp19_2;
/* inst#20 op:0x04 */
let tmp20_0 = C[16] * R[5] + (-R[0]);
let tmp20_1 = C[17] * R[5] + (-R[1]);
let tmp20_2 = C[18] * R[5] + (-R[2]);
R[8] = tmp20_0;
R[9] = tmp20_1;
R[10] = tmp20_2;
/* inst#21 op:0x04 */
let tmp21_0 = C[24] * R[8] + R[0];
let tmp21_1 = C[24] * R[9] + R[1];
let tmp21_2 = C[24] * R[10] + R[2];
R[0] = tmp21_0;
R[1] = tmp21_1;
R[2] = tmp21_2;
/* inst#22 op:0x05 */
let tmp22_1 = R[6] * C[35];
R[5] = tmp22_1;
/* inst#23 op:0x05 */
let tmp23_1 = R[5] * C[22];
let tmp23_2 = R[5] * C[21];
let tmp23_3 = R[5] * C[20];
R[5] = tmp23_1;
R[6] = tmp23_2;
R[7] = tmp23_3;
/* inst#24 op:0x58 */
let tmp24_0 = R[4] >= 0 ? R[7] : C[36];
let tmp24_1 = R[4] >= 0 ? R[6] : C[36];
let tmp24_2 = R[4] >= 0 ? R[5] : C[36];
R[4] = tmp24_0;
R[5] = tmp24_1;
R[6] = tmp24_2;
/* inst#25 op:0x02 */
let tmp25_0 = R[0] + R[4];
let tmp25_1 = R[1] + R[5];
let tmp25_2 = R[2] + R[6];
R[4] = tmp25_0;
R[5] = tmp25_1;
R[6] = tmp25_2;
/* inst#26 op:0x01 */
let tmp26_3 = C[37];
R[7] = tmp26_3;
/* inst#27 op:0x05 */
let tmp27_0 = R[3] * R[4];
let tmp27_1 = R[3] * R[5];
let tmp27_2 = R[3] * R[6];
let tmp27_3 = R[3] * R[7];
R[0] = tmp27_0;
R[1] = tmp27_1;
R[2] = tmp27_2;
R[3] = tmp27_3;
/* inst#28 op:0x05 */
let tmp28_0 = R[0] * V[0];
let tmp28_1 = R[1] * V[1];
let tmp28_2 = R[2] * V[2];
let tmp28_3 = R[3] * V[3];
R[0] = tmp28_0;
R[1] = tmp28_1;
R[2] = tmp28_2;
R[3] = tmp28_3;
/* inst#29 op:0x01 */
let tmp29_0 = R[0];
let tmp29_1 = R[1];
let tmp29_2 = R[2];
let tmp29_3 = R[3];
O[0] = tmp29_0;
O[1] = tmp29_1;
O[2] = tmp29_2;
O[3] = tmp29_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

