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
  ) {
    this.logger.setContext('MixerNameMatcher');
  }

  @Interval(60000)
  handleInterval() {
    this.mixerNameMatch().catch(() =>
      this.logger.error(`Error running mixerNameMatch`),
    );
  }

  async mixerNameMatch() {
    const loadedProfiles = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where('profile.mixerNameMatchChecked is null')
      .take(200)
      .getMany()
      .catch(() => {
        this.logger.error(`Error fetching Destiny Profiles from database.`);
        return [] as DestinyProfileEntity[];
      });

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

    await Promise.all(allSearches)
      .then(() =>
        this.logger.log(`Fetched ${allSearches.length} Mixer search results.`),
      )
      .catch(() =>
        this.logger.error(
          `Error while fetching ${allSearches.length} Mixer search results`,
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
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueMixerChannelEntities.length} Mixer Channel Entities`,
          ),
        );
    }

    if (uniqueMixerAccountEntities.length) {
      await upsert(MixerAccountEntity, uniqueMixerAccountEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueMixerAccountEntities.length} Mixer Account Entities`,
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueMixerAccountEntities} Mixer Account Entities`,
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
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueDestinyProfileEntities.length} Destiny Profile Entities`,
          ),
        );
    }

    if (uniqueAccountLinkEntities.length) {
      await upsert(AccountLinkEntity, uniqueAccountLinkEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueAccountLinkEntities.length} Account Link Entities`,
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueAccountLinkEntities.length} Account Link Entities`,
          ),
        );
    }
  }
}
