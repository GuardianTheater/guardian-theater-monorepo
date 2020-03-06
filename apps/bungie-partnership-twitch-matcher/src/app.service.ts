import { Injectable, Logger } from '@nestjs/common';
import { BungieService, TwitchService } from '@services/shared-services';
import { Interval } from '@nestjs/schedule';
import { getConnection } from 'typeorm';
import { BungieProfileEntity } from '@services/shared-services/bungie/bungie-profile.entity';
import { getPartnerships, PartnershipType } from 'bungie-api-ts/user';
import { TwitchAccountEntity } from '@services/shared-services/twitch/twitch-account.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { AccountLinkEntity } from '@services/shared-services/helpers/account-link.entity';

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
    const loadedBungieProfileEntities = await getConnection()
      .createQueryBuilder(BungieProfileEntity, 'profile')
      .leftJoinAndSelect('profile.profiles', 'profiles')
      .where('profile.twitchPartnershipMatchChecked is null')
      .limit(100)
      .getMany();

    const requests = [];
    const namesToCheck = [];

    const bungieProfileEntities: BungieProfileEntity[] = [];

    const profileWithPartnershipName: {
      profiles: DestinyProfileEntity[];
      name: string;
    }[] = [];

    for (let i = 0; i < loadedBungieProfileEntities.length; i++) {
      const loadedProfile = loadedBungieProfileEntities[i];

      const bnetProfileEntity = new BungieProfileEntity();
      bnetProfileEntity.membershipId = loadedProfile.membershipId;
      bnetProfileEntity.membershipType = loadedProfile.membershipType;
      bnetProfileEntity.twitchPartnershipMatchChecked = new Date().toISOString();

      bungieProfileEntities.push(bnetProfileEntity);

      const request = getPartnerships(
        config => this.bungieService.bungieRequest(config),
        {
          membershipId: bnetProfileEntity.membershipId,
        },
      )
        .then(partnerships => {
          if (
            partnerships?.Response[0]?.partnerType === PartnershipType.Twitch
          ) {
            namesToCheck.push(partnerships.Response[0].name);
            profileWithPartnershipName.push({
              profiles: loadedProfile.profiles,
              name: partnerships.Response[0].name,
            });
          }
        })
        .catch(() => {
          this.logger.error(
            `Error fetching partnerships for ${bnetProfileEntity.membershipId}`,
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
    const accountLinkEntities: AccountLinkEntity[] = [];

    for (let i = 0; i < profileWithPartnershipName.length; i++) {
      const profiles = profileWithPartnershipName[i].profiles;
      const name = profileWithPartnershipName[i].name;

      for (let j = 0; j < results.length; j++) {
        const result = results[j];

        if (name === result.login) {
          const twitchAccountEntity = new TwitchAccountEntity();
          twitchAccountEntity.id = result.id;
          twitchAccountEntity.login = result.login;
          twitchAccountEntity.displayName = result.display_name;

          for (let k = 0; k < profiles.length; k++) {
            const destinyProfileEntity = profiles[k];
            const accountLinkEntity = new AccountLinkEntity();
            accountLinkEntity.destinyProfile = destinyProfileEntity;
            accountLinkEntity.accountType = 'twitch';
            accountLinkEntity.linkType = 'bungiePartner';
            accountLinkEntity.twitchAccount = twitchAccountEntity;
            accountLinkEntity.id =
              accountLinkEntity.destinyProfile.membershipId +
              accountLinkEntity.accountType +
              accountLinkEntity.linkType +
              accountLinkEntity.twitchAccount.id;

            accountLinkEntities.push(accountLinkEntity);
          }

          twitchAccountEntities.push(twitchAccountEntity);
          break;
        }
      }
    }

    const uniqueTwitchAccountEntities: TwitchAccountEntity[] = uniqueEntityArray(
      twitchAccountEntities,
      'id',
    );
    const uniqueBungieProfileEntities: BungieProfileEntity[] = uniqueEntityArray(
      bungieProfileEntities,
      'membershipId',
    );
    const uniqueAccountLinkEntities: AccountLinkEntity[] = uniqueEntityArray(
      accountLinkEntities,
      'id',
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

    if (uniqueAccountLinkEntities.length) {
      await upsert(AccountLinkEntity, uniqueAccountLinkEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueAccountLinkEntities.length} Account Link Entities`,
            'BungiePartnershipTwitchMatcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueAccountLinkEntities.length} Account Link Entities`,
            'BungiePartnershipTwitchMatcher',
          ),
        );
    }
  }
}
