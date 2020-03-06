import { Injectable, Logger } from '@nestjs/common';
import { TwitchService } from '@services/shared-services';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { User } from '@services/shared-services/twitch/twitch.types';
import { TwitchAccountEntity } from '@services/shared-services/twitch/twitch-account.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { Interval } from '@nestjs/schedule';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';
import { AccountLinkEntity } from '@services/shared-services/helpers/account-link.entity';

@Injectable()
export class AppService {
  constructor(
    private readonly twitchService: TwitchService,
    private readonly logger: Logger,
  ) {}

  @Interval(60000)
  handleInterval() {
    this.twitchNameMatch();
  }

  async twitchNameMatch() {
    const loadedProfiles = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where('profile.twitchNameMatchChecked is null')
      .limit(1000)
      .getMany();

    const uniqueNames = Array.from(
      new Set(loadedProfiles.map(profile => profile.displayName)),
    );

    const nameChunks = [];

    while (uniqueNames.length) {
      nameChunks.push(uniqueNames.splice(0, 100));
    }

    const allSearches = [];
    const results: User[] = [];

    for (let i = 0; i < nameChunks.length; i++) {
      if (nameChunks[i].length) {
        const search = this.twitchService
          .getUsersFromLogin(nameChunks[i])
          .then(res => {
            if (res && res.data && res.data.data) {
              for (let j = 0; j < res.data.data.length; j++) {
                results.push(res.data.data[j]);
              }
            }
          })
          .catch(() =>
            this.logger.error(
              `Error fetching Twitch accounts`,
              'TwitchNameMatch',
            ),
          );
        allSearches.push(search);
      }
    }

    await Promise.all(allSearches).catch(() =>
      this.logger.error(`Error fetching Twitch accounts`, 'TwitchNameMatch'),
    );

    const twitchAccountEntities: TwitchAccountEntity[] = [];
    const accountLinkEntities: AccountLinkEntity[] = [];
    const destinyProfileEntities: DestinyProfileEntity[] = [];

    for (let i = 0; i < loadedProfiles.length; i++) {
      const loadedProfile = loadedProfiles[i];
      const destinyProfileEntity = new DestinyProfileEntity();
      destinyProfileEntity.membershipId = loadedProfile.membershipId;
      destinyProfileEntity.membershipType = loadedProfile.membershipType;
      destinyProfileEntity.displayName = loadedProfile.displayName;

      destinyProfileEntity.twitchNameMatchChecked = new Date().toISOString();
      destinyProfileEntities.push(destinyProfileEntity);

      const noSpaceLowercaseName = destinyProfileEntity.displayName
        .replace(/\s/g, '')
        .toLocaleLowerCase();

      for (let j = 0; j < results.length; j++) {
        const result = results[j];

        if (noSpaceLowercaseName === result.login) {
          const twitchAccountEntity = new TwitchAccountEntity();
          twitchAccountEntity.id = result.id;
          twitchAccountEntity.login = result.login;
          twitchAccountEntity.displayName = result.display_name;

          const accountLinkEntity = new AccountLinkEntity();
          accountLinkEntity.destinyProfile = destinyProfileEntity;
          accountLinkEntity.accountType = 'twitch';
          accountLinkEntity.linkType = 'nameMatch';
          accountLinkEntity.twitchAccount = twitchAccountEntity;
          accountLinkEntity.id =
            accountLinkEntity.destinyProfile.membershipId +
            accountLinkEntity.accountType +
            accountLinkEntity.linkType +
            accountLinkEntity.twitchAccount.id;

          twitchAccountEntities.push(twitchAccountEntity);
          accountLinkEntities.push(accountLinkEntity);
          break;
        }
      }
    }

    const uniqueTwitchAccountEntities: TwitchAccountEntity[] = uniqueEntityArray(
      twitchAccountEntities,
      'id',
    );
    const uniqueDestinyProfileEntities: DestinyProfileEntity[] = uniqueEntityArray(
      destinyProfileEntities,
      'membershipId',
    );
    const uniqueAccountLinkEntity: AccountLinkEntity[] = uniqueEntityArray(
      accountLinkEntities,
      'id',
    );

    if (uniqueTwitchAccountEntities.length) {
      await upsert(TwitchAccountEntity, uniqueTwitchAccountEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueTwitchAccountEntities.length} Twitch Account Entities`,
            'TwitchNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueTwitchAccountEntities.length} Twitch Account Entities`,
            'TwitchNameMatch',
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
            'TwitchNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueDestinyProfileEntities.length} Destiny Profile Entities`,
            'TwitchNameMatch',
          ),
        );
    }

    if (uniqueAccountLinkEntity.length) {
      await upsert(AccountLinkEntity, uniqueAccountLinkEntity, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueAccountLinkEntity.length} Account Link Entities`,
            'TwitchNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueAccountLinkEntity.length} Account Link Entities`,
            'TwitchNameMatch',
          ),
        );
    }
  }
}
