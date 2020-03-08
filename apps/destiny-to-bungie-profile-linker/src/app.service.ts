import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { getLinkedProfiles } from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services';
import { BungieProfileEntity } from '@services/shared-services/bungie/bungie-profile.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { Interval } from '@nestjs/schedule';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly logger: Logger,
  ) {
    this.logger.setContext('DestinyToBungieProfileLinker');
  }

  @Interval(60000)
  handleInterval() {
    this.linkBungieAccounts().catch(() =>
      this.logger.error(`Error running linkBungieAccounts`),
    );
  }

  async linkBungieAccounts() {
    const profilesToCheck = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where(
        'profile.bnetProfileChecked is null AND profile.membershipType > 0',
      )
      .take(100)
      .getMany()
      .catch(() => {
        this.logger.error(`Error fetching Destiny Profiles from database.`);
        return [] as DestinyProfileEntity[];
      });

    const requests = [];
    const destinyProfiles: DestinyProfileEntity[] = [];
    const bungieProfiles: BungieProfileEntity[] = [];

    for (let i = 0; i < profilesToCheck.length; i++) {
      const loadedProfile = profilesToCheck[i];
      const profile = new DestinyProfileEntity();
      profile.membershipId = loadedProfile.membershipId;
      profile.membershipType = loadedProfile.membershipType;
      profile.displayName = loadedProfile.displayName;

      const request = getLinkedProfiles(
        config => this.bungieService.bungieRequest(config),
        {
          membershipId: profile.membershipId,
          membershipType: profile.membershipType,
          getAllMemberships: true,
        },
      )
        .then(linkedProfiles => {
          profile.bnetProfileChecked = new Date().toISOString();
          if (linkedProfiles.Response.bnetMembership) {
            const bnetProfile = new BungieProfileEntity();
            bnetProfile.membershipId =
              linkedProfiles.Response.bnetMembership.membershipId;
            bnetProfile.membershipType =
              linkedProfiles.Response.bnetMembership.membershipType;

            profile.bnetProfile = bnetProfile;
            bungieProfiles.push(bnetProfile);
          }
          destinyProfiles.push(profile);

          if (linkedProfiles.Response.bnetMembership) {
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
              }
            }
          }
        })
        .catch(() =>
          this.logger.error(
            `Error fetching linked profiles for ${profile.membershipType}-${profile.membershipId}`,
          ),
        );
      requests.push(request);
    }

    if (requests.length) {
      await Promise.all(requests)
        .then(() => {
          this.logger.log(`Fetched ${profilesToCheck.length} Linked Profiles`);
        })
        .catch(() =>
          this.logger.error(
            `Error fetching ${profilesToCheck.length} Linked Profiles`,
          ),
        );
    }

    const uniqueBungieProfiles = uniqueEntityArray(
      bungieProfiles,
      'membershipId',
    );

    if (uniqueBungieProfiles.length) {
      await upsert(BungieProfileEntity, uniqueBungieProfiles, 'membershipId')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueBungieProfiles.length} Bungie Profiles.`,
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueBungieProfiles.length} Bungie Profiles.`,
          ),
        );
    }

    const uniqueDestinyProfiles = uniqueEntityArray(
      destinyProfiles,
      'membershipId',
    );

    if (uniqueDestinyProfiles.length) {
      await upsert(DestinyProfileEntity, uniqueDestinyProfiles, 'membershipId')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueDestinyProfiles.length} Destiny Profiles.`,
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueDestinyProfiles.length} Destiny Profiles.`,
          ),
        );
    }
  }
}
