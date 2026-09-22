/**
 * Recursive Character Text Splitter
 * Implements LangChain.js recursive character text splitting strategy.
 * Splits on paragraph boundaries, sentences, words, and characters sequentially
 * to keep semantically related text together.
 */

export interface SplitterOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  keepSeparator?: boolean;
}

export interface TextChunkOutput {
  content: string;
  chunkIndex: number;
  pageNumber: number;
  startChar: number;
  endChar: number;
  tokenCount: number;
}

export class RecursiveCharacterTextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];

  constructor(options: SplitterOptions = {}) {
    this.chunkSize = options.chunkSize ?? 800;
    this.chunkOverlap = options.chunkOverlap ?? 150;
    this.separators = options.separators ?? [
      '\n\n', // paragraphs
      '\n',   // line breaks
      '. ',   // sentence period
      '! ',   // exclamation
      '? ',   // question
      '; ',   // semicolon
      ' ',    // words
      '',     // raw characters fallback
    ];

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error('chunkOverlap must be strictly smaller than chunkSize');
    }
  }

  /**
   * Split raw text into chunks, preserving semantic boundaries
   */
  public splitText(text: string, defaultPageNumber = 1): TextChunkOutput[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Split pages if page break markers exist (e.g. \f or --- Page X ---)
    const pageSegments = this.splitByPages(text, defaultPageNumber);
    const chunks: TextChunkOutput[] = [];
    let globalChunkIndex = 0;

    for (const segment of pageSegments) {
      const segmentChunks = this.splitSegment(segment.text, segment.pageNumber, globalChunkIndex);
      for (const sc of segmentChunks) {
        chunks.push(sc);
        globalChunkIndex++;
      }
    }

    return chunks;
  }

  /**
   * Identifies page boundaries if present
   */
  private splitByPages(text: string, defaultPage: number): { text: string; pageNumber: number }[] {
    // Detect form feed character \f (standard PDF page separator)
    if (text.includes('\f')) {
      const pages = text.split('\f');
      return pages
        .map((p, idx) => ({ text: p.trim(), pageNumber: idx + 1 }))
        .filter((p) => p.text.length > 0);
    }

    // Detect explicit markdown page breaks or headers like "--- Page X ---"
    const pageRegex = /(?:^|\n)(?:---+|\*\*\*+)\s*Page\s*(\d+)\s*(?:---+|\*\*\*+)(?:\n|$)/i;
    if (pageRegex.test(text)) {
      const parts = text.split(/(?:^|\n)(?:---+|\*\*\*+)\s*Page\s*(\d+)\s*(?:---+|\*\*\*+)(?:\n|$)/i);
      const results: { text: string; pageNumber: number }[] = [];
      let currentPage = defaultPage;

      for (let i = 0; i < parts.length; i++) {
        const item = parts[i]?.trim();
        if (!item) continue;

        if (/^\d+$/.test(item)) {
          currentPage = parseInt(item, 10);
        } else {
          results.push({ text: item, pageNumber: currentPage });
        }
      }
      if (results.length > 0) return results;
    }

    return [{ text, pageNumber: defaultPage }];
  }

  /**
   * Recursively split a text segment using separator hierarchy
   */
  private splitSegment(
    text: string,
    pageNumber: number,
    startingIndex: number
  ): TextChunkOutput[] {
    const rawChunks = this.recursiveSplit(text, this.separators);
    const mergedChunks = this.mergeSplits(rawChunks);

    const result: TextChunkOutput[] = [];
    let cumulativeChar = 0;

    for (let i = 0; i < mergedChunks.length; i++) {
      const chunkText = mergedChunks[i].trim();
      if (!chunkText) continue;

      const tokenEstimate = Math.ceil(chunkText.length / 4); // ~4 chars per token average
      const start = cumulativeChar;
      const end = start + chunkText.length;
      cumulativeChar = Math.max(0, end - this.chunkOverlap);

      result.push({
        content: chunkText,
        chunkIndex: startingIndex + i,
        pageNumber,
        startChar: start,
        endChar: end,
        tokenCount: tokenEstimate,
      });
    }

    return result;
  }

  private recursiveSplit(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];
    let separator = separators[separators.length - 1];
    let newSeparators: string[] = [];

    for (let i = 0; i < separators.length; i++) {
      const s = separators[i];
      if (s === '') {
        separator = s;
        break;
      }
      if (text.includes(s)) {
        separator = s;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    const splits = separator === '' ? Array.from(text) : text.split(separator);
    const goodSplits: string[] = [];

    for (const s of splits) {
      if (s.length < this.chunkSize) {
        goodSplits.push(s);
      } else {
        if (goodSplits.length > 0) {
          const merged = this.mergeSplits(goodSplits);
          finalChunks.push(...merged);
          goodSplits.length = 0;
        }
        if (newSeparators.length === 0) {
          finalChunks.push(s);
        } else {
          const otherInfo = this.recursiveSplit(s, newSeparators);
          finalChunks.push(...otherInfo);
        }
      }
    }

    if (goodSplits.length > 0) {
      const merged = this.mergeSplits(goodSplits);
      finalChunks.push(...merged);
    }

    return finalChunks;
  }

  private mergeSplits(splits: string[]): string[] {
    const docs: string[] = [];
    const currentDoc: string[] = [];
    let total = 0;

    for (const d of splits) {
      const len = d.length;
      if (total + len > this.chunkSize) {
        if (total > this.chunkSize) {
          // Warning: chunk is larger than chunkSize, but we keep it
        }
        if (currentDoc.length > 0) {
          const doc = currentDoc.join(' ').trim();
          if (doc.length > 0) {
            docs.push(doc);
          }
          // Preserve overlap
          while (total > this.chunkOverlap || (total + len > this.chunkSize && total > 0)) {
            const popped = currentDoc.shift();
            if (!popped) break;
            total -= popped.length + 1;
          }
        }
      }
      currentDoc.push(d);
      total += len + 1;
    }

    const finalDoc = currentDoc.join(' ').trim();
    if (finalDoc.length > 0) {
      docs.push(finalDoc);
    }

    return docs;
  }
}
