export declare class PdfToolError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
export declare function isPdfToolError(error: unknown): error is PdfToolError;
export declare function toUserMessage(error: unknown): string;
export declare function loadPdfBytes(file: File): Promise<ArrayBuffer>;
//# sourceMappingURL=errors.d.ts.map