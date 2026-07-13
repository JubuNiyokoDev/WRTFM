import { createBurundiOCR } from "./src/lib/kyc-burundi/ocr";
import * as fs from "fs";
import * as path from "path";

const ocr = createBurundiOCR();
const frontBuf = fs.readFileSync(
  path.join(process.cwd(), "..", "frontend", "public", "Sized-front-id.jpeg"),
);
const backBuf = fs.readFileSync(
  path.join(process.cwd(), "..", "frontend", "public", "Sized-back-id.jpeg"),
);

console.log("=== FRONT (rotation fix active inside performOCRWithWords) ===");
const front = await ocr.extractAllFields(frontBuf);
console.log("KOMINE:", JSON.stringify(front.personalFields.komine));
console.log("PROVENSI:", JSON.stringify(front.personalFields.provensi));
console.log("SE:", JSON.stringify(front.personalFields.se));
console.log("IZINA:", JSON.stringify(front.personalFields.izina));
console.log("ANCHORS FOUND:", JSON.stringify(front.anchorsFound));
console.log("CONFIDENCE:", JSON.stringify(front.confidence));

console.log("\n=== BACK ===");
const back = await ocr.extractAllFields(backBuf);
console.log("MIFPDI:", JSON.stringify(back.officialFields.numeroMifpdi));
console.log("ITANGIWE I:", JSON.stringify(back.officialFields.itangiweI));
console.log("ITALIKI:", JSON.stringify(back.officialFields.italiki));
console.log("UWUYITANZE:", JSON.stringify(back.officialFields.uwuyitanze));
console.log("ANCHORS FOUND:", JSON.stringify(back.anchorsFound));
console.log("CONFIDENCE:", JSON.stringify(back.confidence));
