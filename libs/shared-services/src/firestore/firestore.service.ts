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
    const batches = [
      {
        count: 0,
        batch: this.db.batch(),
      },
    ];
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
        let batch = batches[batches.length - 1];
        if (batch.count > 499) {
          batch = {
            count: 0,
            batch: this.db.batch(),
          };
          batches.push(batch);
        }
        batch.count++;
        batch.batch.set(
          this.db.collection('destinyProfiles').doc(membershipId),
          update,
          { merge: true },
        );
      }
    }
    for (let i = 0; i < batches.length; i++) {
      batches[i].batch.commit();
    }
  }

  async updateInstances(instances: Instance[]) {
    const batches = [
      {
        count: 0,
        batch: this.db.batch(),
      },
    ];
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const {
        instanceId,
        membershipType,
        period,
        activityHash,
        directorActivityHash,
        entries,
      } = instance;
      if (instanceId) {
        let update: Instance = { instanceId };
        if (membershipType) {
          update = { ...update, membershipType };
        }
        if (period) {
          update = { ...update, period };
        }
        if (activityHash) {
          update = { ...update, activityHash };
        }
        if (directorActivityHash) {
          update = { ...update, directorActivityHash };
        }
        let batch = batches[batches.length - 1];
        if (batch.count > 499) {
          batch = {
            count: 0,
            batch: this.db.batch(),
          };
          batches.push(batch);
        }
        batch.count++;
        batch.batch.set(
          this.db.collection('instances').doc(instanceId),
          update,
          {
            merge: true,
          },
        );
        for (let j = 0; j < entries?.length; j++) {
          const { membershipId, timeStart, timeStop, team } = entries[j];
          if (membershipId) {
            let entryUpdate: Entry = {
              instanceId,
              membershipId,
              profile: this.db.collection('destinyProfiles').doc(membershipId),
            };
            if (timeStart) {
              entryUpdate = { ...entryUpdate, timeStart };
            }
            if (timeStop) {
              entryUpdate = { ...entryUpdate, timeStop };
            }
            if (team) {
              entryUpdate = { ...entryUpdate, team };
            }

            let subBatch = batches[batches.length - 1];
            if (subBatch.count > 499) {
              subBatch = {
                count: 0,
                batch: this.db.batch(),
              };
              batches.push(subBatch);
            }
            subBatch.count++;
            subBatch.batch.set(
              this.db
                .collection('instances')
                .doc(instanceId)
                .collection('entries')
                .doc(membershipId),
              entryUpdate,
              { merge: true },
            );
          }
        }
      }
    }
    for (let i = 0; i < batches.length; i++) {
      batches[i].batch.commit();
    }
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
      .where(
        'timestamps.activitiesLastChecked',
        '<',
        new Date(new Date().setHours(new Date().getHours() - 1)),
      )
      .orderBy('timestamps.activitiesLastChecked', 'asc')
      .limit(10)
      .get();
    return res.docs.map(doc => doc.data());
  }

  async getEntriesByMembershipId(membershipId: string) {
    const res = await this.db
      .collectionGroup('entries')
      .where('membershipId', '==', membershipId)
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
  instanceId?: string;
  membershipType?: BungieMembershipType;
  period?: Date;
  activityHash?: string;
  directorActivityHash?: string;
  entries?: Entry[];
}

export interface Entry {
  instanceId?: string;
  membershipId?: string;
  profile?: FirebaseFirestore.DocumentReference<DestinyProfile>;
  timeStart?: Date;
  timeStop?: Date;
  team?: number;
}
