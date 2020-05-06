import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { BungieService } from '../bungie/bungie.service';

@Injectable()
export class FirestoreService {
  serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
  db: FirebaseFirestore.Firestore;
  constructor(private bungieService: BungieService) {
    admin.initializeApp({
      credential: admin.credential.cert(this.serviceAccount),
    });

    this.db = admin.firestore();
  }

  async logProfileVisit(
    membershipId: string,
    membershipType: BungieMembershipType,
  ) {
    const profileRes = await this.bungieService.getRootProfile(
      membershipId,
      membershipType,
    );
    if (profileRes && profileRes.membershipId) {
      let profile: Profile = {
        membershipId: profileRes.membershipId,
        membershipType: profileRes.membershipType,
        displayName: profileRes.displayName,
        lastVisit: new Date(),
      };
      const profileRef = this.db
        .collection('profiles')
        .doc(profile.membershipId);
      const profileDoc = await profileRef.get();
      if (profileDoc.exists) {
        const oldProfile = profileDoc.data();
        profile = {
          ...profile,
          lastAccountCheck: oldProfile.lastAccountCheck || new Date(),
          lastInstanceCheck: oldProfile.lastInstanceCheck || new Date(),
        };
        if (!profile.status) {
          profile.status = {};
        }
        if (!profile.status.activityHarvest) {
          profile.status.activityHarvest = 'idle';
        }
        profileRef.set(profile, { merge: true });
      } else {
        profile = {
          ...profile,
          lastAccountCheck: new Date(),
          lastInstanceCheck: new Date(),
          status: {
            activityHarvest: 'idle',
            accountHarvest: 'idle',
          },
        };
        profileRef.set(profile, { merge: true });
      }
    }
    // Write to bnetProfile if it exists, else write destinyProfile
  }

  async getEncounteredClips(membershipIds: string[]) {
    const videosRef = this.db.collection('videos');
    return videosRef
      .where('membershipIds', 'array-contains-any', membershipIds)
      .get();
    // query all Videos that contain any linked membershipIds in encounteredMembershipIds
  }

  async getInstanceClips(instanceIds: string[]) {
    const videosRef = this.db.collection('videos');
    return videosRef
      .where('instanceIds', 'array-contains-any', instanceIds)
      .get();
    // query all Videos that contain instanceId in instanceIds
  }
}

export interface Profile {
  membershipId: string;
  membershipType: BungieMembershipType;
  displayName?: string;

  lastAccountCheck?: Date;
  fresh?: boolean;

  lastVisit?: Date;
  lastInstanceCheck?: Date;
  checkedInstances?: string[];

  lastLinkedProfilesCheck?: Date;
  linkedProfiles?: {
    membershipId: string;
    membershipType: BungieMembershipType;
    displayName?: string;
    withError?: boolean;

    lastCharacterIdCheck?: Date;
    characterIds?: string[];
  }[];

  status?: {
    activityHarvest?: 'idle' | 'active';
    accountHarvest?: 'idle' | 'active';
  };
}

export interface VideoAccount {
  membershipId?: string;
  membershipType?: BungieMembershipType;
  displayName?: string;

  fresh?: boolean;
  type: 'twitch' | 'mixer' | 'xbox';

  rejected?: boolean;
  reported?: boolean;
  reportedBy?: string[];

  lastClipCheck?: Date;
  clipCheckStatus: 'idle' | 'active';

  lastLinkedProfilesCheck?: Date;
  linkedProfiles?: {
    membershipId: string;
    membershipType: BungieMembershipType;
    displayName?: string;
    withError?: boolean;

    lastCharacterIdCheck?: Date;
    characterIds?: string[];
  }[];

  twitch?: {
    userId: string;
    login: string;
    displayName: string;
  };

  mixer?: {
    userId: number;
    username: string;
    channelId: number;
    token: string;
  };

  xbox?: {
    gamertag: string;
    xuid?: string;
  };
}

export interface Video {
  owner: {
    membershipId?: string;
    membershipType?: BungieMembershipType;
    displayName?: string;
  };

  instanceIds?: string[];
  membershipIds?: string[];
  teams?: {
    [instanceId: string]: 17 | 18 | number;
  };

  type: 'twitch' | 'mixer' | 'xbox';

  linkName: string;
  linkId: string;

  twitch?: {
    userId?: string;
    id?: string;
  };

  mixer?: {
    userId?: number;
    id?: number;
    token?: string;
  };

  xbox?: {
    gamertag?: string;
    gameClipId?: string;
    scid?: string;
    xuid?: string;
  };

  timeStart?: Date;
  timeStop?: Date;
  title?: string;
  url?: string;
  thumbnailUrl?: string;
}
