import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import { XboxAccountEntity } from '@services/shared-services/xbox/xbox-account.entity';
import { Interval } from '@nestjs/schedule';
import { XboxService } from '@services/shared-services';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';
import { AccountLinkEntity } from '@services/shared-services/helpers/account-link.entity';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(
    private readonly xboxService: XboxService,
    private readonly logger: Logger,
  ) {
    this.logger.setContext('XboxAccountMatcher');
  }

  @Interval(60000)
  handleInterval() {
    this.matchXboxAccounts().catch(() =>
      this.logger.error(`Error running matchXboxAccounts`),
    );
  }

  async matchXboxAccounts() {
    const loadedProfiles = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .leftJoinAndSelect('profile.accountLinks', 'accountLinks')
      .leftJoinAndSelect('accountLinks.xboxAccount', 'xboxAccount')
      .where('profile.membershipType = 1')
      .orderBy('profile.xboxNameMatchChecked', 'ASC', 'NULLS FIRST')
      .take(1000)
      .getMany()
      .catch(() => {
        this.logger.error(`Error retrieving Destiny Profiles from database`);
        return [] as DestinyProfileEntity[];
      });

    const destinyProfileEntities: DestinyProfileEntity[] = [];
    const xboxAccountEntities: XboxAccountEntity[] = [];
    const accountLinkEntities: AccountLinkEntity[] = [];

    for (let i = 0; i < loadedProfiles?.length; i++) {
      const loadedProfile = loadedProfiles[i];
      const destinyProfileEntity = new DestinyProfileEntity();
      destinyProfileEntity.membershipId = loadedProfile.membershipId;
      destinyProfileEntity.membershipType = loadedProfile.membershipType;
      destinyProfileEntity.displayName = loadedProfile.displayName;
      destinyProfileEntity.xboxNameMatchChecked = new Date().toISOString();

      destinyProfileEntities.push(destinyProfileEntity);

      const xboxAccountEntity = new XboxAccountEntity();
      xboxAccountEntity.gamertag = destinyProfileEntity.displayName;

      xboxAccountEntities.push(xboxAccountEntity);

      const accountLinkEntity = new AccountLinkEntity();
      accountLinkEntity.destinyProfile = destinyProfileEntity;
      accountLinkEntity.accountType = 'xbox';
      accountLinkEntity.linkType = 'nameMatch';
      accountLinkEntity.xboxAccount = xboxAccountEntity;
      accountLinkEntity.id =
        accountLinkEntity.destinyProfile.membershipId +
        accountLinkEntity.accountType +
        accountLinkEntity.linkType +
        accountLinkEntity.xboxAccount.gamertag;

      accountLinkEntities.push(accountLinkEntity);
    }

    const uniqueXboxAccountEntities = uniqueEntityArray(
      xboxAccountEntities,
      'gamertag',
    );

    const uniqueDestinyProfileEntities = uniqueEntityArray(
      destinyProfileEntities,
      'membershipId',
    );

    const uniqueAccountLinkEntities = uniqueEntityArray(
      accountLinkEntities,
      'id',
    );

    if (uniqueXboxAccountEntities.length) {
      await upsert(XboxAccountEntity, uniqueXboxAccountEntities, 'gamertag')
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueXboxAccountEntities.length} Xbox Accounts.`,
          ),
        )
        .finally(() =>
          this.logger.log(
            `Saved ${uniqueXboxAccountEntities.length} Xbox Accounts.`,
          ),
        );
    }

    if (uniqueDestinyProfileEntities.length) {
      await upsert(
        DestinyProfileEntity,
        uniqueDestinyProfileEntities,
        'membershipId',
      )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueDestinyProfileEntities.length} Destiny Profiles.`,
          ),
        )
        .finally(() =>
          this.logger.log(
            `Saved ${uniqueDestinyProfileEntities.length} Destiny Profiles.`,
          ),
        );
    }

    if (uniqueAccountLinkEntities.length) {
      await upsert(AccountLinkEntity, uniqueAccountLinkEntities, 'id')
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueAccountLinkEntities.length} Account Links.`,
          ),
        )
        .finally(() =>
          this.logger.log(
            `Saved ${uniqueAccountLinkEntities.length} Account Links.`,
          ),
        );
    }
  }
}
