import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { BungieMembershipType } from 'bungie-api-ts/user';

@Injectable()
export class FirestoreService {
  serviceAccount = require('../../../../firebase-key.json');
  db: FirebaseFirestore.Firestore;
  constructor() {
    admin.initializeApp({
      credential: admin.credential.cert(this.serviceAccount),
    });

    this.db = admin.firestore();
  }

  async updateDestinyProfiles(destinyProfiles: DestinyProfile[]) {
    const batch = this.db.batch();
    for (let i = 0; i < destinyProfiles.length; i++) {
      const destinyProfile = destinyProfiles[i];
      const {
        membershipId,
        membershipType,
        displayName,
        bnetProfile,
        accountLinks,
        timestamps,
      } = destinyProfile;
      if (membershipId) {
        let update: DestinyProfile = { membershipId };
        if (membershipType) {
          update = { ...update, membershipType };
        }
        if (displayName) {
          update = { ...update, displayName };
        }
        if (bnetProfile) {
          update = { ...update, bnetProfile };
        }
        if (accountLinks && accountLinks.length) {
          update = { ...update, accountLinks };
        }
        if (timestamps) {
          if (timestamps.pageLastVisited && !timestamps.activitiesLastChecked) {
            timestamps.activitiesLastChecked = new Date();
          }
          update = { ...update, timestamps };
        }
        batch.set(
          this.db.collection('destinyProfiles').doc(membershipId),
          update,
          { merge: true },
        );
      }
    }
    batch.commit();
  }

  async getDestinyProfile(membershipId: string) {
    const res = await this.db
      .collection('destinyProfiles')
      .doc(membershipId)
      .get();
    return res.data();
  }

  async getDestinyProfileByBnetMembershipId(membershipId: string) {
    const res = await this.db
      .collection('destinyProfiles')
      .where('bnetProfile.membershipId', '==', membershipId)
      .get();
    return res.docs.map(doc => doc.data());
  }

  async getDestinyProfilesToHarvest() {
    const res = await this.db
      .collection('destinyProfiles')
      .orderBy('timestamps.activitiesLastChecked', 'asc')
      .limit(100)
      .get();
    return res.docs.map(doc => doc.data());
  }

  //   async getInstancesForMembershipId(membershipId: string) {
  //     const res = await this.db.collection('instances').where()
  //   }
}

export interface DestinyProfile {
  membershipId?: string;
  membershipType?: BungieMembershipType;
  displayName?: string;
  bnetProfile?: {
    membershipId?: string;
    membershipType?: BungieMembershipType;
  };
  accountLinks?: AccountLink[];
  timestamps?: {
    pageLastVisited?: Date;
    bnetProfileChecked?: Date;
    activitiesLastChecked?: Date;
    xboxNameMatchChecked?: Date;
    twitchNameMatchChecked?: Date;
    mixerNameMatchChecked?: Date;
  };
}

export interface AccountLink {
  linkType: string;
  accountType: string;
  account: TwitchAccount | MixerAccount | XboxAccount;
}

export interface TwitchAccount {
  id: string;
  login: string;
  displayName: string;
  lastChecked: Date;
  videos: TwitchVideo[];
}

export interface TwitchVideo {
  id: string;
  timeStart: Date;
  timeStop: Date;
  title: string;
  url: string;
  thumbnailUrl: string;
}

export interface MixerAccount {
  id: number;
  username: string;
  channel: MixerChannel[];
}

export interface MixerChannel {
  id: number;
  token: string;
  lastChecked: Date;
  recordings: MixerRecording[];
}

export interface MixerRecording {
  id: number;
  timeStart: Date;
  timeStop: Date;
  title: string;
  thumbnail: string;
}

export interface XboxAccount {
  gamertag: string;
  lastChecked: Date;
  clips: XboxClip[];
}

export interface XboxClip {
  gameClipId: string;
  scid: string;
  xuid: string;
  timeStart: Date;
  timeStop: Date;
  thumbnailUrl: string;
}

export interface Instance {
  instanceId: string;
  membershipType: BungieMembershipType;
  period: Date;
  activityHash: string;
  directorActivityHash: string;
  entries: Entry[];
}

export interface Entry {
  profile: string;
  timeStart: Date;
  timeStop: Date;
  team: number;
}
