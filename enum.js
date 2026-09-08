'use strict';

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
    console.error('Usage: node parse-enums.js <CvEnums.h> [enum.json]');
    process.exit(1);
}

const inputPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(
    process.argv[3] || path.join(path.dirname(inputPath), 'enum.json')
);

const source = fs.readFileSync(inputPath, 'utf8');


// ------------------------------------------------------------
// Remove C/C++ comments while preserving strings.
// ------------------------------------------------------------

function removeComments(src) {
    let out = '';
    let i = 0;

    while (i < src.length) {
        // // comment
        if (src[i] === '/' && src[i + 1] === '/') {
            i += 2;

            while (i < src.length && src[i] !== '\n') {
                i++;
            }

            if (i < src.length) {
                out += '\n';
                i++;
            }

            continue;
        }

        // /* comment */
        if (src[i] === '/' && src[i + 1] === '*') {
            i += 2;

            while (i < src.length) {
                if (src[i] === '*' && src[i + 1] === '/') {
                    i += 2;
                    break;
                }

                if (src[i] === '\n') {
                    out += '\n';
                }

                i++;
            }

            continue;
        }

        // String / character literal
        if (src[i] === '"' || src[i] === "'") {
            const quote = src[i];
            out += src[i++];
            
            while (i < src.length) {
                const c = src[i];
                out += c;
                i++;

                if (c === '\\' && i < src.length) {
                    out += src[i++];
                    continue;
                }

                if (c === quote) {
                    break;
                }
            }

            continue;
        }

        out += src[i++];
    }

    return out;
}


// ------------------------------------------------------------
// Find matching brace.
// ------------------------------------------------------------

function findMatchingBrace(src, openPos) {
    let depth = 0;

    for (let i = openPos; i < src.length; i++) {
        if (src[i] === '{') {
            depth++;
        } else if (src[i] === '}') {
            depth--;

            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}


// ------------------------------------------------------------
// Split enum body by commas.
// Parentheses are respected:
//
// A,
// B = (1 << 3),
// C = func(A, B),
// ------------------------------------------------------------

function splitEnumMembers(body) {
    const result = [];

    let start = 0;
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;

    for (let i = 0; i < body.length; i++) {
        switch (body[i]) {
            case '(':
                parenDepth++;
                break;

            case ')':
                parenDepth--;
                break;

            case '[':
                bracketDepth++;
                break;

            case ']':
                bracketDepth--;
                break;

            case '{':
                braceDepth++;
                break;

            case '}':
                braceDepth--;
                break;

            case ',':
                if (
                    parenDepth === 0 &&
                    bracketDepth === 0 &&
                    braceDepth === 0
                ) {
                    result.push(body.slice(start, i));
                    start = i + 1;
                }
                break;
        }
    }

    const last = body.slice(start);

    if (last.trim()) {
        result.push(last);
    }

    return result;
}


// ------------------------------------------------------------
// Parse integer expressions.
//
// Supports things commonly found in CvEnums.h:
//
//   -1
//   0x1234
//   1 << 3
//   A
//   A + 1
//   (1 << A)
//   A | B
//   A & B
//   A ^ B
//   ~A
//   A * 2
//   A - 1
//
// Identifiers are resolved from already-known enum values and
// known preprocessor constants.
// ------------------------------------------------------------

function evaluateExpression(expr, symbols) {
    expr = expr.trim();

    if (!expr) {
        return null;
    }

    // Remove C/C++ integer suffixes.
    expr = expr.replace(
        /\b(0[xX][0-9a-fA-F]+|\d+)(ULL|LLU|UL|LU|LL|L|U)\b/g,
        '$1'
    );

    // Strip C-style casts that are useful for integer expressions.
    expr = expr.replace(
        /\(\s*(?:unsigned\s+)?(?:long\s+long|long|int|short|char|size_t)\s*\)/g,
        ''
    );

    // Replace known identifiers.
    expr = expr.replace(
        /\b[A-Za-z_][A-Za-z0-9_]*\b/g,
        function(name) {
            if (Object.prototype.hasOwnProperty.call(symbols, name)) {
                return String(symbols[name]);
            }

            return name;
        }
    );

    // Only allow integer-expression syntax.
    if (!/^[0-9a-fA-FxX\s()+\-*/%<>&|^~!?:]+$/.test(expr)) {
        return null;
    }

    // Reject things that are not simple integer expressions.
    if (expr.includes('?') || expr.includes(':')) {
        return null;
    }

    try {
        // Use JS integer operators.
        //
        // The enum values in this header are fundamentally integer
        // constants. Bitwise operations are intentionally supported.
        const value = Function(
            '"use strict"; return (' + expr + ');'
        )();

        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            !Number.isInteger(value)
        ) {
            return null;
        }

        return value;
    } catch (e) {
        return null;
    }
}


// ------------------------------------------------------------
// Extract simple #define integer constants.
// ------------------------------------------------------------

function parseDefines(src, symbols) {
    const defineRegex =
        /^[ \t]*#define[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]+(.+)$/gm;

    let match;

    while ((match = defineRegex.exec(src)) !== null) {
        const name = match[1];
        let value = match[2].trim();

        // Ignore function-like macros.
        if (name.includes('(')) {
            continue;
        }

        // Remove trailing comments.
        value = value.replace(/\/\/.*$/, '').trim();

        const evaluated = evaluateExpression(value, symbols);

        if (evaluated !== null) {
            symbols[name] = evaluated;
        }
    }
}


// ------------------------------------------------------------
// Parse one enum.
// ------------------------------------------------------------

function parseEnum(kind, enumName, body, symbols, options) {
    const members = {};
    const parts = splitEnumMembers(body);

    let currentValue = -1;
    let haveCurrentValue = false;

    for (const rawPart of parts) {
        let part = rawPart.trim();

        if (!part) {
            continue;
        }

        // Ignore preprocessor directives.
        if (part.startsWith('#')) {
            continue;
        }

        // Remove trailing semicolon.
        part = part.replace(/;\s*$/, '').trim();

        if (!part) {
            continue;
        }

        // ENUM_META_VALUE means this is a metadata/count member.
        const isMeta = /\bENUM_META_VALUE\b/.test(part);

        if (isMeta && !options.keepMeta) {
            continue;
        }

        // NAME = expression
        //
        // Do not split on '=' inside parentheses unnecessarily.
        const equalPos = part.indexOf('=');

        let name;
        let expression = null;

        if (equalPos >= 0) {
            name = part.slice(0, equalPos).trim();
            expression = part.slice(equalPos + 1).trim();
        } else {
            name = part.trim();
        }

        // Remove anything accidentally attached after the identifier.
        const nameMatch =
            /^([A-Za-z_][A-Za-z0-9_]*)/.exec(name);

        if (!nameMatch) {
            continue;
        }

        name = nameMatch[1];

        let value;

        if (expression !== null) {
            value = evaluateExpression(expression, symbols);

            if (value === null) {
                console.warn(
                    `[WARN] Cannot evaluate ${enumName}::${name} = ${expression}`
                );

                // We cannot safely calculate following implicit values.
                haveCurrentValue = false;
                continue;
            }
        } else {
            if (!haveCurrentValue) {
                value = 0;
            } else {
                value = currentValue + 1;
            }
        }

        members[name] = value;

        currentValue = value;
        haveCurrentValue = true;

        // Make enum members available to later expressions.
        symbols[name] = value;
    }

    return members;
}


// ------------------------------------------------------------
// Main parser.
// ------------------------------------------------------------

function parseEnums(src, options) {
    const clean = removeComments(src);

    const symbols = {};

    // Parse integer #defines first.
    parseDefines(clean, symbols);

    const enums = {};

    //
    // Matches:
    //
    // enum Foo
    // enum OPEN_ENUM Foo
    // enum CLOSED_ENUM Foo
    // enum CLOSED_ENUM FLAG_ENUM Foo
    //
    const enumRegex =
        /\benum\s+(?:(?:OPEN_ENUM|CLOSED_ENUM|FLAG_ENUM)\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;

    let match;

    while ((match = enumRegex.exec(clean)) !== null) {
        const enumName = match[1];
        const openBrace = clean.indexOf('{', match.index);

        const closeBrace = findMatchingBrace(clean, openBrace);

        if (closeBrace < 0) {
            console.warn(
                `[WARN] Unclosed enum: ${enumName}`
            );
            continue;
        }

        const body = clean.slice(
            openBrace + 1,
            closeBrace
        );

        const members = parseEnum(
            null,
            enumName,
            body,
            symbols,
            options
        );

        enums[enumName] = members;

        // Continue searching after this enum.
        enumRegex.lastIndex = closeBrace + 1;
    }

    return enums;
}


// ------------------------------------------------------------
// Run
// ------------------------------------------------------------

const options = {
    // ENUM_META_VALUE members such as NUM_UNITAI_TYPES are normally
    // not useful for binary decoding.
    keepMeta: false
};

const enums = parseEnums(source, options);

fs.writeFileSync(
    outputPath,
    JSON.stringify(enums, null, 2),
    'utf8'
);

console.log(
    `Parsed ${Object.keys(enums).length} enums`
);

console.log(
    `Written: ${outputPath}`
);