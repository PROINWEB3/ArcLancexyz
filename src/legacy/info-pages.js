// Plain information pages: Terms, Privacy, About, Contact, "How to pay an ArcLance invoice" and Roadmap.
// Every statement here describes what the app does today. Facts the owner has not given are left as
// a clearly marked placeholder (see TBD) and listed in the change report.
import { SITE } from '../config/site';

const TBD = '<span class="placeholder">[TO BE ADDED BY OWNER]</span>';

const ul = (items) => `<ul style="margin:8px 0 0 18px;display:flex;flex-direction:column;gap:6px">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const ol = (items) => `<ol style="margin:8px 0 0 20px;display:flex;flex-direction:column;gap:8px">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
const sec = (title, body) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px"><div style="font-size:14px;font-weight:700;margin-bottom:8px">${title}</div><div style="font-size:13px;color:var(--text2);line-height:1.8">${body}</div></div>`;
const testnetNote = '<strong style="color:var(--text)">Testnet demo - no real money.</strong> ArcLance runs on Arc Testnet. All tokens used here are test tokens with no real value.';

export const INFO_PAGES = {
  terms: {
    title: 'Terms',
    summary: 'Plain-language terms for the testnet demo',
    sections: () => [
      sec('This is a summary, not a legal agreement', `${testnetNote}<br>This page explains in plain words how the demo works. It is not a signed contract. Final legal terms: ${TBD}`),
      sec('Testnet demo, no real funds', ul(['Do not send or deposit real money or real tokens. Test tokens come from the Faucet and have no value.', 'Balances, history and receipts describe test activity only.', 'Nothing on ArcLance is legal, tax or financial advice.'])),
      sec('Non-custodial', ul(['ArcLance never holds your funds or your keys. Your own wallet signs every transaction.', 'ArcLance cannot reverse a transaction, recover a lost wallet, or recover a seed phrase. Never share your seed phrase or private key with anyone, including ArcLance.'])),
      sec('Your data stays in your browser', 'Invoices, usernames, reminders, contacts and history are saved only in this browser. Clearing the browser data deletes them, and ArcLance has no copy to restore. Use Export backup on the Invoices page. See the Privacy page.'),
      sec('USDC and EURC issuer risks', ul(['USDC and EURC are issued by Circle. Circle can blacklist (freeze) addresses and can act under its own policies and the law. ArcLance cannot override that.', 'USDC is designed to track $1 USD and EURC to track the euro. Neither is guaranteed to hold its value.', 'The Escrow and P2P contracts on testnet have not been independently audited and can contain bugs. Their settings (including the single dispute arbiter) are described in Docs.'])),
      sec('Other services', 'Swaps, bridging, prices and exchange rates use services from other companies (for example Circle and its partners, price and rate providers, public blockchain nodes). Their terms and availability apply, and they can change or stop.'),
      sec('No warranty, responsibility', `The demo is provided as it is, without promises about availability, accuracy or fitness for a purpose. You use it at your own risk. Legal entity, contact and governing law: ${TBD}`),
      sec('Changes', `These terms can change as the product changes. Effective date: ${TBD}`),
    ],
  },
  privacy: {
    title: 'Privacy',
    summary: 'What is stored, what leaves your browser, and what is public',
    sections: () => [
      sec('Short version', `${testnetNote}<br>ArcLance has no accounts and no ArcLance database of your data. What you create is saved in this browser. Blockchain transactions are public.`),
      sec('Saved in this browser only', ul(['Invoices, usernames, contacts and payment reminders.', 'A cache of your transaction, swap and bridge history, and the assistant chat history.', 'Your wallet is not remembered. You connect and sign again each time you open the site.', 'Clear your browser data and all of this is gone. ArcLance cannot restore it. Use Export backup (Invoices page).'])),
      sec('Public on the blockchain', ul(['Every transaction is public: addresses, amounts and times.', 'Escrow delivery notes and dispute reasons, and P2P payment details, are stored on the blockchain and readable by anyone. Do not put real bank or account details there.'])),
      sec('Requests your browser makes to other services', ul(['Public blockchain nodes (balances, transactions) and the Arcscan explorer links you open.', 'Circle services for bridging (attestation) and swaps. If swap through StableFX is switched on, requests go through an ArcLance server function.', 'CoinGecko (coin prices) and an exchange-rate service (local currency amounts).', 'Google Fonts (the page fonts).', `The assistant sends your question to an AI provider only if the site owner has set one up; otherwise answers come from the built-in guide in your browser.`, 'Each of these can see your IP address, as any website you visit can.'])),
      sec('Not used', 'ArcLance does not add advertising or analytics scripts and does not set tracking cookies. The hosting provider may keep ordinary server logs.'),
      sec('Your choices', 'Export a backup, import it on another device, or clear your browser data to delete what ArcLance saved. You choose which wallet connects and what you sign.'),
      sec('Who is responsible', `Operator name and privacy contact: ${TBD}`),
    ],
  },
  about: {
    title: 'About ArcLance',
    summary: 'A payment page for freelancers, on Arc Testnet',
    sections: () => [
      sec('What it is', `${testnetNote}<br>ArcLance is a payment page for freelancers who get paid in USDC or EURC. You connect your own wallet; ArcLance never holds your funds.`),
      sec('What you can do today', ul(['Send and receive USDC, EURC and cirBTC, with a payment history and receipts.', 'Create invoices (saved in your browser) and share a pay link with your wallet address.', 'Swap USDC and EURC, and bridge USDC and EURC between supported test networks.', 'Use milestone Escrow and P2P (USDC for local money) on testnet.', 'Ask the built-in assistant for help, in English, Urdu, Hindi, Bengali or Nigerian Pidgin.'])),
      sec('Built on Arc', 'Arc is a Layer 1 blockchain from Circle where USDC is used for fees. ArcLance currently runs on Arc Testnet only. See the Roadmap for what is planned.'),
      sec('Code', `<a href="${SITE.repo}" target="_blank" rel="noopener" style="color:var(--yellow-ink)">${SITE.repo.replace('https://', '')}</a>`),
      sec('Who is behind it', `Team and company details: ${TBD}`),
    ],
  },
  contact: {
    title: 'Contact',
    summary: 'How to reach ArcLance',
    sections: () => [
      sec('Find us', ul([`X: <a href="${SITE.x}" target="_blank" rel="noopener" style="color:var(--yellow-ink)">${SITE.xHandle}</a>`, `Code: <a href="${SITE.repo}" target="_blank" rel="noopener" style="color:var(--yellow-ink)">${SITE.repo.replace('https://', '')}</a>`, `Email: ${TBD}`])),
      sec('Reporting a problem or a security issue', `Support and security contact: ${TBD}<br>Never send a seed phrase or private key to anyone. ArcLance will never ask for one.`),
    ],
  },
  clients: {
    title: 'How to pay an ArcLance invoice',
    summary: 'For clients: five steps (testnet demo)',
    sections: () => [
      sec('Before you start', `${testnetNote} Use test tokens only.`),
      sec('Steps', ol([
        '<strong>Install a wallet.</strong> Use a browser wallet such as MetaMask. Keep your seed phrase private and never share it.',
        '<strong>Get testnet USDC.</strong> Open the Faucet page in ArcLance and follow the link to the Circle faucet. Test USDC pays for the invoice and for network fees.',
        '<strong>Open the link</strong> the freelancer sent you. It looks like <span style="font-family:\'JetBrains Mono\',monospace">https://arclance.xyz/pay/&lt;wallet address&gt;/&lt;amount&gt;/&lt;label&gt;</span>. The payment screen shows the amount and who is paid.',
        '<strong>Check the address and network.</strong> Compare the full recipient address with the one the freelancer gave you (ask them through another channel if unsure). The network must be Arc Testnet; if your wallet is on another network, ArcLance asks you to switch.',
        '<strong>Connect your wallet and pay.</strong> Press the pay button and confirm in your wallet. When the transaction is confirmed you get a link to Arcscan and a receipt.',
      ])),
      sec('Good to know', ul(['If a link does not open or the address looks wrong, do not pay. Ask the freelancer for a new link.'])),
    ],
  },
  roadmap: {
    title: 'Roadmap (planned, no dates)',
    summary: 'What is planned. None of this is available today.',
    sections: () => [
      sec('Planned, not available', ul(['<strong>Mainnet</strong> - running on Arc mainnet with real funds. Not available.', '<strong>Saved data across devices</strong> - invoices and usernames that follow you, instead of living in one browser. Not available.', '<strong>Real on-chain escrow for invoices</strong> - the invoice Escrow tag does not lock funds today; the separate Escrow page is the on-chain version on testnet. Not available for invoices.', '<strong>Local cash-out guides</strong> - step-by-step guides for turning USDC into local money, by country. Not available.'])),
      sec('No dates', 'These are plans, not promises. Nothing here has a release date, and plans can change.'),
    ],
  },
};
