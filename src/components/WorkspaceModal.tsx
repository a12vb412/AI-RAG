/**
 * Workspace Creator & Management Modal
 * Allows provisioning private workspaces to isolate document collections,
 * embeddings, and conversation histories.
 */

import { Check, FolderPlus, ShieldCheck, X } from 'lucide-react';
import React, { useState } from 'react';
import { Workspace } from '../types/rag';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWorkspace: (workspace: Workspace) => void;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreateWorkspace,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Workspace name is required.');
      return;
    }

    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newWs: Workspace = {
      id: `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      slug,
      description: description.trim() || 'Private document knowledge base.',
      createdAt: new Date().toISOString(),
      documentCount: 0,
    };

    onCreateWorkspace(newWs);
    setName('');
    setDescription('');
    setError('');
    onClose();
  };

  return (
    <div
      id="workspace-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Create Private Workspace</h3>
              <p className="text-[11px] text-slate-500">Logical multi-tenant isolation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Workspace Name</label>
            <input
              type="text"
              required
              placeholder="e.g., Legal & Compliance, M&A 2025"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 text-xs"
            />
            {error && <p className="text-rose-600 text-[11px] font-medium">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">Description (Optional)</label>
            <textarea
              rows={3}
              placeholder="Scope or classification of documents in this workspace..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 text-xs resize-none"
            />
          </div>

          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Multi-Tenant Isolation
            </div>
            <p className="text-indigo-800/80 leading-relaxed">
              Documents and vector embeddings uploaded here are strictly scoped to this workspace
              ID. No cross-workspace data retrieval will ever occur.
            </p>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
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
              Create Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
