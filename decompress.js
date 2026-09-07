const fs = require("fs");
const zlib = require("zlib");

const input = process.argv[2];
const output = process.argv[3] || input + ".decompressed.bin";

const data = fs.readFileSync(input);

const zlibPos = data.indexOf(Buffer.from([0x78, 0x9c]));

if (zlibPos === -1) {
    throw new Error("zlib stream not found");
}

console.log(`zlib offset: 0x${zlibPos.toString(16)}`);
console.log(`input size : ${data.length}`);

const compressed = data.subarray(zlibPos);

const result = zlib.inflateSync(compressed, {
    finishFlush: zlib.constants.Z_SYNC_FLUSH
});

fs.writeFileSync(output, result);

console.log(`output size: ${result.length}`);
console.log(`output file: ${output}`);