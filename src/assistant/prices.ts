/**
 * Live crypto prices for the assistant.
 * Source: CoinGecko's public API. It needs no key and allows browser requests, so no secret is involved.
 * Rules: never guess. If the request fails, the coin is unknown or the data is incomplete, say the price is unavailable.
 * Results are cached for 45 seconds (inside the 30 to 60 second target) to stay under the public rate limit.
 */
import type { Lang } from './language'

export const PRICE_API = 'https://api.coingecko.com/api/v3/simple/price'
export const CACHE_MS = 45_000
export const SOURCE_NAME = 'CoinGecko'

interface Coin {
  id: string
  symbol: string
  name: string
  /** Names matched in any language (lower case, whole word or phrase). */
  aliases: string[]
  /** Short symbols that are also normal words (LINK, DOT, SOL, ADA, TON). Only matched when typed in capitals. */
  capsOnly?: boolean
}

const coinLabel = (c: { name: string; symbol: string }): string => (c.name === c.symbol ? c.name : `${c.name} (${c.symbol})`)

export const COINS: Coin[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', aliases: ['bitcoin', 'btc', 'بٹ کوائن', 'بٹکوائن', 'बिटकॉइन', 'बिटकोइन', 'বিটকয়েন', 'বিটকয়িন'] },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', aliases: ['ethereum', 'eth', 'ether', 'ایتھریم', 'ایتھر', 'एथेरियम', 'ईथर', 'ইথেরিয়াম', 'ইথার'] },
  { id: 'solana', symbol: 'SOL', name: 'Solana', aliases: ['solana', 'sol', 'سولانا', 'सोलाना', 'সোলানা'], capsOnly: true },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', aliases: ['bnb', 'binance coin', 'بی این بی', 'बीएनबी', 'বিএনবি'] },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', aliases: ['xrp', 'ripple', 'ایکس آر پی', 'एक्सआरपी', 'এক্সআরপি'] },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', aliases: ['usdc', 'usd coin', 'یو ایس ڈی سی', 'यूएसडीसी', 'ইউএসডিসি'] },
  { id: 'tether', symbol: 'USDT', name: 'Tether', aliases: ['usdt', 'tether', 'ٹیتھر', 'टेदर', 'টেদার'] },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', aliases: ['doge', 'dogecoin', 'ڈوج کوائن', 'डॉजकॉइन', 'ডজকয়েন'] },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', aliases: ['cardano', 'ada', 'کارڈانو', 'कार्डानो', 'কার্ডানো'], capsOnly: true },
  { id: 'tron', symbol: 'TRX', name: 'TRON', aliases: ['trx', 'tron'] },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', aliases: ['avax', 'avalanche'] },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', aliases: ['chainlink', 'link'], capsOnly: true },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin', aliases: ['ltc', 'litecoin'] },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', aliases: ['polkadot', 'dot'], capsOnly: true },
  { id: 'the-open-network', symbol: 'TON', name: 'Toncoin', aliases: ['toncoin', 'ton'], capsOnly: true },
]

const FIATS = ['usd', 'eur', 'gbp', 'pkr', 'inr', 'bdt', 'ngn'] as const
type Fiat = (typeof FIATS)[number]

// "price", "worth", "how much is" and the same ideas in the supported languages.
const PRICE_INTENT = new RegExp(
  [
    '\\b(price|prices|worth|value|cost|costs|trading at|quote|market price|how much is|how much be|how much does|wetin be the price|e cost)\\b',
    'قیمت|ریٹ|بھاؤ|کتنا|کتنی|کتنے',
    'कीमत|भाव|दाम|रेट|कितना|कितने|कितनी',
    'দাম|মূল্য|রেট|কত',
  ].join('|'),
  'i',
)

export interface PriceDeps {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
  now: () => number
}

const defaultDeps = (): PriceDeps => ({
  fetch: (url) => fetch(url),
  now: () => Date.now(),
})

interface CacheEntry {
  at: number
  data: Record<string, Record<string, number>>
}
const cache = new Map<string, CacheEntry>()

/** Test helper: forget cached prices. */
export function clearPriceCache(): void {
  cache.clear()
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Coins named in the text, in the order they appear. */
export function findCoins(text: string): Coin[] {
  const found: { coin: Coin; at: number }[] = []
  for (const coin of COINS) {
    let at = -1
    for (const alias of coin.aliases) {
      let index = -1
      if (/^[a-z0-9 ]+$/i.test(alias)) {
        // Latin names match any case. A short symbol that is also a normal word (LINK, DOT, SOL, ADA, TON) must be typed in capitals.
        const capsOnly = coin.capsOnly === true && alias === coin.symbol.toLowerCase()
        const word = capsOnly ? alias.toUpperCase() : alias
        index = new RegExp(`(?<![A-Za-z0-9])${escapeRe(word)}(?![A-Za-z0-9])`, capsOnly ? '' : 'i').exec(text)?.index ?? -1
      } else {
        index = text.indexOf(alias)
      }
      if (index >= 0 && (at === -1 || index < at)) at = index
    }
    if (at >= 0) found.push({ coin, at })
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.coin)
}

/** Currency asked for ("in PKR"). USD by default. */
export function findFiat(text: string): Fiat {
  const m = /\b(?:in|to|into)\s+(usd|eur|gbp|pkr|inr|bdt|ngn)\b|\b(pkr|inr|bdt|ngn|eur|gbp)\b/i.exec(text)
  const code = (m?.[1] ?? m?.[2] ?? 'usd').toLowerCase()
  return (FIATS as readonly string[]).includes(code) ? (code as Fiat) : 'usd'
}

export const isPriceQuestion = (text: string): boolean => PRICE_INTENT.test(text)

// Words that mean the question is about an ArcLance fee or feature, not a coin price.
const FEATURE_WORDS = /\b(fee|fees|gas|swap|bridge|invoice|escrow|p2p|send|pay ?link|payment|subscription|network fee)\b|فیس|फीस|ফি/i
const STRONG_PRICE_WORD = /\b(price|prices|worth)\b|قیمت|ریٹ|بھاؤ|कीमत|भाव|दाम|रेट|দাম|মূল্য|রেট/i

type Copy = {
  title: string
  fetched: (time: string) => string
  source: string
  unavailable: string
  unknownCoin: string
  disclaimer: string
  notAdvice: string
}

const COPY: Record<Lang, Copy> = {
  en: {
    title: 'Live prices',
    fetched: (t) => `Fetched at ${t} (your local time).`,
    source: `Source: ${SOURCE_NAME} public API. Prices move every second, so this is a snapshot.`,
    unavailable: 'The live price is unavailable right now. I will not guess it. Please try again in a minute, or check CoinGecko or your exchange.',
    unknownCoin: 'I could not tell which coin you mean. Write its name or symbol, for example Bitcoin or BTC, and I will look up the live price.',
    disclaimer: 'Information only.',
    notAdvice: 'Not financial advice.',
  },
  ur: {
    title: 'لائیو قیمتیں',
    fetched: (t) => `${t} پر حاصل کی گئی (آپ کا مقامی وقت)۔`,
    source: `ماخذ: ${SOURCE_NAME} کا پبلک API۔ قیمتیں ہر سیکنڈ بدلتی ہیں، یہ ایک لمحے کی تصویر ہے۔`,
    unavailable: 'لائیو قیمت ابھی دستیاب نہیں ہے۔ میں اندازہ نہیں لگاؤں گا۔ ایک منٹ بعد دوبارہ کوشش کریں، یا CoinGecko یا اپنا ایکسچینج دیکھیں۔',
    unknownCoin: 'مجھے سمجھ نہیں آیا کہ آپ کون سا سکہ پوچھ رہے ہیں۔ اس کا نام یا علامت لکھیں، مثلاً Bitcoin یا BTC، اور میں لائیو قیمت دیکھ لوں گا۔',
    disclaimer: 'صرف معلومات۔',
    notAdvice: 'یہ مالی مشورہ نہیں ہے۔',
  },
  hi: {
    title: 'लाइव कीमतें',
    fetched: (t) => `${t} पर ली गई (आपका स्थानीय समय)।`,
    source: `स्रोत: ${SOURCE_NAME} का पब्लिक API। कीमतें हर सेकंड बदलती हैं, यह एक पल की तस्वीर है।`,
    unavailable: 'लाइव कीमत अभी उपलब्ध नहीं है। मैं अंदाज़ा नहीं लगाऊँगा। एक मिनट बाद फिर कोशिश करें, या CoinGecko या अपना एक्सचेंज देखें।',
    unknownCoin: 'मैं समझ नहीं पाया कि आप कौन सा कॉइन पूछ रहे हैं। उसका नाम या सिंबल लिखें, जैसे Bitcoin या BTC, मैं लाइव कीमत देख लूँगा।',
    disclaimer: 'सिर्फ़ जानकारी।',
    notAdvice: 'यह वित्तीय सलाह नहीं है।',
  },
  bn: {
    title: 'লাইভ দাম',
    fetched: (t) => `${t} এ নেওয়া হয়েছে (আপনার স্থানীয় সময়)।`,
    source: `সূত্র: ${SOURCE_NAME} এর পাবলিক API। দাম প্রতি সেকেন্ডে বদলায়, এটি একটি মুহূর্তের ছবি।`,
    unavailable: 'লাইভ দাম এখন পাওয়া যাচ্ছে না। আমি আন্দাজ করব না। এক মিনিট পরে আবার চেষ্টা করুন, অথবা CoinGecko বা আপনার এক্সচেঞ্জ দেখুন।',
    unknownCoin: 'আপনি কোন কয়েন জানতে চান বুঝতে পারিনি। তার নাম বা চিহ্ন লিখুন, যেমন Bitcoin বা BTC, আমি লাইভ দাম দেখে নেব।',
    disclaimer: 'শুধু তথ্য।',
    notAdvice: 'এটি আর্থিক পরামর্শ নয়।',
  },
  pcm: {
    title: 'Live prices',
    fetched: (t) => `I check am at ${t} (your own time).`,
    source: `Source: ${SOURCE_NAME} public API. Price dey change every second, so na snapshot be this.`,
    unavailable: 'The live price no dey available now. I no go guess am. Abeg try again after one minute, or check CoinGecko or your exchange.',
    unknownCoin: 'I no sabi which coin you mean. Write the name or symbol, like Bitcoin or BTC, and I go check the live price.',
    disclaimer: 'Na information only.',
    notAdvice: 'Na no be financial advice.',
  },
}

export const priceCopy = (lang: Lang): Copy => COPY[lang]

function formatPrice(value: number, fiat: Fiat, lang: Lang): string {
  const digits = value >= 1 ? 2 : value >= 0.01 ? 4 : 6
  const locale = lang === 'ur' ? 'en-US' : lang === 'hi' ? 'en-IN' : lang === 'bn' ? 'en-US' : 'en-US'
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ${fiat.toUpperCase()}`
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false })

/**
 * Answer a price question. Returns null when the text is not asking for a price at all, so the caller can use other sources.
 * Never returns a number that did not come from a successful API response fetched within the cache window.
 */
export async function answerPrice(text: string, lang: Lang, deps: PriceDeps = defaultDeps()): Promise<string | null> {
  const coins = findCoins(text)
  if (!isPriceQuestion(text)) return null // a coin name alone ("what is Bitcoin?") is a knowledge question, not a price question
  const copy = COPY[lang]
  if (coins.length === 0) return FEATURE_WORDS.test(text) || !STRONG_PRICE_WORD.test(text) ? null : copy.unknownCoin
  const picked = coins.slice(0, 8)
  const fiat = findFiat(text)
  const ids = picked.map((c) => c.id).join(',')
  const key = `${ids}|${fiat}`
  const now = deps.now()
  let entry = cache.get(key)
  if (!entry || now - entry.at > CACHE_MS) {
    try {
      const resp = await deps.fetch(`${PRICE_API}?ids=${ids}&vs_currencies=${fiat}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as Record<string, Record<string, number>>
      entry = { at: deps.now(), data }
      cache.set(key, entry)
    } catch {
      return `**${copy.title}**\n${copy.unavailable}`
    }
  }
  const lines: string[] = []
  for (const coin of picked) {
    const value = entry.data?.[coin.id]?.[fiat]
    lines.push(typeof value === 'number' && Number.isFinite(value) && value > 0 ? `• ${coinLabel(coin)}: **${formatPrice(value, fiat, lang)}**` : `• ${coinLabel(coin)}: ${copy.unavailable.split('.')[0]}.`)
  }
  if (lines.every((l) => !l.includes('**'))) return `**${copy.title}**\n${copy.unavailable}`
  return `**${copy.title}**\n${lines.join('\n')}\n${copy.fetched(clock(entry.at))}\n${copy.source}`
}
