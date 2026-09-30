import { readdirSync, readFileSync } from "fs";
import { extname, join } from "path";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** find file that includes keyword and return full file to string*/
export function grepToFile(
    keyword: string | RegExp,
    src: string,
    opt = [".cpp", ".h"]
): string[] {
    const results: string[] = [];

    const entries = readdirSync(src, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        const filePath = join(src, entry.name);

        if (entry.isDirectory()) {
            results.push(
                ...grepToFile(keyword, filePath, opt)
            );
            continue;
        }

        if (!entry.isFile()) continue;

        const ext = extname(entry.name);
        if (!opt.includes(ext)) continue;

        const content = readFileSync(filePath, "utf8");

        if (
            (typeof keyword === "string" &&
                content.includes(keyword)) ||
            (keyword instanceof RegExp &&
                keyword.test(content))
        ) {
            results.push(content);
        }
    }

    return results;
}

function extractBraces(str: string, start: number): string | null {
    let depth = 0;
    for (let i = start; i < str.length; i++) {
        if (str[i] === '{') {
            depth++;
        } else if (str[i] === '}') {
            depth--;
            if (depth === 0) {
                return str.slice(start, i + 1);
            }
        }
    }
    return null;
}
function splitCppFunc(func: string, str: string): string | null {
  const start = str.indexOf(func);

  if (start === -1) {
    return null;
  }

  const braceStart = str.indexOf('{', start);

  if (braceStart === -1) {
    return null;
  }
  return extractBraces(str, braceStart);
}
function splitCppType(typeName: string, str: string): string | null {
  const start = str.search(
    new RegExp(
      `\\b(?:class|struct)\\s+${escapeRegExp(typeName)}\\b\\s*(?:\\n\\s*)?\\{`
    )
  );

  if (start === -1) {
    return null;
  }

  const braceStart = str.indexOf('{', start);
  return extractBraces(str, braceStart);
}

export function getHeaderContent(typeName: string, src: string): string | null {
  const file = grepToFile(
    new RegExp(
      `\\b(?:class|struct)\\s+${escapeRegExp(typeName)}\\b\\s*(?:\\n\\s*)?\\{`
    ),
    src,
    ['.cpp', '.h']
  );

  if (file.length < 1) return null;

  return splitCppType(typeName, file[0]!);
}
export function getVisitorContent(typeName: string, src: string): string | null {
    const file = grepToFile(
        new RegExp(`\\b${escapeRegExp(typeName)}::Serialize\\b`),
        src,
        ['.cpp', '.h']
    );
    if (file.length < 1) return null;
    return splitCppFunc(`${typeName}::Serialize`, file[0]!);
}
