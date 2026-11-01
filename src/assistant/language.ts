/**
 * Language detection for the assistant. Pure function, no network.
 * Supported: English, Urdu, Hindi, Bengali (Bangladesh) and Nigerian Pidgin English.
 * Script decides Urdu, Hindi and Bengali. Pidgin is recognised by its own words in Latin letters.
 * Anything else is treated as English, and `unclear` is set when the text looks like another language written in Latin
 * letters (for example Urdu or Hindi typed in English letters), so the caller can mention the supported languages.
 */

export type Lang = 'en' | 'ur' | 'hi' | 'bn' | 'pcm'

export const LANGUAGES: readonly Lang[] = ['en', 'ur', 'hi', 'bn', 'pcm']

export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  ur: 'اردو (Urdu)',
  hi: 'हिन्दी (Hindi)',
  bn: 'বাংলা (Bengali)',
  pcm: 'Nigerian Pidgin',
}

export interface Detected {
  lang: Lang
  /** True when the language could not be decided and English was chosen by default. */
  unclear: boolean
}

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g
const DEVANAGARI = /[\u0900-\u097F]/g
const BENGALI = /[\u0980-\u09FF]/g

// Words that are Nigerian Pidgin and not ordinary English. One of these is enough.
const PIDGIN = /\b(wetin|abeg|wahala|oga|sabi|pikin|una|dey|wey|abi|sef|jare|biko|naija|howfar|no wahala|na so|na wa|e don|i go dey|make we|dem dey|how e take|how i go|how i fit|make i)\b/i

// Urdu, Hindi or Bengali typed in Latin letters. English is used, and the other languages are mentioned.
const ROMAN_SOUTH_ASIAN = /\b(kaise|kaisay|kya|kyun|kyu|mujhe|mujhay|hai|hain|nahi|nahin|kitna|kitni|bhejna|bhejo|bhejein|paisa|paise|karna|karo|karein|chahiye|batao|bataiye|samajh|aap|tum|kaun|kahan|kab|ami|apni|kemon|kivabe|kibhabe|taka|koto|ache|nai|pathabo|korbo|korte)\b/i

// Bengali typed in Latin letters
const ROMAN_BENGALI = /\b(kivabe|kibhabe|kemon|ami|apni|amar|pathabo|pathano|koto|lagbe|korbo|korte|jabe|achhe|achhi|bolun|dhonnobad|taka)\b/i

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length
}

export function detectLanguage(text: string): Detected {
  const ur = count(text, ARABIC_SCRIPT)
  const hi = count(text, DEVANAGARI)
  const bn = count(text, BENGALI)
  const best = Math.max(ur, hi, bn)
  if (best > 0) {
    // Two different non-Latin scripts in one message: the language is not clear.
    if ([ur, hi, bn].filter((n) => n > 0).length > 1) return { lang: 'en', unclear: true }
    return { lang: ur === best ? 'ur' : hi === best ? 'hi' : 'bn', unclear: false }
  }
  if (PIDGIN.test(text)) return { lang: 'pcm', unclear: false }
  if (ROMAN_SOUTH_ASIAN.test(text) || ROMAN_BENGALI.test(text)) return { lang: 'en', unclear: true }
  return { lang: 'en', unclear: false }
}
