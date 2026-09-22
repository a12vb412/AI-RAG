/**
 * Workspace Sidebar
 * Handles multi-tenant workspace switching, document management,
 * cascading deletions, upload trigger, and session navigation.
 */

import {
  Binary,
  BookOpen,
  Code2,
  Database,
  FileCheck2,
  FileText,
  Key,
  Layers,
  MessageSquare,
  Plus,
  Settings,
  Trash2
} from 'lucide-react';
import React, { useState } from 'react';
import { ChatSession, DocumentItem, Workspace } from '../types/rag';

interface SidebarProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  documents: DocumentItem[];
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenNewWorkspaceModal: () => void;
  onOpenUploadModal: () => void;
  onOpenChunkViewer: (doc: DocumentItem) => void;
  onDeleteDocument: (doc: DocumentItem) => void;
  onSelectChatSession: (sessionId: string) => void;
  onNewChatSession: () => void;
  onDeleteChatSession: (sessionId: string) => void;
  onOpenArchitectureModal: () => void;
  onOpenApiKeyModal: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentWorkspace,
  workspaces,
  documents,
  chatSessions,
  activeSessionId,
  onSelectWorkspace,
  onOpenNewWorkspaceModal,
  onOpenUploadModal,
  onOpenChunkViewer,
  onDeleteDocument,
  onSelectChatSession,
  onNewChatSession,
  onDeleteChatSession,
  onOpenArchitectureModal,
  onOpenApiKeyModal,
  isMobileOpen,
  onCloseMobile,
}) => {
  const [docToDelete, setDocToDelete] = useState<DocumentItem | null>(null);

  const totalChunks = documents.reduce((sum, d) => sum + d.chunksCount, 0);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-72 bg-white border-r border-slate-200/90 flex flex-col transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Workspace Brand & Selector */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-sm tracking-tight leading-none">
                RAG Studio
              </h1>
              <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                pgvector + HNSW
              </span>
            </div>
          </div>

          {/* Workspace dropdown selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
              Active Workspace
            </label>
            <div className="flex gap-1.5">
              <select
                id="workspace-select"
                value={currentWorkspace.id}
                onChange={(e) => {
                  const ws = workspaces.find((w) => w.id === e.target.value);
                  if (ws) onSelectWorkspace(ws);
                }}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 truncate"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                id="create-workspace-btn"
                onClick={onOpenNewWorkspaceModal}
                title="Create New Workspace"
                className="p-1.5 text-slate-600 hover:text-slate-950 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content: Documents & Chats */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {/* Documents Section */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>Documents ({documents.length})</span>
              </div>
              <button
                id="sidebar-upload-btn"
                onClick={onOpenUploadModal}
                className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-2 py-0.5 rounded-md transition-colors"
              >
                <Plus className="w-3 h-3" />
                Upload
              </button>
            </div>

            {/* Documents List */}
            {documents.length === 0 ? (
              <div className="text-center py-6 px-2 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <FileText className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-600">No documents yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Upload PDF, TXT or MD files to build your knowledge base.
                </p>
                <button
                  onClick={onOpenUploadModal}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                >
                  + Add Document
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="group p-2 bg-white hover:bg-slate-50/80 border border-slate-200/80 hover:border-slate-300 rounded-xl transition-all text-xs"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-2 truncate min-w-0">
                        <FileCheck2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="font-semibold text-slate-800 truncate" title={doc.name}>
                          {doc.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onOpenChunkViewer(doc)}
                          title="Inspect Chunks & Embeddings"
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                        >
                          <Binary className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDocToDelete(doc)}
                          title="Delete Document (Cascades Chunks)"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 pl-5.5">
                      <span>{doc.chunksCount} chunks</span>
                      <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat Sessions Section */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                <span>Chat History</span>
              </div>
              <button
                id="new-chat-btn"
                onClick={onNewChatSession}
                className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 px-2 py-0.5 rounded-md transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Chat
              </button>
            </div>

            {chatSessions.length === 0 ? (
              <p className="text-xs text-slate-400 px-1 py-2 italic">
                No conversations yet. Ask a question to begin.
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                {chatSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-900 font-semibold border border-indigo-200/60'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                      onClick={() => onSelectChatSession(session.id)}
                    >
                      <span className="truncate pr-2">{session.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChatSession(session.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vector Index Metrics Card */}
          <div className="p-3.5 bg-slate-50/70">
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-xs space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Indexed Vectors
                </span>
                <span className="font-mono font-bold text-slate-900">{totalChunks}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-medium">
                <span>Vector Dimension</span>
                <span className="font-mono font-semibold text-slate-700">1,536</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-medium">
                <span>ANN Index Type</span>
                <span className="font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                  HNSW (Cosine)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-slate-200/80 bg-slate-50/60 space-y-1.5">
          <button
            id="open-architecture-btn"
            onClick={onOpenArchitectureModal}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-200/60 rounded-lg transition-colors border border-slate-200 bg-white"
          >
            <span className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-600" />
              Schema & Architecture
            </span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
              Prisma + SQL
            </span>
          </button>

          <button
            id="open-api-key-btn"
            onClick={onOpenApiKeyModal}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-200/60 rounded-lg transition-colors border border-slate-200 bg-white"
          >
            <span className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-600" />
              API & Models
            </span>
            <Settings className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </aside>

      {/* Delete Confirmation Modal (Cascading Delete) */}
      {docToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Delete Document?</h4>
                <p className="text-xs text-slate-500">Cascading vector deletion</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900">{docToDelete.name}</strong>?
              This will permanently remove the document and cascade-delete all{' '}
              <strong className="text-slate-900">{docToDelete.chunksCount} pgvector embeddings</strong>,
              guaranteeing no orphaned vectors remain.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDocToDelete(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-doc-btn"
                onClick={() => {
                  onDeleteDocument(docToDelete);
                  setDocToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                Delete & Cascade Embeddings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
