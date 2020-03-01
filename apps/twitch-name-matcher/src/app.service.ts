import { Injectable, Logger } from '@nestjs/common';
import { TwitchService } from '@services/shared-services';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { User } from '@services/shared-services/twitch/twitch.types';
import { TwitchAccountEntity } from '@services/shared-services/twitch/twitch-account.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { Interval } from '@nestjs/schedule';

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
    const profiles = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where('profile.twitchNameMatchChecked is null')
      .limit(1000)
      .getMany();

    const uniqueNames = Array.from(
      new Set(profiles.map(profile => profile.displayName)),
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

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      profile.twitchNameMatchChecked = new Date().toISOString();

      const noSpaceLowercaseName = profile.displayName
        .replace(/\s/g, '')
        .toLocaleLowerCase();

      for (let j = 0; j < results.length; j++) {
        const result = results[j];

        if (noSpaceLowercaseName === result.login) {
          profile.twitchNameMatch = new TwitchAccountEntity();
          profile.twitchNameMatch.id = result.id;
          profile.twitchNameMatch.login = result.login;
          profile.twitchNameMatch.displayName = result.display_name;

          twitchAccountEntities.push(profile.twitchNameMatch);
          break;
        }
      }
    }

    const uniqueTwitchIds = Array.from(
      new Set(twitchAccountEntities.map(account => account.id)),
    );
    const uniqueProfileIds = Array.from(
      new Set(profiles.map(profile => profile.membershipId)),
    );

    const uniqueTwitchAccountEntities = [];
    const uniqueDestinyProfileEntities = [];

    for (let i = 0; i < uniqueTwitchIds.length; i++) {
      const twitchId = uniqueTwitchIds[i];
      for (let j = 0; j < twitchAccountEntities.length; j++) {
        const account = twitchAccountEntities[j];
        if (account.id === twitchId) {
          uniqueTwitchAccountEntities.push(account);
          break;
        }
      }
    }

    for (let i = 0; i < uniqueProfileIds.length; i++) {
      const membershipId = uniqueProfileIds[i];
      for (let j = 0; j < profiles.length; j++) {
        const profile = profiles[j];
        if (profile.membershipId === membershipId) {
          uniqueDestinyProfileEntities.push(profile);
          break;
        }
      }
    }

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
  }
}
