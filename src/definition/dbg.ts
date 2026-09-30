import { collectTypedefs } from "../typedef.js";
import { getHeaderContent, getVisitorContent } from "./file.js";
import { recordAllFields } from "./recordAllFields.js";

const typedefs = collectTypedefs('Community-Patch-DLL');
const header = getHeaderContent('PlotExtraYield', 'Community-Patch-DLL');
const fields = recordAllFields(header!, { typedefs });
const visitor = getVisitorContent('PlotExtraYield', 'Community-Patch-DLL');

console.log('visitor:', visitor);