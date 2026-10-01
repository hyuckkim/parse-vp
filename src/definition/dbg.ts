import { collectTypedefs } from "../typedef.js";
import { getHeaderContent, getVisitorContent } from "./file.js";
import { recordAllFields } from "./recordAllFields.js";

const typedefs = collectTypedefs('Community-Patch-DLL');
const header = getHeaderContent('CvRepealProposal', 'Community-Patch-DLL');
console.log('header:', header);
const fields = recordAllFields(header!, { typedefs });
const visitor = getVisitorContent('CvRepealProposal', 'Community-Patch-DLL');
