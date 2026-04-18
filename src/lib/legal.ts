import { readFile } from "node:fs/promises";
import path from "node:path";

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");

export async function readLegalDocument(filename: string): Promise<string> {
  return readFile(path.join(LEGAL_DIR, filename), "utf8");
}
