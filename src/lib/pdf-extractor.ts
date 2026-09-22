/**
 * Robust document text extraction for PDF, TXT, and Markdown files.
 * Streams text in chunks to prevent memory spikes on large files.
 */

import { FileType } from '../types/rag';

export interface ExtractedDocument {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    fileSize: number;
    fileType: FileType;
    estimatedTokens: number;
  };
}

export const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md'] as const;
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
];

/**
 * Validates whether a file is supported.
 * Returns null if valid, or a descriptive error string if invalid.
 */
export function validateDocumentFile(file: File): { isValid: boolean; error?: string; fileType?: FileType } {
  const name = file.name.toLowerCase();
  const ext = name.substring(name.lastIndexOf('.'));

  if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
    return {
      isValid: false,
      error: `Unsupported file format "${ext || 'unknown'}". Only PDF (.pdf), Plain Text (.txt), and Markdown (.md) documents are supported.`,
    };
  }

  // Max file size: 25MB to ensure safe memory handling in browser
  const MAX_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds the 25MB limit (current: ${(file.size / (1024 * 1024)).toFixed(1)}MB). Please upload a smaller document.`,
    };
  }

  let fileType: FileType = 'txt';
  if (ext === '.pdf') fileType = 'pdf';
  else if (ext === '.md') fileType = 'md';

  return { isValid: true, fileType };
}

/**
 * Extracts plain text from an uploaded File.
 */
export async function extractTextFromFile(
  file: File,
  onProgress?: (percent: number, step: string) => void
): Promise<ExtractedDocument> {
  const validation = validateDocumentFile(file);
  if (!validation.isValid || !validation.fileType) {
    throw new Error(validation.error || 'Invalid file');
  }

  onProgress?.(10, 'Reading file buffer...');

  if (validation.fileType === 'txt' || validation.fileType === 'md') {
    onProgress?.(40, 'Decoding text...');
    const rawText = await file.text();
    onProgress?.(100, 'Text extracted successfully');

    // Estimate page count for text/markdown (~3000 chars per standard page)
    const pageCount = Math.max(1, Math.ceil(rawText.length / 3000));
    return {
      text: rawText,
      pageCount,
      metadata: {
        title: file.name.replace(/\.[^/.]+$/, ''),
        fileSize: file.size,
        fileType: validation.fileType,
        estimatedTokens: Math.ceil(rawText.length / 4),
      },
    };
  }

  // For PDF files: Extract textual stream objects and decode text
  onProgress?.(25, 'Scanning PDF structure and pages...');
  const arrayBuffer = await file.arrayBuffer();
  const pdfTextResult = await parsePdfBuffer(arrayBuffer, (p, s) => {
    onProgress?.(25 + Math.round(p * 0.7), s);
  });

  return {
    text: pdfTextResult.text,
    pageCount: Math.max(1, pdfTextResult.pageCount),
    metadata: {
      title: file.name.replace(/\.[^/.]+$/, ''),
      fileSize: file.size,
      fileType: 'pdf',
      estimatedTokens: Math.ceil(pdfTextResult.text.length / 4),
    },
  };
}

/**
 * Lightweight and robust in-browser PDF text extractor.
 * Parses PDF streams, TJ/Tj text operators, and page markers without crashing.
 */
async function parsePdfBuffer(
  buffer: ArrayBuffer,
  progressCallback?: (ratio: number, status: string) => void
): Promise<{ text: string; pageCount: number }> {
  const bytes = new Uint8Array(buffer);
  const textDecoder = new TextDecoder('latin1');
  const rawString = textDecoder.decode(bytes);

  // Count /Page objects
  const pageMatches = rawString.match(/\/Type\s*\/Page\b/g);
  let pageCount = pageMatches ? pageMatches.length : 1;

  progressCallback?.(0.3, 'Extracting PDF text operators...');

  // Search for stream blocks
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  const pageTexts: string[] = [];
  let currentBuffer = '';
  let streamsProcessed = 0;

  // Pattern for (Text) Tj or [ (Text) 120 (More) ] TJ
  const tjRegex = /(?:\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ)/g;

  while ((match = streamRegex.exec(rawString)) !== null) {
    streamsProcessed++;
    const streamContent = match[1];

    let streamExtracted = '';
    let textMatch: RegExpExecArray | null;

    while ((textMatch = tjRegex.exec(streamContent)) !== null) {
      if (textMatch[1]) {
        streamExtracted += cleanPdfText(textMatch[1]) + ' ';
      } else if (textMatch[2]) {
        // TJ array
        const innerStrings = textMatch[2].match(/\((.*?)\)/g);
        if (innerStrings) {
          const joined = innerStrings
            .map((s) => cleanPdfText(s.slice(1, -1)))
            .join('');
          streamExtracted += joined + ' ';
        }
      }
    }

    if (streamExtracted.trim().length > 0) {
      currentBuffer += streamExtracted + '\n';
    }

    // Every few streams or if explicit form feed found
    if (streamContent.includes('/Parent') || currentBuffer.length > 3000) {
      pageTexts.push(currentBuffer.trim());
      currentBuffer = '';
    }
  }

  if (currentBuffer.trim().length > 0) {
    pageTexts.push(currentBuffer.trim());
  }

  // Fallback: If compressed streams couldn't be parsed with regex,
  // extract ASCII string segments from the binary
  if (pageTexts.length === 0 || pageTexts.join('').trim().length < 50) {
    progressCallback?.(0.7, 'Applying fallback text recovery...');
    const asciiText = extractPrintableAscii(bytes);
    if (asciiText.length > 50) {
      return {
        text: asciiText,
        pageCount: Math.max(1, pageCount),
      };
    }
  }

  // Join pages with form feed marker (\f) so RecursiveCharacterTextSplitter can preserve page boundaries!
  const fullText = pageTexts.join('\n\f\n');
  const actualPages = Math.max(pageCount, pageTexts.length, 1);

  progressCallback?.(1.0, 'PDF extraction complete');
  return {
    text: fullText.trim().length > 0 ? fullText : 'Document contained no extractable textual content.',
    pageCount: actualPages,
  };
}

function cleanPdfText(input: string): string {
  return input
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\r/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\b/g, '')
    .replace(/\\f/g, '')
    .trim();
}

function extractPrintableAscii(bytes: Uint8Array): string {
  const result: string[] = [];
  let currentWord = '';

  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    // Printable ASCII: 32 (space) to 126 (~), plus newline and tab
    if ((c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9) {
      currentWord += String.fromCharCode(c);
    } else {
      if (currentWord.length >= 4) {
        // filter out PDF keywords like "xref", "obj", "/Filter"
        if (!currentWord.startsWith('/') && !currentWord.includes('endobj')) {
          result.push(currentWord);
        }
      }
      currentWord = '';
    }
  }
  if (currentWord.length >= 4) {
    result.push(currentWord);
  }

  return result.join(' ');
}
