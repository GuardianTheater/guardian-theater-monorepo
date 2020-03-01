import { Injectable, Logger } from '@nestjs/common';
import { BungieMembershipType, ServerResponse } from 'bungie-api-ts/user';
import { getRepository, getConnection } from 'typeorm';
import { PgcrEntryEntity } from '@services/shared-services/bungie/pgcr-entry.entity';
import {
  DestinyProfileComponent,
  getProfile,
  DestinyComponentType,
  DestinyHistoricalStatsPeriodGroup,
  getActivityHistory,
  getPostGameCarnageReport,
  DestinyActivityHistoryResults,
} from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services/bungie/bungie.service';
import { PgcrEntity } from '@services/shared-services/bungie/pgcr.entity';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import { Interval } from '@nestjs/schedule';
import { XboxAccountEntity } from '@services/shared-services/xbox/xbox-account.entity';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(
    private readonly bungieService: BungieService,
    private readonly logger: Logger,
  ) {}

  @Interval(60000)
  handleInterval() {
    this.harvestActivityHistory();
  }

  async harvestActivityHistory() {
    const staleVisitor = new Date(
      new Date().setDate(new Date().getDate() - 7),
    ).toISOString();

    const staleCheck = new Date(
      new Date().setHours(new Date().getHours() - 1),
    ).toISOString();

    const usersToCheck = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .where(
        'profile.pageLastVisited is not null AND profile.pageLastVisited > :staleVisitor AND (profile.activitiesLastChecked is null OR profile.activitiesLastChecked < :staleCheck)',
        {
          staleVisitor,
          staleCheck,
        },
      )
      .orderBy('profile.activitiesLastChecked')
      .limit(25)
      .getMany();

    if (usersToCheck.length) {
      await this.updateActivityHistoryForDestinyProfiles(usersToCheck);
    }
  }

  async updateActivityHistoryForDestinyProfiles(
    profiles: {
      membershipId: string;
      membershipType: BungieMembershipType;
    }[],
  ) {
    const existingActivities: PgcrEntryEntity[] = [];

    const loadAllActivities = [];

    for (let i = 0; i < profiles.length; i++) {
      const { membershipId } = profiles[i];
      const loadActivities = getRepository(PgcrEntryEntity)
        .find({
          where: {
            profile: membershipId,
          },
          relations: ['instance'],
        })
        .then(res => res.map(entry => existingActivities.push(entry)));
      loadAllActivities.push(loadActivities);
    }

    await Promise.all(loadAllActivities).catch(() =>
      this.logger.error('Error loading existing activities.'),
    );

    const skipActivities = new Set(
      existingActivities.map(activity => activity.instance.instanceId),
    );

    const loadedProfiles: DestinyProfileComponent[] = [];
    const loadAllProfiles = [];

    for (let i = 0; i < profiles.length; i++) {
      const { membershipId: destinyMembershipId, membershipType } = profiles[i];
      const loadProfile = getProfile(
        config => this.bungieService.bungieRequest(config),
        {
          components: [DestinyComponentType.Profiles],
          destinyMembershipId,
          membershipType,
        },
      )
        .then(res => loadedProfiles.push(res.Response.profile.data))
        .catch(() =>
          this.logger.error(
            `Error fetching Profile for ${membershipType}-${destinyMembershipId}`,
          ),
        );
      loadAllProfiles.push(loadProfile);
    }

    await Promise.all(loadAllProfiles).catch(() =>
      this.logger.error('Error fetching Profiles.'),
    );

    const activities: DestinyHistoricalStatsPeriodGroup[] = [];
    const activitiesPromises = [];

    const createActivitiesPromise = async (
      membershipType: BungieMembershipType,
      destinyMembershipId: string,
      characterId: string,
    ) => {
      let page = 0;
      let loadMoreActivities = true;
      const dateCutOff = new Date(
        new Date().setDate(new Date().getDate() - this.daysOfHistory),
      );

      while (loadMoreActivities) {
        await getActivityHistory(
          config => this.bungieService.bungieRequest(config),
          {
            membershipType,
            destinyMembershipId,
            characterId,
            count: 250,
            page,
          },
        )
          .then((res: ServerResponse<DestinyActivityHistoryResults>) => {
            if (!res.Response || !res.Response.activities) {
              loadMoreActivities = false;
              return;
            }
            for (let k = 0; k < res.Response.activities.length; k++) {
              const activity = res.Response.activities[k];

              if (new Date(activity.period) < dateCutOff) {
                loadMoreActivities = false;
                break;
              }

              if (skipActivities.has(activity.activityDetails.instanceId)) {
                continue;
              }

              activities.push(activity);
            }

            if (res.Response.activities.length < 250) {
              loadMoreActivities = false;
            }
            page++;
          })
          .catch(() => {
            loadMoreActivities = false;

            this.logger.error(
              `Error fetching Activity History for ${membershipType}-${destinyMembershipId}-${characterId}`,
              `ActivityHarvester`,
            );
          });
      }
    };

    for (let i = 0; i < loadedProfiles.length; i++) {
      const loadedProfile = loadedProfiles[i];
      for (let j = 0; j < loadedProfile.characterIds.length; j++) {
        const characterId = loadedProfile.characterIds[j];

        const activitiesPromise = createActivitiesPromise(
          loadedProfile.userInfo.membershipType,
          loadedProfile.userInfo.membershipId,
          characterId,
        );

        activitiesPromises.push(activitiesPromise);
      }
    }

    this.logger.log(`Fetching Activity History...`, 'ActivityHarvester');
    await Promise.all(activitiesPromises).catch(() =>
      this.logger.error(`Error fetching Activity History`, 'ActivityHarvester'),
    );
    this.logger.log(`Fetched Activity History.`, 'ActivityHarvester');

    const uniqueInstanceId = Array.from(
      new Set(activities.map(activity => activity.activityDetails.instanceId)),
    );
    const uniqueActivities = [];
    for (let i = 0; i < uniqueInstanceId.length; i++) {
      for (let j = 0; j < activities.length; j++) {
        if (activities[j].activityDetails.instanceId === uniqueInstanceId[i]) {
          uniqueActivities.push(activities[j]);
          break;
        }
      }
    }

    const pgcrPromises = [];
    const pgcrEntities: PgcrEntity[] = [];
    const pgcrEntryEntities: PgcrEntryEntity[] = [];
    const xboxAccountEntities: XboxAccountEntity[] = [];
    const destinyProfileEntities: DestinyProfileEntity[] = [];

    const createPgcrPromise = async (
      activity: DestinyHistoricalStatsPeriodGroup,
    ) => {
      await getPostGameCarnageReport(
        config => this.bungieService.bungieRequest(config),
        {
          activityId: activity.activityDetails.instanceId,
        },
      )
        .then(pgcr => {
          const pgcrEntity = new PgcrEntity();
          pgcrEntities.push(pgcrEntity);

          pgcrEntity.instanceId = pgcr.Response.activityDetails.instanceId;
          pgcrEntity.membershipType =
            pgcr.Response.activityDetails.membershipType;
          pgcrEntity.period = pgcr.Response.period;

          for (let i = 0; i < pgcr.Response.entries.length; i++) {
            const entry = pgcr.Response.entries[i];
            if (
              entry.player.destinyUserInfo.membershipId &&
              entry.player.destinyUserInfo.displayName
            ) {
              const entryEntity = new PgcrEntryEntity();
              entryEntity.instance = pgcrEntity;
              pgcrEntryEntities.push(entryEntity);

              entryEntity.profile = new DestinyProfileEntity();
              entryEntity.profile.displayName =
                entry.player.destinyUserInfo.displayName;
              entryEntity.profile.membershipId =
                entry.player.destinyUserInfo.membershipId;
              entryEntity.profile.membershipType =
                entry.player.destinyUserInfo.membershipType;

              if (
                entry.player.destinyUserInfo.membershipType ===
                BungieMembershipType.TigerXbox
              ) {
                entryEntity.profile.xboxNameMatch = new XboxAccountEntity();
                entryEntity.profile.xboxNameMatch.gamertag =
                  entry.player.destinyUserInfo.displayName;
                xboxAccountEntities.push(entryEntity.profile.xboxNameMatch);
              }

              destinyProfileEntities.push(entryEntity.profile);

              if (entry.values.team) {
                entryEntity.team = entry.values.team.basic.value;
              }

              let startTime = new Date(pgcrEntity.period);
              startTime = new Date(
                startTime.setSeconds(
                  startTime.getSeconds() +
                    entry.values.startSeconds.basic.value,
                ),
              );
              let endTime = new Date(pgcrEntity.period);
              endTime = new Date(
                endTime.setSeconds(
                  endTime.getSeconds() +
                    entry.values.startSeconds.basic.value +
                    entry.values.timePlayedSeconds.basic.value,
                ),
              );

              entryEntity.timePlayedRange = `[${startTime.toISOString()}, ${endTime.toISOString()}]`;
            }
          }
        })
        .catch(() =>
          this.logger.log(
            `Error fetching PGCR for ${activity.activityDetails.instanceId}`,
          ),
        );
    };

    for (let i = 0; i < activities.length; i++) {
      const activity = uniqueActivities[i];
      if (activity) {
        const pgcrPromise = createPgcrPromise(activity);
        pgcrPromises.push(pgcrPromise);
      }
    }

    this.logger.log(
      `Fetching ${pgcrPromises.length} PGCRs...`,
      'ActivityHarvester',
    );
    await Promise.all(pgcrPromises).catch(() =>
      this.logger.error(
        `Error fetching ${pgcrPromises.length} PGCRs.`,
        'ActivityHarvester',
      ),
    );
    this.logger.log(
      `Fetched ${pgcrPromises.length} PGCRs.`,
      'ActivityHarvester',
    );

    const uniqueXboxGamertags = Array.from(
      new Set(xboxAccountEntities.map(account => account.gamertag)),
    );
    const uniqueXboxAccounts = [];
    for (let i = 0; i < uniqueXboxGamertags.length; i++) {
      const gamertag = uniqueXboxGamertags[i];
      for (let j = 0; j < xboxAccountEntities.length; j++) {
        const xboxAccount = xboxAccountEntities[j];
        if (xboxAccount.gamertag === gamertag) {
          uniqueXboxAccounts.push(xboxAccount);
          break;
        }
      }
    }

    this.logger.log(
      `Saving ${uniqueXboxAccounts.length} Xbox Accounts...`,
      'ActivityHarvester',
    );
    if (uniqueXboxAccounts.length) {
      await upsert(
        XboxAccountEntity,
        uniqueXboxAccounts,
        'gamertag',
      ).catch(() =>
        this.logger.error(
          `Error saving ${uniqueXboxAccounts.length} Xbox Accounts.`,
          'ActivityHarvester',
        ),
      );
    }
    this.logger.log(
      `Saved ${uniqueXboxAccounts.length} Xbox Accounts.`,
      'ActivityHarvester',
    );

    const uniqueMembershipIds = Array.from(
      new Set(destinyProfileEntities.map(entity => entity.membershipId)),
    );
    const uniqueProfiles = [];
    for (let i = 0; i < uniqueMembershipIds.length; i++) {
      const membershipId = uniqueMembershipIds[i];
      for (let j = 0; j < destinyProfileEntities.length; j++) {
        const entity = destinyProfileEntities[j];
        if (entity.membershipId === membershipId) {
          uniqueProfiles.push(entity);
          break;
        }
      }
    }

    this.logger.log(
      `Saving ${uniqueProfiles.length} Profiles...`,
      'ActivityHarvester',
    );
    if (uniqueProfiles.length) {
      await upsert(
        DestinyProfileEntity,
        uniqueProfiles,
        'membershipId',
      ).catch(() =>
        this.logger.error(
          `Error saving ${uniqueProfiles.length} Profiles.`,
          'ActivityHarvester',
        ),
      );
    }
    this.logger.log(
      `Saved ${uniqueProfiles.length} Profiles.`,
      'ActivityHarvester',
    );

    const uniquePgcrInstanceIds = Array.from(
      new Set(pgcrEntities.map(entity => entity.instanceId)),
    );
    const uniquePgcrs = [];
    for (let i = 0; i < uniquePgcrInstanceIds.length; i++) {
      const instanceId = uniquePgcrInstanceIds[i];
      for (let j = 0; j < pgcrEntities.length; j++) {
        const entity = pgcrEntities[j];
        if (entity.instanceId === instanceId) {
          uniquePgcrs.push(entity);
          break;
        }
      }
    }

    this.logger.log(
      `Saving ${uniquePgcrs.length} PGCRs...`,
      'ActivityHarvester',
    );
    if (uniquePgcrs.length) {
      await upsert(PgcrEntity, uniquePgcrs, 'instanceId').catch(() =>
        this.logger.error(
          `Error saving ${uniquePgcrs.length} PGCRs.`,
          'ActivityHarvester',
        ),
      );
    }
    this.logger.log(
      `Saved ${uniquePgcrs.length} PGCRs...`,
      'ActivityHarvester',
    );

    const uniqueEntryId = Array.from(
      new Set(
        pgcrEntryEntities.map(
          entity =>
            `${entity.instance.instanceId},${entity.profile.membershipId}`,
        ),
      ),
    );
    const uniqueEntries = [];
    for (let i = 0; i < uniqueEntryId.length; i++) {
      const instanceId = uniqueEntryId[i].split(',')[0];
      const profileId = uniqueEntryId[i].split(',')[1];
      if (!instanceId || !profileId) {
        continue;
      }
      for (let j = 0; j < pgcrEntryEntities.length; j++) {
        const entity = pgcrEntryEntities[j];
        if (
          entity.instance.instanceId === instanceId &&
          entity.profile.membershipId === profileId
        ) {
          uniqueEntries.push(entity);
          break;
        }
      }
    }

    this.logger.log(
      `Saving ${uniqueEntries.length} Entries...`,
      'ActivityHarvester',
    );
    if (uniqueEntries.length) {
      await upsert(
        PgcrEntryEntity,
        uniqueEntries,
        'profile", "instance',
      ).catch(() =>
        this.logger.error(
          `Error saving ${uniqueEntries.length} Entries.`,
          'ActivityHarvester',
        ),
      );
    }
    this.logger.log(
      `Saved ${uniqueEntries.length} Entries.`,
      'ActivityHarvester',
    );

    const logTimestamps = [];

    for (let i = 0; i < loadedProfiles.length; i++) {
      const profile = loadedProfiles[i];

      const profileEntity = new DestinyProfileEntity();
      profileEntity.membershipId = profile.userInfo.membershipId;
      profileEntity.displayName = profile.userInfo.displayName;
      profileEntity.membershipType = profile.userInfo.membershipType;
      profileEntity.activitiesLastChecked = new Date().toISOString();

      const log = upsert(
        DestinyProfileEntity,
        profileEntity,
        'membershipId',
      ).catch(() =>
        this.logger.error(
          `Error logging activitiesLastChecked timestamp for ${profile.userInfo.membershipType}-${profile.userInfo.membershipId}.`,
        ),
      );
      logTimestamps.push(log);
    }

    await Promise.all(logTimestamps).catch(() =>
      this.logger.error('Error logging activitiesLastChecked timestamps.'),
    );
  }
}
