const JSONLD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;
const OG_DESCRIPTION_RE = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i;

export interface JsonLdPerson {
  name?: string;
  description?: string;
}

export function extractJsonLd(html: string): JsonLdPerson | null {
  const match = html.match(JSONLD_RE);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export interface OgCounts {
  followers?: number;
  following?: number;
  posts?: number;
}

export function extractOgDescriptionCounts(html: string): OgCounts | null {
  const match = html.match(OG_DESCRIPTION_RE);
  if (!match?.[1]) return null;

  const content = match[1];
  const followers = content.match(/([\d,]+)\s*Followers/i);
  const following = content.match(/([\d,]+)\s*Following/i);
  const posts = content.match(/([\d,]+)\s*Posts/i);

  if (!followers && !following && !posts) return null;

  const parse = (m: RegExpMatchArray | null) => (m ? Number(m[1]!.replace(/,/g, '')) : undefined);

  return {
    followers: parse(followers),
    following: parse(following),
    posts: parse(posts),
  };
}
