import { collectTypedefs } from "../typedef.js";
import { getHeaderContent, getVisitorContent } from "./file.js";
import { recordAllFields } from "./recordAllFields.js";
import { searchDefinition } from "./index.js";
const typedefs = collectTypedefs('Community-Patch-DLL');
const visitor = getVisitorContent('CvPlot', 'Community-Patch-DLL');

const header = getHeaderContent('CvPlot', 'Community-Patch-DLL');
const fields = recordAllFields(header!, { typedefs });

/*
let braceCount = 0;
for (const l of visitor?.split('\n')?.map(s => s.trim()) ?? []) {
    if (l.includes('{')) braceCount++;
    if (l.includes('}')) braceCount--;

    console.log(braceCount, l);
}
*/

searchDefinition('CvPlot', 'Community-Patch-DLL');
