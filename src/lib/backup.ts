/**
 * Backup file for the data ArcLance keeps only in this browser: invoices and usernames.
 *
 * Reading a backup never trusts the file: every field is checked and copied into a fresh object, text is
 * made safe to show, and importing only ever ADDS what is missing. Nothing already saved is overwritten.
 */

export const BACKUP_APP = 'arclance'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 2_000_000
const MAX_INVOICES = 2000
const MAX_USERNAMES = 500
const STATUSES = ['pending', 'paid', 'overdue']
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const USERNAME = /^[a-z0-9._-]{3,32}$/

export interface BackupInvoice {
  id: number
  createdAt: string
  client: string
  yourName?: string
  number: string
  amount: string
  status: string
  due?: string
  desc?: string
  walletAddr?: string
  isEscrow?: boolean
  escrowStatus?: string | null
  sig?: string
  project?: string
}

export interface Backup {
  app: string
  version: number
  exportedAt: string
  invoices: BackupInvoice[]
  usernames: Record<string, string>
  myUsername: string | null
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

export interface ImportPlan {
  newInvoices: BackupInvoice[]
  duplicateInvoices: number
  newUsernames: Record<string, string>
  conflictingUsernames: string[]
  setMyUsername: string | null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Text from a file is shown with innerHTML in the invoice list, so angle brackets are turned into entities. */
export function safeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  if (value.length > max) return null
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildBackup(invoices: unknown[], usernames: Record<string, string>, myUsername: string | null, now: Date = new Date()): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    invoices: invoices as BackupInvoice[],
    usernames,
    myUsername,
  }
}

function checkInvoice(raw: unknown, index: number): { ok: true; inv: BackupInvoice } | { ok: false; error: string } {
  const where = `Invoice ${index + 1}`
  if (!isObject(raw)) return { ok: false, error: `${where} is not an invoice.` }
  const number = safeText(raw.number, 64)
  const client = safeText(raw.client, 200)
  if (!number || !client) return { ok: false, error: `${where} needs a number and a client name.` }
  const amountNum = typeof raw.amount === 'number' ? raw.amount : typeof raw.amount === 'string' ? Number(raw.amount) : NaN
  if (!Number.isFinite(amountNum) || amountNum < 0 || amountNum > 1e12) return { ok: false, error: `${where} (${number}) has an invalid amount.` }
  const status = typeof raw.status === 'string' ? raw.status : 'pending'
  if (!STATUSES.includes(status)) return { ok: false, error: `${where} (${number}) has an unknown status.` }
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date(0).toISOString()
  const inv: BackupInvoice = {
    id: typeof raw.id === 'number' && Number.isFinite(raw.id) ? raw.id : Date.parse(createdAt),
    createdAt,
    client,
    number,
    amount: String(raw.amount),
    status,
  }
  for (const [key, max] of [['yourName', 200], ['due', 64], ['desc', 5000], ['escrowStatus', 64], ['sig', 64], ['project', 200]] as const) {
    const v = raw[key]
    if (v === undefined || v === null || v === '') continue
    const s = safeText(v, max)
    if (s === null) return { ok: false, error: `${where} (${number}) has an invalid "${key}".` }
    ;(inv as unknown as Record<string, unknown>)[key] = s
  }
  if (raw.walletAddr !== undefined && raw.walletAddr !== null && raw.walletAddr !== '') {
    if (typeof raw.walletAddr !== 'string' || !ADDRESS.test(raw.walletAddr)) return { ok: false, error: `${where} (${number}) has an invalid wallet address.` }
    inv.walletAddr = raw.walletAddr
  }
  if (raw.isEscrow !== undefined) inv.isEscrow = raw.isEscrow === true
  return { ok: true, inv }
}

/** Read and check a backup file's text. Returns the cleaned backup or one clear reason it was refused. */
export function parseBackup(text: string): ParseResult {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'The file is empty.' }
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'The file is too large to be an ArcLance backup.' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This is not a JSON file.' }
  }
  if (!isObject(data) || data.app !== BACKUP_APP) return { ok: false, error: 'This file is not an ArcLance backup.' }
  if (data.version !== BACKUP_VERSION) return { ok: false, error: 'This backup version is not supported.' }
  if (!Array.isArray(data.invoices) || data.invoices.length > MAX_INVOICES) return { ok: false, error: 'The invoice list is missing or too long.' }
  const invoices: BackupInvoice[] = []
  for (let i = 0; i < data.invoices.length; i += 1) {
    const r = checkInvoice(data.invoices[i], i)
    if (!r.ok) return r
    invoices.push(r.inv)
  }
  const usernames: Record<string, string> = {}
  const rawNames = data.usernames ?? {}
  if (!isObject(rawNames) || Object.keys(rawNames).length > MAX_USERNAMES) return { ok: false, error: 'The username list is invalid or too long.' }
  for (const [name, addr] of Object.entries(rawNames)) {
    if (!USERNAME.test(name)) return { ok: false, error: `The username "${name.slice(0, 32)}" is not valid.` }
    if (typeof addr !== 'string' || !ADDRESS.test(addr)) return { ok: false, error: `The username "${name}" has an invalid address.` }
    usernames[name] = addr
  }
  const mine = data.myUsername
  if (mine !== null && mine !== undefined && (typeof mine !== 'string' || !USERNAME.test(mine))) return { ok: false, error: 'The saved own username is not valid.' }
  const exportedAt = typeof data.exportedAt === 'string' ? data.exportedAt : ''
  return { ok: true, backup: { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt, invoices, usernames, myUsername: typeof mine === 'string' ? mine : null } }
}

const invoiceKey = (i: { number: string; client: string; amount: string }) => `${i.number}|${i.client}|${Number(i.amount)}`

/** What importing would do. Existing invoices and usernames are kept; only missing ones are added. */
export function planImport(current: { invoices: { number: string; client: string; amount: string }[]; usernames: Record<string, string>; myUsername: string | null }, backup: Backup): ImportPlan {
  const have = new Set(current.invoices.map(invoiceKey))
  const newInvoices: BackupInvoice[] = []
  let duplicateInvoices = 0
  for (const inv of backup.invoices) {
    const k = invoiceKey(inv)
    if (have.has(k)) duplicateInvoices += 1
    else { have.add(k); newInvoices.push(inv) }
  }
  const newUsernames: Record<string, string> = {}
  const conflictingUsernames: string[] = []
  for (const [name, addr] of Object.entries(backup.usernames)) {
    const existing = current.usernames[name]
    if (existing === undefined) newUsernames[name] = addr
    else if (existing.toLowerCase() !== addr.toLowerCase()) conflictingUsernames.push(name)
  }
  const setMyUsername = !current.myUsername && backup.myUsername && (newUsernames[backup.myUsername] || current.usernames[backup.myUsername]) ? backup.myUsername : null
  return { newInvoices, duplicateInvoices, newUsernames, conflictingUsernames, setMyUsername }
}
