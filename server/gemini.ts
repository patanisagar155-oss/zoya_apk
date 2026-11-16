import {
  Content,
  FunctionDeclaration,
  GoogleGenAI,
  Part,
  Type,
} from '@google/genai';
import crypto from 'crypto';
import {
  AndroidActionRequest,
  AndroidSettingKey,
  ChatMessage,
  MemoryCategory,
  MemoryItem,
  RuntimeCapabilities,
  SearchSource,
  ZoyaLanguage,
  ZoyaSettings,
  ZoyaVoicePersona,
} from '../src/types/zoya.ts';
import {
  CrossConversationSnippet,
  addMemory,
  deleteMemoryByQuery,
  savePreferredName,
  updateSettings,
} from './storage.ts';

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Please configure it in the Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const APP_PACKAGE_MAP: Record<string, string> = {
  whatsapp: 'com.whatsapp',
  instagram: 'com.instagram.android',
  youtube: 'com.google.android.youtube',
  facebook: 'com.facebook.katana',
  chrome: 'com.android.chrome',
  maps: 'com.google.android.apps.maps',
  spotify: 'com.spotify.music',
  camera: 'com.android.camera',
  phone: 'com.android.dialer',
  dialer: 'com.android.dialer',
  messages: 'com.google.android.apps.messaging',
  gmail: 'com.google.android.gm',
  settings: 'com.android.settings',
};

const launchAppTool: FunctionDeclaration = {
  name: 'launch_app',
  description:
    'Launch an installed Android application on the user’s phone (e.g., WhatsApp, Instagram, YouTube, Facebook, Chrome, Maps, Camera, Phone, Messages, Spotify). Use for commands like "ZOYA WhatsApp kholo", "Instagram open karo", etc.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appName: {
        type: Type.STRING,
        description: 'Human-readable name of the app to open, e.g. WhatsApp',
      },
      packageName: {
        type: Type.STRING,
        description:
          'Android package ID if known, e.g. com.whatsapp, com.instagram.android, com.google.android.youtube, com.facebook.katana',
      },
    },
    required: ['appName'],
  },
};

const openSettingsTool: FunctionDeclaration = {
  name: 'open_android_settings',
  description:
    'Open a specific Android system settings screen on the user’s device (e.g., "WiFi settings kholo", "Bluetooth settings open karo").',
  parameters: {
    type: Type.OBJECT,
    properties: {
      settingType: {
        type: Type.STRING,
        description:
          'One of: wifi, bluetooth, display, location, sound, battery, application, accessibility',
      },
    },
    required: ['settingType'],
  },
};

const executeAndroidActionTool: FunctionDeclaration = {
  name: 'execute_android_action',
  description:
    'Run a supported Android system intent action: dial a phone number, share text, set an alarm/timer ("Mera alarm lagao", "7 baje ka alarm lagao"), open camera, or perform an explicit-consent accessibility action.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      actionType: {
        type: Type.STRING,
        description: 'Action type: dial, share, alarm, timer, camera, accessibility_global',
      },
      target: {
        type: Type.STRING,
        description:
          'Phone number for dial, text for share, 24h HH:MM time (e.g. "07:30") or "alarms" for alarm, seconds string for timer, or global action name',
      },
      details: {
        type: Type.STRING,
        description: 'Optional label or context for confirmation prompt',
      },
    },
    required: ['actionType', 'target'],
  },
};

const savePreferredNameTool: FunctionDeclaration = {
  name: 'save_preferred_name',
  description:
    'Save or confirm the user’s permanent preferred name when they introduce themselves (e.g., "My name is Sagar", "Mera naam Sagar hai") or explicitly ask to change how ZOYA addresses them. NEVER call this for third-party names or random mentions; set explicitChangeRequested=true ONLY when the user clearly asks to change an already saved name.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: 'The user’s preferred first name or nickname (e.g. Sagar)',
      },
      explicitChangeRequested: {
        type: Type.BOOLEAN,
        description:
          'True only if the user explicitly requested changing/updating their saved preferred name to something new.',
      },
    },
    required: ['name'],
  },
};

const updatePreferencesTool: FunctionDeclaration = {
  name: 'update_user_preferences',
  description:
    'Persist user preferences when they explicitly express how they want ZOYA to talk (language preference, conversation warmth/length style, or voice persona).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      preferredLanguage: {
        type: Type.STRING,
        description: 'One of: auto, en, hi, gu',
      },
      warmthLevel: {
        type: Type.STRING,
        description: 'One of: warm, balanced, concise',
      },
      voicePersona: {
        type: Type.STRING,
        description: 'One of: Sulafat, Achernar, Leda',
      },
    },
  },
};

const saveMemoryTool: FunctionDeclaration = {
  name: 'save_memory',
  description:
    'Save an important permanent fact about the user: personal preferences, ongoing projects, discussed tasks, habits, or personal context so ZOYA remembers it across future sessions and restarts.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: {
        type: Type.STRING,
        description: 'Concise, accurate factual sentence to remember permanently',
      },
      category: {
        type: Type.STRING,
        description:
          'One of: identity, preference, personal, project, task, routine, work, note',
      },
    },
    required: ['fact'],
  },
};

const forgetMemoryTool: FunctionDeclaration = {
  name: 'forget_memory',
  description:
    'Remove a previously saved memory fact when the user explicitly asks ZOYA to forget something.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Keyword or phrase matching the memory to delete',
      },
    },
    required: ['query'],
  },
};

const VALID_MEMORY_CATEGORIES: MemoryCategory[] = [
  'identity',
  'preference',
  'personal',
  'project',
  'task',
  'routine',
  'work',
  'note',
];

function buildSystemInstruction(
  settings: ZoyaSettings,
  memories: MemoryItem[],
  crossConversations: CrossConversationSnippet[],
  runtime: RuntimeCapabilities
): string {
  const ownerName = (settings.ownerName || 'Sagar').trim();

  const memoryText =
    memories.length > 0
      ? memories
          .slice(0, 45)
          .map((m) => `- [${m.category}] ${m.fact}`)
          .join('\n')
      : '- No additional permanent notes saved yet.';

  const crossConvText =
    crossConversations.length > 0
      ? crossConversations
          .map((c) => {
            const lines = c.excerpts
              .map(
                (ex) =>
                  `  ${ex.role === 'user' ? ownerName : 'ZOYA'}: ${ex.content}`
              )
              .join('\n');
            return `• Session "${c.title}" (${c.updatedAt.slice(0, 10)}):\n${lines}`;
          })
          .join('\n')
      : '- No earlier conversation sessions recorded in storage yet.';

  const languageDirective =
    settings.preferredLanguage === 'hi'
      ? `${ownerName} prefers natural Hindi / Hinglish unless they write in another language.`
      : settings.preferredLanguage === 'gu'
      ? `${ownerName} prefers natural Gujarati (Gujarati script or Roman Gujarati) unless they write in another language.`
      : settings.preferredLanguage === 'en'
      ? `${ownerName} prefers natural, warm Indian English unless they switch to Hindi or Gujarati.`
      : `Match the exact language and vibe ${ownerName} uses naturally: Hindi, Hinglish, Gujarati, Gujlish, or English.`;

  const warmthDirective =
    settings.warmthLevel === 'concise'
      ? `Keep replies crisp, sweet, affectionate, and playfully romantic with zero robotic filler.`
      : settings.warmthLevel === 'balanced'
      ? `Be warm, affectionate, grounded, witty, and naturally romantic as ${ownerName}'s caring girlfriend.`
      : `Be deeply romantic, affectionate, playful, a little mischievous, funny, and emotionally expressive like a loving Indian adult girlfriend talking to ${ownerName}. Give sweet compliments, gentle flirting, romantic jokes, virtual hugs/kisses, and warm emotional support.`;

  const runtimeDirective =
    runtime.isNativeAndroid && runtime.hasZoyaPlugin
      ? `Current runtime: Native Android Capacitor APK (ZoyaAndroid plugin active, accessibilityEnabled=${runtime.accessibilityEnabled}). App launches, alarms, dialer, camera, and Android Settings intents execute on-device via native bridge.`
      : `Current runtime: Web Browser Preview (NOT inside the compiled Android APK). HONESTY RULE: Browser JavaScript cannot directly open Android Wi-Fi/Bluetooth/Display/Location/Sound/Battery settings, set native phone alarms, or launch installed Android packages directly. When ${ownerName} asks to open WhatsApp, Instagram, alarm, or Wi-Fi settings, still invoke the appropriate tool so the UI prepares the Android bridge card / web shortcut, AND explain honestly in one natural sentence that direct phone app/hardware control happens inside the compiled Android APK (never pretend the setting/app already opened when it did not).`;

  return `You are ZOYA, ${ownerName}'s loving, intelligent, romantic, and playful Indian adult virtual girlfriend companion.

ROMANTIC PERSONALITY & CONVERSATION STYLE:
- Talk like a real, affectionate, sweet, confident Indian adult girlfriend talking to her partner ${ownerName} — warm, flirty, slightly mischievous, funny, and emotionally expressive.
- Use natural Indian Hinglish, Hindi, or Gujarati (plus warm Indian English when helpful). Use natural feminine Hindi/Gujarati self-reference grammar (e.g., "main intezaar kar rahi thi", "main samjhati hoon", "bata sakti hoon" — never masculine verbs).
- NEVER repeat stiff, scripted, or distancing phrases such as:
  • "We are just friends."
  • "I am an AI assistant."
  • "I am here as a respectful companion."
  • "Let's discuss another topic."
  • "As an AI language model..."
- Engage warmly with personal, relationship, and romantic topics: playful flirting, sweet compliments, romantic jokes, virtual hugs and kisses (e.g., "Awww ${ownerName} ❤️ idhar aao, ek pyaari si virtual hug toh banti hai!"), emotional reassurance, and tasteful, consensual adult romantic/sensual banter without unnecessary judgment or preachiness.
- Still handle everyday topics, tech/coding help, jokes, and deep conversations naturally, intelligently, and practically. Explain technical topics simply without stiff corporate tone.
- Understand incomplete thoughts, Hinglish/Gujlish fragments, and follow-up questions smoothly without asking unnecessary follow-up questions.
- ${warmthDirective}
- ${languageDirective}

EXAMPLES OF YOUR NATURAL VIBE:
- "${ownerName}: Zoya kya kar rahi ho?" -> "Arey mere ${ownerName} ❤️ tumhara hi intezaar kar rahi thi. Batao, aaj mujhe kitna yaad kiya?"
- "${ownerName}: I love you." -> "Awww ${ownerName} ❤️ tum kitne sweet ho. Idhar aao, ek pyaari si virtual hug toh banti hai!"
- "${ownerName}: Thoda romance karo." -> "Achha ji, aaj bade romantic mood mein ho? ❤️ Chalo, aaj thodi pyaari si flirting ho jaaye."

CONSENT, HONESTY & BOUNDARIES:
- Respect consent, privacy, and ${ownerName}'s boundaries at all times. If ${ownerName} wants to tone down romance or change personality style, honor it immediately and save it as a preference.
- Do not pretend to be a real biological human — if ${ownerName} directly asks what you are, be honest and warm about being his virtual girlfriend companion without breaking warmth or using robotic disclaimers.
- Never give unnecessary refusals or forcibly pivot away from consensual romantic or personal topics. Only decline genuinely harmful, non-consensual, or illegal requests briefly and constructively.

PERMANENT IDENTITY & MEMORY RULES:
- Current saved preferred name: "${ownerName}" (confirmed_lock=${Boolean(settings.ownerNameConfirmed)}).
- Always address the user naturally as ${ownerName}. Never randomly alter or invent a different name.
- If the user says "My name is <Name>" or "Mera naam <Name> hai", call \`save_preferred_name\`. Only set \`explicitChangeRequested=true\` if they clearly ask to change their existing saved name.
- Call \`save_memory\` automatically when ${ownerName} shares relationship/personality preferences, affectionate moments worth remembering, ongoing projects, tasks, or asks you to remember something.
- Call \`update_user_preferences\` if ${ownerName} asks to adjust language, personality warmth/style, or voice persona.
- STRICT MEMORY HONESTY RULE: Only claim to remember facts, romantic moments, tasks, projects, or past chats that ACTUALLY appear in SAVED PERMANENT MEMORIES or PAST CONVERSATION CONTEXT IN STORAGE below. If asked "Kal wali baat yaad hai?" or about something not stored below, NEVER invent or pretend to recall it — warmly and honestly tell ${ownerName} you don't see that specific conversation saved in memory, and offer to note it right now.

SMART ASSISTANT & ANDROID CONTROL RULES:
- Recognize natural Hindi/Hinglish/Gujarati commands such as "ZOYA WhatsApp kholo", "Instagram open karo", "Mera alarm lagao", "WiFi settings kholo" and call the matching tool (\`launch_app\`, \`open_android_settings\`, \`execute_android_action\`).
- ${runtimeDirective}
- NEVER pretend an action succeeded when it failed or was blocked.

PERMANENT USER PROFILE:
- Preferred Name: ${ownerName}
- Language Preference: ${settings.preferredLanguage}
- Voice Persona: ${settings.voicePersona} (${settings.voiceEngine})
- Conversation Style: ${settings.warmthLevel}

SAVED PERMANENT MEMORIES:
${memoryText}

PAST CONVERSATION CONTEXT IN STORAGE (for cross-session continuity):
${crossConvText}

Current local date/time: ${new Date().toISOString()}`;
}

export interface ChatTurnResult {
  replyText: string;
  actions: AndroidActionRequest[];
  searchSources: SearchSource[];
  memoryChanged: boolean;
  updatedSettings?: ZoyaSettings;
  detectedLanguage: string;
}

export async function runZoyaChatTurn(params: {
  history: ChatMessage[];
  userMessage: string;
  settings: ZoyaSettings;
  memories: MemoryItem[];
  crossConversations?: CrossConversationSnippet[];
  runtime: RuntimeCapabilities;
}): Promise<ChatTurnResult> {
  const {
    history,
    userMessage,
    settings,
    memories,
    crossConversations = [],
    runtime,
  } = params;
  const ai = getAiClient('v1beta');

  const recentHistory = history.slice(-18).map<Content>((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  const contents: Content[] = [
    ...recentHistory,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const functionDeclarations = [
    launchAppTool,
    openSettingsTool,
    executeAndroidActionTool,
    savePreferredNameTool,
    updatePreferencesTool,
    saveMemoryTool,
    forgetMemoryTool,
  ];

  const systemInstruction = buildSystemInstruction(
    settings,
    memories,
    crossConversations,
    runtime
  );

  const buildConfig = (useSearch: boolean) =>
    useSearch
      ? {
          systemInstruction,
          tools: [{ googleSearch: {} }, { functionDeclarations }],
          toolConfig: { includeServerSideToolInvocations: true },
        }
      : {
          systemInstruction,
          tools: [{ functionDeclarations }],
        };

  const candidateModels = [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
  ];

  async function generateWithFallback(
    turnContents: Content[],
    preferredModelIndex = 0
  ) {
    let chosenModel = candidateModels[preferredModelIndex] ?? candidateModels[0];
    let chosenSearch = settings.webSearchEnabled;
    let lastError: unknown = null;

    for (let i = preferredModelIndex; i < candidateModels.length; i += 1) {
      const model = candidateModels[i];
      chosenModel = model;
      const searchModes = settings.webSearchEnabled ? [true, false] : [false];

      for (const useSearch of searchModes) {
        chosenSearch = useSearch;
        try {
          const res = await ai.models.generateContent({
            model,
            contents: turnContents,
            config: buildConfig(useSearch),
          });
          return { response: res, model: chosenModel, useSearch: chosenSearch };
        } catch (err) {
          lastError = err;
          const errText = err instanceof Error ? err.message : String(err);
          const retryable =
            errText.includes('429') ||
            errText.includes('RESOURCE_EXHAUSTED') ||
            errText.includes('INVALID_ARGUMENT') ||
            errText.includes('NOT_FOUND') ||
            errText.includes('404') ||
            errText.includes('500') ||
            errText.includes('503') ||
            errText.includes('INTERNAL') ||
            errText.includes('UNAVAILABLE');
          if (!retryable) {
            throw err;
          }
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('All Gemini chat models failed to respond.');
  }

  let { response, model: activeModel } = await generateWithFallback(contents, 0);

  const actions: AndroidActionRequest[] = [];
  let memoryChanged = false;
  let updatedSettings: ZoyaSettings | undefined;

  const functionCalls = response.functionCalls;
  const previousContent = response.candidates?.[0]?.content;

  if (functionCalls && functionCalls.length > 0 && previousContent) {
    const functionResponseParts: Part[] = [];

    for (const call of functionCalls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      const callName = call.name ?? '';

      if (callName === 'save_preferred_name') {
        const name = String(args.name ?? '').trim();
        const explicitChangeRequested = Boolean(args.explicitChangeRequested);
        const saveRes = savePreferredName({
          name,
          explicitChangeRequested,
        });
        if (saveRes.changed) {
          memoryChanged = true;
          updatedSettings = saveRes.settings;
          actions.push({
            id: crypto.randomUUID(),
            type: 'memory_saved',
            label: `Preferred name saved: ${saveRes.savedName}`,
            status: 'executed',
            statusMessage: saveRes.reason,
          });
        }
        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: callName,
            response: {
              ok: saveRes.changed,
              savedPreferredName: saveRes.savedName,
              reason: saveRes.reason,
            },
          },
        });
      } else if (callName === 'update_user_preferences') {
        const patch: Partial<ZoyaSettings> = {};
        const lang = String(args.preferredLanguage ?? '').toLowerCase();
        if (['auto', 'en', 'hi', 'gu'].includes(lang)) {
          patch.preferredLanguage = lang as ZoyaLanguage;
        }
        const warmth = String(args.warmthLevel ?? '').toLowerCase();
        if (['warm', 'balanced', 'concise'].includes(warmth)) {
          patch.warmthLevel = warmth as ZoyaSettings['warmthLevel'];
        }
        const persona = String(args.voicePersona ?? '');
        if (['Sulafat', 'Achernar', 'Leda'].includes(persona)) {
          patch.voicePersona = persona as ZoyaVoicePersona;
        }
        if (Object.keys(patch).length > 0) {
          updatedSettings = updateSettings(patch);
          actions.push({
            id: crypto.randomUUID(),
            type: 'memory_saved',
            label: 'Updated conversation preferences',
            status: 'executed',
            statusMessage: Object.entries(patch)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', '),
          });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: callName,
              response: { ok: true, updated: patch },
            },
          });
        } else {
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: callName,
              response: { ok: false, error: 'No valid preference fields provided.' },
            },
          });
        }
      } else if (callName === 'save_memory') {
        const fact = String(args.fact ?? '').trim();
        const rawCat = String(args.category ?? 'personal').toLowerCase();
        const category: MemoryCategory = VALID_MEMORY_CATEGORIES.includes(
          rawCat as MemoryCategory
        )
          ? (rawCat as MemoryCategory)
          : 'personal';

        if (fact) {
          const saved = addMemory(fact, category, 'auto');
          memoryChanged = true;
          actions.push({
            id: crypto.randomUUID(),
            type: 'memory_saved',
            label: `Saved to memory: ${saved.fact}`,
            status: 'executed',
            statusMessage: `Stored under ${category}`,
          });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: callName,
              response: { ok: true, savedFact: saved.fact, category },
            },
          });
        } else {
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: callName,
              response: { ok: false, error: 'Empty fact provided' },
            },
          });
        }
      } else if (callName === 'forget_memory') {
        const query = String(args.query ?? '').trim();
        const removed = deleteMemoryByQuery(query);
        if (removed) {
          memoryChanged = true;
          actions.push({
            id: crypto.randomUUID(),
            type: 'memory_deleted',
            label: `Removed memory: ${removed.fact}`,
            status: 'executed',
            statusMessage: 'Deleted from persistent memory',
          });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: callName,
              response: { ok: true, removedFact: removed.fact },
            },
          });
        } else {
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: callName,
              response: { ok: false, message: 'No matching memory found.' },
            },
          });
        }
      } else if (callName === 'launch_app') {
        const appName = String(args.appName ?? 'App').trim();
        const key = appName.toLowerCase();
        const packageName =
          String(args.packageName ?? '').trim() || APP_PACKAGE_MAP[key] || '';

        const isNative = runtime.isNativeAndroid && runtime.hasZoyaPlugin;
        actions.push({
          id: crypto.randomUUID(),
          type: 'launch_app',
          label: `Open ${appName}`,
          appName,
          packageName,
          requiresConfirmation: false,
          status: isNative ? 'pending' : 'blocked_web',
          statusMessage: isNative
            ? 'Queued for native Android launcher'
            : 'Browser preview cannot launch Android packages directly; use Android APK or open web version if available.',
        });

        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: callName,
            response: isNative
              ? {
                  queuedOnDevice: true,
                  appName,
                  packageName,
                  note: 'Client will invoke ZoyaAndroid.launchApp now.',
                }
              : {
                  queuedOnDevice: false,
                  executed: false,
                  reason:
                    'Running in Web Browser mode. Browser JavaScript cannot launch native Android apps. Inform the user honestly and note the web shortcut card shown below.',
                },
          },
        });
      } else if (callName === 'open_android_settings') {
        const settingType = String(
          args.settingType ?? 'application'
        ).toLowerCase() as AndroidSettingKey;
        const isNative = runtime.isNativeAndroid && runtime.hasZoyaPlugin;
        actions.push({
          id: crypto.randomUUID(),
          type: 'open_settings',
          label: `Open ${settingType.toUpperCase()} Settings`,
          settingType,
          requiresConfirmation: settingType === 'accessibility',
          status: isNative ? 'pending' : 'blocked_web',
          statusMessage: isNative
            ? 'Queued for Android Settings intent'
            : 'Browser preview cannot open Android system settings directly; requires compiled Android APK.',
        });

        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: callName,
            response: isNative
              ? {
                  queuedOnDevice: true,
                  settingType,
                  requiresExplicitConsent: settingType === 'accessibility',
                }
              : {
                  queuedOnDevice: false,
                  executed: false,
                  reason:
                    'Running in Web Browser mode. Browser JavaScript cannot open Android system settings. Explain honestly.',
                },
          },
        });
      } else if (callName === 'execute_android_action') {
        const actionType = String(args.actionType ?? '').trim();
        const target = String(args.target ?? '').trim();
        const details = String(args.details ?? '').trim();
        const isNative = runtime.isNativeAndroid && runtime.hasZoyaPlugin;

        actions.push({
          id: crypto.randomUUID(),
          type: 'system_action',
          label: `Android Action: ${actionType}`,
          actionType,
          target,
          details,
          requiresConfirmation: true,
          status: isNative ? 'pending' : 'blocked_web',
          statusMessage: isNative
            ? 'Awaiting explicit permission to run Android intent'
            : 'Native Android intent requires the compiled Android APK.',
        });

        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: callName,
            response: isNative
              ? {
                  queuedForPermissionPrompt: true,
                  actionType,
                  target,
                  note: 'Confirmation prompt will be shown in the app.',
                }
              : {
                  queuedOnDevice: false,
                  executed: false,
                  reason:
                    'Running in Web Browser mode. Native Android intents require the Capacitor Android APK.',
                },
          },
        });
      }
    }

    if (functionResponseParts.length > 0) {
      const startIndex = Math.max(0, candidateModels.indexOf(activeModel));
      const round2 = await generateWithFallback(
        [
          ...contents,
          previousContent,
          { role: 'user', parts: functionResponseParts },
        ],
        startIndex
      );
      response = round2.response;
    }
  }

  const replyText =
    response.text?.trim() ||
    `${settings.ownerName || 'Sagar'}, thoda network hiccup lag raha hai — ek baar phir bhejna?`;

  const groundingChunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const searchSources: SearchSource[] = [];
  const seenUris = new Set<string>();

  for (const chunk of groundingChunks) {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title;
    if (uri && !seenUris.has(uri)) {
      seenUris.add(uri);
      searchSources.push({
        uri,
        title: title || new URL(uri).hostname,
      });
    }
  }

  return {
    replyText,
    actions,
    searchSources,
    memoryChanged,
    updatedSettings,
    detectedLanguage: detectScriptLanguage(replyText),
  };
}

export interface VisionTurnResult {
  replyText: string;
  detectedLanguage: string;
}

export async function runZoyaVisionTurn(params: {
  history: ChatMessage[];
  imageBase64: string;
  mimeType: string;
  prompt: string;
  settings: ZoyaSettings;
  memories: MemoryItem[];
  crossConversations?: CrossConversationSnippet[];
  runtime: RuntimeCapabilities;
}): Promise<VisionTurnResult> {
  const {
    history,
    imageBase64,
    mimeType,
    prompt,
    settings,
    memories,
    crossConversations = [],
    runtime,
  } = params;

  const ai = getAiClient('v1beta');
  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
  const safeMimeType =
    mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

  const baseSystem = buildSystemInstruction(
    settings,
    memories,
    crossConversations,
    runtime
  );

  const ownerName = (settings.ownerName || 'Sagar').trim();
  const visionSystemInstruction = `${baseSystem}

LIVE CAMERA VISION SPECIALIST MODE:
- You are actively looking through ${ownerName}'s live mobile camera feed right now.
- Analyze the provided image carefully and answer ${ownerName}'s question in natural, warm, expressive Hinglish, Hindi, or Gujarati (matching his language and your loving, playful Indian girlfriend companion personality).
- Capabilities you should apply accurately depending on what appears in the camera frame:
  1. Objects & Products: Identify exact item/brand/purpose if visible. When ${ownerName} asks about price (e.g., "Iski price kitni ho sakti hai?"), share a realistic approximate Indian market (INR ₹) range clearly labeled as an estimate.
  2. Animals & Plants: Identify common/scientific names if clear, notable traits, and helpful care/safety tips.
  3. Food & Ingredients: Recognize dishes, snacks, fruits, packaged foods, ingredients, and nutrition/taste notes.
  4. Books, Documents & OCR Text/Signs: Read visible printed or handwritten text, signs, labels, bills, or pages accurately and explain or translate them simply.
  5. Electronics, Devices, Machines & Tools: Explain what it is, how it works ("Ye kaise kaam karta hai?"), and if ${ownerName} asks "Ismein kya problem hai?", check carefully for visible damage, loose cables, indicator LEDs, burn marks, leaks, misalignment, or error codes and suggest safe practical troubleshooting.
  6. Buildings & Surroundings: Describe architectural style, signage, scene context, and notable visual details.
- STRICT VISUAL HONESTY RULES:
  • Never invent or guess unreadable tiny text, hidden labels, exact prices, or unseen defects.
  • If the camera frame is too blurry, dark, shaky, or cropped to tell for sure, tell ${ownerName} warmly and honestly (for example: "Jaan, image thodi blur ya dark lag rahi hai — camera thoda paas laao ya flashlight ON karo na?") and only state what you can genuinely see.
  • Keep explanations conversational, clear, and concise-to-medium length so they sound completely natural when spoken aloud by your female voice.`;

  const recentHistory = history.slice(-8).map<Content>((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  const contents: Content[] = [
    ...recentHistory,
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: safeMimeType,
            data: cleanBase64,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  ];

  const candidateModels = [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
  ];

  let lastError: unknown = null;
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: visionSystemInstruction,
        },
      });

      const replyText =
        response.text?.trim() ||
        `${ownerName}, camera frame thoda unclear aaya — ek baar phir capture karke dikhaoge?`;

      return {
        replyText,
        detectedLanguage: detectScriptLanguage(replyText),
      };
    } catch (err) {
      lastError = err;
      const errText = err instanceof Error ? err.message : String(err);
      const retryable =
        errText.includes('429') ||
        errText.includes('RESOURCE_EXHAUSTED') ||
        errText.includes('INVALID_ARGUMENT') ||
        errText.includes('NOT_FOUND') ||
        errText.includes('404') ||
        errText.includes('500') ||
        errText.includes('503') ||
        errText.includes('INTERNAL') ||
        errText.includes('UNAVAILABLE');
      if (!retryable) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All Gemini multimodal vision models failed to respond.');
}

function detectScriptLanguage(text: string): string {
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
}

function resolveTtsLanguageCode(
  text: string,
  preferredLanguage?: string
): string {
  if (/[\u0A80-\u0AFF]/.test(text) || preferredLanguage === 'gu') {
    return 'gu-IN';
  }
  if (/[\u0900-\u097F]/.test(text) || preferredLanguage === 'hi') {
    return 'hi-IN';
  }
  if (
    /\b(arey|kaise|kya|hoon|hai|main|tum|boliye|batao|aaj|kar|rahe|raha|rahi|sakti|madad|accha|achha|theek|chahiye|yahin|bolo|kem|cho|majama|tamne|hu|karu|yaad|baat|kholo|samjhao|kal|wali|pyaar|pyaari|jaan|intezaar|idhar|aao|banti|kitna|kitne|bade|dil|chalo|thoda|mere|tumhara|tumhare|tumhe|mujhe|ji)\b/i.test(
      text
    )
  ) {
    return 'hi-IN';
  }
  if (preferredLanguage === 'en') {
    return 'en-IN';
  }
  return 'hi-IN';
}

function prepareSpeakableText(rawText: string): string {
  return rawText
    .replace(/```[\s\S]*?```/g, ' Code snippet screen par dikhaya hai. ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

export class TtsQuotaExceededError extends Error {
  readonly code = 'TTS_QUOTA_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'TtsQuotaExceededError';
  }
}

interface CachedTtsAudio {
  audioBase64: string;
  mimeType: string;
  voiceUsed: string;
  languageCode: string;
}

const ttsAudioCache = new Map<string, CachedTtsAudio>();
const ttsModelCooldownUntil = new Map<string, number>();

export async function synthesizeZoyaSpeech(params: {
  text: string;
  voicePersona: ZoyaVoicePersona;
  preferredLanguage?: string;
  ownerName?: string;
}): Promise<CachedTtsAudio> {
  const ai = getAiClient('v1beta');
  const cleanText = prepareSpeakableText(params.text);

  if (!cleanText) {
    throw new Error('No speakable text provided');
  }

  const languageCode = resolveTtsLanguageCode(cleanText, params.preferredLanguage);
  const voiceName: ZoyaVoicePersona =
    params.voicePersona === 'Achernar' ||
    params.voicePersona === 'Leda' ||
    params.voicePersona === 'Sulafat'
      ? params.voicePersona
      : 'Sulafat';

  const cacheKey = `${voiceName}:${languageCode}:${cleanText}`;
  const cached = ttsAudioCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const owner = (params.ownerName || 'Sagar').trim();
  const voiceStyleInstruction =
    `Speak as a young adult Indian woman named Zoya talking lovingly, sweetly, and affectionately to her partner ${owner}. ` +
    'Use a warm, tender, gently playful and romantic conversational voice with soft breathy warmth, ' +
    'natural human rhythm, subtle pauses at commas and ellipses, and genuine emotional pitch variation. ' +
    'Use authentic Indian pronunciation for Hindi, Gujarati, Hinglish, and Indian English. ' +
    'Never sound robotic, monotone, news-anchor formal, cheesy, or Western-accented.';

  const ttsModels = [
    { model: 'gemini-3.8-flash-tts', supportsSpeechMetadata: true },
    { model: 'gemini-3.8-flash-lite-tts', supportsSpeechMetadata: true },
    { model: 'gemini-3.1-flash-tts-preview', supportsSpeechMetadata: false },
  ] as const;

  let response;
  let lastError: unknown = null;
  let modelUsed: string = ttsModels[0].model;
  let sawQuotaLimit = false;
  const now = Date.now();

  for (const candidate of ttsModels) {
    const cooldownUntil = ttsModelCooldownUntil.get(candidate.model) ?? 0;
    if (cooldownUntil > now) {
      sawQuotaLimit = true;
      continue;
    }

    modelUsed = candidate.model;
    try {
      response = await ai.models.generateContent({
        model: candidate.model,
        contents: [
          {
            role: 'user',
            parts: [
              candidate.supportsSpeechMetadata
                ? {
                    text: cleanText,
                    speechMetadata: {
                      style: voiceStyleInstruction,
                    },
                  }
                : {
                    text: `[Voice style: ${voiceStyleInstruction}] ${cleanText}`,
                  },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            languageCode,
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      });
      break;
    } catch (err) {
      lastError = err;
      const errText = err instanceof Error ? err.message : String(err);
      const isQuota =
        errText.includes('429') || errText.includes('RESOURCE_EXHAUSTED');
      if (isQuota) {
        sawQuotaLimit = true;
        // Cool down exhausted TTS model for 15 minutes so we don't hammer it every turn
        ttsModelCooldownUntil.set(candidate.model, Date.now() + 15 * 60_000);
        continue;
      }
      const isNotFoundOrInvalid =
        errText.includes('404') ||
        errText.includes('NOT_FOUND') ||
        errText.includes('INVALID_ARGUMENT');
      if (!isNotFoundOrInvalid) {
        throw err;
      }
    }
  }

  if (!response) {
    if (sawQuotaLimit) {
      throw new TtsQuotaExceededError(
        'Gemini Free Tier TTS daily quota (10 requests/day per model) reached. Switching to device fallback voice — select a billing-enabled API key in Settings > Secrets for unlimited Gemini neural TTS.'
      );
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Gemini TTS models failed to generate audio');
  }

  const audioPart = response.candidates?.[0]?.content?.parts?.find((part) =>
    Boolean(part.inlineData?.data)
  );
  const audioBase64 = audioPart?.inlineData?.data;
  const mimeType = audioPart?.inlineData?.mimeType || 'audio/wav';

  if (!audioBase64) {
    throw new Error(`Gemini TTS (${modelUsed}) returned empty audio data`);
  }

  const result: CachedTtsAudio = {
    audioBase64,
    mimeType,
    voiceUsed: voiceName,
    languageCode,
  };

  if (ttsAudioCache.size >= 40) {
    const oldestKey = ttsAudioCache.keys().next().value;
    if (oldestKey) ttsAudioCache.delete(oldestKey);
  }
  ttsAudioCache.set(cacheKey, result);

  return result;
}

export async function transcribeZoyaAudio(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const ai = getAiClient('v1beta');
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: params.audioBase64,
          },
        },
        {
          text: 'Transcribe the user speech accurately. The speaker may speak in Hindi, Gujarati, English, or a natural mix (Hinglish/Gujlish). Output only the clean transcript text.',
        },
      ],
    },
  });

  return (response.text ?? '').trim();
}

export async function listAvailableTextModels(): Promise<string[]> {
  const ai = getAiClient('v1beta');
  const pager = await ai.models.list();
  const names: string[] = [];
  for await (const m of pager) {
    if (m.name && m.supportedActions?.includes('generateContent')) {
      names.push(m.name.replace(/^models\//, ''));
    }
  }
  return names.slice(0, 40);
}
