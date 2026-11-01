import "server-only";

/**
 * Safe text extraction for seller documents. Files are parsed as data only — nothing is executed,
 * macros are ignored, and output is length-capped. Extracted text is UNTRUSTED: it is shown to the
 * seller for review and passed to the model as quoted material, never as instructions.
 */
export const DOCUMENT_LIMIT = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 20_000;

export type DocKind = "pdf" | "docx" | "doc";

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Detect by magic bytes, never by the declared MIME/extension alone. */
export function detectDocument(buf: Buffer, filename: string): DocKind | null {
  const name = filename.toLowerCase();
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // DOCX is a ZIP whose entries include word/document.xml (name appears in the local headers).
    return buf.includes(Buffer.from("word/")) && !name.endsWith(".zip") ? "docx" : null;
  }
  if (buf.subarray(0, 8).equals(OLE) && name.endsWith(".doc")) return "doc";
  return null;
}

function clean(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

export async function extractDocumentText(buf: Buffer, kind: DocKind): Promise<{ text: string; pages?: number }> {
  switch (kind) {
    case "pdf": {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      return { text: clean(Array.isArray(text) ? text.join("\n") : text), pages: totalPages };
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { text: clean(value) };
    }
    case "doc": {
      const { default: WordExtractor } = await import("word-extractor");
      const doc = await new WordExtractor().extract(buf);
      return { text: clean(doc.getBody()) };
    }
  }
}
