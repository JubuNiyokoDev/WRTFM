import Tesseract from "tesseract.js";
import * as fs from "fs";
import * as path from "path";

const buf = fs.readFileSync(
  path.join(process.cwd(), "..", "frontend", "public", "Sized-front-id.jpeg"),
);

async function runOCR(label: string, psm: number) {
  const worker = await Tesseract.createWorker("fra+eng", 1, {
    logger: () => {},
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psm as any,
      preserve_interword_spaces: "1",
    });

    const result = await worker.recognize(buf, {}, { text: true });
    console.log(`\n=== ${label} (PSM ${psm}) ===`);
    console.log("Confidence:", result.data.confidence);
    console.log("Text (first 3000 chars):");
    console.log((result.data.text ?? "").slice(0, 3000));
  } finally {
    await worker.terminate();
  }
}

await runOCR("FRONT original", 3);
await runOCR("FRONT original", 6);
await runOCR("FRONT original", 11);
await runOCR("FRONT original", 12);
