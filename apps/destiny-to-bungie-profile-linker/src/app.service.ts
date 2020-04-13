import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import {
  getLinkedProfiles,
  DestinyLinkedProfilesResponse,
  ServerResponse,
} from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services';
import { BungieProfileEntity } from '@services/shared-services/bungie/bungie-profile.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';
import { AccountLinkEntity } from '@services/shared-services/helpers/account-link.entity';
import { MixerAccountEntity } from '@services/shared-services/mixer/mixer-account.entity';
import { TwitchAccountEntity } from '@services/shared-services/twitch/twitch-account.entity';
import { XboxAccountEntity } from '@services/shared-services/xbox/xbox-account.entity';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly logger: Logger,
  ) {
    this.logger.setContext('DestinyToBungieProfileLinker');
  }

  async linkBungieAccounts() {
    this.logger.log(`Loading profiles to check...`);
    const profilesToCheck = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .leftJoinAndSelect('profile.accountLinks', 'accountLinks')
      .orderBy('profile.bnetProfileChecked', 'ASC', 'NULLS FIRST')
      .limit(100)
      .getMany();
    this.logger.log(`Profiles loaded.`);

    const requests = [];
    const destinyProfiles: DestinyProfileEntity[] = [];
    const bungieProfiles: BungieProfileEntity[] = [];
    const accountLinks: AccountLinkEntity[] = [];

    for (let i = 0; i < profilesToCheck.length; i++) {
      const loadedProfile = profilesToCheck[i];
      const profile = new DestinyProfileEntity();
      profile.membershipId = loadedProfile.membershipId;
      profile.membershipType = loadedProfile.membershipType;
      profile.displayName = loadedProfile.displayName;

      const request = new Promise(async resolve => {
        const linkedProfiles = await getLinkedProfiles(
          config => this.bungieService.bungieRequest(config),
          {
            membershipId: profile.membershipId,
            membershipType: profile.membershipType,
            getAllMemberships: true,
          },
        ).catch(() => {
          this.logger.error(
            `Error fetching linked profiles for ${profile.membershipType}-${profile.membershipId}`,
          );

          return {} as ServerResponse<DestinyLinkedProfilesResponse>;
        });
        profile.bnetProfileChecked = new Date().toISOString();

        if (linkedProfiles.Response?.bnetMembership) {
          const bnetProfile = new BungieProfileEntity();
          bnetProfile.membershipId =
            linkedProfiles.Response.bnetMembership.membershipId;
          bnetProfile.membershipType =
            linkedProfiles.Response.bnetMembership.membershipType;

          profile.bnetProfile = bnetProfile;
          bungieProfiles.push(bnetProfile);

          const linkedProfileEntities = [];

          for (let j = 0; j < linkedProfiles.Response.profiles.length; j++) {
            const linkedProfile = linkedProfiles.Response.profiles[j];
            if (linkedProfile.membershipId !== profile.membershipId) {
              const childProfile = new DestinyProfileEntity();
              childProfile.bnetProfile = profile.bnetProfile;
              childProfile.bnetProfileChecked = new Date().toISOString();
              childProfile.displayName = linkedProfile.displayName;
              childProfile.membershipId = linkedProfile.membershipId;
              childProfile.membershipType = linkedProfile.membershipType;
              destinyProfiles.push(childProfile);
              linkedProfileEntities.push(childProfile);
            }
          }

          const existingProfiles = await getConnection()
            .createQueryBuilder(BungieProfileEntity, 'bnetProfile')
            .leftJoinAndSelect('bnetProfile.profiles', 'profiles')
            .leftJoinAndSelect('profiles.accountLinks', 'accountLinks')
            .where('bnetProfile.membershipId = :membershipId', {
              membershipId: linkedProfiles.Response.bnetMembership.membershipId,
            })
            .getOne()
            .catch(() => {
              this.logger.error(`Error fetching Bungie Profile from database`);
              return {} as BungieProfileEntity;
            });

          const existingLinks: AccountLinkEntity[] = [];

          for (let j = 0; j < loadedProfile.accountLinks?.length; j++) {
            const existingLink = loadedProfile.accountLinks[j];
            existingLinks.push(existingLink);
          }

          for (let j = 0; j < existingProfiles?.profiles?.length; j++) {
            const existingProfile = existingProfiles.profiles[j];
            for (let k = 0; k < existingProfile.accountLinks?.length; k++) {
              const existingLink = existingProfile.accountLinks[k];
              existingLinks.push(existingLink);
            }
          }

          for (let j = 0; j < linkedProfileEntities?.length; j++) {
            const destinyProfile = linkedProfileEntities[j];
            for (let k = 0; k < existingLinks?.length; k++) {
              const existingLink = existingLinks[k];
              const accountLink = new AccountLinkEntity();
              accountLink.accountType = existingLink.accountType;
              accountLink.destinyProfile = destinyProfile;
              accountLink.linkType = existingLink.linkType;
              if (accountLink.accountType === 'mixer') {
                accountLink.mixerAccount = new MixerAccountEntity();
                accountLink.mixerAccount.id = existingLink.mixerAccountId;
                accountLink.id =
                  accountLink.destinyProfile.membershipId +
                  accountLink.accountType +
                  accountLink.linkType +
                  existingLink.mixerAccountId;
              }
              if (accountLink.accountType === 'twitch') {
                accountLink.twitchAccount = new TwitchAccountEntity();
                accountLink.twitchAccount.id = existingLink.twitchAccountId;
                accountLink.id =
                  accountLink.destinyProfile.membershipId +
                  accountLink.accountType +
                  accountLink.linkType +
                  existingLink.twitchAccountId;
              }
              if (accountLink.accountType === 'xbox') {
                accountLink.xboxAccount = new XboxAccountEntity();
                accountLink.xboxAccount.gamertag = existingLink.xboxAccountId;
                accountLink.id =
                  accountLink.destinyProfile.membershipId +
                  accountLink.accountType +
                  accountLink.linkType +
                  existingLink.xboxAccountId;
              }
              accountLinks.push(accountLink);
            }
          }
        }
        destinyProfiles.push(profile);

        resolve();
      });
      requests.push(request);
    }

    if (requests.length) {
      await Promise.all(requests)
        .catch(() =>
          this.logger.error(
            `Error fetching ${profilesToCheck.length} Linked Profiles`,
          ),
        )
        .finally(() => {
          this.logger.log(`Fetched ${profilesToCheck.length} Linked Profiles`);
        });
    }

    const uniqueBungieProfiles = uniqueEntityArray(
      bungieProfiles,
      'membershipId',
    );

    if (uniqueBungieProfiles.length) {
      await upsert(BungieProfileEntity, uniqueBungieProfiles, 'membershipId')
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueBungieProfiles.length} Bungie Profiles.`,
          ),
        )
        .finally(() =>
          this.logger.log(
            `Saved ${uniqueBungieProfiles.length} Bungie Profiles.`,
          ),
        );
    }

    const uniqueDestinyProfiles = uniqueEntityArray(
      destinyProfiles,
      'membershipId',
    );

    if (uniqueDestinyProfiles.length) {
      await upsert(DestinyProfileEntity, uniqueDestinyProfiles, 'membershipId')
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueDestinyProfiles.length} Destiny Profiles.`,
          ),
        )
        .finally(() =>
          this.logger.log(
            `Saved ${uniqueDestinyProfiles.length} Destiny Profiles.`,
          ),
        );
    }

    const uniqueAccountLinks = uniqueEntityArray(accountLinks, 'id');

    if (uniqueAccountLinks.length) {
      await upsert(AccountLinkEntity, uniqueAccountLinks, 'id')
        .catch(e => this.logger.error(e))
        .finally(() =>
          this.logger.log(`Saved ${uniqueAccountLinks.length} Account Links.`),
        );
    }
  }
}
