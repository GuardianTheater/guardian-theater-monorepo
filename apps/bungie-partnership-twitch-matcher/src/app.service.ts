import { Injectable, Logger } from '@nestjs/common';
import { BungieService, TwitchService } from '@services/shared-services';
import { Interval } from '@nestjs/schedule';
import { getConnection } from 'typeorm';
import { BungieProfileEntity } from '@services/shared-services/bungie/bungie-profile.entity';
import { getPartnerships, PartnershipType } from 'bungie-api-ts/user';
import { TwitchAccountEntity } from '@services/shared-services/twitch/twitch-account.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly twitchService: TwitchService,
    private readonly logger: Logger,
  ) {}

  @Interval(60000)
  handleInterval() {
    this.checkBungiePartnershipsForTwitch();
  }

  async checkBungiePartnershipsForTwitch() {
    const profilesToCheck = await getConnection()
      .createQueryBuilder(BungieProfileEntity, 'profile')
      .leftJoinAndSelect('profile.profiles', 'profiles')
      .where('profile.twitchPartnershipMatchChecked is null')
      .limit(100)
      .getMany();

    const requests = [];
    const namesToCheck = [];
    const profiles: BungieProfileEntity[] = [];
    const profileWithPartnershipName: {
      profile: BungieProfileEntity;
      name: string;
    }[] = [];

    for (let i = 0; i < profilesToCheck.length; i++) {
      const profile = profilesToCheck[i];
      profiles.push(profile);

      const request = getPartnerships(
        config => this.bungieService.bungieRequest(config),
        {
          membershipId: profile.membershipId,
        },
      )
        .then(partnerships => {
          if (
            partnerships?.Response[0]?.partnerType === PartnershipType.Twitch
          ) {
            namesToCheck.push(partnerships.Response[0].name);
            profileWithPartnershipName.push({
              profile,
              name: partnerships.Response[0].name,
            });
          }
        })
        .catch(() => {
          this.logger.error(
            `Error fetching partnerships for ${profile.membershipId}`,
            'BungiePartnershipTwitchMatcher',
          );
        });

      requests.push(request);
    }

    if (requests.length) {
      await Promise.all(requests).then(() =>
        this.logger.log(
          `Fetched ${requests.length} partnerships`,
          'BungiePartnershipTwitchMatcher',
        ),
      );
    }

    const results = [];

    if (namesToCheck.length) {
      await this.twitchService
        .getUsersFromLogin(namesToCheck)
        .then(res => {
          if (res?.data?.data) {
            for (let j = 0; j < res.data.data.length; j++) {
              results.push(res.data.data[j]);
            }
          }
          this.logger.log(
            `Fetched ${results.length} Twitch Accounts`,
            'BungiePartnershipTwitchMatcher',
          );
        })
        .catch(() =>
          this.logger.error(
            `Error fetching ${namesToCheck.length} Twitch accounts`,
            'BungiePartnershipTwitchMatcher',
          ),
        );
    }

    const twitchAccountEntities: TwitchAccountEntity[] = [];
    for (let i = 0; i < profileWithPartnershipName.length; i++) {
      const profile = profileWithPartnershipName[i].profile;
      const name = profileWithPartnershipName[i].name;
      profile.twitchPartnershipMatchChecked = new Date().toISOString();

      for (let j = 0; j < results.length; j++) {
        const result = results[j];

        if (name === result.login) {
          profile.twitchPartnershipMatch = new TwitchAccountEntity();
          profile.twitchPartnershipMatch.id = result.id;
          profile.twitchPartnershipMatch.login = result.login;
          profile.twitchPartnershipMatch.displayName = result.display_name;

          twitchAccountEntities.push(profile.twitchPartnershipMatch);
          break;
        }
      }
      profiles.unshift(profile);
    }

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      delete profile.profiles;
    }

    const uniqueTwitchAccountEntities = uniqueEntityArray(
      twitchAccountEntities,
      'id',
    );
    const uniqueBungieProfileEntities = uniqueEntityArray(
      profiles,
      'membershipId',
    );

    if (uniqueTwitchAccountEntities.length) {
      await upsert(TwitchAccountEntity, uniqueTwitchAccountEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueTwitchAccountEntities.length} Twitch Account Entities`,
            'BungiePartnershipTwitchMatcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueTwitchAccountEntities.length} Twitch Account Entities`,
            'BungiePartnershipTwitchMatcher',
          ),
        );
    }

    if (uniqueBungieProfileEntities.length) {
      await upsert(
        BungieProfileEntity,
        uniqueBungieProfileEntities,
        'membershipId',
      )
        .then(() =>
          this.logger.log(
            `Saved ${uniqueBungieProfileEntities.length} Bungie Profile Entities`,
            'BungiePartnershipTwitchMatcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueBungieProfileEntities.length} Bungie Profile Entities`,
            'BungiePartnershipTwitchMatcher',
          ),
        );
    }
  }
}
