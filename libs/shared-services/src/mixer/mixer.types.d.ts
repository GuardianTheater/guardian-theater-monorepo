export interface TimeStamped {
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface User extends TimeStamped {
  id: number;
  level: number;
  social?: SocialInfo;
  username: string;
  email?: string;
  verified: boolean;
  experience: number;
  sparks: number;
  avatarUrl?: string;
  bio?: string;
  primaryTeam?: number;
}

export interface SocialInfo {
  twitter: string;
  facebook: string;
  youtube: string;
  player: string;
  discord: string;
  verified: string[];
}

export interface UserWithChannel extends User {
  channel: Channel;
}

export interface Channel {
  id: number;
  userId: number;
  token: string;
  online: boolean;
  featured: boolean;
  featureLevel: number;
  partnered: boolean;
  transcodingProfileId?: number;
  suspended: boolean;
  name: string;
  audience: 'family' | 'teen' | '18+';
  viewersTotal: number;
  viewersCurrent: number;
  numFollowers: number;
  description: string;
  typeId?: number;
  interactive: boolean;
  interactiveGameId?: number;
  ftl: number;
  hasVod: boolean;
  languageId?: string;
  coverId?: number;
  thumbnailId?: number;
  badgeId: number;
  bannerUrl: string;
  hosteeId: number;
  hasTranscodes: boolean;
  vodsEnabled: boolean;
  costreamId?: string;
}
