import { Injectable, Logger } from '@nestjs/common';
import { ServerResponse, BungieMembershipType } from 'bungie-api-ts/user';
import {
  getLinkedProfiles,
  DestinyLinkedProfilesResponse,
  getProfile,
  DestinyComponentType,
  DestinyProfileResponse,
  getActivityHistory,
  DestinyActivityHistoryResults,
  getPostGameCarnageReport,
  DestinyPostGameCarnageReportData,
} from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services/bungie/bungie.service';
import {
  FirestoreService,
  VideoAccount,
  Video,
} from '@services/shared-services/firestore/firestore.service';
import {
  MixerService,
  TwitchService,
  XboxService,
} from '@services/shared-services';
import { Recording } from '@services/shared-services/mixer/mixer.types';
import { AxiosResponse, AxiosError } from 'axios';
import { GetVideosResponse } from '@services/shared-services/twitch/twitch.types';
import { XboxGameClipsResponse } from '@services/shared-services/xbox/xbox.types';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly firestoreService: FirestoreService,
    public readonly logger: Logger,
    public readonly mixerService: MixerService,
    public readonly twitchService: TwitchService,
    public readonly xboxService: XboxService,
  ) {
    this.logger.setContext('VideoHarvester');
    this.bungieService.bungieKeys.push(
      process.env.VIDEO_HARVESTER_BUNGIE_KEY_A,
    );
    this.bungieService.bungieKeys.push(
      process.env.VIDEO_HARVESTER_BUNGIE_KEY_B,
    );
  }
  async startHarvestQueue() {
    this.logger.log('Harvest started');
    const updates = [];
    const accountHarvestPromises: Promise<void>[] = [];

    const freshAccountsToHarvest = await this.firestoreService.db
      .collection('videoAccounts')
      .where('fresh', '==', true)
      .orderBy('lastClipCheck', 'asc')
      .limit(25)
      .get();

    const staleAccountsToHarvestRes = await this.firestoreService.db
      .collection('videoAccounts')
      .orderBy('lastClipCheck', 'asc')
      .limit(5)
      .get();

    const accountsToHarvest: FirebaseFirestore.QueryDocumentSnapshot<
      FirebaseFirestore.DocumentData
    >[] = [];

    for (const account of freshAccountsToHarvest.docs) {
      accountsToHarvest.push(account);
    }
    for (const profile of staleAccountsToHarvestRes.docs) {
      if (!accountsToHarvest.some(doc => doc.ref.id === profile.ref.id)) {
        accountsToHarvest.push(profile);
      }
    }

    for (const doc of accountsToHarvest) {
      accountHarvestPromises.push(
        new Promise(async resolve => {
          const account = {
            ref: doc.ref,
            data: doc.data() as VideoAccount,
          };

          const fresh: {
            instance: number;
            period?: string;
          } = {
            instance: 0,
            period: undefined,
          };

          const linkedMembershipIds = [];

          if (
            !account.data.lastLinkedProfilesCheck ||
            new Date(
              (account.data.lastLinkedProfilesCheck as any)._seconds * 1000,
              // ) < new Date(new Date().setDate(new Date().getDate() - 10))
            ) < new Date('5/2/2020 6:45 AM')
          ) {
            const linkedProfilesRes = await getLinkedProfiles(
              config => this.bungieService.bungieRequest(config, true),
              {
                membershipType: account.data.membershipType,
                membershipId: account.data.membershipId,
              },
            ).catch(e => {
              this.logger.error(
                `Error fetching linked profiles for ${
                  account.data.membershipId
                }: ${e.response?.data?.Message || e}`,
              );
              return {} as ServerResponse<DestinyLinkedProfilesResponse>;
            });
            if (linkedProfilesRes && linkedProfilesRes.Response) {
              account.data.linkedProfiles = [];
              account.data.lastLinkedProfilesCheck = new Date();
              if (linkedProfilesRes.Response.bnetMembership) {
                account.data.linkedProfiles.push({
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
                  account.data.linkedProfiles.push({
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
                  account.data.linkedProfiles.push({
                    membershipId: prof.infoCard.membershipId,
                    membershipType: prof.infoCard.membershipType,
                    displayName: prof.infoCard.displayName,
                    withError: true,
                  });
                }
              }
            }
          }
          const historyPromises: Promise<
            ServerResponse<DestinyActivityHistoryResults>
          >[] = [];
          if (
            account.data &&
            account.data.linkedProfiles &&
            account.data.linkedProfiles.length
          ) {
            for (const linkedProfile of account.data.linkedProfiles) {
              if (
                linkedProfile.membershipType !==
                  BungieMembershipType.BungieNext &&
                !linkedProfile.withError
              ) {
                linkedMembershipIds.push(linkedProfile.membershipId);

                if (
                  !linkedProfile.lastCharacterIdCheck ||
                  new Date(
                    (linkedProfile.lastCharacterIdCheck as any)._seconds * 1000,
                  ) < new Date(new Date().setDate(new Date().getDate() - 10))
                ) {
                  const destinyProfile = await getProfile(
                    config => this.bungieService.bungieRequest(config, true),
                    {
                      membershipType: linkedProfile.membershipType,
                      destinyMembershipId: linkedProfile.membershipId,
                      components: [DestinyComponentType.Profiles],
                    },
                  ).catch(e => {
                    this.logger.error(
                      `Error fetching profile ${linkedProfile.membershipId}: ${e
                        .response?.data?.Message || e}`,
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
                    for (const characterId of destinyProfile.Response.profile
                      .data.characterIds) {
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
                      ).catch((e: AxiosError) => {
                        this.logger.error(
                          `Error fetching activity history for ${
                            linkedProfile.membershipType
                          }-${linkedProfile.membershipId}-${characterId}: ${e
                            .response?.data?.Message || e}`,
                        );
                        return {} as ServerResponse<
                          DestinyActivityHistoryResults
                        >;
                      }),
                    );
                  }
                }
              }
            }
          }
          // const historyResponses = await Promise.all(historyPromises);
          const historyResults = [];
          for (const historyPromise of historyPromises) {
            const history = await historyPromise;
            historyResults.push(history);
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
              }
            }
          }

          if (
            account.data &&
            account.data.type &&
            account.data.membershipId &&
            account.data.membershipType
          ) {
            switch (account.data.type) {
              case 'mixer':
                if (account.data.mixer && account.data.mixer.channelId) {
                  const mixerResponse = await this.mixerService
                    .getChannelRecordings(account.data.mixer.channelId)
                    .catch(e => {
                      this.logger.error(
                        `Error fetching Mixer recordings for ${account.data.membershipId}: ${e}`,
                      );
                      return {} as AxiosResponse<Recording[]>;
                    });

                  const mixerRes: Recording[] = mixerResponse.data;
                  if (mixerRes) {
                    mixerRes.reverse();
                  }
                  if (mixerRes) {
                    const existingVideosRes = await this.firestoreService.db
                      .collection('videos')
                      .where('type', '==', 'mixer')
                      .where(
                        'owner.membershipId',
                        '==',
                        account.data.membershipId,
                      )
                      .where('mixer.userId', '==', account.data.mixer.userId)
                      .get();

                    const existingVideos: {
                      ref: FirebaseFirestore.DocumentReference<
                        FirebaseFirestore.DocumentData
                      >;
                      data: Video;
                      original?: Video;
                    }[] = [];
                    const refsToDelete: FirebaseFirestore.DocumentReference<
                      FirebaseFirestore.DocumentData
                    >[] = [];

                    existingVideosRes.forEach(viDoc => {
                      if (!mixerRes.length || account.data.rejected) {
                        refsToDelete.push(viDoc.ref);
                      } else {
                        const video: Video = viDoc.data() as Video;
                        if (video.mixer && video.mixer.id) {
                          const id = video.mixer.id;
                          if (mixerRes.some(clip => clip.id === id)) {
                            existingVideos.push({
                              ref: viDoc.ref,
                              data: video,
                              original: { ...video },
                            });
                          } else {
                            refsToDelete.push(viDoc.ref);
                          }
                        } else {
                          refsToDelete.push(viDoc.ref);
                        }
                      }
                    });

                    const videoWrites = [];
                    if (mixerRes.length && !account.data.rejected) {
                      const pgcrPromises: Promise<
                        ServerResponse<DestinyPostGameCarnageReportData>
                      >[] = [];
                      const instancesToCheck = [];
                      for (const history of historyResults) {
                        if (
                          history &&
                          history.Response &&
                          history.Response.activities &&
                          history.Response.activities.length
                        ) {
                          for (const clip of mixerRes) {
                            if (instancesToCheck.length < 10) {
                              const clipStop = new Date(clip.createdAt);
                              const clipStart = new Date(
                                new Date(clip.createdAt).setSeconds(
                                  new Date(clip.createdAt).getSeconds() -
                                    clip.duration,
                                ),
                              );
                              for (const activity of history.Response
                                .activities) {
                                // if period overlaps clip, or just before clip, and not already logged
                                const activityStart = new Date(activity.period);
                                if (activityStart > clipStop) {
                                  continue;
                                }
                                const existingVideo = existingVideos.filter(
                                  video => video.data.mixer?.id === clip.id,
                                );
                                if (
                                  existingVideo[0] &&
                                  existingVideo[0].data.instanceIds?.some(
                                    instance =>
                                      instance ===
                                      activity.activityDetails.instanceId,
                                  )
                                ) {
                                  if (activityStart < clipStart) {
                                    break;
                                  }
                                  continue;
                                }
                                instancesToCheck.push(
                                  activity.activityDetails.instanceId,
                                );
                                if (activityStart < clipStart) {
                                  break;
                                }
                              }
                            }
                          }
                        }
                      }

                      const uniqueInstancesToCheck = Array.from(
                        new Set(instancesToCheck),
                      );

                      for (const instanceId of uniqueInstancesToCheck) {
                        pgcrPromises.push(
                          getPostGameCarnageReport(
                            config =>
                              this.bungieService.bungieRequest(config, true),
                            {
                              activityId: instanceId,
                            },
                          ).catch(e => {
                            this.logger.error(
                              `Error fetching PGCR for ${instanceId}: ${e
                                .response?.data?.Message || e}`,
                            );
                            return {} as ServerResponse<
                              DestinyPostGameCarnageReportData
                            >;
                          }),
                        );
                      }

                      // const pgcrResponses = await Promise.all(pgcrPromises)

                      for (const pgcrPromise of pgcrPromises) {
                        const pgcr = await pgcrPromise;
                        if (
                          pgcr.Response &&
                          pgcr.Response.period &&
                          pgcr.Response.entries
                        ) {
                          const activityStart = new Date(pgcr.Response.period);
                          let longestPlay = 0;
                          for (const entry of pgcr.Response.entries) {
                            const playtime =
                              entry.values.startSeconds.basic.value +
                              entry.values.timePlayedSeconds.basic.value;
                            if (playtime > longestPlay) {
                              longestPlay = playtime;
                            }
                          }
                          const activityStop = new Date(
                            new Date(pgcr.Response.period).setSeconds(
                              new Date(pgcr.Response.period).getSeconds() +
                                longestPlay,
                            ),
                          );

                          for (const clip of mixerRes) {
                            const clipStop = new Date(clip.createdAt);
                            const clipStart = new Date(
                              new Date(clip.createdAt).setSeconds(
                                new Date(clip.createdAt).getSeconds() -
                                  clip.duration,
                              ),
                            );
                            if (clipStart > activityStop) {
                              continue;
                            }
                            if (clipStop > activityStart) {
                              const filteredVideos = existingVideos.filter(
                                vid => vid.data.mixer?.id === clip.id,
                              );
                              let video: {
                                ref: FirebaseFirestore.DocumentReference<
                                  FirebaseFirestore.DocumentData
                                >;
                                data: Video;
                              };
                              if (filteredVideos.length) {
                                video = filteredVideos[0];
                              } else {
                                video = {
                                  ref: this.firestoreService.db
                                    .collection('videos')
                                    .doc(
                                      `${account.data.membershipId}.mixer.${clip.id}`,
                                    ),
                                  data: {
                                    owner: {
                                      membershipId: account.data.membershipId,
                                      membershipType:
                                        account.data.membershipType,
                                      displayName: account.data.displayName,
                                    },

                                    type: 'mixer',
                                    linkId: `${account.data.membershipId}.mixer.${account.data.mixer.userId}`,
                                    linkName: account.data.mixer.username,

                                    mixer: {
                                      userId: account.data.mixer.userId,
                                      id: clip.id,
                                      token: account.data.mixer.token,
                                    },

                                    timeStart: clipStart,
                                    timeStop: clipStop,
                                    title: clip.name,
                                  },
                                };
                                for (const vod of clip.vods) {
                                  if (vod.format === 'thumbnail') {
                                    video.data.thumbnailUrl = `${vod.baseUrl}source.png`;
                                  }
                                }
                                existingVideos.push(video);
                              }
                              if (!video.data.instanceIds) {
                                video.data.instanceIds = [];
                              }
                              video.data.instanceIds.push(
                                pgcr.Response.activityDetails.instanceId,
                              );
                              for (const entry of pgcr.Response.entries) {
                                if (!video.data.membershipIds) {
                                  video.data.membershipIds = [];
                                }
                                video.data.membershipIds.push(
                                  entry.player.destinyUserInfo.membershipId,
                                );
                                if (
                                  linkedMembershipIds.some(
                                    id =>
                                      id ===
                                      entry.player.destinyUserInfo.membershipId,
                                  ) &&
                                  entry.values.team &&
                                  entry.values.team.basic.value
                                ) {
                                  if (!video.data.teams) {
                                    video.data.teams = {};
                                  }
                                  video.data.teams[
                                    pgcr.Response.activityDetails.instanceId
                                  ] = entry.values.team.basic.value;
                                }
                              }
                            } else {
                              break;
                            }
                          }
                        }
                      }
                      for (const video of existingVideos) {
                        if (video.data.instanceIds?.length) {
                          video.data.instanceIds = Array.from(
                            new Set(video.data.instanceIds),
                          );
                        }
                        if (video.data.membershipIds?.length) {
                          video.data.membershipIds = Array.from(
                            new Set(video.data.membershipIds),
                          );
                        }
                        if (video.original) {
                          if (
                            video.original.instanceIds?.length ===
                              video.data.instanceIds?.length &&
                            video.original.membershipIds?.length ===
                              video.data.membershipIds?.length
                          ) {
                            continue;
                          }
                        }
                        videoWrites.push(
                          video.ref.set(video.data, { merge: true }),
                        );
                      }
                    }

                    for (const ref of refsToDelete) {
                      videoWrites.push(ref.delete());
                    }
                    await Promise.all(videoWrites);
                  }
                }
                break;
              case 'twitch':
                if (account.data.twitch && account.data.twitch.userId) {
                  const twitchRes = await this.twitchService
                    .getVideos(account.data.twitch.userId)
                    .catch(e => {
                      this.logger.error(
                        `Error fetching linked Twitch videos for ${account.data.membershipId}: ${e}`,
                      );
                      return {} as AxiosResponse<GetVideosResponse>;
                    });
                  if (twitchRes.data && twitchRes.data.data) {
                    const existingVideosRes = await this.firestoreService.db
                      .collection('videos')
                      .where('type', '==', 'twitch')
                      .where(
                        'owner.membershipId',
                        '==',
                        account.data.membershipId,
                      )
                      .where('twitch.userId', '==', account.data.twitch.userId)
                      .get();

                    const existingVideos: {
                      ref: FirebaseFirestore.DocumentReference<
                        FirebaseFirestore.DocumentData
                      >;
                      data: Video;
                      original?: Video;
                    }[] = [];
                    const refsToDelete: FirebaseFirestore.DocumentReference<
                      FirebaseFirestore.DocumentData
                    >[] = [];

                    existingVideosRes.forEach(viDoc => {
                      if (
                        !twitchRes.data.data.length ||
                        account.data.rejected
                      ) {
                        refsToDelete.push(viDoc.ref);
                      } else {
                        const video: Video = viDoc.data() as Video;
                        if (video.twitch && video.twitch.id) {
                          const id = video.twitch.id;
                          if (
                            twitchRes.data.data.some(clip => clip.id === id)
                          ) {
                            existingVideos.push({
                              ref: viDoc.ref,
                              data: video,
                              original: { ...video },
                            });
                          } else {
                            refsToDelete.push(viDoc.ref);
                          }
                        } else {
                          refsToDelete.push(viDoc.ref);
                        }
                      }
                    });

                    const videoWrites = [];
                    if (twitchRes.data.data.length && !account.data.rejected) {
                      const pgcrPromises: Promise<
                        ServerResponse<DestinyPostGameCarnageReportData>
                      >[] = [];
                      const instancesToCheck = [];
                      for (const history of historyResults) {
                        if (
                          history &&
                          history.Response &&
                          history.Response.activities &&
                          history.Response.activities.length
                        ) {
                          for (const clip of twitchRes.data.data) {
                            if (instancesToCheck.length < 10) {
                              const clipStart = new Date(clip.created_at);
                              let rawDuration = clip.duration;
                              const hourSplit = rawDuration.split('h');
                              let hours = 0;
                              let minutes = 0;
                              let seconds = 0;
                              if (hourSplit.length > 1) {
                                hours = parseInt(hourSplit[0], 10);
                                rawDuration = hourSplit[1];
                              }
                              const minuteSplit = rawDuration.split('m');
                              if (minuteSplit.length > 1) {
                                minutes = parseInt(minuteSplit[0], 10);
                                rawDuration = minuteSplit[1];
                              }
                              const secondSplit = rawDuration.split('s');
                              if (secondSplit.length) {
                                seconds = parseInt(secondSplit[0]);
                              }
                              const duration =
                                seconds + minutes * 60 + hours * 60 * 60;
                              const clipStop = new Date(
                                new Date(clip.created_at).setSeconds(
                                  new Date(clip.created_at).getSeconds() +
                                    duration,
                                ),
                              );
                              for (const activity of history.Response
                                .activities) {
                                if (
                                  +activity.activityDetails.instanceId >
                                  fresh.instance
                                ) {
                                  fresh.instance = +activity.activityDetails
                                    .instanceId;
                                  fresh.period = activity.period;
                                }
                                // if period overlaps clip, or just before clip, and not already logged
                                const activityStart = new Date(activity.period);
                                if (activityStart > clipStop) {
                                  continue;
                                }
                                const existingVideo = existingVideos.filter(
                                  video => video.data.twitch?.id === clip.id,
                                );
                                if (
                                  existingVideo[0] &&
                                  existingVideo[0].data.instanceIds?.some(
                                    instance =>
                                      instance ===
                                      activity.activityDetails.instanceId,
                                  )
                                ) {
                                  if (activityStart < clipStart) {
                                    break;
                                  }
                                  continue;
                                }
                                instancesToCheck.push(
                                  activity.activityDetails.instanceId,
                                );
                                if (activityStart < clipStart) {
                                  break;
                                }
                              }
                            }
                          }
                        }
                      }

                      const uniqueInstancesToCheck = Array.from(
                        new Set(instancesToCheck),
                      );

                      for (const instanceId of uniqueInstancesToCheck) {
                        pgcrPromises.push(
                          getPostGameCarnageReport(
                            config =>
                              this.bungieService.bungieRequest(config, true),
                            {
                              activityId: instanceId,
                            },
                          ).catch(e => {
                            this.logger.error(
                              `Error fetching PGCR for ${instanceId}: ${e
                                .response?.data?.Message || e}`,
                            );
                            return {} as ServerResponse<
                              DestinyPostGameCarnageReportData
                            >;
                          }),
                        );
                      }

                      // const pgcrResponses = await Promise.all(pgcrPromises);
                      for (const pgcrPromise of pgcrPromises) {
                        const pgcr = await pgcrPromise;
                        if (
                          pgcr.Response &&
                          pgcr.Response.period &&
                          pgcr.Response.entries
                        ) {
                          const activityStart = new Date(pgcr.Response.period);
                          let longestPlay = 0;
                          for (const entry of pgcr.Response.entries) {
                            const playtime =
                              entry.values.startSeconds.basic.value +
                              entry.values.timePlayedSeconds.basic.value;
                            if (playtime > longestPlay) {
                              longestPlay = playtime;
                            }
                          }
                          const activityStop = new Date(
                            new Date(pgcr.Response.period).setSeconds(
                              new Date(pgcr.Response.period).getSeconds() +
                                longestPlay,
                            ),
                          );

                          for (const clip of twitchRes.data.data) {
                            const clipStart = new Date(clip.created_at);
                            let rawDuration = clip.duration;
                            const hourSplit = rawDuration.split('h');
                            let hours = 0;
                            let minutes = 0;
                            let seconds = 0;
                            if (hourSplit.length > 1) {
                              hours = parseInt(hourSplit[0], 10);
                              rawDuration = hourSplit[1];
                            }
                            const minuteSplit = rawDuration.split('m');
                            if (minuteSplit.length > 1) {
                              minutes = parseInt(minuteSplit[0], 10);
                              rawDuration = minuteSplit[1];
                            }
                            const secondSplit = rawDuration.split('s');
                            if (secondSplit.length) {
                              seconds = parseInt(secondSplit[0]);
                            }
                            const duration =
                              seconds + minutes * 60 + hours * 60 * 60;
                            const clipStop = new Date(
                              new Date(clip.created_at).setSeconds(
                                new Date(clip.created_at).getSeconds() +
                                  duration,
                              ),
                            );
                            if (clipStart > activityStop) {
                              continue;
                            }
                            if (clipStop > activityStart) {
                              const filteredVideos = existingVideos.filter(
                                vid => vid.data.twitch?.id === clip.id,
                              );
                              let video: {
                                ref: FirebaseFirestore.DocumentReference<
                                  FirebaseFirestore.DocumentData
                                >;
                                data: Video;
                              };
                              if (filteredVideos.length) {
                                video = filteredVideos[0];
                              } else {
                                video = {
                                  ref: this.firestoreService.db
                                    .collection('videos')
                                    .doc(
                                      `${account.data.membershipId}.twitch.${clip.id}`,
                                    ),
                                  data: {
                                    owner: {
                                      membershipId: account.data.membershipId,
                                      membershipType:
                                        account.data.membershipType,
                                      displayName: account.data.displayName,
                                    },

                                    type: 'twitch',
                                    linkId: `${account.data.membershipId}.twitch.${account.data.twitch.userId}`,
                                    linkName: account.data.twitch.displayName,

                                    twitch: {
                                      userId: account.data.twitch.userId,
                                      id: clip.id,
                                    },

                                    timeStart: clipStart,
                                    timeStop: clipStop,
                                    title: clip.title,
                                    url: clip.url,
                                    thumbnailUrl: clip.thumbnail_url,
                                  },
                                };
                                existingVideos.push(video);
                              }
                              if (!video.data.instanceIds) {
                                video.data.instanceIds = [];
                              }
                              video.data.instanceIds.push(
                                pgcr.Response.activityDetails.instanceId,
                              );
                              for (const entry of pgcr.Response.entries) {
                                if (!video.data.membershipIds) {
                                  video.data.membershipIds = [];
                                }
                                video.data.membershipIds.push(
                                  entry.player.destinyUserInfo.membershipId,
                                );
                                if (
                                  linkedMembershipIds.some(
                                    id =>
                                      id ===
                                      entry.player.destinyUserInfo.membershipId,
                                  ) &&
                                  entry.values.team &&
                                  entry.values.team.basic.value
                                ) {
                                  if (!video.data.teams) {
                                    video.data.teams = {};
                                  }
                                  video.data.teams[
                                    pgcr.Response.activityDetails.instanceId
                                  ] = entry.values.team.basic.value;
                                }
                              }
                            } else {
                              break;
                            }
                          }
                        }
                      }
                      for (const video of existingVideos) {
                        if (video.data.instanceIds?.length) {
                          video.data.instanceIds = Array.from(
                            new Set(video.data.instanceIds),
                          );
                        }
                        if (video.data.membershipIds?.length) {
                          video.data.membershipIds = Array.from(
                            new Set(video.data.membershipIds),
                          );
                        }
                        if (video.original) {
                          if (
                            video.original.instanceIds?.length ===
                              video.data.instanceIds?.length &&
                            video.original.membershipIds?.length ===
                              video.data.membershipIds?.length
                          ) {
                            continue;
                          }
                        }
                        videoWrites.push(
                          video.ref.set(video.data, { merge: true }),
                        );
                      }
                    }
                    for (const ref of refsToDelete) {
                      videoWrites.push(ref.delete());
                    }
                    await Promise.all(videoWrites);
                  }
                }
                break;
              case 'xbox':
                if (account.data.xbox && account.data.xbox.gamertag) {
                  const xboxRes = await this.xboxService
                    .fetchConsoleDestiny2ClipsForGamertag(
                      account.data.xbox.gamertag,
                    )
                    .catch(e => {
                      this.logger.error(
                        `Error fetching Xbox clips for ${account.data.membershipId}: ${e}`,
                      );
                      return {} as AxiosResponse<XboxGameClipsResponse>;
                    });

                  if (xboxRes.data && xboxRes.data.status === 'success') {
                    const existingVideosRes = await this.firestoreService.db
                      .collection('videos')
                      .where('type', '==', 'xbox')
                      .where(
                        'owner.membershipId',
                        '==',
                        account.data.membershipId,
                      )
                      .where('xbox.gamertag', '==', account.data.xbox.gamertag)
                      .get();

                    const existingVideos: {
                      ref: FirebaseFirestore.DocumentReference<
                        FirebaseFirestore.DocumentData
                      >;
                      data: Video;
                      original?: Video;
                    }[] = [];
                    const refsToDelete: FirebaseFirestore.DocumentReference<
                      FirebaseFirestore.DocumentData
                    >[] = [];

                    existingVideosRes.forEach(viDoc => {
                      if (
                        !xboxRes.data.gameClips ||
                        !xboxRes.data.gameClips.length ||
                        account.data.rejected
                      ) {
                        refsToDelete.push(viDoc.ref);
                      } else {
                        const video: Video = viDoc.data() as Video;
                        if (video.xbox && video.xbox.gameClipId) {
                          const gameClipId = video.xbox.gameClipId;
                          if (
                            xboxRes.data.gameClips.some(
                              clip => clip.gameClipId === gameClipId,
                            )
                          ) {
                            existingVideos.push({
                              ref: viDoc.ref,
                              data: video,
                              original: { ...video },
                            });
                          } else {
                            refsToDelete.push(viDoc.ref);
                          }
                        } else {
                          refsToDelete.push(viDoc.ref);
                        }
                      }
                    });

                    const videoWrites = [];
                    if (
                      xboxRes.data.gameClips &&
                      xboxRes.data.gameClips.length &&
                      !account.data.rejected
                    ) {
                      const pgcrPromises: Promise<
                        ServerResponse<DestinyPostGameCarnageReportData>
                      >[] = [];
                      const instancesToCheck = [];
                      for (const history of historyResults) {
                        if (
                          history &&
                          history.Response &&
                          history.Response.activities &&
                          history.Response.activities.length
                        ) {
                          for (const clip of xboxRes.data.gameClips) {
                            if (instancesToCheck.length < 10) {
                              const clipStart = new Date(clip.dateRecorded);
                              const clipStop = new Date(
                                new Date(clip.dateRecorded).setSeconds(
                                  new Date(clip.dateRecorded).getSeconds() +
                                    clip.durationInSeconds,
                                ),
                              );
                              for (const activity of history.Response
                                .activities) {
                                if (
                                  +activity.activityDetails.instanceId >
                                  fresh.instance
                                ) {
                                  fresh.instance = +activity.activityDetails
                                    .instanceId;
                                  fresh.period = activity.period;
                                }
                                // if period overlaps clip, or just before clip, and not already logged
                                const activityStart = new Date(activity.period);
                                if (activityStart > clipStop) {
                                  continue;
                                }
                                const existingVideo = existingVideos.filter(
                                  video =>
                                    video.data.xbox?.gameClipId ===
                                    clip.gameClipId,
                                );
                                if (
                                  existingVideo[0] &&
                                  existingVideo[0].data.instanceIds?.some(
                                    instance =>
                                      instance ===
                                      activity.activityDetails.instanceId,
                                  )
                                ) {
                                  if (activityStart < clipStart) {
                                    break;
                                  }
                                  continue;
                                }
                                instancesToCheck.push(
                                  activity.activityDetails.instanceId,
                                );
                                if (activityStart < clipStart) {
                                  break;
                                }
                              }
                            }
                          }
                        }
                      }

                      const uniqueInstancesToCheck = Array.from(
                        new Set(instancesToCheck),
                      );

                      for (const instanceId of uniqueInstancesToCheck) {
                        pgcrPromises.push(
                          getPostGameCarnageReport(
                            config =>
                              this.bungieService.bungieRequest(config, true),
                            {
                              activityId: instanceId,
                            },
                          ).catch(e => {
                            this.logger.error(
                              `Error fetching PGCR for ${instanceId}: ${e
                                .response?.data?.Message || e}`,
                            );
                            return {} as ServerResponse<
                              DestinyPostGameCarnageReportData
                            >;
                          }),
                        );
                      }

                      // const pgcrResponses = await Promise.all(pgcrPromises);
                      for (const pgcrPromise of pgcrPromises) {
                        const pgcr = await pgcrPromise;
                        if (
                          pgcr.Response &&
                          pgcr.Response.period &&
                          pgcr.Response.entries
                        ) {
                          const activityStart = new Date(pgcr.Response.period);
                          let activityStop = new Date(pgcr.Response.period);
                          let longestPlay = 0;
                          for (const entry of pgcr.Response.entries) {
                            const playtime =
                              entry.values.startSeconds.basic.value +
                              entry.values.timePlayedSeconds.basic.value;
                            if (playtime > longestPlay) {
                              longestPlay = playtime;
                              activityStop = new Date(
                                new Date(pgcr.Response.period).setSeconds(
                                  new Date(pgcr.Response.period).getSeconds() +
                                    playtime,
                                ),
                              );
                            }
                          }

                          for (const clip of xboxRes.data.gameClips) {
                            const clipStart = new Date(clip.dateRecorded);
                            const clipStop = new Date(
                              new Date(clip.dateRecorded).setSeconds(
                                new Date(clip.dateRecorded).getSeconds() +
                                  clip.durationInSeconds,
                              ),
                            );
                            if (clipStart > activityStop) {
                              continue;
                            }
                            if (clipStop > activityStart) {
                              const filteredVideos = existingVideos.filter(
                                vid =>
                                  vid.data.xbox?.gameClipId === clip.gameClipId,
                              );
                              let video: {
                                ref: FirebaseFirestore.DocumentReference<
                                  FirebaseFirestore.DocumentData
                                >;
                                data: Video;
                              };
                              if (filteredVideos.length) {
                                video = filteredVideos[0];
                              } else {
                                video = {
                                  ref: this.firestoreService.db
                                    .collection('videos')
                                    .doc(
                                      `${account.data.membershipId}.xbox.${clip.gameClipId}`,
                                    ),
                                  data: {
                                    owner: {
                                      membershipId: account.data.membershipId,
                                      membershipType:
                                        account.data.membershipType,
                                      displayName: account.data.displayName,
                                    },

                                    type: 'xbox',
                                    linkId: `${account.data.membershipId}.xbox.${account.data.xbox.gamertag}`,
                                    linkName: account.data.xbox.gamertag,

                                    xbox: {
                                      gamertag: account.data.xbox.gamertag,
                                      gameClipId: clip.gameClipId,
                                      scid: clip.scid,
                                      xuid: clip.xuid,
                                    },

                                    timeStart: clipStart,
                                    timeStop: clipStop,
                                  },
                                };
                                if (
                                  clip.thumbnails &&
                                  clip.thumbnails.length &&
                                  clip.thumbnails[clip.thumbnails.length - 1]
                                ) {
                                  video.data.thumbnailUrl =
                                    clip.thumbnails[
                                      clip.thumbnails.length - 1
                                    ].uri;
                                }
                                existingVideos.push(video);
                              }
                              if (!video.data.instanceIds) {
                                video.data.instanceIds = [];
                              }
                              video.data.instanceIds.push(
                                pgcr.Response.activityDetails.instanceId,
                              );
                              for (const entry of pgcr.Response.entries) {
                                if (!video.data.membershipIds) {
                                  video.data.membershipIds = [];
                                }
                                video.data.membershipIds.push(
                                  entry.player.destinyUserInfo.membershipId,
                                );
                                if (
                                  linkedMembershipIds.some(
                                    id =>
                                      id ===
                                      entry.player.destinyUserInfo.membershipId,
                                  ) &&
                                  entry.values.team &&
                                  entry.values.team.basic.value
                                ) {
                                  if (!video.data.teams) {
                                    video.data.teams = {};
                                  }
                                  video.data.teams[
                                    pgcr.Response.activityDetails.instanceId
                                  ] = entry.values.team.basic.value;
                                }
                              }
                            } else {
                              break;
                            }
                          }
                        }
                      }
                      for (const video of existingVideos) {
                        if (video.original) {
                          if (
                            video.original.instanceIds?.length ===
                              video.data.instanceIds?.length &&
                            video.original.membershipIds?.length ===
                              video.data.membershipIds?.length
                          ) {
                            continue;
                          }
                        }
                        videoWrites.push(
                          video.ref.set(video.data, { merge: true }),
                        );
                      }
                    }
                    for (const ref of refsToDelete) {
                      videoWrites.push(ref.delete());
                    }
                    await Promise.all(videoWrites);
                  }
                }
                break;
            }
          }

          const update: any = {
            lastClipCheck: new Date(),
            clipCheckStatus: 'idle',
          };
          if (
            account.data.lastLinkedProfilesCheck &&
            account.data.linkedProfiles
          ) {
            update.lastLinkedProfilesCheck =
              account.data.lastLinkedProfilesCheck;
            update.linkedProfiles = account.data.linkedProfiles;
          }
          if (fresh.period) {
            update.fresh =
              new Date(fresh.period) >
              new Date(new Date().setDate(new Date().getDate() - 10));
          }
          if (account.data.rejected) {
            update.fresh = false;
          }

          updates.push(account.ref.update(update));
          resolve();
        }),
      );
    }

    // await Promise.all(accountHarvestPromises);
    for (const accountHarvestPromise of accountHarvestPromises) {
      await accountHarvestPromise;
    }

    await Promise.all(updates);

    // await new Promise(resolve => setTimeout(resolve, 10000));
    return this.startHarvestQueue();
  }
}
