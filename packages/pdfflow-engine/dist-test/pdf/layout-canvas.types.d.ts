export interface LayoutCanvas {
    width: number;
    height: number;
    getContext(contextId: "2d"): CanvasRenderingContext2D | null;
    asRenderTarget(): HTMLCanvasElement;
    toPngBytes(): Promise<Uint8Array>;
}
export type CreateLayoutCanvas = (width: number, height: number) => Promise<LayoutCanvas>;
//# sourceMappingURL=layout-canvas.types.d.ts.map