import { Injectable, Logger } from '@nestjs/common';
import { getConnection, getRepository } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { PgcrEntryEntity } from '@services/shared-services/bungie/pgcr-entry.entity';
import { convertSecondsToTwitchDuration } from '@services/shared-services/helpers/twitch-duration-conversion';
import { BungieMembershipType, ServerResponse } from 'bungie-api-ts/user';
import {
  getProfile,
  DestinyComponentType,
  DestinyProfileResponse,
  getLinkedProfiles,
  DestinyLinkedProfilesResponse,
} from 'bungie-api-ts/destiny2';
import { BungieService, TwitchService } from '@services/shared-services';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { AccountLinkEntity } from '@services/shared-services/helpers/account-link.entity';
import { PgcrEntity } from '@services/shared-services/bungie/pgcr.entity';
import { BungieProfileEntity } from '@services/shared-services/bungie/bungie-profile.entity';
import { TwitchAccountEntity } from '@services/shared-services/twitch/twitch-account.entity';
import { AccountLinkVoteEntity } from '@services/shared-services/helpers/account-link-vote.entity';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly logger: Logger,
    private readonly twitchService: TwitchService,
  ) {}

  async getAllEncounteredVideos(
    membershipType: BungieMembershipType,
    destinyMembershipId: string,
  ) {
    const membershipIds = [];
    let profile;

    if (membershipType === 254) {
      const linkedProfiles = await getLinkedProfiles(
        config => this.bungieService.bungieRequest(config),
        {
          membershipId: destinyMembershipId,
          membershipType: membershipType,
          getAllMemberships: true,
        },
      ).catch(() => {
        this.logger.error(
          `Error fetching linked profiles for ${membershipType}-${destinyMembershipId}`,
        );

        return {} as ServerResponse<DestinyLinkedProfilesResponse>;
      });

      if (linkedProfiles.Response?.bnetMembership) {
        const bnetProfile = new BungieProfileEntity();
        bnetProfile.membershipId =
          linkedProfiles.Response.bnetMembership.membershipId;
        bnetProfile.membershipType =
          linkedProfiles.Response.bnetMembership.membershipType;
        const childProfiles = [];
        let dateLastPlayed;
        for (let j = 0; j < linkedProfiles.Response.profiles.length; j++) {
          const linkedProfile = linkedProfiles.Response.profiles[j];
          const childProfile = new DestinyProfileEntity();
          childProfile.bnetProfile = bnetProfile;
          childProfile.bnetProfileChecked = new Date().toISOString();
          childProfile.displayName = linkedProfile.displayName;
          childProfile.membershipId = linkedProfile.membershipId;
          childProfile.membershipType = linkedProfile.membershipType;
          childProfile.pageLastVisited = new Date().toISOString();
          childProfiles.push(childProfile);

          membershipIds.push(linkedProfile.membershipId);
          if (
            !profile ||
            new Date(linkedProfile.dateLastPlayed) > dateLastPlayed
          ) {
            profile = childProfile;
            dateLastPlayed = new Date(linkedProfile.dateLastPlayed);
          }
        }
        await upsert(
          BungieProfileEntity,
          bnetProfile,
          'membershipId',
        ).catch(() => this.logger.error(`Error Saving Bungie Profile`));
        await upsert(
          DestinyProfileEntity,
          childProfiles,
          'membershipId',
        ).catch(() =>
          this.logger.error(`Error Saving ${childProfiles.length} Profiles`),
        );
      }
    } else {
      const fetchedProfile = await getProfile(
        config => this.bungieService.bungieRequest(config),
        {
          membershipType,
          destinyMembershipId,
          components: [DestinyComponentType.Profiles],
        },
      ).catch(() => {
        this.logger.error(`Error Fetching Profile - ${destinyMembershipId}`);
        return {} as ServerResponse<DestinyProfileResponse>;
      });

      const userInfo = fetchedProfile?.Response?.profile?.data?.userInfo;
      if (userInfo) {
        const updateProfile = new DestinyProfileEntity();
        updateProfile.displayName = userInfo.displayName;
        updateProfile.membershipId = userInfo.membershipId;
        updateProfile.membershipType = userInfo.membershipType;
        updateProfile.pageLastVisited = new Date().toISOString();
        await upsert(
          DestinyProfileEntity,
          updateProfile,
          'membershipId',
        ).catch(() =>
          this.logger.error(
            `Error Saving Profile - ${updateProfile.membershipId}`,
          ),
        );
      }

      profile = await getConnection()
        .createQueryBuilder(DestinyProfileEntity, 'profile')
        .leftJoinAndSelect('profile.bnetProfile', 'bnetProfile')
        .leftJoinAndSelect('bnetProfile.profiles', 'profiles')
        .where('profile.membershipId = :destinyMembershipId', {
          destinyMembershipId,
        })
        .getOne();

      if (profile?.bnetProfile?.profiles.length) {
        const profilesToSave = [];
        for (let i = 0; i < profile.bnetProfile.profiles.length; i++) {
          const linkedProfile = profile.bnetProfile.profiles[i];
          membershipIds.push(linkedProfile.membershipId);

          if (linkedProfile.membershipId !== destinyMembershipId) {
            const updateProfile = new DestinyProfileEntity();
            updateProfile.displayName = linkedProfile.displayName;
            updateProfile.membershipId = linkedProfile.membershipId;
            updateProfile.membershipType = linkedProfile.membershipType;
            updateProfile.pageLastVisited = new Date().toISOString();
            profilesToSave.push(updateProfile);
          }
        }
        if (profilesToSave.length) {
          await upsert(
            DestinyProfileEntity,
            profilesToSave,
            'membershipId',
          ).catch(() =>
            this.logger.error(
              `Error Saving ${profilesToSave.length} Linked Profiles`,
            ),
          );
        }
      } else {
        membershipIds.push(destinyMembershipId);
      }
    }

    const membershipIdSet = new Set(membershipIds);

    const entries = await getConnection()
      .createQueryBuilder(PgcrEntryEntity, 'entry')
      .leftJoinAndSelect('entry.instance', 'instance')
      .leftJoinAndSelect('instance.entries', 'entries')
      .leftJoinAndSelect('entries.profile', 'destinyProfile')
      .leftJoinAndSelect(
        'destinyProfile.accountLinks',
        'accountLinks',
        'accountLinks.rejected is null OR accountLinks.rejected != true',
      )
      .leftJoinAndSelect('accountLinks.twitchAccount', 'twitchAccount')
      .leftJoinAndSelect(
        'twitchAccount.videos',
        'videos',
        'entry.timePlayedRange && videos.durationRange',
      )
      .leftJoinAndSelect('accountLinks.mixerAccount', 'mixerAccount')
      .leftJoinAndSelect('mixerAccount.channel', 'channel')
      .leftJoinAndSelect(
        'channel.recordings',
        'recordings',
        'entry.timePlayedRange && recordings.durationRange',
      )
      .leftJoinAndSelect('accountLinks.xboxAccount', 'xboxAccount')
      .leftJoinAndSelect(
        'xboxAccount.clips',
        'clips',
        'entry.timePlayedRange && clips.dateRecordedRange',
      )
      .leftJoinAndSelect('destinyProfile.bnetProfile', 'bnetProfile')
      .orderBy('instance.period', 'DESC')
      .where('entry.profile = ANY (:membershipIds)', {
        membershipIds,
      })
      .getMany();

    const instances = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const instance = {
        instanceId: entry.instance.instanceId,
        activityHash: parseInt(entry.instance.activityHash, 10),
        directorActivityHash: parseInt(entry.instance.directorActivityHash, 10),
        membershipType: entry.instance.membershipType,
        period: entry.instance.period,
        team: entry.team,
        videos: [],
      };
      const encounteredVideos: {
        displayName: string;
        membershipId: string;
        membershipType: number;
        bnetMembershipId: string;
        team: number;
        linkName: string;
        linkId?: string;
        type: string;
        url: string;
        embedUrl: string;
        thumbnail: string;
        title?: string;
        offset?: string;
      }[] = [];
      for (let j = 0; j < entry.instance.entries.length; j++) {
        const instanceEntryResponse = entry.instance.entries[j];
        const entryProfile = instanceEntryResponse.profile;
        const instanceEntry = {
          displayName: entryProfile.displayName,
          membershipId: entryProfile.membershipId,
          membershipType: entryProfile.membershipType,
          team: instanceEntryResponse.team,
          bnetMembershipId: entryProfile.bnetProfile?.membershipId,
        };
        if (membershipIdSet.has(entryProfile.membershipId)) {
          instanceEntry.team = 16;
        }
        const entryStartTime = new Date(
          JSON.parse(instanceEntryResponse.timePlayedRange)[0],
        );
        const accountLinks: AccountLinkEntity[] = [];
        for (let k = 0; k < entryProfile.accountLinks.length; k++) {
          accountLinks.push(entryProfile.accountLinks[k]);

          if (entryProfile.bnetProfile?.profiles?.length) {
            for (let l = 0; l < entryProfile.bnetProfile.profiles.length; l++) {
              const childProfile = entryProfile.bnetProfile.profiles[l];
              for (let m = 0; m < childProfile.accountLinks?.length; m++) {
                accountLinks.push(childProfile.accountLinks[m]);
              }
            }
          }
        }
        for (let k = 0; k < accountLinks.length; k++) {
          const accountLink = accountLinks[k];
          const linkInfo = {
            ...instanceEntry,
            type: accountLink.accountType,
            linkType: accountLink.linkType,
          };
          if (accountLink.xboxAccount) {
            const entryLink = {
              ...linkInfo,
              linkName: accountLink.xboxAccount.gamertag,
            };
            const gamertag = accountLink.xboxAccount.gamertag;
            for (let l = 0; l < accountLink.xboxAccount.clips.length; l++) {
              const xboxClip = accountLink.xboxAccount.clips[l];
              const video = {
                ...entryLink,
                url: `https://xboxrecord.us/gamer/${encodeURIComponent(
                  gamertag,
                )}/clip/${xboxClip.gameClipId}/scid/${xboxClip.gameClipId}`,
                thumbnail: xboxClip.thumbnailUri,
                embedUrl: `https://api.xboxrecord.us/gameclip/gamertag/${gamertag}/clip/${xboxClip.gameClipId}/scid/${xboxClip.gameClipId}`,
              };
              encounteredVideos.push(video);
            }
          }
          if (accountLink.twitchAccount) {
            const entryLink = {
              ...linkInfo,
              linkName: accountLink.twitchAccount.displayName,
              linkId: accountLink.id,
            };
            for (let l = 0; l < accountLink.twitchAccount.videos.length; l++) {
              const twitchVideo = accountLink.twitchAccount.videos[l];
              const videoStartTime = new Date(
                JSON.parse(twitchVideo.durationRange)[0],
              );
              let offset = 0;
              if (entryStartTime > videoStartTime) {
                offset = Math.floor(
                  (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
                );
              }
              const twitchOffset = convertSecondsToTwitchDuration(offset);
              const video = {
                ...entryLink,
                url: `${twitchVideo.url}?t=${twitchOffset}`,
                embedUrl: `//player.twitch.tv/?video=${twitchVideo.id}&time=${twitchOffset}`,
                thumbnail: twitchVideo.thumbnailUrl
                  .replace('%{width}', '960')
                  .replace('%{height}', '540'),
                title: twitchVideo.title,
                offset: twitchOffset,
              };
              encounteredVideos.push(video);
            }
          }
          if (accountLink.mixerAccount) {
            for (
              let l = 0;
              l < accountLink.mixerAccount.channel.recordings.length;
              l++
            ) {
              const entryLink = {
                ...linkInfo,
                linkName: accountLink.mixerAccount.username,
                linkId: accountLink.id,
              };
              const mixerRecording =
                accountLink.mixerAccount.channel.recordings[l];
              const videoStartTime = new Date(
                JSON.parse(mixerRecording.durationRange)[0],
              );
              let offset = 0;
              if (entryStartTime > videoStartTime) {
                offset = Math.floor(
                  (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
                );
              }
              const mixerOffset = convertSecondsToTwitchDuration(offset);
              const video = {
                ...entryLink,
                url: `https://mixer.com/${accountLink.mixerAccount?.channel?.token}?vod=${mixerRecording.id}&t=${mixerOffset}`,
                thumbnail: mixerRecording.thumbnail,
                title: mixerRecording.title,
                embedUrl: `//mixer.com/embed/player/${accountLink.mixerAccount?.channel?.token}?vod=${mixerRecording.id}&t=${mixerOffset}`,
                offset: mixerOffset,
              };
              encounteredVideos.push(video);
            }
          }
        }
      }
      const uniqueUrls = Array.from(
        new Set(encounteredVideos.map(video => video.url)),
      );
      instance.videos = [];
      for (let k = 0; k < uniqueUrls.length; k++) {
        const uniqueUrl = uniqueUrls[k];
        for (let l = 0; l < encounteredVideos.length; l++) {
          const video = encounteredVideos[l];
          if (video.url === uniqueUrl) {
            instance.videos.push(video);
            break;
          }
        }
      }
      if (instance.videos.length) {
        instances.push(instance);
      }
    }

    return {
      profile,
      instances,
    };
  }

  async getVideosForInstance(instanceId: string) {
    const rawInstance = await getConnection()
      .createQueryBuilder(PgcrEntity, 'instance')
      .leftJoinAndSelect('instance.entries', 'entries')
      .leftJoinAndSelect('entries.profile', 'destinyProfile')

      .leftJoinAndSelect(
        'destinyProfile.accountLinks',
        'accountLinks',
        'accountLinks.rejected is null OR accountLinks.rejected != true',
      )
      .leftJoinAndSelect('accountLinks.twitchAccount', 'twitchAccount')
      .leftJoinAndSelect(
        'twitchAccount.videos',
        'videos',
        'entries.timePlayedRange && videos.durationRange',
      )
      .leftJoinAndSelect('accountLinks.mixerAccount', 'mixerAccount')
      .leftJoinAndSelect('mixerAccount.channel', 'channel')
      .leftJoinAndSelect(
        'channel.recordings',
        'recordings',
        'entries.timePlayedRange && recordings.durationRange',
      )
      .leftJoinAndSelect('accountLinks.xboxAccount', 'xboxAccount')
      .leftJoinAndSelect(
        'xboxAccount.clips',
        'clips',
        'entries.timePlayedRange && clips.dateRecordedRange',
      )
      .leftJoinAndSelect('destinyProfile.bnetProfile', 'bnetProfile')
      .orderBy('instance.period', 'DESC')
      .where('instance = :instanceId', {
        instanceId,
      })
      .getOne();

    const instance = {
      instanceId: rawInstance.instanceId,
      activityHash: parseInt(rawInstance.activityHash, 10),
      directorActivityHash: parseInt(rawInstance.directorActivityHash, 10),
      membershipType: rawInstance.membershipType,
      period: rawInstance.period,
      videos: [],
    };
    const encounteredVideos: {
      displayName: string;
      membershipId: string;
      membershipType: number;
      team: number;
      linkName: string;
      linkId?: string;
      type: string;
      url: string;
      embedUrl: string;
      thumbnail: string;
      title?: string;
      offset?: string;
    }[] = [];
    for (let j = 0; j < rawInstance.entries.length; j++) {
      const rawEntry = rawInstance.entries[j];
      const entryProfile = rawEntry.profile;
      const instanceEntry = {
        displayName: entryProfile.displayName,
        membershipId: entryProfile.membershipId,
        membershipType: entryProfile.membershipType,
        team: rawEntry.team,
      };
      const entryStartTime = new Date(JSON.parse(rawEntry.timePlayedRange)[0]);
      const accountLinks: AccountLinkEntity[] = [];
      for (let k = 0; k < entryProfile.accountLinks.length; k++) {
        accountLinks.push(entryProfile.accountLinks[k]);

        if (entryProfile.bnetProfile?.profiles?.length) {
          for (let l = 0; l < entryProfile.bnetProfile.profiles.length; l++) {
            const childProfile = entryProfile.bnetProfile.profiles[l];
            for (let m = 0; m < childProfile.accountLinks?.length; m++) {
              accountLinks.push(childProfile.accountLinks[m]);
            }
          }
        }
      }
      for (let k = 0; k < accountLinks.length; k++) {
        const accountLink = accountLinks[k];
        const linkInfo = {
          ...instanceEntry,
          type: accountLink.accountType,
          linkType: accountLink.linkType,
        };
        if (accountLink.xboxAccount) {
          const entryLink = {
            ...linkInfo,
            linkName: accountLink.xboxAccount.gamertag,
          };
          const gamertag = accountLink.xboxAccount.gamertag;
          for (let l = 0; l < accountLink.xboxAccount.clips.length; l++) {
            const xboxClip = accountLink.xboxAccount.clips[l];
            const video = {
              ...entryLink,
              url: `https://xboxrecord.us/gamer/${encodeURIComponent(
                gamertag,
              )}/clip/${xboxClip.gameClipId}/scid/${xboxClip.gameClipId}`,
              thumbnail: xboxClip.thumbnailUri,
              embedUrl: `https://api.xboxrecord.us/gameclip/gamertag/${gamertag}/clip/${xboxClip.gameClipId}/scid/${xboxClip.gameClipId}`,
            };
            encounteredVideos.push(video);
          }
        }
        if (accountLink.twitchAccount) {
          const entryLink = {
            ...linkInfo,
            linkName: accountLink.twitchAccount.displayName,
            linkId: accountLink.id,
          };
          for (let l = 0; l < accountLink.twitchAccount.videos.length; l++) {
            const twitchVideo = accountLink.twitchAccount.videos[l];
            const videoStartTime = new Date(
              JSON.parse(twitchVideo.durationRange)[0],
            );
            let offset = 0;
            if (entryStartTime > videoStartTime) {
              offset = Math.floor(
                (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
              );
            }
            const twitchOffset = convertSecondsToTwitchDuration(offset);
            const video = {
              ...entryLink,
              url: `${twitchVideo.url}?t=${twitchOffset}`,
              embedUrl: `//player.twitch.tv/?video=${twitchVideo.id}&time=${twitchOffset}`,
              thumbnail: twitchVideo.thumbnailUrl
                .replace('%{width}', '960')
                .replace('%{height}', '540'),
              title: twitchVideo.title,
              offset: twitchOffset,
            };
            encounteredVideos.push(video);
          }
        }
        if (accountLink.mixerAccount) {
          for (
            let l = 0;
            l < accountLink.mixerAccount.channel.recordings.length;
            l++
          ) {
            const entryLink = {
              ...linkInfo,
              linkName: accountLink.mixerAccount.username,
              linkId: accountLink.id,
            };
            const mixerRecording =
              accountLink.mixerAccount.channel.recordings[l];
            const videoStartTime = new Date(
              JSON.parse(mixerRecording.durationRange)[0],
            );
            let offset = 0;
            if (entryStartTime > videoStartTime) {
              offset = Math.floor(
                (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
              );
            }
            const mixerOffset = convertSecondsToTwitchDuration(offset);
            const video = {
              ...entryLink,
              url: `https://mixer.com/${accountLink.mixerAccount?.channel?.token}?vod=${mixerRecording.id}&t=${mixerOffset}`,
              thumbnail: mixerRecording.thumbnail,
              title: mixerRecording.title,
              embedUrl: `//mixer.com/embed/player/${accountLink.mixerAccount?.channel?.token}?vod=${mixerRecording.id}&t=${mixerOffset}`,
              offset: mixerOffset,
            };
            encounteredVideos.push(video);
          }
        }
      }
    }
    const uniqueUrls = Array.from(
      new Set(encounteredVideos.map(video => video.url)),
    );
    instance.videos = [];
    for (let k = 0; k < uniqueUrls.length; k++) {
      const uniqueUrl = uniqueUrls[k];
      for (let l = 0; l < encounteredVideos.length; l++) {
        const video = encounteredVideos[l];
        if (video.url === uniqueUrl) {
          instance.videos.push(video);
          break;
        }
      }
    }

    return instance;
  }

  async getAllLinkedAccounts(membershipId: string) {
    const membershipIds = [];

    const linkedProfiles = await getLinkedProfiles(
      config => this.bungieService.bungieRequest(config),
      {
        membershipId,
        membershipType: 254,
        getAllMemberships: true,
      },
    ).catch(() => {
      this.logger.error(
        `Error fetching linked profiles for 254-${membershipId}`,
      );

      return {} as ServerResponse<DestinyLinkedProfilesResponse>;
    });

    if (linkedProfiles.Response?.bnetMembership) {
      const bnetProfile = new BungieProfileEntity();
      bnetProfile.membershipId =
        linkedProfiles.Response.bnetMembership.membershipId;
      bnetProfile.membershipType =
        linkedProfiles.Response.bnetMembership.membershipType;
      const childProfiles = [];
      for (let j = 0; j < linkedProfiles.Response.profiles.length; j++) {
        const linkedProfile = linkedProfiles.Response.profiles[j];
        const childProfile = new DestinyProfileEntity();
        childProfile.bnetProfile = bnetProfile;
        childProfile.bnetProfileChecked = new Date().toISOString();
        childProfile.displayName = linkedProfile.displayName;
        childProfile.membershipId = linkedProfile.membershipId;
        childProfile.membershipType = linkedProfile.membershipType;
        childProfile.pageLastVisited = new Date().toISOString();
        childProfiles.push(childProfile);

        membershipIds.push(linkedProfile.membershipId);
      }
    }

    const links = await getConnection()
      .createQueryBuilder(AccountLinkEntity, 'link')
      .leftJoinAndSelect('link.destinyProfile', 'destinyProfile')
      .leftJoinAndSelect('link.twitchAccount', 'twitchAccount')
      .leftJoinAndSelect('link.mixerAccount', 'mixerAccount')
      .leftJoinAndSelect('link.xboxAccount', 'xboxAccount')
      .where('link.destinyProfile = ANY (:membershipIds)', {
        membershipIds,
      })
      .andWhere('link.rejected is null OR link.rejected != true')
      .getMany();

    return links;
  }

  async getStreamerVsStreamerInstances() {
    // return [];
    const pgcrsWithVideos17 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.twitchAccount', 'twitchAccount')
      .innerJoin('twitchAccount.videos', 'videos')
      .where('entries.team = 17')
      .andWhere('entries.timePlayedRange && videos.durationRange')
      .limit(1000)
      .select('pgcr.instanceId');
    const pgcrsWithVideos18 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.twitchAccount', 'twitchAccount')
      .innerJoin('twitchAccount.videos', 'videos')
      .where('entries.team = 18')
      .andWhere('entries.timePlayedRange && videos.durationRange')
      .limit(1000)
      .select('pgcr.instanceId');
    // return pgcrsWithVideos17.getMany();

    const pgcrsWithRecordings17 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.mixerAccount', 'mixerAccount')
      .innerJoin('mixerAccount.channel', 'channel')
      .innerJoin('channel.recordings', 'recordings')
      .where('entries.team = 17')
      .andWhere('entries.timePlayedRange && recordings.durationRange')
      .limit(1000)
      .select('pgcr.instanceId');
    const pgcrsWithRecordings18 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.mixerAccount', 'mixerAccount')
      .innerJoin('mixerAccount.channel', 'channel')
      .innerJoin('channel.recordings', 'recordings')
      .where('entries.team = 18')
      .andWhere('entries.timePlayedRange && recordings.durationRange')
      .limit(1000)
      .select('pgcr.instanceId');

    // return pgcrsWithRecordings18.getMany();

    const pgcrs = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .leftJoinAndSelect('pgcr.entries', 'entries')
      .leftJoinAndSelect('entries.profile', 'destinyProfile')
      .leftJoinAndSelect('destinyProfile.accountLinks', 'accountLinks')
      .leftJoinAndSelect('accountLinks.twitchAccount', 'twitchAccount')
      .leftJoinAndSelect(
        'twitchAccount.videos',
        'videos',
        'entries.timePlayedRange && videos.durationRange',
      )
      .leftJoinAndSelect('accountLinks.mixerAccount', 'mixerAccount')
      .leftJoinAndSelect('mixerAccount.channel', 'channel')
      .leftJoinAndSelect(
        'channel.recordings',
        'recordings',
        'entries.timePlayedRange && recordings.durationRange',
      )
      .leftJoinAndSelect('destinyProfile.bnetProfile', 'bnetProfile')
      .where(
        `(pgcr.instanceId IN (${pgcrsWithVideos17.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithRecordings17.getQuery()})) AND (pgcr.instanceId IN (${pgcrsWithVideos18.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithRecordings18.getQuery()}))`,
      )
      .orderBy('pgcr.period', 'DESC')
      .limit(1000)
      .getMany();

    const rawInstances = await pgcrs;
    const instances: {
      instanceId: string;
      activityHash: number;
      directorActivityHash: number;
      membershipType: BungieMembershipType;
      period: string;
      team: number;
      videos: {
        displayName: string;
        membershipId: string;
        membershipType: number;
        team: number;
        linkName: string;
        linkId?: string;
        type: string;
        url: string;
        embedUrl: string;
        thumbnail: string;
        title?: string;
        offset?: string;
      }[];
    }[] = [];
    for (let i = 0; i < rawInstances.length; i++) {
      const rawInstance = rawInstances[i];
      const instance = {
        instanceId: rawInstance.instanceId,
        activityHash: parseInt(rawInstance.activityHash, 10),
        directorActivityHash: parseInt(rawInstance.directorActivityHash, 10),
        membershipType: rawInstance.membershipType,
        period: rawInstance.period,
        team: 17,
        videos: [],
      };
      const encounteredVideos: {
        displayName: string;
        membershipId: string;
        membershipType: number;
        team: number;
        linkName: string;
        linkId?: string;
        type: string;
        url: string;
        embedUrl: string;
        thumbnail: string;
        title?: string;
        offset?: string;
      }[] = [];
      for (let j = 0; j < rawInstance.entries?.length; j++) {
        const instanceEntryResponse = rawInstance.entries[j];
        const entryProfile = instanceEntryResponse.profile;
        const instanceEntry = {
          displayName: entryProfile.displayName,
          membershipId: entryProfile.membershipId,
          membershipType: entryProfile.membershipType,
          team: instanceEntryResponse.team,
        };
        const entryStartTime = new Date(
          JSON.parse(instanceEntryResponse.timePlayedRange)[0],
        );
        const accountLinks: AccountLinkEntity[] = [];
        for (let k = 0; k < entryProfile.accountLinks.length; k++) {
          accountLinks.push(entryProfile.accountLinks[k]);

          if (entryProfile.bnetProfile?.profiles?.length) {
            for (let l = 0; l < entryProfile.bnetProfile.profiles.length; l++) {
              const childProfile = entryProfile.bnetProfile.profiles[l];
              for (let m = 0; m < childProfile.accountLinks?.length; m++) {
                accountLinks.push(childProfile.accountLinks[m]);
              }
            }
          }
        }
        for (let k = 0; k < accountLinks?.length; k++) {
          const accountLink = accountLinks[k];
          const linkInfo = {
            ...instanceEntry,
            type: accountLink.accountType,
            linkType: accountLink.linkType,
          };
          if (accountLink.twitchAccount) {
            const entryLink = {
              ...linkInfo,
              linkName: accountLink.twitchAccount.displayName,
              linkId: accountLink.id,
            };
            for (let l = 0; l < accountLink.twitchAccount.videos?.length; l++) {
              const twitchVideo = accountLink.twitchAccount.videos[l];
              const videoStartTime = new Date(
                JSON.parse(twitchVideo.durationRange)[0],
              );
              let offset = 0;
              if (entryStartTime > videoStartTime) {
                offset = Math.floor(
                  (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
                );
              }
              const twitchOffset = convertSecondsToTwitchDuration(offset);
              const video = {
                ...entryLink,
                url: `${twitchVideo.url}?t=${twitchOffset}`,
                embedUrl: `//player.twitch.tv/?video=${twitchVideo.id}&time=${twitchOffset}`,
                thumbnail: twitchVideo.thumbnailUrl
                  .replace('%{width}', '960')
                  .replace('%{height}', '540'),
                title: twitchVideo.title,
                offset: twitchOffset,
              };
              encounteredVideos.push(video);
            }
          }
          if (accountLink.mixerAccount) {
            for (
              let l = 0;
              l < accountLink.mixerAccount.channel.recordings?.length;
              l++
            ) {
              const entryLink = {
                ...linkInfo,
                linkName: accountLink.mixerAccount.username,
                linkId: accountLink.id,
              };
              const mixerRecording =
                accountLink.mixerAccount.channel.recordings[l];
              const videoStartTime = new Date(
                JSON.parse(mixerRecording.durationRange)[0],
              );
              let offset = 0;
              if (entryStartTime > videoStartTime) {
                offset = Math.floor(
                  (entryStartTime.getTime() - videoStartTime.getTime()) / 1000,
                );
              }
              const mixerOffset = convertSecondsToTwitchDuration(offset);
              const video = {
                ...entryLink,
                url: `https://mixer.com/${accountLink.mixerAccount?.channel?.token}?vod=${mixerRecording.id}&t=${mixerOffset}`,
                thumbnail: mixerRecording.thumbnail,
                title: mixerRecording.title,
                embedUrl: `//mixer.com/embed/player/${accountLink.mixerAccount?.channel?.token}?vod=${mixerRecording.id}&t=${mixerOffset}`,
                offset: mixerOffset,
              };
              encounteredVideos.push(video);
            }
          }
        }
      }
      const uniqueUrls = Array.from(
        new Set(encounteredVideos.map(video => video.url)),
      );
      instance.videos = [];
      for (let k = 0; k < uniqueUrls.length; k++) {
        const uniqueUrl = uniqueUrls[k];
        for (let l = 0; l < encounteredVideos.length; l++) {
          const video = encounteredVideos[l];
          if (video.url === uniqueUrl) {
            instance.videos.push(video);
            break;
          }
        }
      }
      if (instance.videos.length) {
        instances.push(instance);
      }
    }
    return instances;
  }

  async getInfoAboutMembershipId(destinyMembershipId: string) {
    const profile = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .leftJoinAndSelect('profile.bnetProfile', 'bnetProfile')
      .leftJoinAndSelect('bnetProfile.profiles', 'profiles')
      .where('profile.membershipId = :destinyMembershipId', {
        destinyMembershipId,
      })
      .getOne();

    const membershipIds = [];

    if (profile?.bnetProfile?.profiles.length) {
      for (let i = 0; i < profile.bnetProfile.profiles.length; i++) {
        membershipIds.push(profile.bnetProfile.profiles[i].membershipId);
      }
    } else {
      membershipIds.push(destinyMembershipId);
    }

    return getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'destinyProfile')
      .leftJoinAndSelect('destinyProfile.bnetProfile', 'bnetProfile')
      .leftJoinAndSelect('destinyProfile.accountLinks', 'accountLinks')
      .leftJoinAndSelect('accountLinks.twitchAccount', 'twitchAccount')
      .leftJoinAndSelect('twitchAccount.videos', 'videos')
      .leftJoinAndSelect('accountLinks.mixerAccount', 'mixerAccount')
      .leftJoinAndSelect('mixerAccount.channel', 'channel')
      .leftJoinAndSelect('channel.recordings', 'recordings')
      .leftJoinAndSelect('accountLinks.xboxAccount', 'xboxAccount')
      .leftJoinAndSelect('xboxAccount.clips', 'clips')
      .leftJoinAndSelect('destinyProfile.entries', 'entries')
      .where('destinyProfile.membershipId = ANY (:membershipIds)', {
        membershipIds,
      })
      .getMany();
  }

  async getAllVotes(membershipId: string) {
    const votes = await getConnection()
      .createQueryBuilder(AccountLinkVoteEntity, 'votes')
      .leftJoin('votes.bnetProfile', 'bnetProfile')
      .leftJoinAndSelect('votes.link', 'link')
      .where('votes.bnetProfile = :membershipId', { membershipId })
      .andWhere('votes.vote = -1')
      .getMany();
    return votes;
  }

  async reportLink(linkId: string, membershipId: string) {
    const bnetProfile = await getConnection()
      .createQueryBuilder(BungieProfileEntity, 'profile')
      .leftJoinAndSelect('profile.profiles', 'profiles')
      .where('profile.membershipId = :membershipId', { membershipId })
      .getOne();
    const link = await getConnection()
      .createQueryBuilder(AccountLinkEntity, 'link')
      .leftJoinAndSelect('link.mixerAccount', 'mixerAccount')
      .leftJoinAndSelect('link.twitchAccount', 'twitchAccount')
      .where('link.id = :linkId', { linkId })
      .getOne();

    const vote = new AccountLinkVoteEntity();
    vote.id = membershipId + linkId;
    vote.bnetProfile = bnetProfile;
    vote.link = link;
    vote.vote = -1;

    await getRepository(AccountLinkVoteEntity)
      .save(vote)
      .catch(() => this.logger.error(`Error saving Vote`));

    return this.getAllVotes(membershipId);
  }

  async unreportLink(linkId: string, membershipId: string) {
    const vote = await getConnection()
      .createQueryBuilder(AccountLinkVoteEntity, 'vote')
      .leftJoinAndSelect('vote.bnetProfile', 'bnetProfile')
      .leftJoinAndSelect('vote.link', 'link')
      .where('vote.bnetProfile = :membershipId', { membershipId })
      .andWhere('vote.link = :linkId', { linkId })
      .getOne();

    await getRepository(AccountLinkVoteEntity)
      .delete(vote)
      .catch(() => this.logger.error(`Error deleting Vote`));

    return this.getAllVotes(membershipId);
  }

  async removeLink(linkId: string, membershipId: string) {
    const bnetProfile = await getConnection()
      .createQueryBuilder(BungieProfileEntity, 'profile')
      .leftJoinAndSelect('profile.profiles', 'profiles')
      .where('profile.membershipId = :membershipId', { membershipId })
      .getOne();
    const loadedLink = await getConnection()
      .createQueryBuilder(AccountLinkEntity, 'link')
      .leftJoinAndSelect('link.mixerAccount', 'mixerAccount')
      .leftJoinAndSelect('link.twitchAccount', 'twitchAccount')
      .where('link.id = :linkId', { linkId })
      .getOne();

    let links: AccountLinkEntity[] = [];

    if (loadedLink && loadedLink.accountType === 'mixer') {
      links = await getConnection()
        .createQueryBuilder(AccountLinkEntity, 'link')
        .leftJoinAndSelect('link.mixerAccount', 'mixerAccount')
        .leftJoinAndSelect('link.destinyProfile', 'destinyProfile')
        .where('destinyProfile.membershipId = ANY (:membershipIds)', {
          membershipIds: bnetProfile.profiles.map(
            profile => profile.membershipId,
          ),
        })
        .andWhere('mixerAccount.id = :id', { id: loadedLink.mixerAccount.id })
        .getMany();
    } else if (loadedLink && loadedLink.accountType === 'twitch') {
      links = await getConnection()
        .createQueryBuilder(AccountLinkEntity, 'link')
        .leftJoinAndSelect('link.twitchAccount', 'twitchAccount')
        .leftJoinAndSelect('link.destinyProfile', 'destinyProfile')
        .where('destinyProfile.membershipId = ANY (:membershipIds)', {
          membershipIds: bnetProfile.profiles.map(
            profile => profile.membershipId,
          ),
        })
        .andWhere('twitchAccount.id = :id', { id: loadedLink.twitchAccount.id })
        .getMany();
    }

    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      for (let j = 0; j < bnetProfile.profiles.length; j++) {
        const profile = bnetProfile.profiles[j];
        if (profile.membershipId === link.destinyProfile.membershipId) {
          if (link.linkType === 'nameMatch') {
            link.rejected = true;
            await getRepository(AccountLinkEntity)
              .save(link)
              .catch(() => this.logger.error(`Error saving Link`));
          }
          if (link.linkType === 'authentication') {
            await getRepository(AccountLinkEntity)
              .delete(link)
              .catch(() => this.logger.error(`Error deleting Link`));
          }
        }
      }
    }

    return this.getAllLinkedAccounts(membershipId);
  }

  async addTwitchLink(bnetMembershipId: string, twitchId: string) {
    const bnetProfile = await getConnection()
      .createQueryBuilder(BungieProfileEntity, 'bnetProfile')
      .leftJoinAndSelect('bnetProfile.profiles', 'profiles')
      .where('bnetProfile.membershipId = :bnetMembershipId', {
        bnetMembershipId,
      })
      .getOne();

    const twitchResponse = await this.twitchService.getUserFromId(twitchId);
    const twitchResult = twitchResponse.data.data[0];

    const twitchAccount = new TwitchAccountEntity();
    twitchAccount.displayName = twitchResult.display_name;
    twitchAccount.id = twitchResult.id;
    twitchAccount.login = twitchResult.login;

    await getRepository(TwitchAccountEntity)
      .save(twitchAccount)
      .catch(() => this.logger.error(`Error saving Twitch Account`));
    const links = [];

    for (let i = 0; i < bnetProfile.profiles.length; i++) {
      const profile = bnetProfile.profiles[i];
      const link = new AccountLinkEntity();
      link.accountType = 'twitch';
      link.linkType = 'authentication';
      link.destinyProfile = profile;
      link.twitchAccount = twitchAccount;
      link.id =
        link.destinyProfile.membershipId +
        link.accountType +
        link.linkType +
        link.twitchAccount.id;

      links.push(link);

      await getRepository(AccountLinkEntity)
        .save(link)
        .catch(() => this.logger.error(`Error saving Link`));
    }

    return links;
  }
}
