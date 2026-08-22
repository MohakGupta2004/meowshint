import type { Platform } from '../../../generated/prisma/client';

export type ResultModel =
  'webSearchResult' | 'instagramResult' | 'linkedInResult' | 'socialProfileResult';

export interface MappedResult {
  model: ResultModel;
  data: Record<string, unknown>;
}

// Table/field mapping for platform-specific scrape results, extracted out of
// writeResult so the worker's idempotent upsert path (task-runner.ts) and the
// HTTP-facing create path (sessionsService.writeResult) share one source of
// truth for field names without sharing a persistence method — the existing
// test suite pins writeResult to .create, not .upsert.
export function mapResult(platform: Platform, data: Record<string, any>): MappedResult {
  const baseData = { summaryText: data.summaryText ?? null, raw: data.raw ?? null };

  switch (platform) {
    case 'WEB_SEARCH':
      return {
        model: 'webSearchResult',
        data: {
          ...baseData,
          query: data.query ?? '',
          engine: data.engine ?? null,
          totalResults: data.totalResults ?? null,
          results: data.results ?? [],
          discoveredHandles: data.discoveredHandles ?? null,
        },
      };
    case 'INSTAGRAM':
      return {
        model: 'instagramResult',
        data: {
          ...baseData,
          username: data.username ?? '',
          fullName: data.fullName ?? null,
          biography: data.biography ?? null,
          followers: data.followers ?? null,
          following: data.following ?? null,
          postCount: data.postCount ?? null,
          isPrivate: data.isPrivate ?? false,
          isVerified: data.isVerified ?? false,
          avatarUrl: data.avatarUrl ?? null,
          externalUrl: data.externalUrl ?? null,
          extractedEmails: data.extractedEmails ?? [],
          extractedPhones: data.extractedPhones ?? [],
        },
      };
    case 'LINKEDIN':
      return {
        model: 'linkedInResult',
        data: {
          ...baseData,
          publicId: data.publicId ?? '',
          fullName: data.fullName ?? null,
          headline: data.headline ?? null,
          currentCompany: data.currentCompany ?? null,
          currentTitle: data.currentTitle ?? null,
          location: data.location ?? null,
          about: data.about ?? null,
          experience: data.experience ?? null,
          education: data.education ?? null,
          skills: data.skills ?? [],
          connections: data.connections ?? null,
          avatarUrl: data.avatarUrl ?? null,
        },
      };
    default:
      // GITHUB, TWITCH, YOUTUBE, TIKTOK, PINTEREST, LINKTREE
      return {
        model: 'socialProfileResult',
        data: {
          ...baseData,
          platform,
          username: data.username ?? '',
          displayName: data.displayName ?? null,
          bio: data.bio ?? null,
          followers: data.followers ?? null,
          following: data.following ?? null,
          itemCount: data.itemCount ?? null,
          avatarUrl: data.avatarUrl ?? null,
          profileUrl: data.profileUrl ?? null,
          socials: data.socials ?? null,
        },
      };
  }
}
