const minimum = [22, 23, 2];
const actual = process.versions.node.split(".").map((part) => Number.parseInt(part, 10));
let supported = true;
for (let index = 0; index < minimum.length; index += 1) {
  if (actual[index] === minimum[index]) continue;
  supported = actual[index] > minimum[index];
  break;
}

if (!supported) {
  console.error(`Node.js ${minimum.join(".")} or newer is required; found ${process.versions.node}.`);
  process.exitCode = 1;
}
