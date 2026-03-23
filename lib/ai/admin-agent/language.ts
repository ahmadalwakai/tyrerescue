/* ── Zyphon – Language detection & continuity ─────────── */

export type ZyphonLanguage = 'ar' | 'en';

/** Arabic Unicode ranges + common Arabic connectors */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Common Arabic words (Iraqi/Gulf dialect + MSA) */
const ARABIC_WORDS_RE = /\b(شلون|هلا|مرحبا|اهلا|كيف|يلا|نعم|لا|اي|بلى|شنو|شكو|خوش|صدك|تمام|خلص|ماكو|اكو|هسه|بعد|ليش)\b/;

/**
 * Detect language from a single message.
 * Returns 'ar' if Arabic characters are found, 'en' otherwise.
 */
export function detectLanguage(text: string): ZyphonLanguage {
  if (ARABIC_RE.test(text)) return 'ar';
  if (ARABIC_WORDS_RE.test(text)) return 'ar';
  return 'en';
}

/**
 * Resolve which language the agent should respond in.
 * Priority: explicit session language → detect from latest message → default 'ar'.
 */
export function resolveSessionLanguage(
  sessionLang: ZyphonLanguage | undefined,
  latestMessage: string | undefined,
): ZyphonLanguage {
  // If session language is already locked, keep it
  if (sessionLang) return sessionLang;
  // Detect from the admin's first real reply
  if (latestMessage && latestMessage.trim().length > 0) {
    return detectLanguage(latestMessage);
  }
  // Default: Arabic (admin's primary language)
  return 'ar';
}

/** The mandatory startup greeting (Iraqi dialect) */
export const ZYPHON_GREETING = 'شلونك عبودي جاهز تا نبلش مصايب اليوم 😁';
