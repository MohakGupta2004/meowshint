const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const OBFUSCATED_EMAIL_RE =
  /([a-zA-Z0-9._%+-]+)\s*\(\s*at\s*\)\s*([a-zA-Z0-9.-]+)\s*\(\s*dot\s*\)\s*([a-zA-Z]{2,})/gi;
const PHONE_RE = /(?<![.\d])(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g;

export function extractEmails(text: string): string[] {
  const found: string[] = [];

  for (const match of text.matchAll(OBFUSCATED_EMAIL_RE)) {
    found.push(`${match[1]}@${match[2]}.${match[3]}`);
  }

  const deobfuscated = text.replace(OBFUSCATED_EMAIL_RE, '');
  for (const match of deobfuscated.matchAll(EMAIL_RE)) {
    found.push(match[0]);
  }

  return found;
}

export function extractPhones(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PHONE_RE)) {
    found.push(match[0]);
  }
  return found;
}
