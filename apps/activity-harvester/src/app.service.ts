import { Injectable, Logger } from '@nestjs/common';
import {
  ServerResponse,
  UserInfoCard,
  BungieMembershipType,
} from 'bungie-api-ts/user';
import {
  getProfile,
  DestinyComponentType,
  getActivityHistory,
  getPostGameCarnageReport,
  DestinyActivityHistoryResults,
  DestinyProfileResponse,
  DestinyPostGameCarnageReportData,
  getLinkedProfiles,
  DestinyLinkedProfilesResponse,
} from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services/bungie/bungie.service';
import {
  FirestoreService,
  Profile,
} from '@services/shared-services/firestore/firestore.service';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(
    private readonly bungieService: BungieService,
    private readonly firestoreService: FirestoreService,
    public readonly logger: Logger,
  ) {
    this.logger.setContext('ActivityHarvester');
    this.bungieService.bungieKeys.push(
      process.env.ACTIVITY_HARVESTER_BUNGIE_KEY_A,
    );
    this.bungieService.bungieKeys.push(
      process.env.ACTIVITY_HARVESTER_BUNGIE_KEY_B,
    );
  }

  async startHarvestQueue() {
    this.logger.log('Harvest started');
    const encounteredProfiles: UserInfoCard[] = [];

    const accountSearchPromises: Promise<void>[] = [];
    const pgcrPromises: Promise<
      ServerResponse<DestinyPostGameCarnageReportData>
    >[] = [];
    const profileObjs: {
      ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
      data: Profile;
      update: any;
    }[] = [];

    const profilesToHarvestRes = await this.firestoreService.db
      .collection('profiles')
      .orderBy('lastInstanceCheck', 'asc')
      .limit(25)
      .get();

    for (const doc of profilesToHarvestRes.docs) {
      accountSearchPromises.push(
        new Promise(async resolve => {
          const profileObj = {
            ref: doc.ref,
            data: doc.data() as Profile,
            update: undefined,
          };

          const fresh: {
            instance: number;
            period?: string;
          } = {
            instance: 0,
            period: undefined,
          };

          const profile = profileObj.data;
          const skipInstances = profile.checkedInstances || [];
          profile.checkedInstances = [];

          if (
            !profile.lastLinkedProfilesCheck ||
            new Date((profile.lastLinkedProfilesCheck as any)._seconds * 1000) <
              // new Date(new Date().setDate(new Date().getDate() - 10))
              new Date('5/2/2020 6:45 AM')
          ) {
            const linkedProfilesRes = await getLinkedProfiles(
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

            if (linkedProfilesRes && linkedProfilesRes.Response) {
              profile.linkedProfiles = [];
              profile.lastLinkedProfilesCheck = new Date();
              if (linkedProfilesRes.Response.bnetMembership) {
                profile.linkedProfiles.push({
                  membershipId:
                    linkedProfilesRes.Response.bnetMembership.membershipId,
                  membershipType:
                    linkedProfilesRes.Response.bnetMembership.membershipType,
                  displayName:
                    linkedProfilesRes.Response.bnetMembership.displayName,
                });
              }

              if (
                linkedProfilesRes.Response.profiles &&
                linkedProfilesRes.Response.profiles.length
              ) {
                for (const prof of linkedProfilesRes.Response.profiles) {
                  profile.linkedProfiles.push({
                    membershipId: prof.membershipId,
                    membershipType: prof.membershipType,
                    displayName: prof.displayName,
                  });
                }
              }
              if (
                linkedProfilesRes.Response.profilesWithErrors &&
                linkedProfilesRes.Response.profilesWithErrors.length
              ) {
                for (const prof of linkedProfilesRes.Response
                  .profilesWithErrors) {
                  profile.linkedProfiles.push({
                    membershipId: prof.infoCard.membershipId,
                    membershipType: prof.infoCard.membershipType,
                    displayName: prof.infoCard.displayName,
                    withError: true,
                  });
                }
              }
            }
          }

          if (profile.linkedProfiles && profile.linkedProfiles.length) {
            const historyPromises: Promise<
              ServerResponse<DestinyActivityHistoryResults>
            >[] = [];
            const linkedProfilesPromises: Promise<void>[] = [];
            for (const linkedProfile of profile.linkedProfiles) {
              if (
                linkedProfile.membershipType !==
                  BungieMembershipType.BungieNext &&
                !linkedProfile.withError
              ) {
                linkedProfilesPromises.push(
                  new Promise(async reso => {
                    if (
                      !linkedProfile.lastCharacterIdCheck ||
                      new Date(
                        (linkedProfile.lastCharacterIdCheck as any)._seconds *
                          1000,
                      ) <
                        // new Date(new Date().setDate(new Date().getDate() - 10))
                        new Date('5/2/2020 6:45 AM')
                    ) {
                      const destinyProfile = await getProfile(
                        config =>
                          this.bungieService.bungieRequest(config, true),
                        {
                          membershipType: linkedProfile.membershipType,
                          destinyMembershipId: linkedProfile.membershipId,
                          components: [DestinyComponentType.Profiles],
                        },
                      ).catch(e => {
                        this.logger.error(
                          `Error fetching profile ${
                            linkedProfile.membershipId
                          }: ${e.response?.data?.Message || e}`,
                        );
                        return {} as ServerResponse<DestinyProfileResponse>;
                      });
                      if (
                        destinyProfile.Response &&
                        destinyProfile.Response.profile &&
                        destinyProfile.Response.profile.data
                      ) {
                        linkedProfile.characterIds = [];
                        linkedProfile.lastCharacterIdCheck = new Date();
                        for (const characterId of destinyProfile.Response
                          .profile.data.characterIds) {
                          linkedProfile.characterIds.push(characterId);
                        }
                      }
                    }
                    if (linkedProfile.characterIds) {
                      for (const characterId of linkedProfile.characterIds) {
                        historyPromises.push(
                          getActivityHistory(
                            config =>
                              this.bungieService.bungieRequest(config, true),
                            {
                              membershipType: linkedProfile.membershipType,
                              destinyMembershipId: linkedProfile.membershipId,
                              characterId: characterId,
                              count: 250,
                            },
                          ).catch(e => {
                            this.logger.error(
                              `Error fetching activity history for ${characterId}: ${e
                                .response?.data?.Message || e}`,
                            );
                            return {} as ServerResponse<
                              DestinyActivityHistoryResults
                            >;
                          }),
                        );
                      }
                    }
                    reso();
                  }),
                );
              }
            }
            for (const linkedProfilesPromise of linkedProfilesPromises) {
              await linkedProfilesPromise;
            }
            // await Promise.all(linkedProfilesPromises);
            // const historyResponses = await Promise.all(historyPromises);
            for (const historyPromise of historyPromises) {
              const history = await historyPromise;
              if (
                history &&
                history.Response &&
                history.Response.activities &&
                history.Response.activities.length
              ) {
                for (const activity of history.Response.activities) {
                  if (+activity.activityDetails.instanceId > fresh.instance) {
                    fresh.instance = +activity.activityDetails.instanceId;
                    fresh.period = activity.period;
                  }
                  if (
                    skipInstances.indexOf(activity.activityDetails.instanceId) <
                    0
                  ) {
                    if (pgcrPromises.length < 10) {
                      pgcrPromises.push(
                        getPostGameCarnageReport(
                          config =>
                            this.bungieService.bungieRequest(config, true),
                          {
                            activityId: activity.activityDetails.instanceId,
                          },
                        ).catch(e => {
                          this.logger.error(
                            `Error fetching PGCR for ${
                              activity.activityDetails.instanceId
                            }: ${e.response?.data?.Message || e}`,
                          );
                          return {} as ServerResponse<
                            DestinyPostGameCarnageReportData
                          >;
                        }),
                      );
                      profile.checkedInstances.push(
                        activity.activityDetails.instanceId,
                      );
                    }
                  } else {
                    profile.checkedInstances.push(
                      activity.activityDetails.instanceId,
                    );
                  }
                }
              }
            }
          }
          profileObj.update = {
            lastInstanceCheck: new Date(),
            checkedInstances: Array.from(
              new Set(profileObj.data.checkedInstances),
            ),
            'status.activityHarvest': 'idle',
          };

          if (
            profileObj.data.lastLinkedProfilesCheck &&
            profileObj.data.linkedProfiles
          ) {
            profileObj.update.lastLinkedProfilesCheck =
              profileObj.data.lastLinkedProfilesCheck;
            profileObj.update.linkedProfiles = profileObj.data.linkedProfiles;
          }

          if (fresh.period) {
            profileObj.update.fresh =
              new Date(fresh.period) >
              new Date(new Date().setDate(new Date().getDate() - 10));
          }

          profileObjs.push(profileObj);

          resolve();
        }),
      );
    }

    // await Promise.all(accountSearchPromises);
    for (const accountSearchPromise of accountSearchPromises) {
      await accountSearchPromise;
    }

    // const pgcrs = await Promise.all(pgcrPromises);

    for (const pgcrPromise of pgcrPromises) {
      const pgcr = await pgcrPromise;
      if (pgcr.Response) {
        for (const entry of pgcr.Response.entries) {
          encounteredProfiles.push(entry.player.destinyUserInfo);
        }
      }
    }

    const uniqueMembershipIds = Array.from(
      new Set(encounteredProfiles.map(prof => prof.membershipId)),
    );
    const rootProfiles: UserInfoCard[] = [];
    const linkedProfilesPromises = [];
    for (const membershipId of uniqueMembershipIds) {
      let profile: UserInfoCard | undefined;
      encounteredProfiles.some(prof => {
        if (prof.membershipId === membershipId) {
          profile = prof;
          return true;
        }
        return false;
      });
      if (profile) {
        linkedProfilesPromises.push(
          getLinkedProfiles(
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
          }),
        );
      }
    }
    // const linkedProfilesResponses = await Promise.all(linkedProfilesPromises);

    for (const linkedProfilesPromise of linkedProfilesPromises) {
      const linkedProfiles = await linkedProfilesPromise;
      try {
        if (linkedProfiles.Response) {
          rootProfiles.push(
            linkedProfiles.Response.bnetMembership ||
              linkedProfiles.Response.profiles[0] ||
              linkedProfiles.Response.profilesWithErrors[0].infoCard,
          );
        }
      } catch (e) {
        this.logger.error('Error fetching root profile.');
      }
    }
    const uniqueRootMembershipIds = Array.from(
      new Set(rootProfiles.map(prof => prof.membershipId)),
    );
    const profileWrites = [];
    for (const membershipId of uniqueRootMembershipIds) {
      let profile: UserInfoCard | undefined;

      rootProfiles.some(prof => {
        if (prof.membershipId === membershipId) {
          profile = prof;
          return true;
        }
        return false;
      });

      if (profile) {
        const ref = this.firestoreService.db
          .collection('profiles')
          .doc(profile.membershipId);
        const doc = await ref.get();
        if (doc.exists) {
          profileWrites.push(
            ref.update({
              fresh: true,
            }),
          );
        } else {
          const toWrite: Profile = {
            membershipId: profile.membershipId,
            membershipType: profile.membershipType,
            displayName: profile.displayName,
            lastAccountCheck: new Date(),
            status: {
              accountHarvest: 'idle',
            },
            fresh: true,
          };
          profileWrites.push(ref.set(toWrite, { merge: true }));
        }
      }
    }
    await Promise.all(profileWrites);

    const updates = [];

    for (const profileObj of profileObjs) {
      if (profileObj.update) {
        updates.push(profileObj.ref.update(profileObj.update));
      }
    }

    await Promise.all(updates);

    // await new Promise(resolve => setTimeout(resolve, 10000));
    return this.startHarvestQueue();
  }
}
