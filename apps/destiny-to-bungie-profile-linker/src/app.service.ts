import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { getLinkedProfiles } from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services';
import { BungieProfileEntity } from '@services/shared-services/bungie/bungie-profile.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class AppService {
  constructor(
    private readonly bungieService: BungieService,
    private readonly logger: Logger,
  ) {}

  @Interval(20000)
  handleInterval() {
    this.linkBungieAccounts();
  }

  async linkBungieAccounts() {
    const profilesToCheck = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where('profile.bnetProfileChecked is null')
      .limit(100)
      .getMany();

    const requests = [];
    const destinyProfiles: DestinyProfileEntity[] = [];
    const bungieProfiles: BungieProfileEntity[] = [];

    for (let i = 0; i < profilesToCheck.length; i++) {
      const profile = profilesToCheck[i];

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
          destinyProfiles.push(profile);
          if (linkedProfiles.Response.bnetMembership) {
            profile.bnetProfile = new BungieProfileEntity();
            bungieProfiles.push(profile.bnetProfile);
            profile.bnetProfile.membershipId =
              linkedProfiles.Response.bnetMembership.membershipId;
            profile.bnetProfile.membershipType =
              linkedProfiles.Response.bnetMembership.membershipType;

            for (let j = 0; j < linkedProfiles.Response.profiles.length; j++) {
              const linkedProfile = linkedProfiles.Response.profiles[j];
              if (linkedProfile.membershipId !== profile.membershipId) {
                const childProfile = new DestinyProfileEntity();
                destinyProfiles.push(childProfile);
                childProfile.bnetProfile = profile.bnetProfile;
                childProfile.bnetProfileChecked = new Date().toISOString();
                childProfile.displayName = linkedProfile.displayName;
                childProfile.membershipId = linkedProfile.membershipId;
                childProfile.membershipType = linkedProfile.membershipType;
              }
            }
          }
        })
        .catch(() =>
          this.logger.error(
            `Error fetching linked profiles for ${profile.membershipType}-${profile.membershipId}`,
            'DestinyToBungieProfileLinker',
          ),
        );
      requests.push(request);
    }

    await Promise.all(requests).catch(() =>
      this.logger.error(
        `Error fetching ${profilesToCheck.length} Linked Profiles`,
        'DestinyToBungieProfileLinker',
      ),
    );
    this.logger.log(
      `Fetched ${profilesToCheck.length} Linked Profiles`,
      'DestinyToBungieProfileLinker',
    );

    const uniqueBungieMembershipIds = Array.from(
      new Set(bungieProfiles.map(profile => profile.membershipId)),
    );
    const uniqueBungieProfiles = [];
    for (let i = 0; i < uniqueBungieMembershipIds.length; i++) {
      const membershipId = uniqueBungieMembershipIds[i];
      for (let j = 0; j < bungieProfiles.length; j++) {
        const profile = bungieProfiles[j];
        if (profile.membershipId === membershipId) {
          uniqueBungieProfiles.push(profile);
          break;
        }
      }
    }

    if (uniqueBungieProfiles.length) {
      await upsert(
        BungieProfileEntity,
        uniqueBungieProfiles,
        'membershipId',
      ).catch(() =>
        this.logger.error(
          `Error saving ${uniqueBungieProfiles.length} Bungie Profiles.`,
          'DestinyToBungieProfileLinker',
        ),
      );
      this.logger.log(
        `Saved ${uniqueBungieProfiles.length} Bungie Profiles.`,
        'DestinyToBungieProfileLinker',
      );
    }

    const uniqueDestinyMembershipIds = Array.from(
      new Set(destinyProfiles.map(profile => profile.membershipId)),
    );
    const uniqueDestinyProfiles = [];
    for (let i = 0; i < uniqueDestinyMembershipIds.length; i++) {
      const membershipId = uniqueDestinyMembershipIds[i];
      for (let j = 0; j < destinyProfiles.length; j++) {
        const profile = destinyProfiles[j];
        if (profile.membershipId === membershipId) {
          uniqueDestinyProfiles.push(profile);
          break;
        }
      }
    }

    if (uniqueDestinyProfiles.length) {
      await upsert(
        DestinyProfileEntity,
        uniqueDestinyProfiles,
        'membershipId',
      ).catch(() =>
        this.logger.error(
          `Error saving ${uniqueDestinyProfiles.length} Destiny Profiles.`,
          'DestinyToBungieProfileLinker',
        ),
      );
      this.logger.log(
        `Saved ${uniqueDestinyProfiles.length} Destiny Profiles.`,
        'DestinyToBungieProfileLinker',
      );
    }
  }
}
