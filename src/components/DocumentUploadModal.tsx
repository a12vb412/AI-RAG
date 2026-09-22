/**
 * Multi-File Drag & Drop Document Uploader
 * Supports PDF, TXT, and Markdown files with real-time processing status
 * (Parsing -> Recursive Chunking -> Vector Embeddings -> pgvector Indexing).
 */

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { extractTextFromFile, validateDocumentFile } from '../lib/pdf-extractor';
import { RecursiveCharacterTextSplitter } from '../lib/text-splitter';
import { globalVectorStore } from '../lib/vector-store';
import { DocumentChunk, DocumentItem, RAGSettings, UploadProgressItem } from '../types/rag';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  settings: RAGSettings;
  onUploadSuccess: () => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  settings,
  onUploadSuccess,
}) => {
  const [items, setItems] = useState<UploadProgressItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingGlobal, setIsProcessingGlobal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = (files: FileList | File[]) => {
    const newItems: UploadProgressItem[] = [];

    Array.from(files).forEach((file) => {
      const validation = validateDocumentFile(file);

      newItems.push({
        id: `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        type: validation.fileType || 'txt',
        progress: 0,
        status: validation.isValid ? 'QUEUED' : 'ERROR',
        chunksGenerated: 0,
        errorMessage: validation.error,
      });
    });

    setItems((prev) => [...prev, ...newItems]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const startProcessingQueue = async () => {
    const pendingItems = items.filter((i) => i.status === 'QUEUED');
    if (pendingItems.length === 0) return;

    setIsProcessingGlobal(true);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: settings.chunkSize || 800,
      chunkOverlap: settings.chunkOverlap || 150,
    });

    for (const item of pendingItems) {
      try {
        // Step 1: Parsing
        updateItem(item.id, { status: 'PARSING', progress: 15 });

        const extracted = await extractTextFromFile(item.file, (pct, statusDesc) => {
          updateItem(item.id, { progress: 15 + Math.round(pct * 0.3) });
        });

        // Step 2: Intelligent Chunking
        updateItem(item.id, { status: 'CHUNKING', progress: 50 });
        const rawChunks = splitter.splitText(extracted.text);

        if (rawChunks.length === 0) {
          throw new Error('No readable text could be extracted from this document.');
        }

        updateItem(item.id, {
          status: 'EMBEDDING',
          progress: 65,
          chunksGenerated: rawChunks.length,
        });

        // Step 3: Embeddings Generation
        const chunkTexts = rawChunks.map((c) => c.content);
        const vectors = await globalVectorStore.generateEmbeddings(
          chunkTexts,
          settings,
          (embedProgress) => {
            updateItem(item.id, {
              progress: 65 + Math.round(embedProgress * 0.3),
            });
          }
        );

        // Step 4: Index into Vector Store
        const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const docRecord: DocumentItem = {
          id: docId,
          workspaceId,
          name: item.name,
          fileType: item.type,
          fileSize: item.size,
          pageCount: extracted.pageCount,
          status: 'READY',
          chunksCount: rawChunks.length,
          createdAt: new Date().toISOString(),
        };

        const chunkRecords: DocumentChunk[] = rawChunks.map((rc, idx) => ({
          id: `chunk-${docId}-${idx}`,
          documentId: docId,
          documentName: item.name,
          workspaceId,
          chunkIndex: rc.chunkIndex,
          content: rc.content,
          pageNumber: rc.pageNumber,
          tokenCount: rc.tokenCount,
          startChar: rc.startChar,
          endChar: rc.endChar,
          embedding: vectors[idx],
        }));

        globalVectorStore.addDocument(docRecord);
        globalVectorStore.storeChunks(chunkRecords);

        updateItem(item.id, { status: 'READY', progress: 100 });
      } catch (err: any) {
        console.error('Document processing failed:', err);
        updateItem(item.id, {
          status: 'ERROR',
          progress: 0,
          errorMessage: err.message || 'Processing failed',
        });
      }
    }

    setIsProcessingGlobal(false);
    onUploadSuccess();
  };

  const updateItem = (id: string, updates: Partial<UploadProgressItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const queuedCount = items.filter((i) => i.status === 'QUEUED').length;
  const readyCount = items.filter((i) => i.status === 'READY').length;

  return (
    <div
      id="upload-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Upload Documents</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Extract text, split into recursive chunks, and index into pgvector.
            </p>
          </div>
          <button
            id="close-upload-modal"
            onClick={onClose}
            disabled={isProcessingGlobal}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drag & Drop Zone */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div
            id="drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60 scale-[0.99]'
                : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/80 bg-slate-50/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFilesSelected(e.target.files);
              }}
            />
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-800 text-sm">
              Click to browse or drag and drop files here
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supported formats: <strong className="text-slate-700">PDF (.pdf)</strong>,{' '}
              <strong className="text-slate-700">Markdown (.md)</strong>,{' '}
              <strong className="text-slate-700">Text (.txt)</strong> • Up to 25MB each
            </p>
          </div>

          {/* Files List with status indicators */}
          {items.length > 0 && (
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
                <span>Upload Queue ({items.length} files)</span>
                <span>
                  {readyCount} indexed / {queuedCount} queued
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">
                          ({(item.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'READY' && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {item.chunksGenerated} Chunks Indexed
                          </span>
                        )}
                        {(item.status === 'PARSING' ||
                          item.status === 'CHUNKING' ||
                          item.status === 'EMBEDDING') && (
                          <span className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {item.status} ({item.progress}%)
                          </span>
                        )}
                        {item.status === 'QUEUED' && (
                          <span className="text-xs text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                            Queued
                          </span>
                        )}
                        {item.status === 'ERROR' && (
                          <span className="flex items-center gap-1 text-xs text-rose-600 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        )}

                        {!isProcessingGlobal && item.status !== 'READY' && (
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {item.status !== 'QUEUED' && item.status !== 'ERROR' && (
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Error message */}
                    {item.errorMessage && (
                      <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200/80 rounded-lg p-2 leading-relaxed">
                        {item.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
          >
            {readyCount > 0 ? 'Close & View Workspace' : 'Cancel'}
          </button>

          <button
            id="start-process-btn"
            onClick={startProcessingQueue}
            disabled={queuedCount === 0 || isProcessingGlobal}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessingGlobal ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing Vector Pipeline...
              </>
            ) : (
              `Process & Embed ${queuedCount > 0 ? `(${queuedCount})` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
