import { Jimp } from "jimp";
import * as fs from "fs";
import * as path from "path";

const buf = fs.readFileSync(
  path.join(process.cwd(), "..", "frontend", "public", "Sized-front-id.jpeg"),
);
const img = await Jimp.read(buf);
console.log("Before:", img.getWidth(), "x", img.getHeight());
const rotated = img.rotate(90);
console.log("After:", rotated.getWidth(), "x", rotated.getHeight());
const out = await rotated.getBufferAsync(Jimp.MIME_JPEG);
fs.writeFileSync("/tmp/rotated-front.jpeg", out);
console.log("Wrote /tmp/rotated-front.jpeg");
