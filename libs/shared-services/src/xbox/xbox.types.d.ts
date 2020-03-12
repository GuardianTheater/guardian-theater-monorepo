export interface XboxGameClipsResponse {
  status: string;
  numResults: number;
  gameClips: XboxGameClip[];
  continuationToken: string;
}

export interface XboxGameClip {
  gameClipId: string;
  scid: string;
  xuid: string;

  dateRecorded: string;
  durationInSeconds: number;

  thumbnails: XboxThumbnail[];
  gameClipLocale: 'en-US' | string;

  datePublished: string;
  titleId: number;
  state: 'Published' | string;
  lastModified: string;
  userCaption: string;
  type: 'UserGenerated' | string;
  rating: number;
  ratingCount: number;
  views: number;
  titleData: string;
  systemProperties: string;
  savedByUser: boolean;
  achievementId: string;
  greatestMomentId: string;
  gameClipUris: XboxGameClipUri[];
  clipName: string;
  titleName: string;
  clipContentAttributes: 'None' | string;
  deviceType: 'Edmonton' | 'Durango' | 'Scorpio' | 'WindowsOneCore' | string;
  commentCount: number;
  likeCount: number;
  shareCount: number;
  partialViews: number;
}

export interface XboxThumbnail {
  uri: string;
  thumbnailType: 'Small' | 'Large' | string;
  fileSize: number;
}

export interface XboxGameClipUri {
  uri: string;
  fileSize: number;
  uriType: 'Download' | string;
  expiration: string;
}
