// What the email log keeps of a message. Pure, so it can be tested without the mail provider or the database.

/** The one-time coach login and invitation links are replaced: reading the log can never open a session. */
export const logText = (m: { kind: string; text: string }): string =>
  m.kind === 'coach_login' || m.kind === 'coach_invite'
    ? m.text.replace(/(\/admin\/verify\?token=)[A-Za-z0-9_-]+/g, '$1(lien à usage unique, non conservé)')
    : m.text;
