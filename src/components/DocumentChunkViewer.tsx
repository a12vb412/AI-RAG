/**
 * Document Chunk Inspector
 * Allows inspecting the exact chunks, page mappings, token distributions,
 * and 1536-dim vector embeddings for any document.
 */

import { Binary, ChevronRight, FileText, Hash, Search, X } from 'lucide-react';
import React, { useState } from 'react';
import { globalVectorStore } from '../lib/vector-store';
import { DocumentChunk, DocumentItem } from '../types/rag';

interface DocumentChunkViewerProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentChunkViewer: React.FC<DocumentChunkViewerProps> = ({
  document,
  isOpen,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChunk, setSelectedChunk] = useState<DocumentChunk | null>(null);

  if (!isOpen || !document) return null;

  const chunks = globalVectorStore.getDocumentChunks(document.id);
  const filteredChunks = chunks.filter((c) =>
    searchTerm.trim() ? c.content.toLowerCase().includes(searchTerm.toLowerCase()) : true
  );

  const activeChunk = selectedChunk || filteredChunks[0] || null;

  return (
    <div
      id="chunk-viewer-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Binary className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">{document.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
                  {chunks.length} pgvector chunks
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Hierarchical Recursive Chunks & 1536-Dimensional Embeddings Inspection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-slate-200/80 bg-white flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search through chunk contents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <span className="text-xs text-slate-500 shrink-0">
            Showing {filteredChunks.length} of {chunks.length} chunks
          </span>
        </div>

        {/* Master-Detail Split View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chunks List (Left Column) */}
          <div className="w-80 border-r border-slate-200 overflow-y-auto bg-slate-50/50 p-3 space-y-2">
            {filteredChunks.length === 0 ? (
              <div className="text-center py-12 px-4">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No matching chunks found.</p>
              </div>
            ) : (
              filteredChunks.map((chunk) => {
                const isSelected = activeChunk?.id === chunk.id;
                return (
                  <button
                    key={chunk.id}
                    onClick={() => setSelectedChunk(chunk)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-800 flex items-center gap-1">
                        <Hash className="w-3 h-3 text-indigo-500" />
                        Chunk #{chunk.chunkIndex + 1}
                      </span>
                      <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                        Page {chunk.pageNumber}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {chunk.content}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                      <span>~{chunk.tokenCount} tokens</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Active Chunk Details (Right Column) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
            {activeChunk ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Chunk #{activeChunk.chunkIndex + 1} Details
                    </h4>
                    <p className="text-xs text-slate-500">
                      Page {activeChunk.pageNumber} • Characters [{activeChunk.startChar} -{' '}
                      {activeChunk.endChar}] • ~{activeChunk.tokenCount} tokens
                    </p>
                  </div>
                  <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md border border-indigo-100 font-semibold">
                    ID: {activeChunk.id}
                  </span>
                </div>

                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Extracted & Grounded Chunk Content
                  </h5>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap select-text">
                    {activeChunk.content}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <Binary className="w-3.5 h-3.5 text-indigo-600" />
                    Dense Vector Embedding Preview (pgvector 1536-dim)
                  </h5>
                  <div className="p-3.5 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-36">
                    {activeChunk.embedding && activeChunk.embedding.length > 0 ? (
                      <div>
                        <div className="text-slate-400 text-[11px] mb-1">
                          // Vector length: {activeChunk.embedding.length} floats (First 24 dimensions
                          shown):
                        </div>
                        [
                        {activeChunk.embedding
                          .slice(0, 24)
                          .map((val) => (val >= 0 ? `+${val.toFixed(5)}` : val.toFixed(5)))
                          .join(', ')}
                        , ... +{activeChunk.embedding.length - 24} dimensions]
                      </div>
                    ) : (
                      <span className="text-slate-400">Embedding pending calculation</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a chunk on the left to inspect its parameters.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
