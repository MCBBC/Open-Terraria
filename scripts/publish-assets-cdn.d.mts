// publish-assets-cdn.mjs 类型声明(先例 l10n-merge.d.mts;纯函数面,CLI 不入测)
export interface CdnPlanPart {
  file: string;
  zipBytes: number;
  pkg: string;
  ver: string;
  npmmirrorUrl: string;
  jsDelivrUrl: string;
}
export declare function pkgName(scope: string, file: string): string;
export declare function npmVersion(file: string): string;
export declare function npmmirrorFileUrl(pkg: string, ver: string, file: string): string;
export declare function jsDelivrFileUrl(pkg: string, ver: string, file: string): string;
export declare function derivePlan(manifest: { parts: Array<{ file: string; zipBytes: number }> }, scope: string): CdnPlanPart[];
