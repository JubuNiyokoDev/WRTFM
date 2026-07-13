import { createBurundiOCR } from "./src/lib/kyc-burundi/ocr";
import * as fs from "fs";
import * as path from "path";

const ocr = createBurundiOCR();
const frontBuf = fs.readFileSync(
  path.join(process.cwd(), "..", "frontend", "public", "Sized-front-id.jpeg"),
);

// @ts-ignore - access private method for debugging
const rotated = await ocr["getRotatedBuffer"](frontBuf);
console.log("Original size:", frontBuf.length);
console.log("Rotated size:", rotated.length);

// Check if rotation actually happened by reading dimensions
const { Jimp } = await import("jimp");
// @ts-ignore
const img = await Jimp.read(frontBuf);
console.log("Original dimensions:", img.getWidth(), "x", img.getHeight());

// @ts-ignore
const rotatedImg = await Jimp.read(rotated);
console.log(
  "Rotated dimensions:",
  rotatedImg.getWidth(),
  "x",
  rotatedImg.getHeight(),
);

// Save rotated image to verify visually
fs.writeFileSync("/tmp/rotated-debug.jpeg", rotated);
console.log("Saved rotated image to /tmp/rotated-debug.jpeg");
