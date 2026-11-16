import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  addMemory,
  appendMessagesToConversation,
  clearMemories,
  createConversation,
  deleteConversation,
  deleteMemory,
  getConversation,
  getCrossConversationContext,
  getSettings,
  listConversations,
  listMemories,
  updateActionStatusInConversation,
  updateSettings,
} from './server/storage.ts';
import {
  TtsQuotaExceededError,
  runZoyaChatTurn,
  runZoyaVisionTurn,
  synthesizeZoyaSpeech,
  transcribeZoyaAudio,
} from './server/gemini.ts';
import {
  ChatMessage,
  MemoryCategory,
  RuntimeCapabilities,
  ZoyaVoicePersona,
} from './src/types/zoya.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Simple in-memory rate limiter for API routes
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'local';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 90) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment before trying again.',
    });
  }
  return next();
}

function getGeminiErrorStatus(err: unknown): { status: number; message: string } {
  console.error('[ZOYA Gemini Error]', err);
  const rawMessage =
    err instanceof Error ? err.message : 'Unexpected server error occurred';

  let extractedMessage = rawMessage;
  try {
    const jsonStart = rawMessage.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
        error?: { message?: string; status?: string; code?: number };
      };
      if (parsed?.error?.message) {
        extractedMessage = parsed.error.message;
      }
    }
  } catch {
    // Keep rawMessage
  }

  if (rawMessage.includes('API_KEY_INVALID')) {
    return {
      status: 400,
      message:
        'Gemini API key appears invalid. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (rawMessage.includes('INVALID_ARGUMENT') || rawMessage.includes('"code":400')) {
    return { status: 400, message: extractedMessage };
  }
  if (rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('"code":403')) {
    return {
      status: 403,
      message: `Gemini API permission denied: ${extractedMessage}`,
    };
  }
  if (rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('"code":429')) {
    return {
      status: 429,
      message: `Gemini API quota/rate limit: ${extractedMessage}`,
    };
  }
  if (rawMessage.includes('NOT_FOUND') || rawMessage.includes('"code":404')) {
    return {
      status: 404,
      message: `Gemini model not found: ${extractedMessage}`,
    };
  }
  if (rawMessage.includes('GEMINI_API_KEY')) {
    return { status: 503, message: extractedMessage };
  }
  return { status: 500, message: extractedMessage };
}

async function startServer() {
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      origin &&
      (origin === 'https://localhost' ||
        origin === 'capacitor://localhost' ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1'))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use('/api', rateLimit);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'ZOYA JARVIS AI',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.get('/api/health/models', async (_req, res) => {
    try {
      const { listAvailableTextModels } = await import('./server/gemini.ts');
      const models = await listAvailableTextModels();
      res.json({ models });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      res.status(status).json({ error: message });
    }
  });

  // Conversations CRUD
  app.get('/api/conversations', (_req, res) => {
    res.json({ conversations: listConversations() });
  });

  app.post('/api/conversations', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const conversation = createConversation(title);
    res.status(201).json({ conversation });
  });

  app.get('/api/conversations/:id', (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json({ conversation: conv });
  });

  app.delete('/api/conversations/:id', (req, res) => {
    const conversations = deleteConversation(req.params.id);
    res.json({ conversations });
  });

  app.patch('/api/conversations/:id/actions/:actionId', (req, res) => {
    const { id, actionId } = req.params;
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
    const status = req.body?.status;
    const statusMessage =
      typeof req.body?.statusMessage === 'string' ? req.body.statusMessage : undefined;

    if (!messageId || !['pending', 'executed', 'blocked_web', 'denied', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid action status update payload' });
    }
    const updated = updateActionStatusInConversation(
      id,
      messageId,
      actionId,
      status,
      statusMessage
    );
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json({ conversation: updated });
  });

  // Memories CRUD
  app.get('/api/memories', (_req, res) => {
    res.json({ memories: listMemories() });
  });

  app.post('/api/memories', (req, res) => {
    const fact = typeof req.body?.fact === 'string' ? req.body.fact.trim() : '';
    if (!fact || fact.length < 2) {
      return res.status(400).json({ error: 'Memory fact must be at least 2 characters' });
    }
    const rawCat = String(req.body?.category ?? 'personal');
    const validCategories: MemoryCategory[] = [
      'identity',
      'preference',
      'personal',
      'project',
      'task',
      'routine',
      'work',
      'note',
    ];
    const category: MemoryCategory = validCategories.includes(rawCat as MemoryCategory)
      ? (rawCat as MemoryCategory)
      : 'personal';

    const memory = addMemory(fact, category, 'manual');
    return res.status(201).json({ memory, memories: listMemories() });
  });

  app.delete('/api/memories/:id', (req, res) => {
    const memories = deleteMemory(req.params.id);
    res.json({ memories });
  });

  app.delete('/api/memories', (_req, res) => {
    const memories = clearMemories();
    res.json({ memories });
  });

  // Settings
  app.get('/api/settings', (_req, res) => {
    res.json({ settings: getSettings() });
  });

  app.put('/api/settings', (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }
    const updated = updateSettings(req.body);
    return res.json({ settings: updated });
  });

  // ZOYA AI Chat Endpoint
  app.post('/api/zoya/chat', async (req, res) => {
    try {
      const conversationId =
        typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
      const message =
        typeof req.body?.message === 'string' ? req.body.message.trim() : '';

      if (!message || message.length > 8000) {
        return res.status(400).json({
          error: 'Message must be a non-empty string under 8000 characters.',
        });
      }

      const runtime: RuntimeCapabilities = {
        isNativeAndroid: Boolean(req.body?.runtime?.isNativeAndroid),
        platform: req.body?.runtime?.platform === 'android' ? 'android' : 'web',
        hasZoyaPlugin: Boolean(req.body?.runtime?.hasZoyaPlugin),
        hasWebSpeechRecognition: Boolean(req.body?.runtime?.hasWebSpeechRecognition),
        hasMediaRecorder: Boolean(req.body?.runtime?.hasMediaRecorder),
        hasSpeechSynthesis: Boolean(req.body?.runtime?.hasSpeechSynthesis),
        micPermission: req.body?.runtime?.micPermission ?? 'unknown',
        cameraPermission: req.body?.runtime?.cameraPermission ?? 'unknown',
        accessibilityEnabled: Boolean(req.body?.runtime?.accessibilityEnabled),
      };

      const activeConv = conversationId ? getConversation(conversationId) : undefined;
      const targetConv = activeConv ?? createConversation(message.slice(0, 48));
      const settings = getSettings();
      const memories = listMemories();
      const crossConversations = getCrossConversationContext(targetConv.id, message, 4);

      const result = await runZoyaChatTurn({
        history: targetConv.messages,
        userMessage: message,
        settings,
        memories,
        crossConversations,
        runtime,
      });

      const userNow = new Date().toISOString();
      const assistantNow = new Date(Date.now() + 1).toISOString();

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: userNow,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.replyText,
        timestamp: assistantNow,
        language: result.detectedLanguage,
        searchSources: result.searchSources,
        actions: result.actions,
      };

      const updatedConv = appendMessagesToConversation(
        targetConv.id,
        [userMsg, assistantMsg],
        message.slice(0, 48)
      );

      return res.json({
        conversation: updatedConv,
        assistantMessage: assistantMsg,
        memories: result.memoryChanged ? listMemories() : undefined,
        settings: result.updatedSettings,
      });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      return res.status(status).json({ error: message });
    }
  });

  // ZOYA Live Camera Vision Multimodal Endpoint
  app.post('/api/zoya/vision', async (req, res) => {
    try {
      const conversationId =
        typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
      const rawImage =
        typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
      const imageBase64 = rawImage.replace(/^data:[^;]+;base64,/, '');
      const mimeType =
        typeof req.body?.mimeType === 'string' && req.body.mimeType.startsWith('image/')
          ? req.body.mimeType
          : 'image/jpeg';
      const rawPrompt =
        typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      const prompt =
        rawPrompt || 'Zoya, ye kya hai? Iske baare mein detail mein batao.';

      if (!imageBase64 || imageBase64.length < 32 || imageBase64.length > 7_500_000) {
        return res.status(400).json({
          error: 'Valid captured camera image payload is required for Live Vision.',
        });
      }

      if (prompt.length > 2000) {
        return res.status(400).json({
          error: 'Vision question must be under 2000 characters.',
        });
      }

      const runtime: RuntimeCapabilities = {
        isNativeAndroid: Boolean(req.body?.runtime?.isNativeAndroid),
        platform: req.body?.runtime?.platform === 'android' ? 'android' : 'web',
        hasZoyaPlugin: Boolean(req.body?.runtime?.hasZoyaPlugin),
        hasWebSpeechRecognition: Boolean(req.body?.runtime?.hasWebSpeechRecognition),
        hasMediaRecorder: Boolean(req.body?.runtime?.hasMediaRecorder),
        hasSpeechSynthesis: Boolean(req.body?.runtime?.hasSpeechSynthesis),
        micPermission: req.body?.runtime?.micPermission ?? 'unknown',
        cameraPermission: req.body?.runtime?.cameraPermission ?? 'unknown',
        accessibilityEnabled: Boolean(req.body?.runtime?.accessibilityEnabled),
      };

      const activeConv = conversationId ? getConversation(conversationId) : undefined;
      const settings = getSettings();
      const memories = listMemories();
      const crossConversations = getCrossConversationContext(
        activeConv?.id ?? '',
        prompt,
        3
      );

      const result = await runZoyaVisionTurn({
        history: activeConv?.messages ?? [],
        imageBase64,
        mimeType,
        prompt,
        settings,
        memories,
        crossConversations,
        runtime,
      });

      const targetConv = activeConv ?? createConversation(`Vision: ${prompt.slice(0, 40)}`);

      const userNow = new Date().toISOString();
      const assistantNow = new Date(Date.now() + 1).toISOString();

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: `[Live Vision] ${prompt}`,
        timestamp: userNow,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.replyText,
        timestamp: assistantNow,
        language: result.detectedLanguage,
      };

      const updatedConv = appendMessagesToConversation(
        targetConv.id,
        [userMsg, assistantMsg],
        `Vision: ${prompt.slice(0, 40)}`
      );

      return res.json({
        conversation: updatedConv,
        assistantMessage: assistantMsg,
      });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      return res.status(status).json({ error: message });
    }
  });

  // ZOYA Natural Female Voice TTS Endpoint (Gemini 3.8 Flash TTS)
  app.post('/api/zoya/tts', async (req, res) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) {
        return res.status(400).json({ error: 'Text is required for speech synthesis.' });
      }
      const settings = getSettings();
      const requestedPersona = req.body?.voicePersona;
      const voicePersona: ZoyaVoicePersona =
        requestedPersona === 'Sulafat' ||
        requestedPersona === 'Achernar' ||
        requestedPersona === 'Leda'
          ? requestedPersona
          : settings.voicePersona;

      const preferredLanguage =
        typeof req.body?.preferredLanguage === 'string'
          ? req.body.preferredLanguage
          : settings.preferredLanguage;

      const audio = await synthesizeZoyaSpeech({
        text,
        voicePersona,
        preferredLanguage,
        ownerName: settings.ownerName,
      });
      return res.json(audio);
    } catch (err) {
      if (err instanceof TtsQuotaExceededError) {
        console.warn('[ZOYA TTS Quota Notice]', err.message);
        return res.status(429).json({
          error: err.message,
          code: err.code,
          fallbackToWebSpeech: true,
        });
      }
      const { status, message } = getGeminiErrorStatus(err);
      return res.status(status).json({
        error: message,
        ...(status === 429
          ? { code: 'TTS_QUOTA_EXCEEDED', fallbackToWebSpeech: true }
          : {}),
      });
    }
  });

  // ZOYA Audio Transcription Fallback Endpoint
  app.post('/api/zoya/transcribe', async (req, res) => {
    try {
      const audioBase64 =
        typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64 : '';
      const mimeType =
        typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'audio/webm';

      if (!audioBase64 || audioBase64.length > 8_000_000) {
        return res.status(400).json({ error: 'Valid audio payload is required.' });
      }

      const transcript = await transcribeZoyaAudio({ audioBase64, mimeType });
      return res.json({ transcript });
    } catch (err) {
      const { status, message } = getGeminiErrorStatus(err);
      return res.status(status).json({ error: message });
    }
  });

  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZOYA JARVIS AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ZOYA JARVIS AI server:', err);
  process.exit(1);
});
