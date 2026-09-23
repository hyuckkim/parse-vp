export function removeComments(src: string) {
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

export function findMatchingBrace(src: string, openPos: number) {
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