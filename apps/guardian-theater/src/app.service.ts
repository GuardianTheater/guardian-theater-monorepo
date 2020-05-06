import { Injectable, Logger } from '@nestjs/common';
import { BungieMembershipType, ServerResponse } from 'bungie-api-ts/user';
import {
  getProfile,
  DestinyComponentType,
  DestinyProfileResponse,
  getLinkedProfiles,
  DestinyLinkedProfilesResponse,
  DestinyProfileUserInfoCard,
  getActivityHistory,
  DestinyActivityHistoryResults,
  DestinyActivityModeType,
  getPostGameCarnageReport,
  DestinyPostGameCarnageReportData,
} from 'bungie-api-ts/destiny2';
import { BungieService, TwitchService } from '@services/shared-services';
import {
  FirestoreService,
  Profile,
  Video,
  VideoAccount,
} from '@services/shared-services/firestore/firestore.service';
import * as admin from 'firebase-admin';
import { GetUsersResponse } from '@services/shared-services/twitch/twitch.types';
import { AxiosResponse } from 'axios';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly logger: Logger,
    private readonly firestoreService: FirestoreService,
    private readonly twitchService: TwitchService,
  ) {
    this.bungieService.bungieKeys.push(process.env.BUNGIE_API_KEY);
    this.bungieService.bungieKeys.push(process.env.BUNGIE_API_KEY_2);
  }

  async getAllEncounteredVideos(
    membershipType: BungieMembershipType,
    destinyMembershipId: string,
  ): Promise<{
    profile?: DestinyProfileUserInfoCard;
    instances?: {
      instanceId: string;
      activityHash: number;
      directorActivityHash: number;
      mode: DestinyActivityModeType;
      membershipType: number;
      period: string;
      team: number;
      videos: {
        displayName: string;
        membershipId: string;
        membershipType: BungieMembershipType;
        bnetMembershipId?: string;
        linkName: string;
        linkId?: string;
        type?: string;
        team?: number | undefined;
        url?: string | undefined;
        thumbnail?: string | undefined;
        embedUrl?: string | undefined;
        title?: string | undefined;
        offset?: string | undefined;

        play?: boolean;
        infoExpanded?: boolean;
        badLink?: boolean;
        reporting?: boolean;
      }[];
    }[];
  }> {
    const linkedProfiles = await getLinkedProfiles(
      config => this.bungieService.bungieRequest(config, true),
      {
        membershipType: membershipType,
        membershipId: destinyMembershipId,
      },
    ).catch(e => {
      this.logger.error(
        `Error fetching linked profiles for ${destinyMembershipId}: ${e.response
          ?.data?.Message || e}`,
      );
      return {} as ServerResponse<DestinyLinkedProfilesResponse>;
    });
    if (linkedProfiles.Response) {
      const rootProfile =
        linkedProfiles.Response.bnetMembership ||
        linkedProfiles.Response.profiles[0] ||
        linkedProfiles.Response.profilesWithErrors[0].infoCard;

      if (rootProfile && rootProfile.membershipId) {
        let prof: Profile = {
          membershipId: rootProfile.membershipId,
          membershipType: rootProfile.membershipType,
          displayName: rootProfile.displayName,
          lastVisit: new Date(),
        };
        const profileRef = this.firestoreService.db
          .collection('profiles')
          .doc(prof.membershipId);
        const profileDoc = await profileRef.get();
        if (profileDoc.exists) {
          const oldProfile = profileDoc.data();
          prof = {
            ...prof,
            lastAccountCheck: oldProfile?.lastAccountCheck || new Date(),
            lastInstanceCheck: oldProfile?.lastInstanceCheck || new Date(),
            fresh: true,
          };
          if (!prof.status) {
            prof.status = {};
          }
          if (!prof.status.activityHarvest) {
            prof.status.activityHarvest = 'idle';
          }
          await profileRef.set(prof, { merge: true });
        } else {
          prof = {
            ...prof,
            lastAccountCheck: new Date(),
            lastInstanceCheck: new Date(),
            status: {
              activityHarvest: 'idle',
              accountHarvest: 'idle',
            },
            fresh: true,
          };
          await profileRef.set(prof, { merge: true });
        }
      }

      const memberships: {
        membershipId: string;
        membershipType: BungieMembershipType;
      }[] = [];
      if (linkedProfiles.Response.bnetMembership) {
        memberships.push({
          membershipId: linkedProfiles.Response.bnetMembership.membershipId,
          membershipType: linkedProfiles.Response.bnetMembership.membershipType,
        });
      }

      let profile;
      let dateLastPlayed = new Date();
      for (const linkedProfile of linkedProfiles.Response.profiles) {
        memberships.push({
          membershipId: linkedProfile.membershipId,
          membershipType: linkedProfile.membershipType,
        });
        if (!profile) {
          profile = linkedProfile;
          dateLastPlayed = new Date(linkedProfile.dateLastPlayed);
        }
        if (new Date(linkedProfile.dateLastPlayed) > dateLastPlayed) {
          profile = linkedProfile;
          dateLastPlayed = new Date(linkedProfile.dateLastPlayed);
        }
      }

      const membershipIdSet = new Set(
        memberships.map(membership => membership.membershipId),
      );

      const videosRef = this.firestoreService.db.collection('videos');
      const encounteredVideos = await videosRef
        .where(
          'membershipIds',
          'array-contains-any',
          Array.from(membershipIdSet),
        )
        .get();

      if (encounteredVideos.empty) {
        return { profile, instances: [] };
      } else {
        const videos = encounteredVideos.docs.map(doc => doc.data() as Video);
        const instances: {
          instanceId: string;
          activityHash: number;
          directorActivityHash: number;
          mode: DestinyActivityModeType;
          membershipType: number;
          period: string;
          team: number;
          videos: {
            displayName: string;
            membershipId: string;
            membershipType: BungieMembershipType;
            bnetMembershipId?: string;
            linkName: string;
            linkId?: string;
            type?: string;
            team?: number | undefined;
            url?: string | undefined;
            thumbnail?: string | undefined;
            embedUrl?: string | undefined;
            title?: string | undefined;
            offset?: string | undefined;

            play?: boolean;
            infoExpanded?: boolean;
            badLink?: boolean;
            reporting?: boolean;
          }[];
        }[] = [];

        let oldestInstance;

        for (const video of videos) {
          if (video.instanceIds) {
            for (const instanceId of video.instanceIds) {
              if (!oldestInstance) {
                oldestInstance = instanceId;
              } else if (+instanceId < +oldestInstance) {
                oldestInstance = instanceId;
              }
            }
          }
        }

        const activityHistoryPromises = [];

        for (const membership of memberships) {
          if (membership.membershipType !== BungieMembershipType.BungieNext) {
            const loadProfile = await getProfile(
              config => this.bungieService.bungieRequest(config, true),
              {
                membershipType: membership.membershipType,
                destinyMembershipId: membership.membershipId,
                components: [DestinyComponentType.Profiles],
              },
            ).catch(e => {
              this.logger.error(
                `Error fetching profile ${membership.membershipId}: ${e.response
                  ?.data?.Message || e}`,
              );
              return {} as ServerResponse<DestinyProfileResponse>;
            });

            if (
              loadProfile &&
              loadProfile.Response &&
              loadProfile.Response.profile &&
              loadProfile.Response.profile.data
            ) {
              for (const characterId of loadProfile.Response.profile.data
                .characterIds) {
                activityHistoryPromises.push(
                  getActivityHistory(
                    config => this.bungieService.bungieRequest(config, true),
                    {
                      membershipType: membership.membershipType,
                      destinyMembershipId: membership.membershipId,
                      characterId,
                      count: 250,
                    },
                  ).catch(e => {
                    this.logger.error(
                      `Error fetching activity history for ${characterId}: ${e
                        .response?.data?.Message || e}`,
                    );
                    return {} as ServerResponse<DestinyActivityHistoryResults>;
                  }),
                );
              }
            }
          }
        }
        const activityHistories = await Promise.all(activityHistoryPromises);
        for (const activityHistory of activityHistories) {
          if (activityHistory.Response && activityHistory.Response.activities) {
            for (const activity of activityHistory.Response.activities) {
              for (const video of videos) {
                if (
                  video &&
                  video.instanceIds &&
                  video.instanceIds.indexOf(
                    activity.activityDetails.instanceId,
                  ) > -1
                ) {
                  let instance;
                  const filter = instances.filter(
                    inst =>
                      inst.instanceId === activity.activityDetails.instanceId,
                  );
                  if (filter.length) {
                    instance = filter[0];
                  } else {
                    instance = {
                      instanceId: activity.activityDetails.instanceId,
                      activityHash: activity.activityDetails.referenceId,
                      directorActivityHash:
                        activity.activityDetails.directorActivityHash,
                      mode: activity.activityDetails.mode,
                      membershipType: activity.activityDetails.membershipType,
                      period: activity.period,
                      team: activity.values.team.basic.value,
                      videos: [],
                    };
                    instances.push(instance);
                  }

                  if (
                    video.owner &&
                    video.owner.displayName &&
                    video.owner.membershipId &&
                    video.owner.membershipType
                  ) {
                    let vid: {
                      displayName: string;
                      membershipId: string;
                      membershipType: BungieMembershipType;
                      type: string;
                      linkName: string;
                      linkId: string;
                      team?: number | undefined;
                      url?: string | undefined;
                      thumbnail?: string | undefined;
                      embedUrl?: string | undefined;
                      title?: string | undefined;
                      offset?: string | undefined;
                    } = {
                      displayName: video.owner.displayName,
                      membershipId: video.owner.membershipId,
                      membershipType: video.owner.membershipType,
                      type: video.type,
                      linkName: video.linkName,
                      linkId: video.linkId,
                    };
                    if (
                      video &&
                      video.owner &&
                      video.owner.membershipId &&
                      membershipIdSet.has(video.owner.membershipId)
                    ) {
                      vid = { ...vid, team: 16 };
                    } else if (video.teams) {
                      vid = {
                        ...vid,
                        team: video.teams[instance.instanceId],
                      };
                    }
                    const videoStartTime = new Date(
                      (video.timeStart as any)._seconds * 1000,
                    );
                    let offset = 0;
                    const activityStartTime = new Date(activity.period);
                    if (activityStartTime > videoStartTime) {
                      offset = Math.floor(
                        (activityStartTime.getTime() -
                          videoStartTime.getTime()) /
                          1000,
                      );
                    }
                    let seconds = offset;
                    const hours = Math.floor(seconds / 60 / 60);
                    seconds -= hours * 60 * 60;
                    const minutes = Math.floor(seconds / 60);
                    seconds -= minutes * 60;
                    let twitchOffset = '';
                    if (hours) {
                      twitchOffset += `${hours}h`;
                    }
                    if (minutes) {
                      twitchOffset += `${minutes}m`;
                    }
                    if (seconds) {
                      twitchOffset += `${seconds}s`;
                    }

                    switch (video.type) {
                      case 'mixer':
                        if (video.mixer) {
                          vid = {
                            ...vid,
                            url: `https://mixer.com/${video.mixer.token}?vod=${video.mixer.id}&t=${twitchOffset}`,
                            thumbnail: video.thumbnailUrl,
                            title: video.title,
                            embedUrl: `//mixer.com/embed/player/${video.mixer.token}?vod=${video.mixer.id}&t=${twitchOffset}`,
                            offset: twitchOffset,
                          };
                        }
                        break;
                      case 'twitch':
                        if (video.twitch) {
                          vid = {
                            ...vid,
                            url: `${video.url}?t=${twitchOffset}`,
                            embedUrl: `//player.twitch.tv/?video=${video.twitch.id}&time=${twitchOffset}`,
                            title: video.title,
                            offset: twitchOffset,
                          };
                          if (video.thumbnailUrl) {
                            vid = {
                              ...vid,
                              thumbnail: video.thumbnailUrl
                                .replace('%{width}', '960')
                                .replace('%{height}', '540'),
                            };
                          }
                        }
                        break;
                      case 'xbox':
                        if (video.xbox && video.xbox.gamertag) {
                          vid = {
                            ...vid,
                            url: `https://xboxrecord.us/gamer/${encodeURIComponent(
                              video.xbox.gamertag,
                            )}/clip/${video.xbox.gameClipId}/scid/${
                              video.xbox.gameClipId
                            }`,
                            thumbnail: video.thumbnailUrl,
                            embedUrl: `https://api.xboxrecord.us/gameclip/gamertag/${encodeURIComponent(
                              video.xbox.gamertag,
                            )}/clip/${video.xbox.gameClipId}/scid/${
                              video.xbox.gameClipId
                            }`,
                          };
                        }
                        break;
                    }

                    instance.videos.push(vid);
                  }
                }
              }
            }
          }
        }

        instances.sort(
          (a, b) => new Date(b.period).getTime() - new Date(a.period).getTime(),
        );
        return { profile, instances };
      }
    } else {
      return {};
    }
  }

  async getVideosForInstance(
    instanceId: string,
  ): Promise<{
    instanceId?: string;
    activityHash?: number;
    directorActivityHash?: number;
    mode?: DestinyActivityModeType;
    membershipType?: number;
    period?: string;
    team?: number;
    videos?: {
      displayName: string;
      membershipId: string;
      membershipType: BungieMembershipType;
      bnetMembershipId?: string;
      linkName: string;
      linkId?: string;
      type?: string;
      team?: number | undefined;
      url?: string | undefined;
      thumbnail?: string | undefined;
      embedUrl?: string | undefined;
      title?: string | undefined;
      offset?: string | undefined;

      play?: boolean;
      infoExpanded?: boolean;
      badLink?: boolean;
      reporting?: boolean;
    }[];
  }> {
    const videosRef = this.firestoreService.db.collection('videos');
    const encounteredVideos = await videosRef
      .where('instanceIds', 'array-contains', instanceId)
      .get();

    if (encounteredVideos.empty) {
      return {};
    } else {
      const pgcr = await getPostGameCarnageReport(
        config => this.bungieService.bungieRequest(config, true),
        {
          activityId: instanceId,
        },
      ).catch(e => {
        this.logger.error(
          `Error fetching PGCR for ${instanceId}: ${e.response?.data?.Message ||
            e}`,
        );
        return {} as ServerResponse<DestinyPostGameCarnageReportData>;
      });

      const instance: {
        instanceId?: string;
        activityHash?: number;
        directorActivityHash?: number;
        mode?: DestinyActivityModeType;
        membershipType?: number;
        period?: string;
        team?: number;
        videos?: {
          displayName: string;
          membershipId: string;
          membershipType: BungieMembershipType;
          bnetMembershipId?: string;
          linkName: string;
          linkId?: string;
          type?: string;
          team?: number | undefined;
          url?: string | undefined;
          thumbnail?: string | undefined;
          embedUrl?: string | undefined;
          title?: string | undefined;
          offset?: string | undefined;

          play?: boolean;
          infoExpanded?: boolean;
          badLink?: boolean;
          reporting?: boolean;
        }[];
      } = {
        instanceId,
        activityHash: pgcr?.Response?.activityDetails?.referenceId,
        directorActivityHash:
          pgcr?.Response?.activityDetails?.directorActivityHash,
        mode: pgcr?.Response?.activityDetails?.mode,
        membershipType: pgcr?.Response?.activityDetails?.membershipType,
        period: pgcr?.Response?.period,
        videos: [],
      };

      const videos = encounteredVideos.docs.map(doc => doc.data() as Video);
      for (const video of videos) {
        if (
          video.owner &&
          video.owner.displayName &&
          video.owner.membershipId &&
          video.owner.membershipType
        ) {
          let vid: {
            displayName: string;
            membershipId: string;
            membershipType: BungieMembershipType;
            type: string;
            linkName: string;
            linkId: string;
            team?: number | undefined;
            url?: string | undefined;
            thumbnail?: string | undefined;
            embedUrl?: string | undefined;
            title?: string | undefined;
            offset?: string | undefined;
          } = {
            displayName: video.owner.displayName,
            membershipId: video.owner.membershipId,
            membershipType: video.owner.membershipType,
            type: video.type,
            linkName: video.linkName,
            linkId: video.linkId,
            team: video.teams[instance.instanceId],
          };
          const videoStartTime = new Date(
            (video.timeStart as any)._seconds * 1000,
          );
          let offset = 0;
          const activityStartTime = new Date(instance.period);
          if (activityStartTime > videoStartTime) {
            offset = Math.floor(
              (activityStartTime.getTime() - videoStartTime.getTime()) / 1000,
            );
          }
          let seconds = offset;
          const hours = Math.floor(seconds / 60 / 60);
          seconds -= hours * 60 * 60;
          const minutes = Math.floor(seconds / 60);
          seconds -= minutes * 60;
          let twitchOffset = '';
          if (hours) {
            twitchOffset += `${hours}h`;
          }
          if (minutes) {
            twitchOffset += `${minutes}m`;
          }
          if (seconds) {
            twitchOffset += `${seconds}s`;
          }

          switch (video.type) {
            case 'mixer':
              if (video.mixer) {
                vid = {
                  ...vid,
                  url: `https://mixer.com/${video.mixer.token}?vod=${video.mixer.id}&t=${twitchOffset}`,
                  thumbnail: video.thumbnailUrl,
                  title: video.title,
                  embedUrl: `//mixer.com/embed/player/${video.mixer.token}?vod=${video.mixer.id}&t=${twitchOffset}`,
                  offset: twitchOffset,
                };
              }
              break;
            case 'twitch':
              if (video.twitch) {
                vid = {
                  ...vid,
                  url: `${video.url}?t=${twitchOffset}`,
                  embedUrl: `//player.twitch.tv/?video=${video.twitch.id}&time=${twitchOffset}`,
                  title: video.title,
                  offset: twitchOffset,
                };
                if (video.thumbnailUrl) {
                  vid = {
                    ...vid,
                    thumbnail: video.thumbnailUrl
                      .replace('%{width}', '960')
                      .replace('%{height}', '540'),
                  };
                }
              }
              break;
            case 'xbox':
              if (video.xbox && video.xbox.gamertag) {
                vid = {
                  ...vid,
                  url: `https://xboxrecord.us/gamer/${encodeURIComponent(
                    video.xbox.gamertag,
                  )}/clip/${video.xbox.gameClipId}/scid/${
                    video.xbox.gameClipId
                  }`,
                  thumbnail: video.thumbnailUrl,
                  embedUrl: `https://api.xboxrecord.us/gameclip/gamertag/${encodeURIComponent(
                    video.xbox.gamertag,
                  )}/clip/${video.xbox.gameClipId}/scid/${
                    video.xbox.gameClipId
                  }`,
                };
              }
              break;
          }

          instance.videos.push(vid);
        }
      }

      return instance;
    }
  }

  async getAllLinkedAccounts(membershipId: string) {
    const links = await this.firestoreService.db
      .collection('videoAccounts')
      .where('membershipId', '==', membershipId)
      .get();

    if (links.empty) {
      return [];
    } else {
      const videoAccounts = links.docs.map(doc => doc.data() as VideoAccount);
      return videoAccounts.filter(account => !account.rejected);
    }
  }

  // async getStreamerVsStreamerInstances() {
  //   return [];
  //   const rawInstances: {
  //     instance_instanceId: string;
  //     instance_membershipType: number;
  //     instance_period: Date;
  //     instance_activityHash: string;
  //     instance_directorActivityHash?: string;
  //     entries_timePlayedRange: string;
  //     entries_team: number;
  //     destinyProfile_membershipId: string;
  //     destinyProfile_membershipType: number;
  //     destinyProfile_displayName: string;
  //     accountLinks_id: string;
  //     accountLinks_linkType: string;
  //     accountLinks_accountType: string;
  //     twitchAccount_displayName?: string;
  //     videos_id?: string;
  //     videos_durationRange?: string;
  //     videos_title?: string;
  //     videos_url?: string;
  //     videos_thumbnailUrl?: string;
  //     mixerAccount_username?: string;
  //     channel_token?: string;
  //     recordings_id?: number;
  //     recordings_durationRange?: string;
  //     recordings_title?: string;
  //     recordings_thumbnail?: string;
  //     bnetProfile_membershipId?: string;
  //   }[] = await getConnection().query(`SELECT * FROM streamervsstreamer`);

  //   const instances: {
  //     instanceId: string;
  //     activityHash: number;
  //     directorActivityHash: number;
  //     membershipType: BungieMembershipType;
  //     period: string;
  //     team: number;
  //     videos: {
  //       displayName: string;
  //       membershipId: string;
  //       membershipType: number;
  //       team: number;
  //       linkName: string;
  //       linkId?: string;
  //       type: string;
  //       url: string;
  //       embedUrl: string;
  //       thumbnail: string;
  //       title?: string;
  //       offset?: string;
  //     }[];
  //   }[] = [];

  //   for (let i = 0; i < rawInstances.length; i++) {
  //     const rawInstance = rawInstances[i];
  //     let instance: {
  //       instanceId: string;
  //       activityHash: number;
  //       directorActivityHash: number;
  //       membershipType: BungieMembershipType;
  //       period: string;
  //       team: number;
  //       videos: {
  //         displayName: string;
  //         membershipId: string;
  //         membershipType: number;
  //         team: number;
  //         linkName: string;
  //         linkId?: string;
  //         type: string;
  //         url: string;
  //         embedUrl: string;
  //         thumbnail: string;
  //         title?: string;
  //         offset?: string;
  //       }[];
  //     };
  //     if (
  //       !instances.length ||
  //       instances[instances.length - 1].instanceId !==
  //         rawInstance.instance_instanceId
  //     ) {
  //       instance = {
  //         instanceId: rawInstance.instance_instanceId,
  //         activityHash: parseInt(rawInstance.instance_activityHash, 10),
  //         directorActivityHash: parseInt(
  //           rawInstance.instance_directorActivityHash,
  //           10,
  //         ),
  //         membershipType: rawInstance.instance_membershipType,
  //         period: rawInstance.instance_period.toISOString(),
  //         team: 17,
  //         videos: [],
  //       };
  //       instances.push(instance);
  //     } else {
  //       instance = instances[instances.length - 1];
  //     }

  //     let encounteredVideo: {
  //       displayName: string;
  //       membershipId: string;
  //       membershipType: number;
  //       team: number;
  //       linkName: string;
  //       linkId?: string;
  //       type: string;
  //       url: string;
  //       embedUrl: string;
  //       thumbnail: string;
  //       title?: string;
  //       offset?: string;
  //     };
  //     const instanceEntry = {
  //       displayName: rawInstance.destinyProfile_displayName,
  //       membershipId: rawInstance.destinyProfile_membershipId,
  //       membershipType: rawInstance.destinyProfile_membershipType,
  //       team: rawInstance.entries_team,
  //     };
  //     const entryStartTime = new Date(
  //       JSON.parse(rawInstance.entries_timePlayedRange)[0],
  //     );
  //     const linkInfo = {
  //       ...instanceEntry,
  //       type: rawInstance.accountLinks_accountType,
  //       linkType: rawInstance.accountLinks_linkType,
  //     };
  //     if (rawInstance.twitchAccount_displayName) {
  //       const entryLink = {
  //         ...linkInfo,
  //         linkName: rawInstance.twitchAccount_displayName,
  //         linkId: rawInstance.accountLinks_id,
  //       };
  //       const videoStartTime = new Date(
  //         JSON.parse(rawInstance.videos_durationRange)[0],
  //       );
  //       let offset = 0;
  //       if (entryStartTime > videoStartTime) {
  //         offset = Math.floor(
  //           (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
  //         );
  //       }
  //       const twitchOffset = convertSecondsToTwitchDuration(offset);
  //       const video = {
  //         ...entryLink,
  //         url: `${rawInstance.videos_url}?t=${twitchOffset}`,
  //         embedUrl: `//player.twitch.tv/?video=${rawInstance.videos_id}&time=${twitchOffset}`,
  //         thumbnail: rawInstance.videos_thumbnailUrl
  //           .replace('%{width}', '960')
  //           .replace('%{height}', '540'),
  //         title: rawInstance.videos_title,
  //         offset: twitchOffset,
  //       };
  //       encounteredVideo = video;
  //     }
  //     if (rawInstance.mixerAccount_username) {
  //       const entryLink = {
  //         ...linkInfo,
  //         linkName: rawInstance.mixerAccount_username,
  //         linkId: rawInstance.accountLinks_id,
  //       };
  //       const videoStartTime = new Date(
  //         JSON.parse(rawInstance.recordings_durationRange)[0],
  //       );
  //       let offset = 0;
  //       if (entryStartTime > videoStartTime) {
  //         offset = Math.floor(
  //           (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
  //         );
  //       }
  //       const mixerOffset = convertSecondsToTwitchDuration(offset);
  //       const video = {
  //         ...entryLink,
  //         url: `https://mixer.com/${rawInstance.channel_token}?vod=${rawInstance.recordings_id}&t=${mixerOffset}`,
  //         thumbnail: rawInstance.recordings_thumbnail,
  //         title: rawInstance.recordings_title,
  //         embedUrl: `//mixer.com/embed/player/${rawInstance.channel_token}?vod=${rawInstance.recordings_id}&t=${mixerOffset}`,
  //         offset: mixerOffset,
  //       };
  //       encounteredVideo = video;
  //     }
  //     instance.videos.push(encounteredVideo);
  //   }
  //   return instances;
  // }

  async getReportedLinks() {
    const links = await getConnection()
      .createQueryBuilder(AccountLinkVoteEntity, 'votes')
      .leftJoinAndSelect('votes.link', 'link')
      .getMany();
    return links;
  }

  async reportLink(linkId: string, membershipId: string) {
    const videoAccountRef = this.firestoreService.db
      .collection('videoAccounts')
      .doc(linkId);
    const videoAccountRes = await videoAccountRef.get();
    if (videoAccountRes.exists) {
      const videoAccount = videoAccountRes.data() as VideoAccount;

      if (!videoAccount.reported) {
        await videoAccountRef.update({
          reported: true,
          reportedBy: [membershipId],
        });
        return { Response: 'Link reported.' };
      } else if (
        videoAccount.reportedBy &&
        videoAccount.reportedBy.length &&
        videoAccount.reportedBy.indexOf(membershipId) < 0
      ) {
        await videoAccountRef.update({
          reportedBy: admin.firestore.FieldValue.arrayUnion(membershipId),
        });
        return { Response: 'Link reported.' };
      }
      return { Response: 'Link previously reported.' };
    }
    return { Response: `Link doesn't exist.` };
  }

  async unreportLink(linkId: string, membershipId: string) {
    const videoAccountRef = this.firestoreService.db
      .collection('videoAccounts')
      .doc(linkId);
    const videoAccountRes = await videoAccountRef.get();
    if (videoAccountRes.exists) {
      const videoAccount = videoAccountRes.data() as VideoAccount;

      if (
        videoAccount.reported &&
        videoAccount.reportedBy &&
        videoAccount.reportedBy.length &&
        videoAccount.reportedBy.indexOf(membershipId) > -1
      ) {
        await videoAccountRef.update({
          reportedBy: admin.firestore.FieldValue.arrayRemove(membershipId),
        });
        return { Response: 'Link un-reported.' };
      }
      return { Response: 'Link had not been reported.' };
    }
    return { Response: `Link doesn't exist.` };
  }

  async removeLink(linkId: string, membershipId: string) {
    const videoAccountRef = this.firestoreService.db
      .collection('videoAccounts')
      .doc(linkId);
    const videoAccountRes = await videoAccountRef.get();

    if (videoAccountRes.exists) {
      const videoAccount = videoAccountRes.data() as VideoAccount;

      if (!videoAccount.rejected) {
        await videoAccountRef.update({
          fresh: true,
          rejected: true,
        });
      }
    }

    return this.getAllLinkedAccounts(membershipId);
  }

  async addTwitchLink(bnetMembershipId: string, twitchId: string) {
    const videoAccountRef = this.firestoreService.db
      .collection('videoAccounts')
      .doc(`${bnetMembershipId}.twitch.${twitchId}`);
    const videoAccountRes = await videoAccountRef.get();

    if (videoAccountRes.exists) {
      videoAccountRef.update({
        rejected: false,
      });
    } else {
      const linkedProfiles = await getLinkedProfiles(
        config => this.bungieService.bungieRequest(config, true),
        {
          membershipType: BungieMembershipType.BungieNext,
          membershipId: bnetMembershipId,
        },
      ).catch(e => {
        this.logger.error(
          `Error fetching linked profiles for ${bnetMembershipId}: ${e.response
            ?.data?.Message || e}`,
        );
        return {} as ServerResponse<DestinyLinkedProfilesResponse>;
      });
      const twitchUser = await this.twitchService
        .getUserFromId(twitchId)
        .catch(e => {
          this.logger.error(
            `Error fetching Twitch profile for ${twitchId}: ${e}`,
          );
          return {} as AxiosResponse<GetUsersResponse>;
        });

      try {
        const videoAccount: VideoAccount = {
          membershipId: linkedProfiles.Response.bnetMembership.membershipId,
          membershipType: linkedProfiles.Response.bnetMembership.membershipType,
          displayName: linkedProfiles.Response.bnetMembership.displayName,

          fresh: true,
          type: 'twitch',

          rejected: false,
          reported: false,
          reportedBy: [],

          lastClipCheck: new Date(),
          clipCheckStatus: 'idle',

          lastLinkedProfilesCheck: new Date(),
          linkedProfiles: [],

          twitch: {
            userId: twitchUser.data.data[0].id,
            login: twitchUser.data.data[0].login,
            displayName: twitchUser.data.data[0].display_name,
          },
        };
        for (const profile of linkedProfiles.Response.profiles) {
          videoAccount.linkedProfiles.push({
            membershipId: profile.membershipId,
            membershipType: profile.membershipType,
            displayName: profile.displayName,
          });
        }
        for (const profile of linkedProfiles.Response.profilesWithErrors) {
          videoAccount.linkedProfiles.push({
            membershipId: profile.infoCard.membershipId,
            membershipType: profile.infoCard.membershipType,
            displayName: profile.infoCard.displayName,
            withError: true,
          });
        }
        videoAccountRef.set(videoAccount, { merge: true });
      } catch (e) {
        this.logger.log(`Error creating new VideoAccount: ${e}`);
      }
    }

    return {};
  }
}
