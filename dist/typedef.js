import esMain from 'es-main';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
const src = process.argv[2];
if (!src) {
    console.error('Usage: node typedef.js <source-directory>');
    process.exit(1);
}
const outputPath = join(__dirname, 'typedef.json');
function collectTypedefs(dir) {
    const typedefs = {};
    walk(dir, typedefs);
    return typedefs;
}
function walk(dir, typedefs) {
    const entries = readdirSync(dir, {
        withFileTypes: true
    });
    for (const entry of entries) {
        const filePath = join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(filePath, typedefs);
            continue;
        }
        if (!entry.isFile())
            continue;
        const ext = extname(entry.name).toLowerCase();
        if (ext !== '.h' && ext !== '.cpp') {
            continue;
        }
        const content = readFileSync(filePath, 'utf8');
        extractTypedefs(content, typedefs);
    }
}
function extractTypedefs(content, typedefs) {
    content = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    const re = /\btypedef[ \t]+([^;\r\n]+?)[ \t]*([A-Za-z_]\w*)[ \t]*;/g;
    let match;
    while ((match = re.exec(content)) !== null) {
        if (!match[1] || !match[2]) {
            continue;
        }
        const type = match[1].trim();
        const name = match[2];
        typedefs[name] = type;
    }
}
if (esMain(import.meta)) {
    const typedefs = collectTypedefs(src);
    writeFileSync(outputPath, JSON.stringify(typedefs, null, 2), 'utf8');
    console.log(`Found ${Object.keys(typedefs).length} typedefs.`);
    console.log(`Written to ${outputPath}`);
}
//# sourceMappingURL=typedef.js.map