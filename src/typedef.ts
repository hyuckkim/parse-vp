import { readdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';

export function collectTypedefs(dir: string): Record<string, string> {
  const typedefs = {};

  walk(dir, typedefs);

  return typedefs;
}

function walk(dir: string, typedefs: Record<string, string>) {
  const entries = readdirSync(dir, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const filePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(filePath, typedefs);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();

    if (ext !== '.h' && ext !== '.cpp') {
      continue;
    }

    const content = readFileSync(filePath, 'utf8');

    extractTypedefs(content, typedefs);
  }
}

function extractTypedefs(content: string, typedefs: Record<string, string>) {
  content = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const re =
    /\btypedef[ \t]+([^;\r\n]+?)[ \t]*([A-Za-z_]\w*)[ \t]*;/g;

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
