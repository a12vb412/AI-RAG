/**
 * Type definitions for Document Q&A RAG Engine
 */

export type FileType = 'pdf' | 'txt' | 'md';

export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  workspaceId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number;
  tokenCount: number;
  startChar: number;
  endChar: number;
  embedding?: number[]; // 1536-dimensional vector
  similarityScore?: number;
}

export interface DocumentItem {
  id: string;
  workspaceId: string;
  name: string;
  fileType: FileType;
  fileSize: number;
  pageCount: number;
  status: DocumentStatus;
  errorMessage?: string;
  chunksCount: number;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  documentCount: number;
}

export interface Citation {
  id: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  similarityScore: number;
  snippet: string;
}

export interface GroundingWebChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export type GeminiTaskType = 'fast' | 'general' | 'complex';

export interface ChatbotRole {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  defaultTaskType: GeminiTaskType;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  createdAt: string;
  citations?: Citation[];
  groundingChunks?: GroundingWebChunk[];
  webSearchQueries?: string[];
  modelUsed?: string;
  rolePersona?: string;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface RAGSettings {
  provider: 'openai' | 'gemini' | 'local';
  openaiApiKey?: string;
  geminiApiKey?: string;
  embeddingModel: string;
  chatModel: string;
  chunkSize: number; // in characters (~800)
  chunkOverlap: number; // in characters (~150)
  topK: number; // retrieved chunks (~5)
  similarityThreshold: number; // minimum cosine similarity (0.0 - 1.0)
}

export interface UploadProgressItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: FileType;
  progress: number;
  status: 'QUEUED' | 'PARSING' | 'CHUNKING' | 'EMBEDDING' | 'READY' | 'ERROR';
  chunksGenerated: number;
  errorMessage?: string;
}
