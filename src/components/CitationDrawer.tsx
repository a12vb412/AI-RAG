/**
 * Verifiable Citation Inspector Drawer / Dialog
 * Displays exact chunk text, source document, page number, and similarity score.
 */

import { Check, Copy, ExternalLink, FileText, Hash, Percent, Sparkles, X } from 'lucide-react';
import React, { useState } from 'react';
import { Citation, DocumentChunk } from '../types/rag';

interface CitationDrawerProps {
  citation: Citation | null;
  chunk?: DocumentChunk | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CitationDrawer: React.FC<CitationDrawerProps> = ({
  citation,
  chunk,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !citation) return null;

  const scorePercentage = Math.round(citation.similarityScore * 100);
  const chunkText = chunk?.content || citation.snippet;

  const handleCopy = () => {
    navigator.clipboard.writeText(chunkText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="citation-inspector-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 text-base leading-tight">
                  {citation.documentName}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100/70 text-blue-700 font-medium">
                  Page {citation.pageNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Source Document Chunk Verification & Grounding Evidence
              </p>
            </div>
          </div>
          <button
            id="close-citation-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
            aria-label="Close citation inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verification Metadata Bar */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 bg-slate-100/60 border-b border-slate-200/80 text-xs">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-slate-500 block">Similarity Score</span>
              <span className="font-semibold text-emerald-700">
                {scorePercentage}% Cosine Match
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <span className="text-slate-500 block">Chunk Index</span>
              <span className="font-semibold text-indigo-700">
                Chunk #{citation.chunkIndex + 1}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="text-slate-500 block">Vector Dimensions</span>
              <span className="font-semibold text-amber-700">1,536 (pgvector)</span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Exact Retrieved Chunk Text
              </span>
              <button
                id="copy-chunk-btn"
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md transition-colors font-medium"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600">Copied Chunk</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm leading-relaxed text-slate-800 whitespace-pre-wrap select-text">
              {chunkText}
            </div>
          </div>

          {chunk && (
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 text-xs text-blue-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Chunk Boundary & Token Metrics
              </div>
              <p className="text-blue-700/90">
                Estimated tokens: <span className="font-medium">{chunk.tokenCount}</span> | Character offset: [
                {chunk.startChar} - {chunk.endChar}] | Page: {chunk.pageNumber}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Grounded in PostgreSQL pgvector HNSW index</span>
          <button
            id="done-citation-btn"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
