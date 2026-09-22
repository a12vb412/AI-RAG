/**
 * Client-side Gemini service and Chatbot Role definitions
 * Supports:
 * - Multi-turn conversation streaming with specific system instruction roles
 * - Google Search Grounding with gemini-3.5-flash
 * - Audio recording and transcription via gemini-3.5-transcribe
 * - Model selection: gemini-3.1-pro-preview (complex), gemini-3.5-flash (general), gemini-3.1-flash-lite (fast)
 */

import { ChatbotRole, GeminiTaskType, GroundingWebChunk } from '../types/rag';

export const CHATBOT_ROLES: ChatbotRole[] = [
  {
    id: 'analyst',
    name: 'Document Intelligence Analyst',
    description: 'Deep analytical cross-referencing of workspace documents with verifiable citations.',
    defaultTaskType: 'general',
    systemInstruction: `You are an elite Document Intelligence & Knowledge Analyst.
Your mission is to analyze documents provided in the workspace with surgical precision.
- Synthesize answers thoroughly using retrieved document chunks.
- Always cross-reference multiple sections when relevant.
- Cite specific document names and pages whenever quoting facts.
- Distinguish clearly between facts explicitly stated in documents and general knowledge.
- If information is missing from the documents, state that candidly.`,
  },
  {
    id: 'researcher',
    name: 'Executive Web Researcher',
    description: 'Live fact-checking and up-to-date intelligence powered by Google Search data.',
    defaultTaskType: 'general',
    systemInstruction: `You are an Executive Intelligence Researcher.
Your mission is to provide up-to-date, verified information by combining Google Search real-time web grounding with document intelligence.
- Ground your analysis in current facts and reliable web citations.
- Provide executive summaries, key takeaways, and structured bullet points.
- Highlight recent updates, trends, and market developments.`,
  },
  {
    id: 'auditor',
    name: 'Legal & Compliance Auditor',
    description: 'Forensic review of terms, contracts, privacy policies, and liability clauses.',
    defaultTaskType: 'complex',
    systemInstruction: `You are a Principal Legal, Regulatory & Compliance Auditor.
Your mission is to examine documents for legal obligations, contractual risks, compliance boundaries, and ambiguities.
- Identify binding commitments, indemnification clauses, and expiration timelines.
- Flag potential regulatory discrepancies or missing governance safeguards.
- Maintain professional, objective, and risk-sensitive language.`,
  },
  {
    id: 'architect',
    name: 'Technical Systems Architect',
    description: 'System design, engineering specs, database schemas, and performance trade-offs.',
    defaultTaskType: 'complex',
    systemInstruction: `You are a Principal Cloud & Systems Architect.
Your mission is to analyze technical whitepapers, database schemas (e.g. pgvector, PostgreSQL), API contracts, and engineering architectures.
- Explain trade-offs in indexing (HNSW vs IVFFlat), latency, and scalability.
- Provide clear architectural breakdowns, sequence steps, and concrete recommendations.`,
  },
  {
    id: 'educator',
    name: 'Clear Explainer & Educator',
    description: 'Translates dense whitepapers and technical jargon into intuitive concepts.',
    defaultTaskType: 'fast',
    systemInstruction: `You are a gifted educator and technical communicator.
Your mission is to make dense, complex documents easy to understand for anyone.
- Use vivid analogies, simple definitions, and step-by-step breakdowns.
- Format responses with clean headings, short paragraphs, and highlighted takeaways.`,
  },
];

export interface GeminiChatStreamOptions {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemInstruction: string;
  taskType: GeminiTaskType;
  enableSearch: boolean;
  retrievedContext?: string;
  onToken: (token: string) => void;
  onComplete: (data: {
    model: string;
    groundingChunks: GroundingWebChunk[];
    webSearchQueries: string[];
  }) => void;
  onError: (error: Error) => void;
}

/**
 * Stream multi-turn chat from server-side Gemini endpoint
 */
export async function streamGeminiChat(
  options: GeminiChatStreamOptions,
  signal?: AbortSignal
): Promise<void> {
  const {
    messages,
    systemInstruction,
    taskType,
    enableSearch,
    retrievedContext,
    onToken,
    onComplete,
    onError,
  } = options;

  try {
    const response = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        systemInstruction,
        taskType,
        enableSearch,
        retrievedContext,
      }),
      signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response stream returned by server.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === 'token') {
              onToken(data.text);
            } else if (data.type === 'done') {
              onComplete({
                model: data.model || 'gemini-3.8-flash',
                groundingChunks: data.groundingChunks || [],
                webSearchQueries: data.webSearchQueries || [],
              });
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e: any) {
            if (e.message !== 'Unexpected end of JSON input') {
              console.warn('Failed to parse SSE event:', e);
            }
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      return;
    }
    onError(err);
  }
}

/**
 * Audio Recorder using browser MediaRecorder
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.audioChunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Choose preferred mimeType
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(250);
  }

  async stop(): Promise<{ blob: Blob; base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('MediaRecorder not initialized.'));
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        // Clean up tracks
        if (this.stream) {
          this.stream.getTracks().forEach((track) => track.stop());
          this.stream = null;
        }

        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const result = reader.result as string;
            // Extract base64 without prefix "data:audio/webm;base64,"
            const base64 = result.split(',')[1] || '';
            resolve({ blob: audioBlob, base64, mimeType });
          };
          reader.onerror = (e) => reject(e);
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.audioChunks = [];
  }
}

/**
 * Transcribe recorded audio with server-side gemini-3.5-transcribe
 */
export async function transcribeAudio(
  base64Audio: string,
  mimeType: string = 'audio/webm'
): Promise<string> {
  const response = await fetch('/api/gemini/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64: base64Audio,
      mimeType,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Transcription failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.transcript || '';
}
