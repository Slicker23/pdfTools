import { type CosDict } from "../cos/types";
export interface SecurityHandler {
    /**
     * When false, the document's /Metadata stream is stored unencrypted and must
     * NOT be run through {@link decrypt} (doing so would corrupt it).
     */
    readonly encryptMetadata: boolean;
    decrypt(data: Uint8Array, num: number, gen: number, isStringField: boolean): Uint8Array;
}
export interface SecurityParams {
    encrypt: CosDict;
    idFirst: Uint8Array | undefined;
    password: Uint8Array;
}
export declare function createStandardSecurityHandler(params: SecurityParams): SecurityHandler;
//# sourceMappingURL=standard-security.d.ts.map