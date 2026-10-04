import sqlite3 from "sqlite3";
import esMain from "es-main";
import { findMatchingBrace, removeComments } from "../util.js";
import { grepToFile } from "./file.js";

type EnumKind = "OPEN_ENUM" | "CLOSED_ENUM" | "FLAG_ENUM";

interface EnumMember {
    name: string;
    value?: EnumValue;
    isMeta: boolean;
}
type EnumValue =
| {
resolved: true;
value: number;
}
| {
resolved: false;
expression: string;
};

interface EnumInfo {
    name: string;
    kind: EnumKind;
    members: EnumMember[];
}

export interface EnumDefinition {
    length: number;
    fields: Record<string, number | string>;
}

function all(
    db: sqlite3.Database,
    sql: string
): Promise<any[]> {
    return new Promise((resolve, reject) => {
        db.all(sql, (err: Error | null, rows: any[]) => {
            if (err !== null) {
                reject(err);
                return;
            }

            resolve(rows);
        });
    });
}

function getCount(
    db: sqlite3.Database,
    table: string
): Promise<number> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) AS count FROM "${table}"`,
            (err: Error | null, row: { count: number } | undefined) => {
                if (err !== null) {
                    reject(err);
                    return;
                }

                if (row === undefined) {
                    reject(new Error(`No COUNT result for table: ${table}`));
                    return;
                }

                resolve(row.count);
            }
        );
    });
}

async function getTableNames(
    db: sqlite3.Database
): Promise<string[]> {
    const rows = await all(
        db,
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        `
    );

    return rows.map(row => row.name as string);
}

function openDB(
    dbPath: string
): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(
            dbPath,
            (err: Error | null) => {
                if (err !== null) {
                    reject(err);
                    return;
                }

                resolve(database);
            }
        );
    });
}

function enumToTableName(enumName: string): string {
    // Enum 이름의 Type/Types suffix 제거
    if (enumName.endsWith("Types")) {
        return pluralize(
            enumName.slice(0, -"Types".length)
        );
    }

    if (enumName.endsWith("Type")) {
        return pluralize(
            enumName.slice(0, -"Type".length)
        );
    }

    // 이미 복수형으로 보이는 이름은 그대로
    if (
        enumName.endsWith("s") ||
        enumName.endsWith("x") ||
        enumName.endsWith("z") ||
        enumName.endsWith("ch") ||
        enumName.endsWith("sh")
    ) {
        return enumName;
    }

    // 그 외에는 enum 이름 자체를 복수화
    return pluralize(enumName);
}

function pluralize(name: string): string {
    // consonant + y
    // Strategy -> Strategies
    if (/[^aeiou]y$/i.test(name)) {
        return name.slice(0, -1) + "ies";
    }

    // s, x, z, ch, sh
    // Class -> Classes
    // Box -> Boxes
    // Match -> Matches
    // Brush -> Brushes
    if (/(?:s|x|z|ch|sh)$/i.test(name)) {
        return name + "es";
    }

    return name + "s";
}

function parseNumber(
    value: string
): number | undefined {
    const trimmed = value.trim();

    if (trimmed === "") {
        return undefined;
    }

    // hexadecimal
    if (/^-?0x[0-9a-f]+$/i.test(trimmed)) {
        const negative = trimmed.startsWith("-");
        const hex = negative ? trimmed.slice(1) : trimmed;

        const parsed = parseInt(hex, 16);

        return negative ? -parsed : parsed;
    }

    // decimal
    if (/^-?\d+$/.test(trimmed)) {
        return Number(trimmed);
    }

    return undefined;
}
function evaluateExpression(
    expression: string,
    symbols: Map<string, EnumValue>
): EnumValue | undefined {
    const trimmed = expression.trim();

    if (trimmed === "") {
        return undefined;
    }

    const direct = parseNumber(trimmed);

    if (direct !== undefined) {
        return { resolved: true, value: direct };
    }

    const symbol = symbols.get(trimmed);

    if (symbol !== undefined) {
        return symbol;
    }

    let expressionForJS = trimmed;

    for (const [name, value] of symbols) {
        if (!value.resolved) {
            continue;
        }

        expressionForJS = expressionForJS.replace(
            new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"),
            String(value.value)
        );
    }

    if (!/^[0-9a-fxXA-F+\-*/%<>&|^~() \t]+$/.test(expressionForJS)) {
        return { resolved: false, expression: trimmed };
    }

    try {
        const result = Function(
            `"use strict"; return (${expressionForJS});`
        )();

        if (typeof result === "number" && Number.isFinite(result)) {
            return { resolved: true, value: result };
        }
    } catch {
        // ignore
    }

    return { resolved: false, expression: trimmed };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseEnums(
    source: string
): EnumInfo[] {
    const cleaned = removeComments(source);

    const enums: EnumInfo[] = [];
    const symbols = new Map<string, EnumValue>();

    const enumRegex =
        /\benum\s+(?:(OPEN_ENUM|CLOSED_ENUM|FLAG_ENUM)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;

    let match: RegExpExecArray | null;

    while ((match = enumRegex.exec(cleaned)) !== null) {
        const kind =
            (match[1] as EnumKind | undefined) ??
            "CLOSED_ENUM";

        const name = match[2];

        if (name === undefined) {
            continue;
        }

        const braceStart = enumRegex.lastIndex - 1;
        const braceEnd = findMatchingBrace(cleaned, braceStart);

        if (braceEnd < 0) {
            console.warn(
                `[WARN] Cannot find closing brace for enum ${name}`
            );
            continue;
        }

        const body = cleaned.slice(
            braceStart + 1,
            braceEnd
        );

        const members: EnumMember[] = [];

        let currentValue = -1;

        for (const rawPart of body.split(",")) {
            const part = rawPart.trim();

            if (part === "") {
                continue;
            }

            const memberMatch =
                /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*(.*))?$/.exec(part);

            if (memberMatch === null) {
                continue;
            }

            const memberName = memberMatch[1];

            if (memberName === undefined) {
                continue;
            }

            const expression = memberMatch[2];

            const isMeta =
                /\bENUM_META_VALUE\b/.test(part);

            let value: EnumValue | undefined;

            if (expression !== undefined) {
                let v = evaluateExpression(
                    expression,
                    symbols
                );
                if (expression !== undefined) {
                    value = evaluateExpression(
                        expression,
                        symbols
                    );
                }
            } else {
                currentValue++;
                value = { resolved: true, value: currentValue };
            }

            const member: EnumMember = {
                name: memberName,
                isMeta
            };

            if (value !== undefined) {
                member.value = value;
            }

            members.push(member);

            if (
                value !== undefined &&
                !isMeta
            ) {
                symbols.set(
                    memberName,
                    value
                );
            }
        }

        enums.push({
            name,
            kind,
            members
        });

        enumRegex.lastIndex = braceEnd + 1;
    }

    return enums;
}

function getClosedEnumLength(
    enumInfo: EnumInfo
): number {
    const meta = enumInfo.members.find(
        member => member.isMeta
    );

    if (
        meta !== undefined &&
        meta.value !== undefined &&
        meta.value.resolved
    ) {
        return meta.value.value;
    }

    /*
     * Hash-based CLOSED_ENUMs such as AutomateTypes don't have
     * ENUM_META_VALUE. Keep the existing fallback behavior:
     * maximum enum value + 1.
     *
     * These values are not necessarily meaningful lengths,
     * but such enums aren't iterated by length.
     */
    const values = enumInfo.members
        .filter(
            member =>
                !member.isMeta &&
                member.value !== undefined
        )
        .map(member => member.value as EnumValue)
        .filter((value): value is { resolved: true, value: number } => value.resolved)
        .map(value => value.value);

    if (values.length === 0) {
        return 0;
    }

    return Math.max(...values) + 1;
}

function getEnumFields(
    enumInfo: EnumInfo
): Record<string, string | number> {
    const fields: Record<string, string | number> = {};

    for (const member of enumInfo.members) {
        /*
         * ENUM_META_VALUE is not a real enum field.
         */
        if (member.isMeta) {
            continue;
        }

        /*
         * Don't emit fields whose value could not be resolved.
         */
        if (member.value === undefined) {
            continue;
        }

        fields[member.name] = member.value.resolved
            ? member.value.value
            : member.value.expression;
    }

    return fields;
}

async function buildEnumDefinitions(
    enums: EnumInfo[],
    db: sqlite3.Database,
    tableNames: string[]
): Promise<Record<string, EnumDefinition>> {
    const result: Record<string, EnumDefinition> = {};
    const tableSet = new Set(tableNames);

    for (const enumInfo of enums) {
        const tableName =
            enumToTableName(enumInfo.name);

        let length: number;

        if (enumInfo.kind === "OPEN_ENUM") {
            if (tableSet.has(tableName)) {

                length = await getCount(
                    db,
                    tableName
                );
            } else length = getClosedEnumLength(
                enumInfo
            );
        } else {
            /*
             * CLOSED_ENUM / FLAG_ENUM:
             * length comes from the enum itself.
             */
            length = getClosedEnumLength(
                enumInfo
            );
        }

        result[enumInfo.name] = {
            length,
            fields: getEnumFields(enumInfo)
        };
    }

    return result;
}

export async function getEnums(
    dbPath: string,
    enumPath: string
): Promise<Record<string, EnumDefinition>> {
    const db = await openDB(dbPath);

    try {
        const enumRegex =
            /\benum\s+(?:(OPEN_ENUM|CLOSED_ENUM|FLAG_ENUM)\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\{/;

        const files = grepToFile(
            enumRegex,
            enumPath,
            [".cpp", ".h"]
        );

        const enums = files.flatMap(
            source => parseEnums(source)
        );

        const tables = await getTableNames(db);

        return await buildEnumDefinitions(
            enums,
            db,
            tables
        );
    } finally {
        await new Promise<void>(
            resolve => {
                db.close(() => resolve());
            }
        );
    }
}

if (esMain(import.meta)) {
    const dbPath = process.argv[2];
    const enumPath = process.argv[3];

    if (dbPath === undefined || enumPath === undefined) {
        throw new Error(
            "Usage: getEnums <dbPath> <enumPath>"
        );
    }

    const result = await getEnums(
        dbPath,
        enumPath
    );

    console.log(
        JSON.stringify(
            result,
            null,
            2
        )
    );
}