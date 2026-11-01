import type { AssistantContext } from './knowledge'

/** One language's answers. Keys are topic ids from knowledge.ts. A topic with no entry falls back to English. */
export interface LangPack {
  replies: Record<string, string | ((c: AssistantContext) => string)>
  /** Extra words that lead to a topic when the user writes in this language. English keywords always work too. */
  keywords: Record<string, string[]>
  noMatch: string
  /** First line when a message looks like a private key or seed phrase. */
  secretStop: string
}
