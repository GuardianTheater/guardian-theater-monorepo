import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { PgcrEntryEntity } from '@services/shared-services/bungie/pgcr-entry.entity';
import { convertSecondsToTwitchDuration } from '@services/shared-services/helpers/twitch-duration-conversion';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { getProfile, DestinyComponentType } from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { AccountLinkEntity } from '@services/shared-services/helpers/account-link.entity';
import { PgcrEntity } from '@services/shared-services/bungie/pgcr.entity';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly logger: Logger,
  ) {}
  async getAllEncounteredVideos(
    membershipType: BungieMembershipType,
    destinyMembershipId: string,
  ) {
    await getProfile(config => this.bungieService.bungieRequest(config), {
      membershipType,
      destinyMembershipId,
      components: [DestinyComponentType.Profiles],
    })
      .then(async fetchedProfile => {
        const userInfo = fetchedProfile?.Response?.profile?.data?.userInfo;
        if (userInfo) {
          const updateProfile = new DestinyProfileEntity();
          updateProfile.displayName = userInfo.displayName;
          updateProfile.membershipId = userInfo.membershipId;
          updateProfile.membershipType = userInfo.membershipType;
          updateProfile.pageLastVisited = new Date().toISOString();
          return upsert(
            DestinyProfileEntity,
            updateProfile,
            'membershipId',
          ).catch(() =>
            this.logger.error(
              `Error Saving Profile - ${updateProfile.membershipId}`,
            ),
          );
        }
      })
      .catch(() =>
        this.logger.error(`Error Fetching Profile - ${destinyMembershipId}`),
      );

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

    const entries = await getConnection()
      .createQueryBuilder(PgcrEntryEntity, 'entry')
      .leftJoinAndSelect('entry.instance', 'instance')
      .leftJoinAndSelect('instance.entries', 'entries')
      .leftJoinAndSelect('entries.profile', 'destinyProfile')
      .leftJoinAndSelect('destinyProfile.accountLinks', 'accountLinks')
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
      .leftJoinAndSelect(
        'bnetProfile.profiles',
        'linkedDestinyProfile',
        'linkedDestinyProfile.membershipId != destinyProfile.membershipId',
      )
      .leftJoinAndSelect(
        'linkedDestinyProfile.accountLinks',
        'linkedAccountLinks',
      )
      .leftJoinAndSelect('linkedAccountLinks.xboxAccount', 'linkedXboxAccount')
      .leftJoinAndSelect(
        'linkedXboxAccount.clips',
        'linkedClips',
        'entry.timePlayedRange && linkedClips.dateRecordedRange',
      )
      .leftJoinAndSelect(
        'linkedAccountLinks.twitchAccount',
        'linkedTwitchAccount',
      )
      .leftJoinAndSelect(
        'linkedTwitchAccount.videos',
        'linkedVideos',
        'entry.timePlayedRange && linkedVideos.durationRange',
      )
      .leftJoinAndSelect(
        'linkedAccountLinks.mixerAccount',
        'linkedMixerAccount',
      )
      .leftJoinAndSelect('linkedMixerAccount.channel', 'linkedChannel')
      .leftJoinAndSelect(
        'linkedChannel.recordings',
        'linkedRecordings',
        'entry.timePlayedRange && linkedRecordings.durationRange',
      )
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
        team: number;
        linkName: string;
        linkId?: string | number;
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
              linkId: accountLink.twitchAccount.id,
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
                linkId: accountLink.mixerAccount.id,
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

  async getStreamerVsStreamerInstances() {
    const pgcrsWithVideos17 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 17')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.twitchAccount', 'twitchAccount')
      .innerJoin(
        'twitchAccount.videos',
        'videos',
        'entries.timePlayedRange && videos.durationRange',
      )
      .select('pgcr.instanceId');
    const pgcrsWithVideos18 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 18')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.twitchAccount', 'twitchAccount')
      .innerJoin(
        'twitchAccount.videos',
        'videos',
        'entries.timePlayedRange && videos.durationRange',
      )
      .select('pgcr.instanceId');

    // return pgcrsWithVideos17.take(100).getMany();

    const pgcrsWithRecordings17 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 17')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.mixerAccount', 'mixerAccount')
      .innerJoin('mixerAccount.channel', 'channel')
      .innerJoin(
        'channel.recordings',
        'recordings',
        'entries.timePlayedRange && recordings.durationRange',
      )
      .select('pgcr.instanceId');
    const pgcrsWithRecordings18 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 18')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.accountLinks', 'accountLinks')
      .innerJoin('accountLinks.mixerAccount', 'mixerAccount')
      .innerJoin('mixerAccount.channel', 'channel')
      .innerJoin(
        'channel.recordings',
        'recordings',
        'entries.timePlayedRange && recordings.durationRange',
      )
      .select('pgcr.instanceId');

    // return pgcrsWithRecordings.take(100).getMany();

    const pgcrsWithLinkedVideos17 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 17')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.bnetProfile', 'bnetProfile')
      .innerJoin(
        'bnetProfile.profiles',
        'linkedDestinyProfiles',
        'linkedDestinyProfiles.membershipId != destinyProfile.membershipId',
      )
      .innerJoin('linkedDestinyProfiles.accountLinks', 'linkedAccountLinks')
      .innerJoin('linkedAccountLinks.twitchAccount', 'linkedTwitchAccount')
      .innerJoin(
        'linkedTwitchAccount.videos',
        'linkedVideos',
        'entries.timePlayedRange && linkedVideos.durationRange',
      )
      .select('pgcr.instanceId');
    const pgcrsWithLinkedVideos18 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 18')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.bnetProfile', 'bnetProfile')
      .innerJoin(
        'bnetProfile.profiles',
        'linkedDestinyProfiles',
        'linkedDestinyProfiles.membershipId != destinyProfile.membershipId',
      )
      .innerJoin('linkedDestinyProfiles.accountLinks', 'linkedAccountLinks')
      .innerJoin('linkedAccountLinks.twitchAccount', 'linkedTwitchAccount')
      .innerJoin(
        'linkedTwitchAccount.videos',
        'linkedVideos',
        'entries.timePlayedRange && linkedVideos.durationRange',
      )
      .select('pgcr.instanceId');

    // return pgcrsWithLinkedVideos.take(100).getMany();

    const pgcrsWithLinkedRecordings17 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 17')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.bnetProfile', 'bnetProfile')
      .innerJoin(
        'bnetProfile.profiles',
        'linkedDestinyProfiles',
        'linkedDestinyProfiles.membershipId != destinyProfile.membershipId',
      )
      .innerJoin('linkedDestinyProfiles.accountLinks', 'linkedAccountLinks')
      .innerJoin('linkedAccountLinks.mixerAccount', 'linkedMixerAccount')
      .innerJoin('linkedMixerAccount.channel', 'linkedChannel')
      .innerJoin(
        'linkedChannel.recordings',
        'linkedRecordings',
        'entries.timePlayedRange && linkedRecordings.durationRange',
      )
      .select('pgcr.instanceId');
    const pgcrsWithLinkedRecordings18 = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoin('pgcr.entries', 'entries', 'entries.team = 18')
      .innerJoin('entries.profile', 'destinyProfile')
      .innerJoin('destinyProfile.bnetProfile', 'bnetProfile')
      .innerJoin(
        'bnetProfile.profiles',
        'linkedDestinyProfiles',
        'linkedDestinyProfiles.membershipId != destinyProfile.membershipId',
      )
      .innerJoin('linkedDestinyProfiles.accountLinks', 'linkedAccountLinks')
      .innerJoin('linkedAccountLinks.mixerAccount', 'linkedMixerAccount')
      .innerJoin('linkedMixerAccount.channel', 'linkedChannel')
      .innerJoin(
        'linkedChannel.recordings',
        'linkedRecordings',
        'entries.timePlayedRange && linkedRecordings.durationRange',
      )
      .select('pgcr.instanceId');

    // return pgcrsWithLinkedRecordings.take(100).getMany();

    const pgcrs = getConnection()
      .createQueryBuilder(PgcrEntity, 'pgcr')
      .innerJoinAndSelect('pgcr.entries', 'entries')
      .innerJoinAndSelect('entries.profile', 'destinyProfile')
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
      .leftJoinAndSelect(
        'bnetProfile.profiles',
        'linkedDestinyProfiles',
        'linkedDestinyProfiles.membershipId != destinyProfile.membershipId',
      )
      .leftJoinAndSelect(
        'linkedDestinyProfiles.accountLinks',
        'linkedAccountLinks',
      )
      .leftJoinAndSelect(
        'linkedAccountLinks.twitchAccount',
        'linkedTwitchAccount',
      )
      .leftJoinAndSelect(
        'linkedTwitchAccount.videos',
        'linkedVideos',
        'entries.timePlayedRange && linkedVideos.durationRange',
      )
      .leftJoinAndSelect(
        'linkedAccountLinks.mixerAccount',
        'linkedMixerAccount',
      )
      .leftJoinAndSelect('linkedMixerAccount.channel', 'linkedChannel')
      .leftJoinAndSelect(
        'linkedChannel.recordings',
        'linkedRecordings',
        'entries.timePlayedRange && linkedRecordings.durationRange',
      )
      .where(
        `(pgcr.instanceId IN (${pgcrsWithVideos17.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithRecordings17.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithLinkedVideos17.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithLinkedRecordings17.getQuery()})) AND (pgcr.instanceId IN (${pgcrsWithVideos18.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithRecordings18.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithLinkedVideos18.getQuery()}) OR pgcr.instanceId IN (${pgcrsWithLinkedRecordings18.getQuery()}))`,
      )
      .orderBy('pgcr.period', 'DESC')
      .take(21)
      .getMany();

    const rawInstances = await pgcrs;
    const instances = [];
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
        linkId?: string | number;
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
              linkId: accountLink.twitchAccount.id,
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
                linkId: accountLink.mixerAccount.id,
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
}
