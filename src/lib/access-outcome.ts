// What the answer of POST /api/acces means for the candidate (pure, shared by the form and its test).
export type AccessOutcome = 'sent' | 'limited' | 'retry';
/** No answer (network failure) or a server error is worth a retry; 429 is the limit; anything else is « sent » (the route never says more). */
export const accessOutcome = (status: number | null): AccessOutcome =>
  status === null || status >= 500 ? 'retry' : status === 429 ? 'limited' : 'sent';
