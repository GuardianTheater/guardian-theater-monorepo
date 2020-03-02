import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { MixerService } from '@services/shared-services';
import { MixerAccountEntity } from '@services/shared-services/mixer/mixer-account.entity';
import { MixerChannelEntity } from '@services/shared-services/mixer/mixer-channel.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { UserWithChannel } from '@services/shared-services/mixer/mixer.types';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';

@Injectable()
export class AppService {
  constructor(
    private readonly mixerService: MixerService,
    private readonly logger: Logger,
  ) {}

  @Interval(60000)
  handleInterval() {
    this.mixerNameMatch();
  }

  async mixerNameMatch() {
    const profiles = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where('profile.mixerNameMatchChecked is null')
      .limit(250)
      .getMany();

    const allSearches = [];
    const results: {
      profile: DestinyProfileEntity;
      result: UserWithChannel;
    }[] = [];

    const profileEntities: DestinyProfileEntity[] = [];
    const mixerAccountEntities: MixerAccountEntity[] = [];
    const mixerChannelEntities: MixerChannelEntity[] = [];

    const profileSearch = async (profile: DestinyProfileEntity) =>
      this.mixerService
        .searchUser(profile.displayName.replace(/\s/g, '_'))
        .then(async res => {
          profile.mixerNameMatchChecked = new Date().toISOString();
          if (profile.membershipId) {
            profileEntities.push(profile);
          }
          if (res && res.data && res.data[0]) {
            results.push({ profile, result: res.data[0] });
          }
        })
        .catch(() =>
          this.logger.error(
            `Error searching Mixer account for ${profile.displayName}`,
            'MixerNameMatch',
          ),
        );

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const search = profileSearch(profile);
      allSearches.push(search);
    }

    await Promise.all(allSearches).catch(() =>
      this.logger.error(
        `Error while searching for Mixer name matches`,
        'MixerNameMatch',
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const profile = results[i].profile;
      const result = results[i].result;
      if (result?.username === profile.displayName) {
        profile.mixerNameMatch = new MixerAccountEntity();
        profile.mixerNameMatch.username = result.username;
        profile.mixerNameMatch.id = result.id;
        profile.mixerNameMatch.channel = new MixerChannelEntity();
        profile.mixerNameMatch.channel.id = result.channel?.id;
        profile.mixerNameMatch.channel.token = result.channel?.token;
        if (profile.mixerNameMatch.id) {
          mixerAccountEntities.push(profile.mixerNameMatch);
        }
        if (profile.mixerNameMatch.channel.id) {
          mixerChannelEntities.push(profile.mixerNameMatch.channel);
        }
      }
    }

    const uniqueMixerChannelEntities: MixerChannelEntity[] = uniqueEntityArray(
      mixerChannelEntities,
      'id',
    );
    const uniqueMixerAccountEntities: MixerAccountEntity[] = uniqueEntityArray(
      mixerAccountEntities,
      'id',
    );
    const uniqueDestinyProfileEntities: DestinyProfileEntity[] = uniqueEntityArray(
      profileEntities,
      'membershipId',
    );

    if (uniqueMixerChannelEntities.length) {
      await upsert(MixerChannelEntity, uniqueMixerChannelEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueMixerChannelEntities.length} Mixer Channel Entities`,
            'MixerNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueMixerChannelEntities.length} Mixer Channel Entities`,
            'MixerNameMatch',
          ),
        );
    }

    if (uniqueMixerAccountEntities.length) {
      await upsert(MixerAccountEntity, uniqueMixerAccountEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueMixerAccountEntities.length} Mixer Account Entities`,
            'MixerNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueMixerAccountEntities} Mixer Account Entities`,
            'MixerNameMatch',
          ),
        );
    }

    if (uniqueDestinyProfileEntities.length) {
      await upsert(
        DestinyProfileEntity,
        uniqueDestinyProfileEntities,
        'membershipId',
      )
        .then(() =>
          this.logger.log(
            `Saved ${uniqueDestinyProfileEntities.length} Destiny Profile Entities`,
            'MixerNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueDestinyProfileEntities.length} Destiny Profile Entities`,
            'MixerNameMatch',
          ),
        );
    }
  }
}
