import { Jimp } from "jimp";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const buf = fs.readFileSync(
    path.join(process.cwd(), "..", "frontend", "public", "Sized-front-id.jpeg"),
  );
  const img = await Jimp.read(buf);
  console.log("Before:", img.bitmap.width, "x", img.bitmap.height);
  const rotated = img.rotate(90);
  console.log("After:", rotated.bitmap.width, "x", rotated.bitmap.height);
  const out = await rotated.getBuffer("image/jpeg");
  fs.writeFileSync("/tmp/rotated-front.jpeg", out);
  console.log("Wrote /tmp/rotated-front.jpeg");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
