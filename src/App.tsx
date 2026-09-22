/**
 * Main Application Component: Document Q&A RAG Studio
 * Enhanced with:
 * - Gemini Multi-turn Chatbot with system persona roles
 * - Google Search Grounding with gemini-3.5-flash
 * - Audio speech-to-text recording with gemini-3.5-transcribe
 * - pgvector similarity search & verifiable inline citations
 * - Model tiers: gemini-3.1-pro-preview, gemini-3.5-flash, gemini-3.1-flash-lite
 */

import React, { useEffect, useRef, useState } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ArchitectureModal } from './components/ArchitectureModal';
import { ChatInterface } from './components/ChatInterface';
import { CitationDrawer } from './components/CitationDrawer';
import { DocumentChunkViewer } from './components/DocumentChunkViewer';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { Sidebar } from './components/Sidebar';
import { WorkspaceModal } from './components/WorkspaceModal';
import { CHATBOT_ROLES, streamGeminiChat } from './lib/gemini-service';
import { DEFAULT_WORKSPACE, seedSampleDataIfEmpty } from './lib/sample-data';
import { globalVectorStore } from './lib/vector-store';
import { executeRAGQuery } from './server/rag-engine';
import {
  ChatbotRole,
  ChatMessage,
  ChatSession,
  Citation,
  DocumentChunk,
  DocumentItem,
  GeminiTaskType,
  GroundingWebChunk,
  RAGSettings,
  Workspace,
} from './types/rag';

const STORAGE_KEY_WORKSPACES = 'rag_studio_workspaces_v1';
const STORAGE_KEY_SESSIONS = 'rag_studio_sessions_v1';
const STORAGE_KEY_SETTINGS = 'rag_studio_settings_v1';

const DEFAULT_SETTINGS: RAGSettings = {
  provider: 'gemini',
  embeddingModel: 'text-embedding-3-small',
  chatModel: 'gemini-3.5-flash',
  chunkSize: 800,
  chunkOverlap: 150,
  topK: 5,
  similarityThreshold: 0.35,
};

export default function App() {
  // 1. Workspaces State
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_WORKSPACES);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn(e);
    }
    return [DEFAULT_WORKSPACE];
  });
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace>(
    workspaces[0] || DEFAULT_WORKSPACE
  );

  // 2. Documents State
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeChunkDoc, setActiveChunkDoc] = useState<DocumentItem | null>(null);

  // 3. Chat Sessions & Messages State
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn(e);
    }
    return [];
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // 4. Gemini Chatbot & Grounding Configurations
  const [activeRole, setActiveRole] = useState<ChatbotRole>(CHATBOT_ROLES[0]);
  const [taskType, setTaskType] = useState<GeminiTaskType>('general');
  const [enableGoogleSearch, setEnableGoogleSearch] = useState<boolean>(true);
  const [enableDocContext, setEnableDocContext] = useState<boolean>(true);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 5. Citation Inspector State
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [inspectedChunk, setInspectedChunk] = useState<DocumentChunk | null>(null);

  // 6. Settings State
  const [settings, setSettings] = useState<RAGSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn(e);
    }
    return DEFAULT_SETTINGS;
  });

  // 7. UI Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isArchitectureModalOpen, setIsArchitectureModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Seed sample data on first load
  useEffect(() => {
    seedSampleDataIfEmpty().then(() => {
      refreshDocuments();
    });
  }, []);

  // Sync workspaces to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WORKSPACES, JSON.stringify(workspaces));
  }, [workspaces]);

  // Sync chat sessions to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chatSessions));
  }, [chatSessions]);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // When workspace changes, reload documents & active chat session
  useEffect(() => {
    refreshDocuments();
    const wsSessions = chatSessions.filter((s) => s.workspaceId === currentWorkspace.id);
    if (wsSessions.length > 0) {
      const latest = wsSessions[0];
      setActiveSessionId(latest.id);
      setMessages(latest.messages);
    } else {
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [currentWorkspace.id]);

  const refreshDocuments = () => {
    const docs = globalVectorStore.getDocuments(currentWorkspace.id);
    setDocuments(docs);
  };

  // Switch active workspace
  const handleSelectWorkspace = (ws: Workspace) => {
    setCurrentWorkspace(ws);
    setIsMobileSidebarOpen(false);
  };

  // Create new workspace
  const handleCreateWorkspace = (newWs: Workspace) => {
    setWorkspaces((prev) => [newWs, ...prev]);
    setCurrentWorkspace(newWs);
  };

  // Delete document (CASCADE EMBEDDINGS)
  const handleDeleteDocument = (doc: DocumentItem) => {
    globalVectorStore.deleteDocument(doc.id);
    refreshDocuments();
  };

  // Chat Session Management
  const handleNewChatSession = () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      workspaceId: currentWorkspace.id,
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setChatSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessages([]);
  };

  const handleSelectChatSession = (sessionId: string) => {
    const session = chatSessions.find((s) => s.id === sessionId);
    if (session) {
      setActiveSessionId(session.id);
      setMessages(session.messages);
    }
    setIsMobileSidebarOpen(false);
  };

  const handleDeleteChatSession = (sessionId: string) => {
    setChatSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remaining = chatSessions.filter(
        (s) => s.workspaceId === currentWorkspace.id && s.id !== sessionId
      );
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
        setMessages(remaining[0].messages);
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }
    }
  };

  const handleClearCurrentChat = () => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    setChatSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, messages: [] } : s))
    );
  };

  // Main Streaming Query Execution (Gemini Multi-turn + Search Grounding + Document RAG)
  const handleSendMessage = async (queryText: string) => {
    if (!queryText.trim() || isStreaming) return;

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        workspaceId: currentWorkspace.id,
        title: queryText.slice(0, 30) + (queryText.length > 30 ? '...' : ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setChatSessions((prev) => [newSession, ...prev]);
      targetSessionId = newSession.id;
      setActiveSessionId(targetSessionId);
    }

    const userMessage: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      sessionId: targetSessionId,
      role: 'user',
      content: queryText,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgId = `msg-asst-${Date.now()}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      sessionId: targetSessionId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      rolePersona: activeRole.name,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMessage, initialAssistantMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startTime = Date.now();

    // 1. Retrieve pgvector document chunks if Document RAG is enabled
    let retrievedContext = '';
    let retrievedCitations: Citation[] = [];

    if (enableDocContext && documents.length > 0) {
      try {
        const queryVectors = await globalVectorStore.generateEmbeddings([queryText], settings);
        const queryVector = queryVectors[0];
        const matchingChunks = await globalVectorStore.similaritySearch(
          queryVector,
          currentWorkspace.id,
          settings.topK || 5,
          settings.similarityThreshold ?? 0.35
        );

        if (matchingChunks.length > 0) {
          retrievedContext = matchingChunks
            .map(
              (c, idx) =>
                `[Source ${idx + 1}: ${c.documentName} | Page: ${c.pageNumber || 1} | Match: ${(
                  (c.similarityScore || 0) * 100
                ).toFixed(0)}%]\n${c.content}`
            )
            .join('\n\n---\n\n');

          retrievedCitations = matchingChunks.map((c) => ({
            id: `cite-${c.id}`,
            chunkId: c.id,
            documentId: c.documentId,
            documentName: c.documentName,
            pageNumber: c.pageNumber || 1,
            chunkIndex: c.chunkIndex,
            similarityScore: c.similarityScore || 0.85,
            snippet: c.content.slice(0, 150) + '...',
          }));
        }
      } catch (embErr) {
        console.warn('Vector embedding retrieval error:', embErr);
      }
    }

    try {
      let accumulatedContent = '';

      // Prepare multi-turn history for Gemini
      const conversationHistory = [
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: queryText },
      ];

      // Stream response using Gemini endpoint
      await streamGeminiChat(
        {
          messages: conversationHistory,
          systemInstruction: activeRole.systemInstruction,
          taskType,
          enableSearch: enableGoogleSearch,
          retrievedContext,
          onToken: (token) => {
            if (abortController.signal.aborted) return;
            accumulatedContent += token;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
              )
            );
          },
          onComplete: ({ model, groundingChunks, webSearchQueries }) => {
            const latencyMs = Date.now() - startTime;
            const finalAssistantMessage: ChatMessage = {
              id: assistantMsgId,
              sessionId: targetSessionId!,
              role: 'assistant',
              content: accumulatedContent,
              isStreaming: false,
              citations: retrievedCitations,
              groundingChunks: groundingChunks as GroundingWebChunk[],
              webSearchQueries,
              modelUsed: model,
              rolePersona: activeRole.name,
              latencyMs,
              tokenUsage: {
                promptTokens: Math.round(queryText.length / 4) + Math.round(retrievedContext.length / 4),
                completionTokens: Math.round(accumulatedContent.length / 4),
                totalTokens:
                  Math.round(queryText.length / 4) +
                  Math.round(retrievedContext.length / 4) +
                  Math.round(accumulatedContent.length / 4),
              },
              createdAt: new Date().toISOString(),
            };

            const finalMessagesList = [...messages, userMessage, finalAssistantMessage];
            setMessages(finalMessagesList);

            setChatSessions((prev) =>
              prev.map((s) => {
                if (s.id === targetSessionId) {
                  const isFirst = s.messages.length === 0;
                  return {
                    ...s,
                    title: isFirst ? queryText.slice(0, 35) : s.title,
                    updatedAt: new Date().toISOString(),
                    messages: finalMessagesList,
                  };
                }
                return s;
              })
            );
          },
          onError: async (error) => {
            console.warn('Gemini chat error, attempting local engine fallback:', error);
            // Fallback to local semantic RAG engine if Gemini endpoint has issues
            try {
              const ragResult = await executeRAGQuery({
                query: queryText,
                workspaceId: currentWorkspace.id,
                settings,
                onToken: (token) => {
                  accumulatedContent += token;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
                    )
                  );
                },
              });

              const fallbackMsg: ChatMessage = {
                id: assistantMsgId,
                sessionId: targetSessionId!,
                role: 'assistant',
                content: ragResult.answer,
                isStreaming: false,
                citations: ragResult.citations,
                modelUsed: 'Local Semantic Fallback',
                rolePersona: activeRole.name,
                createdAt: new Date().toISOString(),
              };

              setMessages([...messages, userMessage, fallbackMsg]);
            } catch (fallbackErr: any) {
              const errorMessage: ChatMessage = {
                id: assistantMsgId,
                sessionId: targetSessionId!,
                role: 'assistant',
                content: `Could not synthesize response: ${error.message || 'Service unavailable'}. Please verify your API key in Settings > Secrets.`,
                isStreaming: false,
                createdAt: new Date().toISOString(),
              };
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? errorMessage : m))
              );
            }
          },
        },
        abortController.signal
      );
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        console.error('Execution error:', err);
        const errorMessage: ChatMessage = {
          id: assistantMsgId,
          sessionId: targetSessionId,
          role: 'assistant',
          content: `Error: ${err.message || 'An unexpected error occurred.'}`,
          isStreaming: false,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? errorMessage : m))
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
  };

  // Inline citation inspection
  const handleSelectCitation = (citation: Citation) => {
    setSelectedCitation(citation);
    if (citation.chunkId) {
      const chunks = globalVectorStore.getDocumentChunks(citation.documentId);
      const found = chunks.find((c) => c.id === citation.chunkId);
      setInspectedChunk(found || null);
    } else {
      setInspectedChunk(null);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-900 font-sans antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        documents={documents}
        chatSessions={chatSessions.filter((s) => s.workspaceId === currentWorkspace.id)}
        activeSessionId={activeSessionId}
        onSelectWorkspace={handleSelectWorkspace}
        onOpenNewWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        onOpenUploadModal={() => setIsUploadOpen(true)}
        onOpenChunkViewer={(doc) => setActiveChunkDoc(doc)}
        onDeleteDocument={handleDeleteDocument}
        onSelectChatSession={handleSelectChatSession}
        onNewChatSession={handleNewChatSession}
        onDeleteChatSession={handleDeleteChatSession}
        onOpenArchitectureModal={() => setIsArchitectureModalOpen(true)}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Chat Interface */}
      <ChatInterface
        currentWorkspace={currentWorkspace}
        documents={documents}
        messages={messages}
        isStreaming={isStreaming}
        settings={settings}
        activeRole={activeRole}
        taskType={taskType}
        enableGoogleSearch={enableGoogleSearch}
        enableDocContext={enableDocContext}
        onChangeRole={setActiveRole}
        onChangeTaskType={setTaskType}
        onToggleGoogleSearch={() => setEnableGoogleSearch((prev) => !prev)}
        onToggleDocContext={() => setEnableDocContext((prev) => !prev)}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        onClearChat={handleClearCurrentChat}
        onSelectCitation={handleSelectCitation}
        onOpenUploadModal={() => setIsUploadOpen(true)}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
      />

      {/* Verifiable Citation Inspector Modal */}
      <CitationDrawer
        isOpen={!!selectedCitation}
        citation={selectedCitation}
        chunk={inspectedChunk}
        onClose={() => {
          setSelectedCitation(null);
          setInspectedChunk(null);
        }}
      />

      {/* Multi-File Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        workspaceId={currentWorkspace.id}
        settings={settings}
        onUploadSuccess={() => {
          refreshDocuments();
          setIsUploadOpen(false);
        }}
      />

      {/* Document Chunk & Vector Inspector */}
      <DocumentChunkViewer
        isOpen={!!activeChunkDoc}
        document={activeChunkDoc}
        onClose={() => setActiveChunkDoc(null)}
      />

      {/* Workspace Creation Modal */}
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onCreateWorkspace={handleCreateWorkspace}
      />

      {/* Architecture, Schema & Cost Analysis Modal */}
      <ArchitectureModal
        isOpen={isArchitectureModalOpen}
        onClose={() => setIsArchitectureModalOpen(false)}
      />

      {/* API Key & Hyperparameters Configuration Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        settings={settings}
        onSaveSettings={(newSettings) => setSettings(newSettings)}
      />
    </div>
  );
}
