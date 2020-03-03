export interface User {
  broadcaster_type: 'partner' | 'affiliate' | '';
  description: string;
  display_name: string;
  email?: string;
  id: string;
  login: string;
  offline_image_url: string;
  profile_image_url: string;
  type: 'staff' | 'admin' | 'global_mod' | '';
  view_count: number;
}

export interface GetUsersResponse {
  data: User[];
}

export interface Video {
  created_at: string;
  description: string;
  duration: string;
  id: string;
  language: string;
  pagination: string;
  published_at: string;
  thumbnail_url: string;
  title: string;
  type: 'upload' | 'archive' | 'highlight';
  url: string;
  user_id: string;
  user_name: string;
  view_count: number;
  viewable: 'public' | 'private';
}

export interface GetVideosResponse {
  data: Video[];
  pagination: {
    cursor: string;
  };
}
