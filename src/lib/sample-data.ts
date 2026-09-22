/**
 * Sample Seed Data for instant out-of-the-box RAG testing.
 * Provides realistic enterprise documents across PDF, MD, and TXT formats.
 */

import { DocumentChunk, DocumentItem, Workspace } from '../types/rag';
import { RecursiveCharacterTextSplitter } from './text-splitter';
import { globalVectorStore } from './vector-store';

export const DEFAULT_WORKSPACE: Workspace = {
  id: 'ws-enterprise-default',
  name: 'Acme Enterprise & Security',
  slug: 'acme-enterprise-security',
  description: 'Corporate filings, technical infrastructure specifications, and compliance handbooks.',
  createdAt: new Date().toISOString(),
  documentCount: 3,
};

const SAMPLE_DOCUMENTS = [
  {
    id: 'doc-financial-q3',
    name: 'Quarterly_Financial_Report_Q3.pdf',
    fileType: 'pdf' as const,
    fileSize: 428000,
    pageCount: 4,
    content: `ACME CORPORATION - Q3 FINANCIAL RESULTS & INVESTOR PRESENTATION
Page 1 - Executive Summary
Acme Corporation recorded total quarterly revenue of $142.8 million for the third quarter of fiscal year 2025, representing an increase of 24.3% year-over-year compared to $114.9 million in Q3 of the prior fiscal year. Operating income reached $38.4 million, reflecting an operating margin of 26.9%, up 310 basis points compared to Q3 2024. Net income attributable to common shareholders was $31.2 million, or $0.78 per diluted share, surpassing consensus estimates by $0.09.

\f
Page 2 - Segment Breakdown & Capital Expenditures
Enterprise Cloud Infrastructure generated $88.5 million in subscription revenue, up 31.2% year-over-year, driven by accelerated adoption of our automated Retrieval-Augmented Generation (RAG) platform and real-time inference services. Consumer subscriptions contributed $34.1 million, growing 11.5% YoY. Professional Services and enterprise support contracts accounted for the remaining $20.2 million.
Capital expenditures (CapEx) totaled $21.5 million during the quarter, with 78% dedicated to procuring high-density GPU clusters and expanding data center rack capacity in northern Virginia and Frankfurt. Free cash flow stood at $26.9 million at quarter end.

\f
Page 3 - Liquidity, Balance Sheet & Dividend
Cash, cash equivalents, and short-term marketable securities totaled $215.4 million as of September 30, 2025, compared to $184.2 million as of December 31, 2024. Acme carries zero outstanding long-term debt under its revolving credit facility.
The Board of Directors declared a quarterly cash dividend of $0.16 per share of common stock, payable on November 14, 2025, to stockholders of record at the close of business on October 24, 2025. Share repurchases under the 2024 Authorization totaled $10.0 million during the quarter.

\f
Page 4 - Forward-Looking Financial Guidance
For the fourth quarter of fiscal 2025, Acme Corporation expects revenue in the range of $150.0 million to $154.0 million. Non-GAAP operating margin is projected to remain between 26.5% and 27.5%. Diluted earnings per share is modeled between $0.81 and $0.85 based on an estimated 40.2 million diluted shares outstanding. Full fiscal year 2025 revenue guidance is updated to $545.0M - $550.0M, reflecting strong sustained pipeline velocity across Fortune 500 customers.`,
  },
  {
    id: 'doc-security-spec',
    name: 'Cloud_Architecture_Security_Spec.md',
    fileType: 'md' as const,
    fileSize: 185000,
    pageCount: 3,
    content: `# Enterprise Cloud Architecture & Security Specification (v4.2)

--- Page 1 ---
## 1. Zero Trust Network Architecture & Identity Isolation
All network communications within the production Kubernetes cluster enforce mutual TLS (mTLS) via Istio service mesh with SPIFFE/SPIRE cryptographic identities. Ingress traffic terminates at hardened Envoy edge proxies configured with WAF rate limiting and TLS 1.3 only. 
Workspaces are logically isolated at both the application and database tiers. Each tenant's vector chunks are indexed with strict \`workspace_id\` row-level constraints. Cross-workspace vector similarity searches are strictly forbidden at the PostgreSQL pgvector extension layer.

--- Page 2 ---
## 2. PostgreSQL with pgvector Indexing Strategy
Vector similarity queries use the Hierarchical Navigable Small World (HNSW) indexing algorithm over an Inverted File Flat (IVFFlat) index. The HNSW index is defined with parameters \`m = 16\` and \`ef_construction = 64\`, utilizing cosine distance operators (\`vector_cosine_ops\`).
During retrieval, queries execute with an \`ef_search\` value of 40, achieving an average retrieval latency of 3.4 milliseconds across 500,000 document chunks with a 99.1% Recall@10 accuracy rating. All database connections use connection pooling via PgBouncer with encrypted SSL mode \`verify-full\`.

--- Page 3 ---
## 3. Threat Modeling & Prompt Injection Mitigation
All user input submitted to the RAG endpoint undergoes dual-layer sanitization:
1. Lexical filtering for instruction override directives (e.g., "ignore prior instructions", "system jailbreak").
2. Context encapsulation inside sanitized XML delimiters (\`<retrieved_context>\`).
The LLM system prompt is cryptographically signed at application boot and instructs the model to refuse synthesis if retrieved similarity scores fall below the 0.45 cosine similarity threshold. SOC 2 Type II compliance audits are conducted biannually by independent certified assessors.`,
  },
  {
    id: 'doc-employee-handbook',
    name: 'Employee_Handbook_2025.txt',
    fileType: 'txt' as const,
    fileSize: 94000,
    pageCount: 2,
    content: `ACME GLOBAL EMPLOYEE HANDBOOK & POLICY GUIDELINES (2025 EDITION)

Section 1: Work Schedule, Flexibility & Remote Stipend
Acme operates as a remote-first organization with core collaborative hours scheduled between 10:00 AM and 3:00 PM in the employee's local timezone. All full-time employees are eligible for a one-time home office equipment stipend of $1,500 upon joining the company to purchase ergonomic desks, monitors, and chairs.
Additionally, employees receive an ongoing monthly wellness and internet reimbursement of $120 submitted via the expense portal before the 25th of each calendar month.

\f
Section 2: Paid Time Off (PTO), Parental Leave & Health Benefits
Acme provides a Flexible Paid Time Off policy for all salaried staff, with a recommended minimum of 20 days off per calendar year to promote work-life harmony. Standard company holidays include 11 observed federal holidays plus a company-wide winter recharge week between December 24 and January 1.
New parents (birth, adoption, or foster placement) receive 16 consecutive weeks of 100% paid parental leave, eligible to be taken within the first 12 months following the child's arrival. Medical, dental, and vision insurance coverage takes effect on the employee's first calendar day of employment.`,
  },
];

export async function seedSampleDataIfEmpty() {
  const existingDocs = globalVectorStore.getDocuments(DEFAULT_WORKSPACE.id);
  if (existingDocs.length > 0) {
    return;
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 750,
    chunkOverlap: 120,
  });

  for (const sample of SAMPLE_DOCUMENTS) {
    const docItem: DocumentItem = {
      id: sample.id,
      workspaceId: DEFAULT_WORKSPACE.id,
      name: sample.name,
      fileType: sample.fileType,
      fileSize: sample.fileSize,
      pageCount: sample.pageCount,
      status: 'READY',
      chunksCount: 0,
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    };

    const textChunks = splitter.splitText(sample.content);
    docItem.chunksCount = textChunks.length;

    // Generate local semantic embeddings for each chunk
    const contents = textChunks.map((tc) => tc.content);
    const vectors = await globalVectorStore.generateLocalSemanticEmbeddings(contents);

    const docChunks: DocumentChunk[] = textChunks.map((tc, idx) => ({
      id: `chunk-${sample.id}-${idx}`,
      documentId: sample.id,
      documentName: sample.name,
      workspaceId: DEFAULT_WORKSPACE.id,
      chunkIndex: tc.chunkIndex,
      content: tc.content,
      pageNumber: tc.pageNumber,
      tokenCount: tc.tokenCount,
      startChar: tc.startChar,
      endChar: tc.endChar,
      embedding: vectors[idx],
    }));

    globalVectorStore.addDocument(docItem);
    globalVectorStore.storeChunks(docChunks);
  }
}
