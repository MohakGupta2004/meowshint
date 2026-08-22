export interface SummaryLine {
  label: string;
  value: string | number | undefined | null;
}

function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
}

function clampBio(bio: string, max = 280): string {
  if (bio.length <= max) return bio;
  return `${bio.slice(0, max)}…`;
}

export interface RenderSummaryInput {
  title: string; // e.g. "@octocat — The Octocat"
  bio?: string | null;
  followers?: number | null;
  following?: number | null;
  itemCount?: number | null;
  itemLabel?: string; // e.g. "Public repos" default
  links?: string[];
  profileUrl?: string | null;
}

export function renderSummary(input: RenderSummaryInput): string {
  const lines: string[] = [input.title];

  const counts: string[] = [];
  if (input.followers != null) counts.push(`Followers ${fmtCount(input.followers)}`);
  if (input.following != null) counts.push(`Following ${fmtCount(input.following)}`);
  if (input.itemCount != null) {
    counts.push(`${input.itemLabel ?? 'Items'} ${fmtCount(input.itemCount)}`);
  }
  if (counts.length > 0) lines.push(counts.join(' · '));

  if (input.bio) lines.push(`Bio: ${clampBio(input.bio)}`);
  if (input.links && input.links.length > 0) lines.push(`Links: ${input.links.join(' · ')}`);
  if (input.profileUrl) lines.push(`Profile: ${input.profileUrl}`);

  return lines.join('\n');
}
