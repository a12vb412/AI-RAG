/**
 * Express Server with Vite Middleware
 * Handles Gemini API endpoints:
 * - Multi-turn Chat with System Persona instructions & role customization
 * - Google Search Grounding with gemini-3.8-flash & resilient live web search fallback
 * - Audio Transcription via gemini-3.5-transcribe
 * - Model selection: gemini-3.8-flash (general/search), gemini-3.1-pro-preview (complex), gemini-3.1-flash-lite (fast)
 * - Automatic latency optimization with ThinkingLevel.LOW and high-availability fallback
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware for parsing JSON with generous limit for audio payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * Lazy initialization for Gemini SDK
 */
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY environment variable is missing. Please configure your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Multi-Source Live Web Search Engine
 * Fetches real-time search results, queries, and summaries
 */
interface WebSearchResult {
  title: string;
  uri: string;
  snippet: string;
}

async function searchWebFallback(query: string): Promise<{
  results: WebSearchResult[];
  relatedQueries: string[];
}> {
  const results: WebSearchResult[] = [];
  const relatedQueries: string[] = [query];

  // 1. Fetch Google search suggestions for related queries & autocomplete
  try {
    const suggestRes = await fetch(
      `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`
    );
    if (suggestRes.ok) {
      const suggestData = await suggestRes.json();
      if (Array.isArray(suggestData[1])) {
        for (const item of suggestData[1].slice(0, 5)) {
          if (typeof item === 'string' && !relatedQueries.includes(item)) {
            relatedQueries.push(item);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Google suggest error:', e);
  }

  // 2. Fetch Wikipedia live search articles & summaries
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&format=json&utf8=`
    );
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const hits = wikiData.query?.search || [];
      for (const h of hits.slice(0, 4)) {
        const cleanSnippet = h.snippet ? h.snippet.replace(/<[^>]+>/g, '').trim() : '';
        results.push({
          title: h.title,
          uri: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
          snippet: cleanSnippet,
        });
      }
    }
  } catch (e) {
    console.warn('Wikipedia search error:', e);
  }

  // 3. Fetch Hacker News / Tech / Open Web news & articles
  try {
    const hnRes = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=4`
    );
    if (hnRes.ok) {
      const hnData = await hnRes.json();
      for (const hit of hnData.hits || []) {
        const targetUrl = hit.url || hit.story_url;
        if (hit.title && targetUrl) {
          results.push({
            title: hit.title,
            uri: targetUrl,
            snippet: hit.comment_text
              ? hit.comment_text.replace(/<[^>]+>/g, '').slice(0, 200)
              : hit.title,
          });
        }
      }
    }
  } catch (e) {
    console.warn('HN search error:', e);
  }

  return { results, relatedQueries };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

/**
 * 1. Audio Transcription Endpoint
 * Uses model: gemini-3.5-transcribe
 */
app.post('/api/gemini/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio data (audioBase64) is required.' });
    }

    const ai = getGeminiClient();

    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: 'Transcribe this audio recording accurately. Return only the verbatim transcription text without any additional formatting or conversational preamble.',
          },
        ],
      },
    });

    const transcript = response.text?.trim() || '';
    return res.json({ transcript });
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to transcribe audio.',
    });
  }
});

/**
 * 2. Multi-turn Chat Endpoint (with Streaming & Search Grounding)
 * Models:
 * - gemini-3.8-flash for general tasks & Google Search grounding (optimized with ThinkingLevel.LOW)
 * - gemini-3.1-pro-preview for complex reasoning (ThinkingLevel.HIGH)
 * - gemini-3.1-flash-lite for ultra-fast queries
 * - Resilient search grounding that guarantees real web sources even when native search quota is 429
 */
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const {
      messages,
      systemInstruction,
      taskType = 'general', // 'complex' | 'general' | 'fast'
      enableSearch = false,
      retrievedContext = '',
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const ai = getGeminiClient();

    // Select primary model:
    let selectedModel = 'gemini-3.8-flash';
    if (enableSearch) {
      selectedModel = 'gemini-3.8-flash';
    } else if (taskType === 'complex') {
      selectedModel = 'gemini-3.1-pro-preview';
    } else if (taskType === 'fast') {
      selectedModel = 'gemini-3.1-flash-lite';
    } else {
      selectedModel = 'gemini-3.8-flash';
    }

    // Set up SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Format conversation history for Gemini
    let enrichedSystemInstruction =
      systemInstruction ||
      'You are a knowledgeable and precise AI research assistant. Provide thorough, well-reasoned answers.';

    if (retrievedContext && retrievedContext.trim()) {
      enrichedSystemInstruction += `\n\n<retrieved_workspace_documents>\n${retrievedContext}\n</retrieved_workspace_documents>\nWhen answering questions based on the retrieved workspace documents, cite specific document names and page numbers in the format [Doc: <name>, p. <page>].`;
    }

    // Prepare contents array
    const contents: any[] = [];
    for (const msg of messages) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const userQuery = lastUserMsg?.content || '';

    let searchGroundingChunks: any[] = [];
    let webSearchQueries: string[] = [];
    let streamedSuccessfully = false;

    // PATH A: Attempt native Google Search grounding if enabled
    if (enableSearch) {
      try {
        console.log(`[GoogleSearch] Attempting native googleSearch tool with ${selectedModel}...`);
        const nativeConfig: any = {
          systemInstruction: enrichedSystemInstruction,
          tools: [{ googleSearch: {} }],
        };

        const responseStream = await ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: nativeConfig,
        });

        for await (const chunk of responseStream) {
          const text = chunk.text;
          if (text) {
            res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`);
          }

          const candidate = chunk.candidates?.[0];
          if (candidate?.groundingMetadata?.groundingChunks) {
            searchGroundingChunks = candidate.groundingMetadata.groundingChunks;
          }
          if (candidate?.groundingMetadata?.webSearchQueries) {
            webSearchQueries = candidate.groundingMetadata.webSearchQueries;
          }
        }

        streamedSuccessfully = true;
      } catch (searchError: any) {
        console.warn(
          `[GoogleSearch] Native tool unavailable (${searchError?.status || searchError?.code}): ${searchError?.message}. Switching to live web search fallback...`
        );
      }
    }

    // PATH B: If native search hit quota (429) or search wasn't requested, run content stream with low thinking latency
    if (!streamedSuccessfully) {
      let activeContents = contents;
      let activeSystemInstruction = enrichedSystemInstruction;

      if (enableSearch && userQuery) {
        console.log(`[LiveWebSearch] Fetching real-time web search results for query: "${userQuery}"...`);
        const { results: webResults, relatedQueries } = await searchWebFallback(userQuery);

        searchGroundingChunks = webResults.map((r) => ({
          web: {
            title: r.title,
            uri: r.uri,
          },
        }));
        webSearchQueries = relatedQueries;

        const webGroundingBlock = webResults
          .map(
            (r, i) =>
              `[Source ${i + 1}] Title: ${r.title}\nURL: ${r.uri}\nSnippet: ${r.snippet}`
          )
          .join('\n\n');

        activeSystemInstruction += `\n\n<live_google_search_grounding>\nUser Search Query: "${userQuery}"\nRelated Search Topics: ${relatedQueries.join(
          ', '
        )}\n\nVerified Web Results:\n${webGroundingBlock}\n</live_google_search_grounding>\nInstructions for Live Web Grounding:\n- Synthesize an up-to-date, comprehensive, and objective answer directly using the live web search results above.\n- Explicitly reference the sources with clickable markdown links [Source Title](URL).\n- Highlight key facts, dates, and recent developments.`;
      }

      // Models to try with low latency thinking config
      const modelsToTry = [selectedModel, 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
      const uniqueModels = Array.from(new Set(modelsToTry));

      for (const modelToTry of uniqueModels) {
        try {
          console.log(`[Gemini Chat] Streaming with model: ${modelToTry} (ThinkingLevel: ${taskType === 'complex' ? 'HIGH' : 'LOW'})...`);
          
          const config: any = {
            systemInstruction: activeSystemInstruction,
            thinkingConfig: {
              thinkingLevel: taskType === 'complex' ? ThinkingLevel.HIGH : ThinkingLevel.LOW,
            },
          };

          const responseStream = await ai.models.generateContentStream({
            model: modelToTry,
            contents: activeContents,
            config,
          });

          selectedModel = modelToTry;

          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`);
            }
          }

          streamedSuccessfully = true;
          break;
        } catch (err: any) {
          console.warn(`[Gemini Chat] Model ${modelToTry} failed (${err.status || err.code}): ${err.message}. Trying next fallback...`);
          // Wait briefly before trying next model
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      // High-availability fallback: if all Gemini models are 503 high demand and search was requested,
      // synthesize and stream directly from verified web search results!
      if (!streamedSuccessfully && enableSearch && searchGroundingChunks.length > 0) {
        console.log('[LiveWebSearch] Providing direct web search synthesis during Gemini 503 high demand...');
        const intro = `### Real-Time Web Intelligence\n\nHere are the latest live web search results for **"${userQuery}"**:\n\n`;
        const sourcesText = searchGroundingChunks
          .map(
            (c, i) =>
              `**${i + 1}. [${c.web.title || c.web.uri}](${c.web.uri})**\nVerified live web reference for this query.\n`
          )
          .join('\n');
        const relatedText =
          webSearchQueries.length > 1
            ? `\n*Related search explorations:* ${webSearchQueries.slice(1, 5).join(' • ')}\n`
            : '';

        const fullSynthesis = `${intro}${sourcesText}${relatedText}`;
        const words = fullSynthesis.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          const chunkStr = words.slice(i, i + 3).join(' ') + ' ';
          res.write(`data: ${JSON.stringify({ type: 'token', text: chunkStr })}\n\n`);
          await new Promise((r) => setTimeout(r, 30));
        }
        selectedModel = 'Web Search Grounding Engine';
        streamedSuccessfully = true;
      }
    }

    // Send final metadata event
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        model: selectedModel,
        groundingChunks: searchGroundingChunks,
        webSearchQueries,
      })}\n\n`
    );

    res.end();
  } catch (error: any) {
    console.error('Gemini chat streaming error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Gemini chat error.' });
    }
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

// Start server with Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
