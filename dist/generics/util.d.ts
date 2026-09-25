export declare let offset: number;
export declare let stopped: boolean;
export declare let data: Buffer;
export declare function Init(input: string): void;
export declare function readBytes(size: number): Buffer<ArrayBufferLike>;
export declare function readString(): string;
export declare function Stop(err?: string): null;
export declare function readContainerCount(): {
    offset: number;
    size: number;
    count: number;
    data: string;
};
export declare function typeArgs(type: {
    name: string;
    args: any[];
} | string): any[];
export declare function typeToString(type: {
    name: string;
    args: any[];
} | string): string;
export declare function typeName(type: {
    name: string;
    args: any[];
} | string): string | null;
//# sourceMappingURL=util.d.ts.map