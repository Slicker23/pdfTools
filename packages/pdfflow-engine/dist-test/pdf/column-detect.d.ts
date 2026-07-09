/** Column detection shared by browser layout extract and server worker. */
export interface TextSpanBounds {
    x: number;
    width: number;
    y?: number;
    height?: number;
}
export interface ColumnAnalysis {
    splitX: number;
    leftWidthPct: number;
    leftCount: number;
    rightCount: number;
}
/** Find the gutter between two text columns from span positions. */
export declare function findColumnSplitX(spans: TextSpanBounds[], pageWidth: number): number | null;
export declare function analyzeColumns(spans: TextSpanBounds[], pageWidth: number): ColumnAnalysis | null;
//# sourceMappingURL=column-detect.d.ts.map