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
      const profile = new DestinyProfileEntity();
      profile.membershipId = loadedProfile.membershipId;
      profile.membershipType = loadedProfile.membershipType;
      profile.displayName = loadedProfile.displayName;

      profile.twitchNameMatchChecked = new Date().toISOString();
      destinyProfileEntities.push(profile);

      const noSpaceLowercaseName = profile.displayName
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
          accountLinkEntity.accountType = 'twitch';
          accountLinkEntity.linkType = 'nameMatch';
          accountLinkEntity.destinyProfile = profile;
          accountLinkEntity.twitchAccount = twitchAccountEntity;

          twitchAccountEntities.push(twitchAccountEntity);
          accountLinkEntities.push(accountLinkEntity);
          break;
        }
      }
    }

    const uniqueTwitchAccountEntities = uniqueEntityArray(
      twitchAccountEntities,
      'id',
    );
    const uniqueDestinyProfileEntities = uniqueEntityArray(
      destinyProfileEntities,
      'membershipId',
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

    if (accountLinkEntities.length) {
      await upsert(AccountLinkEntity, accountLinkEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${accountLinkEntities.length} Account Link Entities`,
            'TwitchNameMatch',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${accountLinkEntities.length} Account Link Entities`,
            'TwitchNameMatch',
          ),
        );
    }
  }
}
