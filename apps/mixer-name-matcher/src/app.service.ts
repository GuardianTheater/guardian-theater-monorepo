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
import { AccountLinkEntity } from '@services/shared-services/helpers/account-link.entity';

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
    const loadedProfiles = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where('profile.mixerNameMatchChecked is null')
      .limit(100)
      .getMany();

    const allSearches = [];
    const results: UserWithChannel[] = [];

    const profileEntities: DestinyProfileEntity[] = [];
    const mixerAccountEntities: MixerAccountEntity[] = [];
    const mixerChannelEntities: MixerChannelEntity[] = [];
    const accountLinkEntities: AccountLinkEntity[] = [];

    const profileSearch = async (profile: DestinyProfileEntity) =>
      this.mixerService
        .searchUser(profile.displayName.replace(/\s/g, '_'))
        .then(async res => {
          if (res && res.data && res.data[0]) {
            results.push(res.data[0]);
          }
        })
        .catch(() =>
          this.logger.error(
            `Error searching Mixer account for ${profile.displayName}`,
            'MixerNameMatch',
          ),
        );

    for (let i = 0; i < loadedProfiles.length; i++) {
      const loadedProfile = loadedProfiles[i];
      const profile = new DestinyProfileEntity();
      profile.displayName = loadedProfile.displayName;
      profile.membershipId = loadedProfile.membershipId;
      profile.membershipType = loadedProfile.membershipType;
      profile.mixerNameMatchChecked = new Date().toISOString();
      profileEntities.push(profile);

      const search = profileSearch(profile);
      allSearches.push(search);
    }

    await Promise.all(allSearches).catch(() =>
      this.logger.error(
        `Error while searching for Mixer name matches`,
        'MixerNameMatch',
      ),
    );

    for (let i = 0; i < profileEntities.length; i++) {
      const destinyProfileEntity = profileEntities[i];
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (
          result?.username ===
          destinyProfileEntity.displayName.replace(/\s/g, '_')
        ) {
          const mixerAccountEntity = new MixerAccountEntity();
          mixerAccountEntity.username = result.username;
          mixerAccountEntity.id = result.id;

          const channel = new MixerChannelEntity();
          channel.id = result.channel?.id;
          channel.token = result.channel?.token;

          mixerAccountEntity.channel = channel;

          const accountLinkEntity = new AccountLinkEntity();
          accountLinkEntity.destinyProfile = destinyProfileEntity;
          accountLinkEntity.accountType = 'mixer';
          accountLinkEntity.linkType = 'nameMatch';
          accountLinkEntity.mixerAccount = mixerAccountEntity;
          accountLinkEntity.id =
            accountLinkEntity.destinyProfile.membershipId +
            accountLinkEntity.accountType +
            accountLinkEntity.linkType +
            accountLinkEntity.mixerAccount.id;

          mixerAccountEntities.push(mixerAccountEntity);
          mixerChannelEntities.push(channel);
          accountLinkEntities.push(accountLinkEntity);
          break;
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
    const uniqueAccountLinkEntities: AccountLinkEntity[] = uniqueEntityArray(
      accountLinkEntities,
      'id',
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

    if (uniqueAccountLinkEntities.length) {
      await upsert(AccountLinkEntity, uniqueAccountLinkEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueAccountLinkEntities.length} Account Link Entities`,
            'MixerNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueAccountLinkEntities.length} Account Link Entities`,
            'MixerNameMatch',
          ),
        );
    }
  }
}
