import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { PgcrEntryEntity } from '@services/shared-services/bungie/pgcr-entry.entity';
import { convertSecondsToTwitchDuration } from '@services/shared-services/helpers/twitch-duration-conversion';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { getProfile, DestinyComponentType } from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services';
import upsert from '@services/shared-services/helpers/typeorm-upsert';

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
      for (let i = 0; i < profile.bnetProfile.profiles.length; i++) {
        membershipIds.push(profile.bnetProfile.profiles[i].membershipId);
      }
    } else {
      membershipIds.push(destinyMembershipId);
    }

    const entries = await getConnection()
      .createQueryBuilder(PgcrEntryEntity, 'entry')
      .leftJoinAndSelect('entry.instance', 'instance')
      .leftJoinAndSelect('instance.entries', 'entries')
      .leftJoinAndSelect('entries.profile', 'profiles')
      .leftJoinAndSelect(
        'profiles.xboxNameMatch',
        'profilesXbox',
        'instance.membershipType = 1',
      )
      .leftJoinAndSelect(
        'profilesXbox.clips',
        'profilesClips',
        'entry.timePlayedRange && profilesClips.dateRecordedRange',
      )
      .leftJoinAndSelect('profiles.twitchNameMatch', 'profilesTwitch')
      .leftJoinAndSelect(
        'profilesTwitch.videos',
        'profilesVideos',
        'entry.timePlayedRange && profilesVideos.durationRange',
      )
      .leftJoinAndSelect('profiles.mixerNameMatch', 'profilesMixer')
      .leftJoinAndSelect('profilesMixer.channel', 'profilesChannel')
      .leftJoinAndSelect(
        'profilesChannel.recordings',
        'profileRecordings',
        'entry.timePlayedRange && profileRecordings.durationRange',
      )
      .leftJoinAndSelect('profiles.bnetProfile', 'bnetProfile')
      .leftJoinAndSelect('bnetProfile.twitchPartnershipMatch', 'bnetTwitch')
      .leftJoinAndSelect(
        'bnetTwitch.videos',
        'bnetVideos',
        'entry.timePlayedRange && bnetVideos.durationRange',
      )
      .where(
        'entry.profile = ANY (:membershipIds)',
        //  +' AND (' +
        // 'entry.timePlayedRange && profilesClips.dateRecordedRange OR ' +
        // 'entry.timePlayedRange && profilesVideos.durationRange OR ' +
        // 'entry.timePlayedRange && bnetVideos.durationRange OR ' +
        // 'entry.timePlayedRange && profileRecordings.durationRange OR ' +
        // 'entry.timePlayedRange && linkedProfilesClips.dateRecordedRange OR ' +
        // 'entry.timePlayedRange && linkedProfilesVideos.durationRange OR ' +
        // 'entry.timePlayedRange && linkedProfileRecordings.durationRange' +
        // ')',
        {
          membershipIds,
        },
      )
      .getMany();

    const instances = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const instance = {
        instanceId: entry.instance.instanceId,
        membershipType: entry.instance.membershipType,
        period: entry.instance.period,
        team: entry.team,
        entries: [],
      };
      for (let j = 0; j < entry.instance.entries.length; j++) {
        const instanceEntryResponse = entry.instance.entries[j];
        const entryProfile = instanceEntryResponse.profile;
        const instanceEntry = {
          displayName: entryProfile.displayName,
          membershipId: entryProfile.membershipId,
          membershipType: entryProfile.membershipType,
          team: instanceEntryResponse.team,
          videos: [],
        };
        const encounteredVideos = [];
        const entryStartTime = new Date(
          JSON.parse(instanceEntryResponse.timePlayedRange)[0],
        );
        if (entryProfile.xboxNameMatch) {
          const gamertag = entryProfile.xboxNameMatch.gamertag;
          for (let k = 0; k < entryProfile.xboxNameMatch.clips.length; k++) {
            const xboxClip = entryProfile.xboxNameMatch.clips[k];
            const video = {
              type: 'xbox',
              url: `https://xboxrecord.us/gamer/${encodeURIComponent(
                gamertag,
              )}/clip/${xboxClip.gameClipId}/scid/${xboxClip.gameClipId}`,
            };
            encounteredVideos.push(video);
          }
        }
        if (entryProfile.twitchNameMatch) {
          for (let k = 0; k < entryProfile.twitchNameMatch.videos.length; k++) {
            const twitchVideo = entryProfile.twitchNameMatch.videos[k];
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
              type: 'twitch',
              url: `${twitchVideo.url}?t=${twitchOffset}`,
            };
            encounteredVideos.push(video);
          }
        }
        if (entryProfile.mixerNameMatch) {
          for (
            let k = 0;
            k < entryProfile.mixerNameMatch.channel.recordings.length;
            k++
          ) {
            const mixerRecording =
              entryProfile.mixerNameMatch.channel.recordings[k];
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
              type: 'mixer',
              url: `https://mixer.com/${entryProfile.mixerNameMatch?.channel?.token}?vod=${mixerRecording.id}$t=${mixerOffset}`,
            };
            encounteredVideos.push(video);
          }
        }
        if (entryProfile.bnetProfile?.twitchPartnershipMatch) {
          for (
            let k = 0;
            k < entryProfile.bnetProfile.twitchPartnershipMatch.videos.length;
            k++
          ) {
            const twitchVideo =
              entryProfile.bnetProfile.twitchPartnershipMatch.videos[k];
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
              type: 'twitch',
              url: `${twitchVideo.url}?t=${twitchOffset}`,
            };
            encounteredVideos.push(video);
          }
        }
        instanceEntry.videos = Array.from(
          new Set(encounteredVideos.map(video => video.url)),
        );
        if (instanceEntry.videos.length) {
          instance.entries.push(instanceEntry);
        }
      }
      if (instance.entries.length) {
        instances.push(instance);
      }
    }

    return {
      profile,
      instances,
    };
  }

  async getInfoAboutMembershipId(membershipId: string) {
    return getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .leftJoinAndSelect('profile.bnetProfile', 'bnetProfile')
      .leftJoinAndSelect('profile.twitchNameMatch', 'twitchNameMatch')
      .leftJoinAndSelect('twitchNameMatch.videos', 'videos')
      .leftJoinAndSelect('profile.mixerNameMatch', 'mixerNameMatch')
      .leftJoinAndSelect('mixerNameMatch.channel', 'channel')
      .leftJoinAndSelect('channel.recordings', 'recordings')
      .leftJoinAndSelect('profile.xboxNameMatch', 'xbox')
      .leftJoinAndSelect('xbox.clips', 'clips')
      .leftJoinAndSelect(
        'bnetProfile.twitchPartnershipMatch',
        'twitchPartnershipMatch',
      )
      .leftJoinAndSelect('twitchPartnershipMatch.videos', 'parentVideos')
      .leftJoinAndSelect(
        'bnetProfile.profiles',
        'linkedProfile',
        'linkedProfile.membershipId != profile.membershipId',
      )
      .leftJoinAndSelect(
        'linkedProfile.twitchNameMatch',
        'childTwitchNameMatch',
      )
      .leftJoinAndSelect('childTwitchNameMatch.videos', 'childVideos')
      .leftJoinAndSelect('linkedProfile.mixerNameMatch', 'childMixerNameMatch')
      .leftJoinAndSelect('childMixerNameMatch.channel', 'childChannel')
      .leftJoinAndSelect('childChannel.recordings', 'childRecordings')
      .leftJoinAndSelect('linkedProfile.xboxNameMatch', 'childXbox')
      .leftJoinAndSelect('childXbox.clips', 'childClips')
      .where('profile.membershipId = :membershipId', {
        membershipId,
      })
      .getOne();
  }
}
