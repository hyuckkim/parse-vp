import { type DefinitionType } from '../magicnumber.js';
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
export declare function typeArgs(type: DefinitionType | string): any[];
export declare function typeToString(type: DefinitionType): string;
export declare function typeName(type: DefinitionType): string | null;
//# sourceMappingURL=util.d.ts.map