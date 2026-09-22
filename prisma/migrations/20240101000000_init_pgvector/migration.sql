-- Enable pgvector extension for dense vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Enum Types
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT,
  "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Workspaces Table
CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT UNIQUE NOT NULL,
  "description" TEXT,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_workspace_owner" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_workspace_ownerId" ON "Workspace"("ownerId");

-- 3. Workspace Members Table
CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_member_workspace" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_member_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "uq_workspace_user" UNIQUE ("workspaceId", "userId")
);
CREATE INDEX IF NOT EXISTS "idx_member_workspace" ON "WorkspaceMember"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_member_user" ON "WorkspaceMember"("userId");

-- 4. Documents Table
CREATE TABLE IF NOT EXISTS "Document" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "pageCount" INTEGER NOT NULL DEFAULT 1,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "checksum" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_document_workspace" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_document_workspace" ON "Document"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_document_workspace_status" ON "Document"("workspaceId", "status");

-- 5. Document Chunks Table (Vector Storage)
CREATE TABLE IF NOT EXISTS "DocumentChunk" (
  "id" TEXT PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "pageNumber" INTEGER,
  "tokenCount" INTEGER NOT NULL,
  "metadata" JSONB,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_chunk_document" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_chunk_workspace" ON "DocumentChunk"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_chunk_document" ON "DocumentChunk"("documentId");
CREATE INDEX IF NOT EXISTS "idx_chunk_doc_index" ON "DocumentChunk"("documentId", "chunkIndex");

-- Fast Approximate Nearest Neighbor (ANN) HNSW index with Cosine Distance
-- m = 16 (max links per node), ef_construction = 64 (search queue size during build)
CREATE INDEX IF NOT EXISTS "idx_document_chunks_embedding_hnsw"
  ON "DocumentChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 6. Chat Sessions Table
CREATE TABLE IF NOT EXISTS "ChatSession" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New Conversation',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_chat_workspace" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_chat_workspace" ON "ChatSession"("workspaceId");

-- 7. Chat Messages Table
CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "tokenUsage" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_message_session" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_message_session" ON "ChatMessage"("sessionId");

-- 8. Citations Table
CREATE TABLE IF NOT EXISTS "Citation" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "chunkId" TEXT,
  "documentId" TEXT NOT NULL,
  "documentName" TEXT NOT NULL,
  "pageNumber" INTEGER,
  "similarityScore" DOUBLE PRECISION NOT NULL,
  "snippet" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_citation_message" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_citation_chunk" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "idx_citation_message" ON "Citation"("messageId");
CREATE INDEX IF NOT EXISTS "idx_citation_chunk" ON "Citation"("chunkId");

-- 9. PostgreSQL Stored Function for Vector Match (RAG retrieval query)
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold double precision,
  match_count integer,
  filter_workspace_id text
)
RETURNS TABLE (
  id text,
  document_id text,
  document_name text,
  page_number integer,
  chunk_index integer,
  content text,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc."documentId" AS document_id,
    d.name AS document_name,
    dc."pageNumber" AS page_number,
    dc."chunkIndex" AS chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM "DocumentChunk" dc
  INNER JOIN "Document" d ON dc."documentId" = d.id
  WHERE dc."workspaceId" = filter_workspace_id
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
  ORDER BY dc.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;
