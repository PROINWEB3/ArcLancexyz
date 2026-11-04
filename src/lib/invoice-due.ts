/**
 * Invoice due dates.
 *
 * New invoices store a real date ("2026-12-30", from the date picker). Older invoices saved free text
 * such as "7 days", "30 Dec 2026" or "On receipt". Both keep working: a due date we can read gives a
 * real "overdue" status, and one we cannot read simply never becomes overdue (it is never an error).
 */

export interface InvoiceLike {
  status?: string
  due?: string
  createdAt?: string
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const RELATIVE = /^(?:within\s+|net\s*)?(\d{1,3})\s*days?$/i

function endOfDay(d: Date): Date {
  const e = new Date(d.getTime())
  e.setHours(23, 59, 59, 999)
  return e
}

/** The moment an invoice stops being on time (end of its due day), or null when there is no readable due date. */
export function parseDue(due: string | undefined, createdAtIso?: string): Date | null {
  const text = (due ?? '').trim()
  if (!text) return null
  const iso = ISO_DAY.exec(text)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Number.isNaN(d.getTime()) || d.getMonth() !== Number(iso[2]) - 1 ? null : endOfDay(d)
  }
  const rel = RELATIVE.exec(text)
  if (rel) {
    const created = createdAtIso ? new Date(createdAtIso) : null
    if (!created || Number.isNaN(created.getTime())) return null
    const d = new Date(created.getTime())
    d.setDate(d.getDate() + Number(rel[1]))
    return endOfDay(d)
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getFullYear()
  if (year < 2000 || year > 2100) return null
  return endOfDay(parsed)
}

/** The status to show: a pending invoice whose due date has passed is overdue. Paid stays paid. */
export function effectiveStatus(inv: InvoiceLike, now: Date = new Date()): string {
  const status = inv.status ?? 'pending'
  if (status !== 'pending') return status
  const due = parseDue(inv.due, inv.createdAt)
  return due && now.getTime() > due.getTime() ? 'overdue' : 'pending'
}

/** A readable due date: real dates are shown as a local date, older free text is shown as it was typed. */
export function formatDue(due: string | undefined): string {
  const text = (due ?? '').trim()
  const iso = ISO_DAY.exec(text)
  if (!iso) return text
  const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  return Number.isNaN(d.getTime()) ? text : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
