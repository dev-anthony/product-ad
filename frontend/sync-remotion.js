const fs = require("fs");
fs.mkdirSync("src/remotion", {recursive: true});
for (const f of ["types.ts", "Ad.tsx", "Scene.tsx"]) {
  fs.copyFileSync(`../server/remotion/${f}`, `src/remotion/${f}`);
}
console.log("Synced remotion files from server");
