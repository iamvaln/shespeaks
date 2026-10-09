// mail.ts imports `after` from next/server, which Node cannot resolve outside Next: give it a minimal stand-in (runs the job at once).
// Import this file first in a database test that loads code reaching mail.ts.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === 'next/server') return { url: 'data:text/javascript,export const after = (job) => { void Promise.resolve().then(job); };', shortCircuit: true };
    return next(specifier, context);
  }
`));
