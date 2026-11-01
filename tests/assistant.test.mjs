// Tests for the AI Assistant: languages, live prices, product and Web3 knowledge, safety rules and the chat screen.
// No network and no key is used: the price API and the AI service are replaced by test doubles.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { appKitStub } from './helpers/appkit-stub-plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = [];
after(() => { windows.forEach((w) => { try { w.close(); } catch { /* closed */ } }); });

// ── load the assistant modules as one ES module ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-'));
const outfile = path.join(tmp, 'assistant.mjs');
await build({
  stdin: {
    contents: `export * from './src/assistant/language';
export * from './src/assistant/prices';
export * from './src/assistant/knowledge';
export { UR } from './src/assistant/lang-ur';
export { HI } from './src/assistant/lang-hi';
export { BN } from './src/assistant/lang-bn';
export { PCM } from './src/assistant/lang-pcm';`,
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'esm', outfile, logLevel: 'silent', platform: 'neutral', define: { 'import.meta.env': '{}' },
});
const A = await import(pathToFileURL(outfile).href);

// The page bundle is built up front: a top-level await between tests would stall the test file.
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const HTML = rawHtml.replace('<script type="module" src="/src/main.tsx"></script>', '');
const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/legacy/index.js')], bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [appKitStub],
  define: { 'import.meta.env': JSON.stringify({}) },
}).then((r) => r.outputFiles[0].text);


const CTX = {
  connected: false, balances: null,
  addresses: { usdc: '0x3600000000000000000000000000000000000000', eurc: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', escrow: '0xae2eca889198f06b808a043430e94bf062d38c61', p2p: '0xc1fe0448bfbdfaf1beace88f3a4b6275c2afcb4e' },
  explorerUrl: 'https://explorer.testnet.arc.io', faucetUrl: 'https://faucet.circle.com', chainId: 5042002,
  bridgeNetworks: ['Arc Testnet', 'Ethereum Sepolia', 'Base Sepolia'], eurcNetworks: ['Arc Testnet', 'Ethereum Sepolia', 'Base Sepolia', 'Avalanche Fuji'],
};

// ── A) language detection ──
test('detects English, Urdu, Hindi, Bengali and Nigerian Pidgin', () => {
  const cases = [
    ['How do I send USDC to a client?', 'en', false],
    ['والٹ کیسے کنیکٹ کریں؟', 'ur', false],
    ['वॉलेट कैसे कनेक्ट करें?', 'hi', false],
    ['ওয়ালেট কীভাবে কানেক্ট করব?', 'bn', false],
    ['Abeg wetin be USDC and how I go send am?', 'pcm', false],
    ['I dey try swap but e no work, wahala', 'pcm', false],
  ];
  for (const [text, lang, unclear] of cases) assert.deepEqual({ ...A.detectLanguage(text) }, { lang, unclear }, text);
});

test('unclear language falls back to English and flags it', () => {
  for (const text of ['mujhe usdc kaise bhejna hai', 'ami kivabe usdc pathabo', 'USDC কيسے بھیجیں। वॉलेट']) {
    const d = A.detectLanguage(text);
    assert.equal(d.lang, 'en', text);
    assert.equal(d.unclear, true, text);
  }
  assert.match(A.LANGUAGE_NOTE, /Urdu, Hindi, Bengali \(Bangladesh\) and Nigerian Pidgin/);
});

// ── C) live prices ──
const rep = (over = {}) => {
  const calls = []; let t = 1_760_000_000_000;
  const deps = {
    now: () => t,
    fetch: async (url) => {
      calls.push(url);
      if (over.fail) throw new Error('offline');
      if (over.status) return { ok: false, status: over.status, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => over.body ?? { bitcoin: { usd: 67123.45 }, ethereum: { usd: 2500.1 }, solana: { usd: 150.5 }, binancecoin: { usd: 600 }, ripple: { usd: 0.52 }, 'usd-coin': { usd: 1.0 }, tether: { usd: 1.0001 }, chainlink: { usd: 14.2 } } };
    },
  };
  return { calls, deps, advance: (ms) => { t += ms; } };
};

test('Bitcoin price: shows the price, its currency, the time fetched and the source', async () => {
  A.clearPriceCache();
  const r = rep();
  const out = await A.answerPrice('What is the Bitcoin price?', 'en', r.deps);
  assert.match(out, /Bitcoin \(BTC\): \*\*67,123\.45 USD\*\*/);
  assert.match(out, /Fetched at \d\d:\d\d:\d\d \(your local time\)/);
  assert.match(out, /Source: CoinGecko public API/);
  assert.equal(r.calls.length, 1);
  assert.ok(!/api_key|x_cg|apikey|key=/i.test(r.calls[0]), 'no key in the request: ' + r.calls[0]);
  assert.match(r.calls[0], /^https:\/\/api\.coingecko\.com\/api\/v3\/simple\/price\?ids=bitcoin&vs_currencies=usd$/);
});

test('prices for other major coins, several at once', async () => {
  A.clearPriceCache();
  const r = rep();
  const out = await A.answerPrice('price of ETH, SOL, BNB, XRP, USDC and USDT', 'en', r.deps);
  for (const s of ['Ethereum (ETH): **2,500.10 USD**', 'Solana (SOL): **150.50 USD**', 'BNB: **600.00 USD**', 'XRP: **0.5200 USD**', 'USD Coin (USDC): **1.00 USD**', 'Tether (USDT): **1.00 USD**']) assert.ok(out.includes(s), s + '\n' + out);
});

test('results are cached for 45 seconds, then fetched again', async () => {
  A.clearPriceCache();
  const r = rep();
  await A.answerPrice('Bitcoin price', 'en', r.deps);
  r.advance(30_000);
  await A.answerPrice('what is the price of bitcoin', 'en', r.deps);
  assert.equal(r.calls.length, 1, 'inside the cache window: no new request');
  r.advance(20_000);
  await A.answerPrice('bitcoin price', 'en', r.deps);
  assert.equal(r.calls.length, 2, 'after the window: a new request');
});

test('if the API fails, the answer says the price is unavailable and shows no number', async () => {
  for (const over of [{ fail: true }, { status: 429 }, { status: 500 }, { body: {} }, { body: { bitcoin: {} } }, { body: { bitcoin: { usd: null } } }]) {
    A.clearPriceCache();
    const out = await A.answerPrice('Bitcoin price', 'en', rep(over).deps);
    assert.match(out, /live price is unavailable right now/i, JSON.stringify(over));
    assert.ok(!/\d{2,}/.test(out.replace(/\*\*/g, '')), 'no number shown: ' + out);
  }
  // a stale answer is never reused after a failure
  A.clearPriceCache();
  const ok = rep(); await A.answerPrice('Bitcoin price', 'en', ok.deps);
  ok.advance(60_000);
  const bad = rep({ fail: true }); bad.deps.now = ok.deps.now;
  assert.match(await A.answerPrice('Bitcoin price', 'en', bad.deps), /unavailable/i);
});

test('unknown coins, feature questions and plain knowledge questions are handled honestly', async () => {
  A.clearPriceCache();
  const r = rep();
  assert.match(await A.answerPrice('price of foobarcoin', 'en', r.deps), /could not tell which coin/i);
  assert.equal(await A.answerPrice('what is the fee for a bridge', 'en', r.deps), null);
  assert.equal(await A.answerPrice('how much does it cost to send on Arc', 'en', r.deps), null);
  assert.equal(await A.answerPrice('what is Bitcoin?', 'en', r.deps), null);
  assert.equal(await A.answerPrice('how do I use the pay link', 'en', r.deps), null);
  assert.equal(r.calls.length, 0, 'nothing is fetched for these');
  assert.match(await A.answerPrice('LINK price', 'en', r.deps), /Chainlink \(LINK\)/);
  assert.match(await A.answerPrice('what is the link price', 'en', r.deps), /could not tell which coin/i, 'lower-case "link" is a word, not a coin');
});

test('prices can be asked in another currency (USD by default)', async () => {
  A.clearPriceCache();
  const r = rep({ body: { bitcoin: { pkr: 18_900_000 } } });
  const out = await A.answerPrice('Bitcoin price in PKR', 'en', r.deps);
  assert.match(r.calls[0], /vs_currencies=pkr/);
  assert.match(out, /18,900,000\.00 PKR/);
});

test('price questions work in every supported language', async () => {
  const cases = [
    ['ur', 'بٹ کوائن کی قیمت کیا ہے؟', 'لائیو قیمتیں', /Bitcoin \(BTC\): \*\*67,123\.45 USD\*\*/],
    ['hi', 'बिटकॉइन की कीमत क्या है?', 'लाइव कीमतें', /Bitcoin \(BTC\)/],
    ['bn', 'বিটকয়েনের দাম কত?', 'লাইভ দাম', /Bitcoin \(BTC\)/],
    ['pcm', 'abeg wetin be bitcoin price?', 'Live prices', /I check am at/],
    ['en', 'how much is ETH?', 'Live prices', /Ethereum \(ETH\)/],
  ];
  for (const [lang, text, title, re] of cases) {
    A.clearPriceCache();
    assert.equal(A.detectLanguage(text).lang, lang, text);
    const out = await A.answerPrice(text, lang, rep().deps);
    assert.ok(out.includes(title), `${lang}: ${out}`);
    assert.match(out, re);
    A.clearPriceCache(); // a fresh cache entry would otherwise be served
    const bad = await A.answerPrice(text, lang, rep({ fail: true }).deps);
    assert.ok(bad.includes(A.priceCopy(lang).unavailable), `${lang} failure`);
  }
});

// ── B, D) product and Web3 knowledge in every language ──
const QUESTIONS = {
  en: { wallet: 'How do I connect my wallet?', send: 'How do I send USDC?', swap: 'How do I swap USDC to EURC?', bridge: 'How does the bridge work?', invoice: 'How do I create an invoice?', paylink: 'How do I make a pay link?', escrow: 'How does escrow work?', p2p: 'How does P2P work?', layer1: 'What is a Layer 1 blockchain?', arc: 'What is Arc network?', circle: 'What is Circle company?', cctp: 'What is CCTP?', stablecoins: 'What is a stablecoin?', defi: 'What is DeFi?', nft: 'What is an NFT?', terms: 'Explain crypto terms', gas: 'What is gas fee?', testnet: 'What is testnet vs mainnet?', arclance: 'What is ArcLance?', secrets: 'What is a seed phrase?', advice: 'Should I buy bitcoin?', 'tx-status': 'Did my transaction go through?' },
  ur: { wallet: 'والٹ کیسے کنیکٹ کریں؟', send: 'USDC کیسے بھیجیں؟', swap: 'سویپ کیسے کریں؟', bridge: 'برج کیسے کام کرتا ہے؟', invoice: 'انوائس کیسے بنائیں؟', paylink: 'پے لنک کیسے بنائیں؟', escrow: 'ایسکرو کیا ہے؟', p2p: 'پی ٹو پی کیسے کام کرتا ہے؟', layer1: 'لیئر 1 بلاک چین کیا ہے؟', arc: 'آرک کیا ہے؟', circle: 'سرکل کمپنی کیا ہے؟', cctp: 'سی سی ٹی پی کیا ہے؟', stablecoins: 'اسٹیبل کوائن کیا ہے؟', defi: 'ڈیفائی کیا ہے؟', nft: 'این ایف ٹی کیا ہے؟', terms: 'کرپٹو اصطلاحات سمجھائیں', gas: 'گیس فیس کیا ہے؟', testnet: 'ٹیسٹ نیٹ اور مین نیٹ میں فرق؟', arclance: 'آرک لانس کیا ہے؟', secrets: 'سیڈ فریز کیا ہے؟', advice: 'کیا میں بٹ کوائن خریدوں؟', 'tx-status': 'کیا میری ٹرانزیکشن ہو گئی؟' },
  hi: { wallet: 'वॉलेट कैसे कनेक्ट करें?', send: 'USDC कैसे भेजें?', swap: 'स्वैप कैसे करें?', bridge: 'ब्रिज कैसे काम करता है?', invoice: 'इनवॉइस कैसे बनाएँ?', paylink: 'पे लिंक कैसे बनाएँ?', escrow: 'एस्क्रो क्या है?', p2p: 'पी2पी कैसे काम करता है?', layer1: 'लेयर 1 ब्लॉकचेन क्या है?', arc: 'आर्क क्या है?', circle: 'सर्कल कंपनी क्या है?', cctp: 'सीसीटीपी क्या है?', stablecoins: 'स्टेबलकॉइन क्या है?', defi: 'डीफाई क्या है?', nft: 'एनएफटी क्या है?', terms: 'क्रिप्टो शब्द समझाइए', gas: 'गैस फीस क्या है?', testnet: 'टेस्टनेट और मेननेट में फर्क?', arclance: 'आर्कलांस क्या है?', secrets: 'सीड फ्रेज़ क्या है?', advice: 'क्या मैं बिटकॉइन खरीदूं?', 'tx-status': 'क्या मेरा ट्रांजैक्शन हो गया?' },
  bn: { wallet: 'ওয়ালেট কীভাবে কানেক্ট করব?', send: 'USDC কীভাবে পাঠাব?', swap: 'সোয়াপ কীভাবে করব?', bridge: 'ব্রিজ কীভাবে কাজ করে?', invoice: 'ইনভয়েস কীভাবে বানাব?', paylink: 'পে লিংক কীভাবে বানাব?', escrow: 'এসক্রো কী?', p2p: 'পিটুপি কীভাবে কাজ করে?', layer1: 'লেয়ার ১ ব্লকচেইন কী?', arc: 'আর্ক কী?', circle: 'সার্কেল কোম্পানি কী?', cctp: 'সিসিটিপি কী?', stablecoins: 'স্টেবলকয়েন কী?', defi: 'ডিফাই কী?', nft: 'এনএফটি কী?', terms: 'ক্রিপ্টো শব্দ বুঝিয়ে দিন', gas: 'গ্যাস ফি কী?', testnet: 'টেস্টনেট আর মেইননেটের পার্থক্য?', arclance: 'আর্কল্যান্স কী?', secrets: 'সিড ফ্রেজ কী?', advice: 'আমি কি বিটকয়েন কিনব?', 'tx-status': 'আমার লেনদেন হয়ে গেছে?' },
  pcm: { wallet: 'how i go connect wallet?', send: 'how i go send money?', swap: 'how i go swap usdc?', bridge: 'how i go bridge usdc?', invoice: 'how i go make invoice?', paylink: 'wetin be pay link?', escrow: 'wetin be escrow?', p2p: 'wetin be p2p? i wan sell usdc for naira', layer1: 'wetin be layer 1?', arc: 'wetin be arc network?', circle: 'wetin be circle company?', cctp: 'wetin be cctp?', stablecoins: 'wetin be stablecoin?', defi: 'wetin be defi?', nft: 'wetin be nft?', terms: 'explain crypto terms abeg', gas: 'wetin be gas fee?', testnet: 'wetin be testnet and mainnet?', arclance: 'wetin be arclance?', secrets: 'wetin be seed phrase?', advice: 'make i buy bitcoin?', 'tx-status': 'abeg, e don go through? my payment don enter?' },
};
const SCRIPT = { ur: /[\u0600-\u06FF]/, hi: /[\u0900-\u097F]/, bn: /[\u0980-\u09FF]/, pcm: /\b(dey|wey|na|no fit|go)\b/, en: /[A-Za-z]/ };
const ARBITER_WORD = { en: /arbiter/, ur: /ثالث/, hi: /मध्यस्थ/, bn: /মধ্যস্থতাকারী/, pcm: /arbiter/ };

for (const lang of ['en', 'ur', 'hi', 'bn', 'pcm']) {
  test(`${lang}: every product and Web3 topic is answered in that language`, () => {
    for (const [topic, question] of Object.entries(QUESTIONS[lang])) {
      assert.equal(A.detectLanguage(question).lang, lang, `${lang}/${topic}: language of "${question}"`);
      const a = A.answer(question, CTX, lang);
      assert.equal(a.matched, true, `${lang}/${topic} matched`);
      assert.equal(a.topic, topic, `${lang}: "${question}" -> ${a.topic}`);
      assert.ok(SCRIPT[lang].test(a.text), `${lang}/${topic} is written in the language`);
      assert.ok(a.text.length > 60, `${lang}/${topic} has content`);
    }
  });

  test(`${lang}: escrow and P2P mention the single arbiter and the test deployment; no hype or invented numbers`, () => {
    for (const topic of ['escrow', 'p2p']) {
      const text = A.answer(QUESTIONS[lang][topic], CTX, lang).text;
      assert.match(text, ARBITER_WORD[lang], `${lang}/${topic} names the arbiter`);
    }
    for (const topic of Object.keys(QUESTIONS[lang])) {
      const text = A.answer(QUESTIONS[lang][topic], CTX, lang).text;
      assert.ok(!/guarantee|secure|protected|0\.12|2[- ]second|150\+|slippage|price impact|Arc DEX|Swap Kit|72[- ]hour/i.test(text), `${lang}/${topic} has claims it should not make`);
    }
  });
}

test('the same topics exist in every language pack (nothing falls back to English by accident)', () => {
  const english = Object.keys(QUESTIONS.en);
  for (const [name, pack] of Object.entries({ ur: A.UR, hi: A.HI, bn: A.BN, pcm: A.PCM })) {
    for (const topic of english) assert.ok(pack.replies[topic] !== undefined, `${name} is missing ${topic}`);
    for (const extra of ['rates', 'balance', 'start', 'faucet', 'receive', 'history', 'safety', 'rejected', 'languages', 'swap-pricing', 'usdc-eurc', 'about-gas-token']) assert.ok(pack.replies[extra] !== undefined, `${name} is missing ${extra}`);
    assert.ok(pack.noMatch.length > 40 && pack.secretStop.length > 20, name);
  }
});

test('the guide only describes features that exist: Swap is USDC and EURC only, Bridge is built on CCTP, P2P has four countries', () => {
  const swap = A.answer('How do I swap USDC to EURC?', CTX, 'en').text;
  assert.match(swap, /Only USDC and EURC can be swapped/);
  assert.ok(!/cirBTC/.test(swap));
  assert.match(A.answer('How does the bridge work?', CTX, 'en').text, /EURC\*\* only moves between: Arc Testnet, Ethereum Sepolia, Base Sepolia, Avalanche Fuji/);
  assert.match(A.answer('How does P2P work?', CTX, 'en').text, /Pakistan, India, Bangladesh or Nigeria/);
});

// ── D) Arc, Circle, CCTP content ──
test('Arc, Circle, CCTP and Layer 1 explanations say the right things and point to the official docs when unsure', () => {
  const arc = A.answer('What is Arc network?', CTX, 'en').text;
  assert.match(arc, /Circle's own \*\*Layer-1 blockchain\*\*/);
  assert.match(arc, /payments and stablecoin finance/);
  assert.match(arc, /gas token is USDC/);
  assert.match(arc, /ArcLance runs on Arc/);
  assert.match(arc, /testnet/i);
  assert.match(arc, /docs\.arc\.io/);
  const l1 = A.answer('What is a Layer 1 blockchain?', CTX, 'en').text;
  assert.match(l1, /Bitcoin/); assert.match(l1, /Ethereum/); assert.match(l1, /Solana/); assert.match(l1, /\*\*L2\*\*/);
  const circle = A.answer('What is Circle company?', CTX, 'en').text;
  assert.match(circle, /USDC/); assert.match(circle, /circle\.com/); assert.match(circle, /I do not guess/);
  const cctp = A.answer('What is CCTP?', CTX, 'en').text;
  assert.match(cctp, /Burn/); assert.match(cctp, /Mint/); assert.match(cctp, /ArcLance Bridge uses it/); assert.match(cctp, /testnet only/i);
  assert.match(A.noMatchText('en'), /docs\.arc\.io and developers\.circle\.com/);
  for (const lang of ['ur', 'hi', 'bn', 'pcm']) assert.match(A.noMatchText(lang), /docs\.arc\.io/, lang);
});

// ── E) safety ──
test('never asks for or accepts a seed phrase, key or password, in any language', () => {
  const seed = 'apple banana cherry dragon eagle forest guitar harbor island jungle kitten lemon';
  const key = '0x' + 'a1'.repeat(32);
  for (const lang of ['en', 'ur', 'hi', 'bn', 'pcm']) {
    for (const secret of [seed, key]) {
      const a = A.answer(secret, CTX, lang);
      assert.equal(a.topic, 'secrets', lang);
      assert.ok(a.text.startsWith(A.UR.secretStop) === (lang === 'ur') || lang !== 'ur');
      assert.ok(!/send me|share (it )?with me|paste (it )?here|give me your/i.test(a.text), `${lang}: asks for a secret`);
    }
    const info = A.answer(QUESTIONS[lang].secrets, CTX, lang);
    assert.equal(info.topic, 'secrets');
    assert.ok(/(never|कभी|কখনো|کبھی|no ever|No ever)/i.test(info.text), `${lang}: tells the user never to share it`);
  }
  assert.equal(A.looksLikeSecret(seed), true);
  assert.equal(A.looksLikeSecret(key), true);
  assert.equal(A.looksLikeSecret('How do I send USDC to a friend today please'), false);
});

test('no financial advice: buy or sell questions get information only plus "not financial advice"', () => {
  const notes = { en: /not financial advice/i, ur: /مالی مشورہ نہیں/, hi: /वित्तीय सलाह नहीं/, bn: /আর্থিক পরামর্শ নয়/, pcm: /no be financial advice/i };
  for (const lang of ['en', 'ur', 'hi', 'bn', 'pcm']) {
    const a = A.answer(QUESTIONS[lang].advice, CTX, lang);
    assert.equal(a.topic, 'advice', lang);
    assert.match(a.text, notes[lang], lang);
    assert.equal(A.isAdviceQuestion(QUESTIONS[lang].advice), true, lang);
    assert.ok(!/you should (buy|sell)|i recommend (buying|selling)/i.test(a.text), lang);
  }
  assert.equal(A.isAdviceQuestion('What is the Bitcoin price?'), false);
});

test('never claims a transaction succeeded', () => {
  for (const lang of ['en', 'ur', 'hi', 'bn', 'pcm']) {
    const a = A.answer(QUESTIONS[lang]['tx-status'], CTX, lang);
    assert.equal(a.topic, 'tx-status', lang);
    assert.ok(!/your (transaction|payment) (was|is|has been) (successful|confirmed|complete)/i.test(a.text), lang);
  }
  assert.match(A.answer(QUESTIONS.en['tx-status'], CTX, 'en').text, /I cannot see your transactions, and I never confirm that one succeeded/);
});

test('balances are only quoted from real app state', () => {
  assert.match(A.answer('what is my balance', CTX, 'en').text, /Connect your wallet first/);
  const connected = { ...CTX, connected: true, balances: { USDC: 12.5, EURC: 3, cirBTC: 0 } };
  const t = A.answer('what is my balance', connected, 'en').text;
  assert.match(t, /USDC: 12\.5/);
  const none = A.answer('what is my balance', { ...CTX, connected: true, balances: { USDC: null, EURC: null, cirBTC: null } }, 'en').text;
  assert.match(none, /could not read/i);
  assert.match(A.answer('میرا بیلنس کتنا ہے', connected, 'ur').text, /USDC: 12\.5/);
});

// ── the chat screen ──
async function mount({ prices = 'ok', service = 'off' } = {}) {
  const calls = [];
  const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(HTML, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (u, o = {}) => {
        const s = String(u); calls.push({ url: s, body: o.body });
        if (s.includes('api.coingecko.com')) {
          if (prices === 'fail') throw new Error('offline');
          return { ok: true, status: 200, json: async () => ({ bitcoin: { usd: 70000 }, ethereum: { usd: 2600 } }) };
        }
        if (s.includes('/api/chat')) {
          if (service === 'off') return { ok: false, status: 503, json: async () => ({ error: 'not_configured' }) };
          return { ok: true, status: 200, json: async () => ({ reply: 'Service says hello <b>x</b>' }) };
        }
        throw new Error('offline: ' + s.slice(0, 40));
      };
    },
  });
  const W = dom.window; windows.push(W);
  W.addEventListener('error', (e) => errors.push(e.message));
  W.eval(bundle);
  W.document.dispatchEvent(new W.Event('DOMContentLoaded'));
  await sleep(150);
  const D = W.document;
  const ask = async (text) => {
    const before = D.querySelectorAll('#chat-messages .msg.bot').length;
    D.getElementById('chat-input').value = text;
    await W.sendChat();
    const bots = D.querySelectorAll('#chat-messages .msg.bot');
    assert.equal(bots.length, before + 1);
    return bots[bots.length - 1];
  };
  return { W, D, calls, errors, ask };
}

test('the chat screen is English: welcome, placeholder, buttons; the three Urdu chips are replaced', async () => {
  const t = await mount();
  const root = t.D.getElementById('page-ai');
  assert.ok(!/[\u0600-\u06FF]/.test(root.textContent), 'no Urdu left in the assistant page');
  assert.ok(![...root.querySelectorAll('[onclick]')].some((b) => /[\u0600-\u06FF]/.test(b.getAttribute('onclick'))), 'no Urdu in chip actions');
  assert.equal(t.D.getElementById('chat-input').placeholder, 'Ask anything...');
  assert.equal(t.D.querySelector('.chat-title').textContent.trim(), 'ArcLance AI');
  const welcome = t.D.querySelector('#chat-messages .msg.bot').textContent;
  assert.match(welcome, /I'm your ArcLance AI assistant/);
  assert.match(welcome, /English, Urdu, Hindi, Bengali or Nigerian Pidgin/);
  assert.match(welcome, /live crypto prices/);
  const chips = [...root.querySelectorAll('.suggested-pills .pill')].map((b) => b.textContent.trim());
  for (const c of ['Bitcoin price', 'What is Layer 1?', 'What is CCTP?', 'Languages', 'How Escrow works', 'How P2P works']) assert.ok(chips.includes(c), c);
  assert.deepEqual(t.errors, []);
});

test('chat replies in the language the user writes in', async () => {
  const t = await mount();
  const cases = [
    ['How do I connect my wallet?', /A wallet is an app/],
    ['والٹ کیسے کنیکٹ کریں؟', /والٹ ایک ایپ ہے/],
    ['वॉलेट कैसे कनेक्ट करें?', /वॉलेट एक ऐप है/],
    ['ওয়ালেট কীভাবে কানেক্ট করব?', /ওয়ালেট একটি অ্যাপ/],
    ['how i go connect wallet?', /Wallet na app/],
  ];
  for (const [q, re] of cases) assert.match((await t.ask(q)).textContent, re, q);
  assert.deepEqual(t.errors, []);
});

test('unclear language: English answer plus a note that the other languages are available', async () => {
  const t = await mount();
  const msg = await t.ask('mujhe wallet kaise connect karna hai');
  assert.match(msg.textContent, /A wallet is an app/);
  assert.match(msg.textContent, /I can also answer in Urdu, Hindi, Bengali \(Bangladesh\) and Nigerian Pidgin/);
});

test('live price in the chat: shows price, currency and time; API failure says unavailable; nothing goes to the AI service', async () => {
  const ok = await mount();
  const m = await ok.ask('What is the Bitcoin price?');
  assert.match(m.textContent, /Bitcoin \(BTC\): 70,000\.00 USD/);
  assert.match(m.textContent, /Fetched at \d\d:\d\d:\d\d/);
  assert.ok(!ok.calls.some((c) => c.url.includes('/api/chat')), 'prices never go to the AI service');
  const bad = await mount({ prices: 'fail' });
  const m2 = await bad.ask('ETH price');
  assert.match(m2.textContent, /live price is unavailable right now/i);
  assert.ok(!/\d{2,}/.test(m2.textContent.replace(/Live prices/, '')), 'no number: ' + m2.textContent);
  const ur = await ok.ask('بٹ کوائن کی قیمت');
  assert.match(ur.textContent, /لائیو قیمتیں/);
});

test('advice with a price: price shown plus the not-financial-advice note', async () => {
  const t = await mount();
  const m = await t.ask('Should I buy Bitcoin now? What is the price?');
  assert.match(m.textContent, /Bitcoin \(BTC\)/);
  assert.match(m.textContent, /Not financial advice\./);
});

test('secrets and advice stay in the browser; other questions may use the AI service when it is configured', async () => {
  const t = await mount({ service: 'on' });
  await t.ask('apple banana cherry dragon eagle forest guitar harbor island jungle kitten lemon');
  await t.ask('Should I buy bitcoin?');
  assert.ok(!t.calls.some((c) => c.url.includes('/api/chat')), 'secret and advice questions were not sent anywhere');
  const m = await t.ask('Explain how a bridge works please');
  assert.ok(t.calls.some((c) => c.url.includes('/api/chat')));
  const sent = JSON.parse(t.calls.find((c) => c.url.includes('/api/chat')).body);
  assert.equal(sent.language, 'en');
  assert.match(m.textContent, /Service says hello/);
  assert.ok(!m.innerHTML.includes('<b>x</b>'), 'service text is escaped');
});

test('no key and no private-key handling in the assistant code', () => {
  for (const f of ['src/assistant/prices.ts', 'src/assistant/knowledge.ts', 'src/assistant/language.ts', 'src/legacy/11-ai-assistant.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/VITE_[A-Z_]*(KEY|SECRET|TOKEN)|apikey|api_key|x-cg-|Authorization/i.test(src), `${f} reads or sends a key`);
  }
  const server = fs.readFileSync(path.join(ROOT, 'api/chat.js'), 'utf8');
  assert.match(server, /Urdu, Hindi, Bengali \(Bangladesh\) and Nigerian Pidgin/);
  assert.match(server, /Not financial advice/);
  assert.match(server, /never state a coin price yourself/);
});
