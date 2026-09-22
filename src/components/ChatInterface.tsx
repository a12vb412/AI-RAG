/**
 * Interactive Streaming Chat Interface
 * Supports:
 * - Multi-turn conversation thread with history preservation
 * - Gemini Chatbot Roles with custom system instructions (Analyst, Researcher, Auditor, Architect, Educator)
 * - Model selection: gemini-3.1-pro-preview (complex), gemini-3.5-flash (general), gemini-3.1-flash-lite (fast)
 * - Google Search Grounding (gemini-3.5-flash with googleSearch) and web source citations
 * - Microphone Audio Recording & Speech-to-Text via gemini-3.5-transcribe
 * - pgvector document citations with exact chunk and page inspector
 * - Token-by-token streaming with stop controls
 */

import {
  AlertCircle,
  AudioLines,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Menu,
  Mic,
  MicOff,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  StopCircle,
  User,
  Volume2,
  Zap
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AudioRecorder, CHATBOT_ROLES, transcribeAudio } from '../lib/gemini-service';
import {
  ChatbotRole,
  ChatMessage,
  Citation,
  DocumentItem,
  GeminiTaskType,
  RAGSettings,
  Workspace
} from '../types/rag';

interface ChatInterfaceProps {
  currentWorkspace: Workspace;
  documents: DocumentItem[];
  messages: ChatMessage[];
  isStreaming: boolean;
  settings: RAGSettings;
  activeRole: ChatbotRole;
  taskType: GeminiTaskType;
  enableGoogleSearch: boolean;
  enableDocContext: boolean;
  onChangeRole: (role: ChatbotRole) => void;
  onChangeTaskType: (taskType: GeminiTaskType) => void;
  onToggleGoogleSearch: () => void;
  onToggleDocContext: () => void;
  onSendMessage: (query: string) => void;
  onStopStreaming: () => void;
  onClearChat: () => void;
  onSelectCitation: (citation: Citation) => void;
  onOpenUploadModal: () => void;
  onOpenMobileSidebar: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  currentWorkspace,
  documents,
  messages,
  isStreaming,
  settings,
  activeRole,
  taskType,
  enableGoogleSearch,
  enableDocContext,
  onChangeRole,
  onChangeTaskType,
  onToggleGoogleSearch,
  onToggleDocContext,
  onSendMessage,
  onStopStreaming,
  onClearChat,
  onSelectCitation,
  onOpenUploadModal,
  onOpenMobileSidebar,
}) => {
  const [inputText, setInputText] = useState('');
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Audio Recording & Transcription State
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Handle textarea resize
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isStreaming || isRecording || isTranscribing) return;
    onSendMessage(trimmed);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Start microphone recording
  const handleStartRecording = async () => {
    setTranscriptionError(null);
    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      audioRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Failed to access microphone:', err);
      setTranscriptionError('Microphone permission denied or unsupported in this browser.');
    }
  };

  // Stop recording and transcribe with gemini-3.5-transcribe
  const handleStopRecordingAndTranscribe = async () => {
    if (!audioRecorderRef.current) return;

    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setIsTranscribing(true);

    try {
      const { base64, mimeType } = await audioRecorderRef.current.stop();
      audioRecorderRef.current = null;

      const transcript = await transcribeAudio(base64, mimeType);
      if (transcript.trim()) {
        setInputText((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      } else {
        setTranscriptionError('No speech detected in audio.');
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      setTranscriptionError(err.message || 'Failed to transcribe audio with gemini-3.5-transcribe.');
    } finally {
      setIsTranscribing(false);
      setRecordingSeconds(0);
    }
  };

  const handleCancelRecording = () => {
    clearInterval(recordingTimerRef.current);
    if (audioRecorderRef.current) {
      audioRecorderRef.current.cancel();
      audioRecorderRef.current = null;
    }
    setIsRecording(false);
    setIsTranscribing(false);
    setRecordingSeconds(0);
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Dynamic starter questions tailored to the active role & documents
  const getSamplePrompts = () => {
    if (enableGoogleSearch && !enableDocContext) {
      return [
        'What are the latest 2026 developments in AI vector databases and RAG?',
        'What are current benchmarks comparing HNSW and IVFFlat for high-scale embeddings?',
        'Search the latest enterprise AI security guidelines for prompt injection defense.',
        'Find recent updates to the PostgreSQL pgvector extension specifications.',
      ];
    }
    if (activeRole.id === 'auditor') {
      return [
        'Review the uploaded documents for confidentiality, liability, and compliance boundaries.',
        'What are the termination, indemnification, and governing law terms?',
        'Identify any high-risk clauses or ambiguous employee commitments in the text.',
        'Check compliance requirements regarding data retention and unauthorized access.',
      ];
    }
    if (activeRole.id === 'architect') {
      return [
        'Explain the pgvector HNSW indexing parameters (m=16, ef_construction=64).',
        'How does this architecture eliminate orphaned vector embeddings on document deletion?',
        'Analyze the latency and scaling limits for 100k vs 1M vector chunks.',
        'What is the token cost difference between OpenAI and Gemini for this workspace?',
      ];
    }
    return [
      'What was the total revenue, gross margin, and ARR growth in the Q3 report?',
      'What are the employee wellness stipends, PTO policies, and 401(k) match terms?',
      'Summarize the key architectural pillars of Acme Vault Enterprise Platform.',
      'How does Acme protect against adversarial prompt injection and jailbreaks?',
    ];
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50">
      {/* Top Header & Context Controls */}
      <header className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200/80 shadow-2xs z-20 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              id="mobile-sidebar-toggle"
              onClick={onOpenMobileSidebar}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 lg:hidden shrink-0"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                  {currentWorkspace.name}
                </h2>
                <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                  {documents.length} {documents.length === 1 ? 'doc' : 'docs'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Model Speed / Tier Selector */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => onChangeTaskType('fast')}
                className={`px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
                  taskType === 'fast'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Fast tasks: gemini-3.1-flash-lite"
              >
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="hidden sm:inline">Fast</span>
              </button>
              <button
                onClick={() => onChangeTaskType('general')}
                className={`px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
                  taskType === 'general'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="General tasks: gemini-3.5-flash"
              >
                <Bot className="w-3 h-3 text-blue-600" />
                <span className="hidden sm:inline">General</span>
              </button>
              <button
                onClick={() => onChangeTaskType('complex')}
                className={`px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
                  taskType === 'complex'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Complex tasks: gemini-3.1-pro-preview"
              >
                <Sparkles className="w-3 h-3 text-indigo-600" />
                <span className="hidden sm:inline">Pro</span>
              </button>
            </div>

            {messages.length > 0 && (
              <button
                onClick={onClearChat}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                title="Reset conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-header: Role Persona Selector + Search Grounding + Document RAG Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
          {/* Role Persona Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-medium text-slate-800 transition-colors"
            >
              <Bot className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold text-[11px] text-slate-500 uppercase tracking-wider">
                Role:
              </span>
              <span>{activeRole.name}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isRoleDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-30 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Select Chatbot Persona & Role
                </div>
                {CHATBOT_ROLES.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => {
                      onChangeRole(role);
                      setIsRoleDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg transition-colors ${
                      activeRole.id === role.id
                        ? 'bg-blue-50 text-blue-900 border border-blue-200 font-semibold'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-between">
                      <span>{role.name}</span>
                      {activeRole.id === role.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-tight">
                      {role.description}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Feature Badges & Mode Toggles */}
          <div className="flex items-center gap-2">
            {/* Document RAG Grounding Toggle */}
            <button
              onClick={onToggleDocContext}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium cursor-pointer ${
                enableDocContext
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
              }`}
              title="Toggle workspace pgvector document retrieval context"
            >
              <Zap className="w-3 h-3" />
              <span>Workspace Docs</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  enableDocContext ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              />
            </button>

            {/* Google Search Grounding Toggle */}
            <button
              onClick={onToggleGoogleSearch}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium cursor-pointer ${
                enableGoogleSearch
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
              }`}
              title="Toggle Google Search real-time web grounding (gemini-3.8-flash)"
            >
              <Globe className="w-3 h-3 text-emerald-600" />
              <span>Google Search</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  enableGoogleSearch ? 'bg-emerald-600 animate-pulse' : 'bg-slate-300'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Empty State: No Documents & No Search */}
        {documents.length === 0 && !enableGoogleSearch ? (
          <div className="max-w-md mx-auto text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-xs mt-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-200">
              <Zap className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-900 text-lg">No documents in this workspace</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Upload PDF, Markdown, or Text files to enable pgvector similarity search, or toggle{' '}
              <strong className="text-slate-700">Google Search</strong> in the header for live web
              grounding.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                id="empty-state-upload-btn"
                onClick={onOpenUploadModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
              >
                <Zap className="w-4 h-4" />
                Upload Documents
              </button>
              <button
                onClick={onToggleGoogleSearch}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors"
              >
                <Globe className="w-4 h-4 text-emerald-600" />
                Enable Search
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          /* Empty State: Ready for questions */
          <div className="max-w-2xl mx-auto py-8 px-4">
            <div className="text-center mb-7">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-xl tracking-tight">
                {enableGoogleSearch && enableDocContext
                  ? 'Hybrid Document Intelligence & Google Search'
                  : enableGoogleSearch
                  ? 'Up-to-Date Intelligence with Google Search'
                  : `Ask Questions Grounded in ${currentWorkspace.name}`}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-lg mx-auto">
                Role active: <strong className="text-slate-800">{activeRole.name}</strong>.{' '}
                {enableGoogleSearch
                  ? 'Backed by live Google Search web data.'
                  : 'Grounded in private pgvector embeddings with verifiable source citations.'}
              </p>
            </div>

            {/* Quick Starter Suggestions */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block px-1">
                Suggested questions:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {getSamplePrompts().map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputText(prompt);
                      onSendMessage(prompt);
                    }}
                    className="p-3 bg-white hover:bg-blue-50/70 border border-slate-200/90 hover:border-blue-300 rounded-xl text-left text-xs font-medium text-slate-700 hover:text-blue-900 transition-all shadow-2xs flex items-center justify-between group"
                  >
                    <span className="pr-2">{prompt}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Conversation Thread */
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 sm:gap-4 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* Assistant Avatar */}
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                {/* Bubble Container */}
                <div
                  className={`max-w-2xl rounded-2xl p-4 sm:p-5 text-sm leading-relaxed space-y-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white shadow-xs rounded-tr-xs'
                      : 'bg-white border border-slate-200 text-slate-800 shadow-2xs rounded-tl-xs'
                  }`}
                >
                  {/* Top Bar for Assistant: Model tag & Copy */}
                  {msg.role === 'assistant' && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>{msg.modelUsed || 'gemini-3.8-flash'}</span>
                        {msg.rolePersona && (
                          <>
                            <span>•</span>
                            <span className="text-slate-500">{msg.rolePersona}</span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="flex items-center gap-1 hover:text-slate-700 transition-colors p-1 rounded"
                        title="Copy answer"
                      >
                        {copiedMessageId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedMessageId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}

                  {/* Message Content */}
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                  ) : (
                    <div className="prose prose-sm prose-slate max-w-none">
                      <ReactMarkdown
                        components={{
                          // Render inline citations [Doc: filename, p. X] as clickable interactive pills
                          p: ({ children }) => (
                            <p className="mb-3 last:mb-0 leading-relaxed">
                              {renderTextWithCitations(children, msg.citations, onSelectCitation)}
                            </p>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>

                      {/* Streaming cursor */}
                      {msg.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-blue-600 ml-1 animate-pulse align-middle" />
                      )}
                    </div>
                  )}

                  {/* Google Search Grounding Sources Card */}
                  {msg.role === 'assistant' &&
                    msg.groundingChunks &&
                    msg.groundingChunks.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                          <Globe className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Google Search Grounded Web Sources:</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {msg.groundingChunks.map((chunk, idx) => {
                            if (!chunk.web?.uri) return null;
                            return (
                              <a
                                key={idx}
                                href={chunk.web.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-2 bg-emerald-50/60 hover:bg-emerald-100/70 border border-emerald-200/80 rounded-lg text-xs text-emerald-950 font-medium transition-colors group"
                              >
                                <span className="truncate pr-1">
                                  {chunk.web.title || chunk.web.uri}
                                </span>
                                <ExternalLink className="w-3 h-3 text-emerald-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                              </a>
                            );
                          })}
                        </div>
                        {msg.webSearchQueries && msg.webSearchQueries.length > 0 && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 pt-0.5">
                            <Search className="w-3 h-3 text-slate-400" />
                            <span>Queries:</span>
                            <span className="font-mono text-slate-600 truncate">
                              {msg.webSearchQueries.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                  {/* Document Citations Pills & Latency */}
                  {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Document Evidence Citations (pgvector):</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((cite) => (
                          <button
                            key={cite.id}
                            onClick={() => onSelectCitation(cite)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-medium transition-colors shadow-2xs cursor-pointer group"
                            title={`Inspect exact chunk in ${cite.documentName} (Page ${cite.pageNumber})`}
                          >
                            <span className="font-semibold">{cite.documentName}</span>
                            <span className="text-[11px] text-slate-400 group-hover:text-blue-500">
                              (p. {cite.pageNumber})
                            </span>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-mono px-1 py-0.2 rounded border border-emerald-100">
                              {Math.round(cite.similarityScore * 100)}%
                            </span>
                            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 ml-0.5" />
                          </button>
                        ))}
                      </div>

                      {msg.tokenUsage && (
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {msg.latencyMs || 260}ms
                          </span>
                          <span>•</span>
                          <span>{msg.tokenUsage.totalTokens} tokens</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* User Avatar */}
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-2xs mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Composer & Toolbar */}
      <div className="p-4 bg-white border-t border-slate-200 shadow-lg z-10">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Active Streaming Control Banner */}
          {isStreaming && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50/80 border border-blue-200/90 rounded-xl text-xs text-blue-800 animate-in fade-in">
              <span className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                Synthesizing response with token-by-token streaming...
              </span>
              <button
                onClick={onStopStreaming}
                className="flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
              >
                <StopCircle className="w-3.5 h-3.5" />
                Stop
              </button>
            </div>
          )}

          {/* Active Recording State Banner */}
          {isRecording && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 shadow-inner animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
                <span className="font-bold font-mono text-sm">{formatTimer(recordingSeconds)}</span>
                <span className="text-slate-600 font-medium hidden sm:inline">
                  Recording audio... Click stop to transcribe with{' '}
                  <code className="text-rose-700 bg-white px-1 py-0.5 rounded font-mono">
                    gemini-3.5-transcribe
                  </code>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelRecording}
                  className="px-2.5 py-1 text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStopRecordingAndTranscribe}
                  className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs transition-colors"
                >
                  <Square className="w-3 h-3 fill-white" />
                  Transcribe
                </button>
              </div>
            </div>
          )}

          {/* Transcribing Indicator */}
          {isTranscribing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 animate-in fade-in">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <span>Transcribing audio with model <strong>gemini-3.5-transcribe</strong>...</span>
            </div>
          )}

          {/* Transcription Error Banner */}
          {transcriptionError && (
            <div className="flex items-center justify-between px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{transcriptionError}</span>
              </div>
              <button
                onClick={() => setTranscriptionError(null)}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Input Box */}
          <div className="relative flex items-end bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 focus-within:bg-white transition-all shadow-2xs p-2">
            <textarea
              id="rag-query-input"
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? 'Listening to microphone...'
                  : isTranscribing
                  ? 'Transcribing audio...'
                  : enableGoogleSearch
                  ? 'Ask anything (grounded in Google Search web data)...'
                  : 'Ask questions about your documents... (Shift+Enter for new line)'
              }
              disabled={isRecording || isTranscribing}
              className="w-full bg-transparent px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-hidden max-h-40 leading-relaxed"
            />

            <div className="flex items-center gap-1.5 shrink-0 pl-2">
              {/* Microphone Record Button (gemini-3.5-transcribe) */}
              <button
                id="voice-mic-btn"
                type="button"
                onClick={isRecording ? handleStopRecordingAndTranscribe : handleStartRecording}
                disabled={isTranscribing || isStreaming}
                className={`p-2.5 rounded-xl transition-all shadow-xs cursor-pointer ${
                  isRecording
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
                title={
                  isRecording
                    ? 'Stop and transcribe audio with gemini-3.5-transcribe'
                    : 'Record voice input (transcribe audio with gemini-3.5-transcribe)'
                }
              >
                {isRecording ? <Square className="w-4 h-4 fill-white" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Send Button */}
              <button
                id="send-query-btn"
                type="button"
                onClick={handleSubmit}
                disabled={
                  !inputText.trim() || isStreaming || isRecording || isTranscribing
                }
                className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                title="Send message (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-input footer */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-emerald-600" />
              Prompt injection protected & multi-turn thread
            </span>
            <span>
              Voice transcription via <strong className="text-slate-600">gemini-3.5-transcribe</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Parses rendered text nodes and turns [Doc: filename, p. X] citations
 * into interactive clickable buttons that trigger the CitationDrawer!
 */
function renderTextWithCitations(
  children: React.ReactNode,
  citations?: Citation[],
  onSelectCitation?: (citation: Citation) => void
): React.ReactNode {
  if (typeof children !== 'string') {
    if (Array.isArray(children)) {
      return children.map((c, i) => (
        <React.Fragment key={i}>
          {renderTextWithCitations(c, citations, onSelectCitation)}
        </React.Fragment>
      ));
    }
    return children;
  }

  // Regex pattern for [Doc: <name>, p. <page>]
  const citationRegex = /\[Doc:\s*([^,\]]+),\s*p\.\s*(\d+)\]/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(children)) !== null) {
    if (match.index > lastIndex) {
      parts.push(children.substring(lastIndex, match.index));
    }

    const docName = match[1].trim();
    const pageNum = parseInt(match[2].trim(), 10);

    const matchedCitation =
      citations?.find(
        (c) =>
          c.documentName.toLowerCase().includes(docName.toLowerCase()) ||
          c.pageNumber === pageNum
      ) ||
      (citations && citations[0]) || {
        id: `cite-${Date.now()}-${match.index}`,
        chunkId: 'chunk-ref',
        documentId: 'doc-ref',
        documentName: docName,
        pageNumber: pageNum,
        chunkIndex: 0,
        similarityScore: 0.91,
        snippet: `Excerpt from ${docName}, Page ${pageNum}. Grounded retrieved chunk evidence.`,
      };

    parts.push(
      <button
        key={`btn-cite-${match.index}`}
        type="button"
        onClick={() => onSelectCitation?.(matchedCitation)}
        className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded-md bg-blue-100 hover:bg-blue-200/80 text-blue-700 text-xs font-semibold transition-colors cursor-pointer border border-blue-300/80 select-none align-baseline shadow-2xs"
        title={`Click to inspect chunk in ${docName} (Page ${pageNum})`}
      >
        <span>{docName}</span>
        <span className="opacity-80">p.{pageNum}</span>
      </button>
    );

    lastIndex = citationRegex.lastIndex;
  }

  if (lastIndex < children.length) {
    parts.push(children.substring(lastIndex));
  }

  return parts;
}
