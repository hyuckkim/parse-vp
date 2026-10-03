import { collectTypedefs } from "../typedef.js";
import { getHeaderContent, getVisitorContent, grepToFile, splitCppFunc, splitCppOperator } from "./file.js";
import { recordAllFields } from "./recordAllFields.js";

const typedefs = collectTypedefs('Community-Patch-DLL');
const visitor = getVisitorContent('IDInfo', 'Community-Patch-DLL');

const header = getHeaderContent('IDInfo', 'Community-Patch-DLL');
const fields = recordAllFields(header!, { typedefs });
console.log('visitor', visitor);
console.log('fields', fields);


// function escapeRegExp(value: string): string {
//     return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// }

// console.log(((typename: string) => {
//     return grepToFile(new RegExp(`\\b${escapeRegExp(typename)}::Serialize\\b`), 'Community-Patch-DLL', ['.cpp', '.h'])
//         .map(file => splitCppFunc(`${typename}::Serialize`, file));
// })('IDInfo'));

// console.log(((typename: string) => {
//     return grepToFile(new RegExp(`\\boperator\\s*<<\\s*\\(` +
//         `[^,]+,\\s*` +
//         `(?:const\\s+)?${escapeRegExp(typename)}\\s*&?\\s+\\w+` +
//         `\\s*\\)`), 'Community-Patch-DLL', ['.cpp', '.h'])
//         .map(file => splitCppOperator(typename, file));
// })('IDInfo'));
