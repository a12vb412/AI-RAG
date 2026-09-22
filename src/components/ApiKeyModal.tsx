/**
 * API & Model Configuration Modal
 * Configures provider (OpenAI, Gemini, Local Semantic Engine),
 * API keys, chunk size, overlap, Top-K, and similarity threshold.
 */

import { Check, Cpu, Key, Sliders, Sparkles, X } from 'lucide-react';
import React, { useState } from 'react';
import { RAGSettings } from '../types/rag';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: RAGSettings;
  onSaveSettings: (settings: RAGSettings) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [current, setCurrent] = useState<RAGSettings>({ ...settings });
  const [showKey, setShowKey] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(current);
    onClose();
  };

  return (
    <div
      id="api-key-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Provider & RAG Parameters</h3>
              <p className="text-[11px] text-slate-500">
                Embedding models, LLM engines, and chunk hyperparameters
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-800 block">AI & Embedding Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurrent({ ...current, provider: 'local' })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  current.provider === 'local'
                    ? 'border-blue-500 bg-blue-50/60 text-blue-900'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5 mb-1">
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  Local Semantic Mode
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Zero setup required. 1536-dim vectors & synthesized streaming out of the box.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setCurrent({ ...current, provider: 'openai' })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  current.provider === 'openai'
                    ? 'border-blue-500 bg-blue-50/60 text-blue-900'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  OpenAI API
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  text-embedding-3-small + gpt-4o-mini streaming generation.
                </p>
              </button>
            </div>
          </div>

          {/* OpenAI Key Input (if OpenAI selected) */}
          {current.provider === 'openai' && (
            <div className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-800 block">OpenAI API Key</label>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-proj-..."
                value={current.openaiApiKey || ''}
                onChange={(e) => setCurrent({ ...current, openaiApiKey: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <p className="text-[11px] text-slate-400">
                Key is used directly for embedding & chat completions with rate-limit retries.
              </p>
            </div>
          )}

          {/* Model Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">Chat Completion Model</label>
              <select
                value={current.chatModel}
                onChange={(e) => setCurrent({ ...current, chatModel: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Fast & Cost Efficient)</option>
                <option value="gpt-4o">gpt-4o (Frontier Reasoning)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">Embedding Model</label>
              <select
                value={current.embeddingModel}
                onChange={(e) => setCurrent({ ...current, embeddingModel: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden"
              >
                <option value="text-embedding-3-small">text-embedding-3-small (1536 dim)</option>
                <option value="text-embedding-3-large">text-embedding-3-large (3072 dim)</option>
              </select>
            </div>
          </div>

          {/* Chunking & Retrieval Hyperparameters */}
          <div className="pt-2 border-t border-slate-100 space-y-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              <span>RAG Chunking & Retrieval Hyperparameters</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between font-semibold text-slate-700 text-[11px]">
                  <span>Chunk Size:</span>
                  <span className="font-mono text-blue-600">{current.chunkSize} chars</span>
                </div>
                <input
                  type="range"
                  min="400"
                  max="1500"
                  step="50"
                  value={current.chunkSize}
                  onChange={(e) =>
                    setCurrent({ ...current, chunkSize: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-blue-600"
                />
                <span className="text-[10px] text-slate-400 block">~{Math.round(current.chunkSize / 4)} tokens</span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between font-semibold text-slate-700 text-[11px]">
                  <span>Chunk Overlap:</span>
                  <span className="font-mono text-indigo-600">{current.chunkOverlap} chars</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="300"
                  step="25"
                  value={current.chunkOverlap}
                  onChange={(e) =>
                    setCurrent({ ...current, chunkOverlap: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-indigo-600"
                />
                <span className="text-[10px] text-slate-400 block">Prevents split boundary loss</span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between font-semibold text-slate-700 text-[11px]">
                  <span>Top-K Retrieved Chunks:</span>
                  <span className="font-mono text-blue-600">{current.topK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={current.topK}
                  onChange={(e) => setCurrent({ ...current, topK: parseInt(e.target.value, 10) })}
                  className="w-full accent-blue-600"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between font-semibold text-slate-700 text-[11px]">
                  <span>Similarity Cutoff:</span>
                  <span className="font-mono text-emerald-600">
                    {(current.similarityThreshold * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.80"
                  step="0.05"
                  value={current.similarityThreshold}
                  onChange={(e) =>
                    setCurrent({ ...current, similarityThreshold: parseFloat(e.target.value) })
                  }
                  className="w-full accent-emerald-600"
                />
                <span className="text-[10px] text-slate-400 block">Min cosine similarity score</span>
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
