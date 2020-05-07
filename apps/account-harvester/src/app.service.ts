import { Injectable, Logger } from '@nestjs/common';
import { ServerResponse, BungieMembershipType } from 'bungie-api-ts/user';
import {
  getLinkedProfiles,
  DestinyLinkedProfilesResponse,
} from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services/bungie/bungie.service';
import {
  FirestoreService,
  Profile,
  VideoAccount,
} from '@services/shared-services/firestore/firestore.service';
import { MixerService, TwitchService } from '@services/shared-services';
import { AxiosResponse } from 'axios';
import { UserWithChannel } from '@services/shared-services/mixer/mixer.types';
import { GetUsersResponse } from '@services/shared-services/twitch/twitch.types';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly firestoreService: FirestoreService,
    public readonly logger: Logger,
    public readonly mixerService: MixerService,
    public readonly twitchService: TwitchService,
  ) {
    this.logger.setContext('AccountHarvester');
    this.bungieService.bungieKeys.push(
      process.env.ACCOUNT_HARVESTER_BUNGIE_KEY_A,
    );
    this.bungieService.bungieKeys.push(
      process.env.ACCOUNT_HARVESTER_BUNGIE_KEY_B,
    );
  }
  async startHarvestQueue() {
    this.logger.log('Harvest started');
    const profileObjs: {
      ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
      data: Profile;
    }[] = [];
    const accountSearchPromises: Promise<void>[] = [];
    const videoAccounts: {
      ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
      data: VideoAccount;
    }[] = [];

    // const freshProfilesToHarvestRes = await this.firestoreService.db
    //   .collection('profiles')
    //   .where('fresh', '==', true)
    //   .orderBy('lastAccountCheck', 'asc')
    //   .limit(25)
    //   .get();

    const staleProfilesToHarvestRes = await this.firestoreService.db
      .collection('profiles')
      .orderBy('lastAccountCheck', 'asc')
      .limit(25)
      .get();

    const profilesToHarvest: FirebaseFirestore.QueryDocumentSnapshot<
      FirebaseFirestore.DocumentData
    >[] = [];

    // for (const profile of freshProfilesToHarvestRes.docs) {
    //   profilesToHarvest.push(profile);
    //   this.logger.log(`fresh ${profile.ref.id}`);
    // }
    for (const profile of staleProfilesToHarvestRes.docs) {
      if (!profilesToHarvest.some(doc => doc.ref.id === profile.ref.id)) {
        profilesToHarvest.push(profile);
        // this.logger.log(`stale ${profile.ref.id}`);
      } else {
        // this.logger.log(`dupe ${profile.ref.id}`);
      }
    }

    for (const profileToHarvest of profilesToHarvest) {
      const profileObj = {
        ref: profileToHarvest.ref,
        data: profileToHarvest.data() as Profile,
      };
      profileObjs.push(profileObj);

      accountSearchPromises.push(
        new Promise(async resolve => {
          const profile = profileObj.data;
          const namesToCheck = [];

          if (
            !profile.lastLinkedProfilesCheck ||
            new Date((profile.lastLinkedProfilesCheck as any)._seconds * 1000) <
              // new Date(new Date().setDate(new Date().getDate() - 10))
              new Date('5/2/2020 6:45 AM')
          ) {
            const linkedProfiles = await getLinkedProfiles(
              config => this.bungieService.bungieRequest(config, true),
              {
                membershipType: profile.membershipType,
                membershipId: profile.membershipId,
              },
            ).catch(e => {
              this.logger.error(
                `Error fetching linked profiles for ${profile.membershipId}: ${e
                  .response?.data?.Message || e}`,
              );
              return {} as ServerResponse<DestinyLinkedProfilesResponse>;
            });

            if (linkedProfiles && linkedProfiles.Response) {
              profile.linkedProfiles = [];
              profile.lastLinkedProfilesCheck = new Date();
              if (linkedProfiles.Response.bnetMembership) {
                profile.linkedProfiles.push({
                  membershipId:
                    linkedProfiles.Response.bnetMembership.membershipId,
                  membershipType:
                    linkedProfiles.Response.bnetMembership.membershipType,
                  displayName:
                    linkedProfiles.Response.bnetMembership.displayName,
                });
                namesToCheck.push(
                  linkedProfiles.Response.bnetMembership.displayName,
                );
              }
              if (
                linkedProfiles.Response.profiles &&
                linkedProfiles.Response.profiles.length
              ) {
                for (const prof of linkedProfiles.Response.profiles) {
                  profile.linkedProfiles.push({
                    membershipId: prof.membershipId,
                    membershipType: prof.membershipType,
                    displayName: prof.displayName,
                  });
                  namesToCheck.push(prof.displayName);

                  if (prof.membershipType === BungieMembershipType.TigerXbox) {
                    videoAccounts.push({
                      ref: this.firestoreService.db
                        .collection('videoAccounts')
                        .doc(
                          profile.membershipId + '.xbox.' + prof.displayName,
                        ),
                      data: {
                        membershipId: profile.membershipId,
                        membershipType: profile.membershipType,
                        displayName: profile.displayName,

                        type: 'xbox',
                        fresh: true,

                        lastClipCheck: new Date(),
                        clipCheckStatus: 'idle',

                        lastLinkedProfilesCheck:
                          profile.lastLinkedProfilesCheck,
                        linkedProfiles: profile.linkedProfiles,

                        xbox: {
                          gamertag: prof.displayName,
                        },
                      },
                    });
                  }
                }
              }
              if (
                linkedProfiles.Response.profilesWithErrors &&
                linkedProfiles.Response.profilesWithErrors.length
              ) {
                for (const prof of linkedProfiles.Response.profilesWithErrors) {
                  try {
                    profile.linkedProfiles.push({
                      membershipId: prof.infoCard.membershipId,
                      membershipType: prof.infoCard.membershipType,
                      displayName: prof.infoCard.displayName,
                      withError: true,
                    });
                    namesToCheck.push(prof.infoCard.displayName);
                  } catch (e) {
                    this.logger.error(e);
                  }
                }
              }
            }
          } else {
            for (const linkedProfile of profile.linkedProfiles) {
              namesToCheck.push(linkedProfile.displayName);
            }
          }

          for (const name of namesToCheck) {
            if (name !== name.trim()) {
              namesToCheck.push(name.trim());
            }
          }
          for (const name of namesToCheck) {
            if (name !== name.replace(/\s/g, '_')) {
              namesToCheck.push(name.replace(/\s/g, '_'));
            }
          }
          for (const name of namesToCheck) {
            if (
              name !==
              name
                .replace(/\s/g, '')
                .replace('twitch.tv/', '')
                .replace('t.tv/', '')
                .replace('twitch/', '')
                .replace('ttv/', '')
                .replace('[ttv]', '')
                .replace('ttv', '')
            ) {
              namesToCheck.push(
                name
                  .replace(/\s/g, '')
                  .replace('twitch.tv/', '')
                  .replace('t.tv/', '')
                  .replace('twitch/', '')
                  .replace('ttv/', '')
                  .replace('[ttv]', '')
                  .replace('ttv', ''),
              );
            }
          }
          const mixerSearchPromises: Promise<
            AxiosResponse<UserWithChannel[]>
          >[] = [];
          const twitchSearchPromises: Promise<
            AxiosResponse<GetUsersResponse>
          >[] = [];
          const uniqueNamesToCheck = Array.from(new Set(namesToCheck));
          for (const name of uniqueNamesToCheck) {
            mixerSearchPromises.push(
              this.mixerService.searchUser(name).catch(() => {
                this.logger.error(
                  `Error fetching Mixer search result for ${name}`,
                );
                return {} as AxiosResponse<UserWithChannel[]>;
              }),
            );
            if (/^(\w+)$/.test(name) && name.length > 3 && name.length < 26) {
              twitchSearchPromises.push(
                this.twitchService.getUsersFromLogin([name]).catch(e => {
                  this.logger.error(
                    `Error fetching Twitch search result for ${name}: ${e}`,
                  );
                  return {} as AxiosResponse<GetUsersResponse>;
                }),
              );
            }
          }
          const mixerSearchResponses = await Promise.all(mixerSearchPromises);

          for (const mixerSearchResponse of mixerSearchResponses) {
            const mixerSearchResults: UserWithChannel[] =
              mixerSearchResponse?.data;
            if (mixerSearchResults && mixerSearchResults.length) {
              for (const result of mixerSearchResults) {
                if (
                  result.username &&
                  result.channel &&
                  uniqueNamesToCheck.some(
                    name =>
                      name.toLowerCase() === result.username.toLowerCase(),
                  )
                ) {
                  videoAccounts.push({
                    ref: this.firestoreService.db
                      .collection('videoAccounts')
                      .doc(profile.membershipId + '.mixer.' + result.id),
                    data: {
                      membershipId: profile.membershipId,
                      membershipType: profile.membershipType,
                      displayName: profile.displayName,

                      type: 'mixer',
                      fresh: true,

                      lastClipCheck: new Date(),
                      clipCheckStatus: 'idle',

                      lastLinkedProfilesCheck: profile.lastLinkedProfilesCheck,
                      linkedProfiles: profile.linkedProfiles,

                      mixer: {
                        userId: result.id,
                        username: result.username,
                        channelId: result.channel.id,
                        token: result.channel.token,
                      },
                    },
                  });
                }
              }
            }
          }

          const twitchSearchResponses = await Promise.all(twitchSearchPromises);
          for (const twitchSearchResponse of twitchSearchResponses) {
            const twitchSearchResults: GetUsersResponse =
              twitchSearchResponse.data;
            if (twitchSearchResults?.data && twitchSearchResults.data.length) {
              for (const result of twitchSearchResults.data) {
                if (
                  (result.login || result.display_name) &&
                  uniqueNamesToCheck.some(
                    name =>
                      name.toLowerCase() === result.login.toLowerCase() ||
                      name.toLowerCase() === result.display_name.toLowerCase(),
                  )
                ) {
                  videoAccounts.push({
                    ref: this.firestoreService.db
                      .collection('videoAccounts')
                      .doc(profile.membershipId + '.twitch.' + result.id),
                    data: {
                      membershipId: profile.membershipId,
                      membershipType: profile.membershipType,
                      displayName: profile.displayName,

                      type: 'twitch',
                      fresh: true,

                      lastClipCheck: new Date(),
                      clipCheckStatus: 'idle',

                      lastLinkedProfilesCheck: profile.lastLinkedProfilesCheck,
                      linkedProfiles: profile.linkedProfiles,

                      twitch: {
                        userId: result.id,
                        login: result.login,
                        displayName: result.display_name,
                      },
                    },
                  });
                }
              }
            }
          }

          resolve();
        }),
      );
    }

    await Promise.all(accountSearchPromises);

    const writes = [];

    for (const videoAccount of videoAccounts) {
      const doc = await videoAccount.ref.get();
      if (doc.exists) {
        const account = doc.data() as VideoAccount;
        let update;
        switch (videoAccount.data.type) {
          case 'mixer':
            if (
              account.displayName !== videoAccount.data.displayName ||
              account.mixer.username !== videoAccount.data.mixer.username ||
              account.mixer.token !== videoAccount.data.mixer.token ||
              account.mixer.channelId !== videoAccount.data.mixer.channelId
            ) {
              update = {
                displayName: videoAccount.data.displayName,
                mixer: videoAccount.data.mixer,
              };
            }
            break;
          case 'twitch':
            if (
              account.displayName !== videoAccount.data.displayName ||
              account.twitch.displayName !==
                videoAccount.data.twitch.displayName ||
              account.twitch.login !== videoAccount.data.twitch.login
            ) {
              update = {
                displayName: videoAccount.data.displayName,
                twitch: videoAccount.data.twitch,
              };
            }
            break;
          case 'xbox':
            if (
              account.displayName !== videoAccount.data.displayName ||
              account.xbox.gamertag !== videoAccount.data.xbox.gamertag
            ) {
              update = {
                displayName: videoAccount.data.displayName,
                xbox: videoAccount.data.xbox,
              };
            }
            break;
        }
        if (update) {
          writes.push(videoAccount.ref.update(update));
        }
        continue;
      } else {
        writes.push(videoAccount.ref.set(videoAccount.data, { merge: true }));
      }
    }

    const updates = [];

    for (const profileObj of profileObjs) {
      const update: any = {
        lastAccountCheck: new Date(),
        'status.accountHarvest': 'idle',
      };
      if (
        profileObj.data.lastLinkedProfilesCheck &&
        profileObj.data.linkedProfiles
      ) {
        update.lastLinkedProfilesCheck =
          profileObj.data.lastLinkedProfilesCheck;
        update.linkedProfiles = profileObj.data.linkedProfiles;
      }
      updates.push(profileObj.ref.update(update));
    }

    await Promise.all(writes);
    await Promise.all(updates);

    // await new Promise(resolve => setTimeout(resolve, 10000));
    return this.startHarvestQueue();
  }
}
