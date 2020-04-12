import { Injectable, Logger } from '@nestjs/common';
import { ServerResponse } from 'bungie-api-ts/user';
import {
  getProfile,
  DestinyComponentType,
  DestinyHistoricalStatsPeriodGroup,
  getActivityHistory,
  getPostGameCarnageReport,
  DestinyActivityHistoryResults,
  DestinyProfileResponse,
  DestinyPostGameCarnageReportData,
} from 'bungie-api-ts/destiny2';
import { BungieService } from '@services/shared-services/bungie/bungie.service';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';
import {
  FirestoreService,
  DestinyProfile,
  Entry,
  Instance,
} from '@services/shared-services/firestore/firestore.service';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(
    private readonly bungieService: BungieService,
    private readonly firestoreService: FirestoreService,
    public readonly logger: Logger,
  ) {
    this.logger.setContext('ActivityHarvester');
  }

  async startHarvestQueue() {
    const profilesToHarvest = (await this.firestoreService.getDestinyProfilesToHarvest()) as DestinyProfile[];

    console.log(profilesToHarvest);

    for (let i = 0; i < profilesToHarvest.length; i++) {
      const profile = profilesToHarvest[i];
      this.logger.log(`Harvesting activites for ${profile.displayName}`);
      await this.harvestDestinyProfileActivityHistory(profile)
        .catch(() =>
          this.logger.error(
            `Error harvesting activities for ${profile.displayName}`,
          ),
        )
        .finally(() =>
          this.logger.log(`Harvested activities for ${profile.displayName}`),
        );
    }
  }

  async harvestDestinyProfileActivityHistory(profile: DestinyProfile) {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );
    //   const existingEntries: PgcrEntryEntity[] = await getConnection()
    //     .createQueryBuilder(PgcrEntryEntity, 'entry')
    //     .leftJoinAndSelect('entry.instance', 'instance')
    //     .where('entry.profile = :membershipId', {
    //       membershipId: profile.membershipId,
    //     })
    //     .getMany();

    // const existingInstances: Instance[] = this.firestoreService.getInstancesForMembershipId(profile.membershipId)

    //   const skipActivities = new Set(
    //     existingEntries.map(entry => entry?.instance?.instanceId),
    //   );
    const profileResponse: ServerResponse<DestinyProfileResponse> = await getProfile(
      config => this.bungieService.bungieRequest(config),
      {
        components: [DestinyComponentType.Profiles],
        destinyMembershipId: profile.membershipId,
        membershipType: profile.membershipType,
      },
    )
      .catch(() => {
        this.logger.error(
          `Error fetching Profile for ${profile.membershipType}-${profile.membershipId} from Bungie`,
        );
        return {} as ServerResponse<DestinyProfileResponse>;
      })
      .finally(() => {
        this.logger.log(
          `Fetched Profile for ${profile.membershipType}-${profile.membershipId} from Bungie`,
        );
      });
    const loadedProfile = profileResponse.Response?.profile?.data;
    //   const activities: DestinyHistoricalStatsPeriodGroup[] = [];
    //   if (loadedProfile?.characterIds?.length) {
    //     for (let i = 0; i < loadedProfile.characterIds?.length; i++) {
    //       const characterId = loadedProfile.characterIds[i];
    //       const history: ServerResponse<DestinyActivityHistoryResults> = await getActivityHistory(
    //         config => this.bungieService.bungieRequest(config),
    //         {
    //           membershipType: profile.membershipType,
    //           destinyMembershipId: profile.membershipId,
    //           characterId,
    //           count: 250,
    //         },
    //       )
    //         .catch(() => {
    //           this.logger.error(
    //             `Error fetching Activity History for ${profile.membershipType}-${profile.membershipId}-${characterId}`,
    //           );
    //           return {} as ServerResponse<DestinyActivityHistoryResults>;
    //         })
    //         .finally(() => {
    //           this.logger.log(
    //             `Fetched Activity History for ${profile.membershipType}-${profile.membershipId}-${characterId} from Bungie`,
    //           );
    //         });
    //       if (!history.Response || !history.Response.activities) {
    //         continue;
    //       }
    //       for (let k = 0; k < history.Response.activities.length; k++) {
    //         const activity = history.Response.activities[k];
    //         if (new Date(activity.period) < dateCutOff) {
    //           break;
    //         }
    //         if (skipActivities.has(activity.activityDetails.instanceId)) {
    //           continue;
    //         }
    //         activities.push(activity);
    //       }
    //     }
    //   }
    //   const uniqueInstanceId = Array.from(
    //     new Set(activities.map(activity => activity.activityDetails.instanceId)),
    //   );
    //   const uniqueActivities: DestinyHistoricalStatsPeriodGroup[] = [];
    //   for (let i = 0; i < uniqueInstanceId.length; i++) {
    //     for (let j = 0; j < activities.length; j++) {
    //       if (activities[j].activityDetails.instanceId === uniqueInstanceId[i]) {
    //         uniqueActivities.push(activities[j]);
    //         break;
    //       }
    //     }
    //   }
    //   const pgcrEntities: PgcrEntity[] = [];
    //   const pgcrEntryEntities: PgcrEntryEntity[] = [];
    //   const destinyProfileEntities: DestinyProfileEntity[] = [];
    //   const existingPgcrs: PgcrEntity[] = await getConnection()
    //     .createQueryBuilder(PgcrEntity, 'pgcr')
    //     .where('pgcr.instanceId = ANY (:instanceIds)', {
    //       instanceIds: uniqueInstanceId,
    //     })
    //     .getMany();
    //   const existingPgcrSet = new Set(existingPgcrs.map(pgcr => pgcr.instanceId));
    //   const promisesOfCarnage = [];
    //   for (let i = 0; i < uniqueActivities.length; i++) {
    //     const activity = uniqueActivities[i];
    //     if (existingPgcrSet.has(activity.activityDetails.instanceId)) {
    //       continue;
    //     }
    //     const carnageReportPromise = new Promise(async resolve => {
    //       const pgcr = await getPostGameCarnageReport(
    //         config => this.bungieService.bungieRequest(config, true),
    //         {
    //           activityId: activity.activityDetails.instanceId,
    //         },
    //       ).catch(() => {
    //         this.logger.error(
    //           `Error fetching PGCR for ${activity.activityDetails.instanceId}`,
    //         );
    //         return {} as ServerResponse<DestinyPostGameCarnageReportData>;
    //       });
    //       if (pgcr.Response) {
    //         const pgcrEntity = new PgcrEntity();
    //         pgcrEntity.instanceId = pgcr.Response.activityDetails.instanceId;
    //         pgcrEntity.activityHash =
    //           pgcr.Response.activityDetails.referenceId + '';
    //         pgcrEntity.directorActivityHash =
    //           pgcr.Response.activityDetails.directorActivityHash + '';
    //         pgcrEntity.membershipType =
    //           pgcr.Response.activityDetails.membershipType;
    //         pgcrEntity.period = pgcr.Response.period;
    //         pgcrEntities.push(pgcrEntity);
    //         for (let j = 0; j < pgcr.Response.entries.length; j++) {
    //           const entry = pgcr.Response.entries[j];
    //           if (
    //             entry.player.destinyUserInfo.membershipId &&
    //             entry.player.destinyUserInfo.displayName
    //           ) {
    //             const pgcrEntryEntity = new PgcrEntryEntity();
    //             pgcrEntryEntity.instance = pgcrEntity;
    //             const destinyProfileEntity = new DestinyProfileEntity();
    //             destinyProfileEntity.displayName =
    //               entry.player.destinyUserInfo.displayName;
    //             destinyProfileEntity.membershipId =
    //               entry.player.destinyUserInfo.membershipId;
    //             destinyProfileEntity.membershipType =
    //               entry.player.destinyUserInfo.membershipType;
    //             pgcrEntryEntity.profile = destinyProfileEntity;
    //             destinyProfileEntities.push(destinyProfileEntity);
    //             if (entry.values.team) {
    //               pgcrEntryEntity.team = entry.values.team.basic.value;
    //             }
    //             let startTime = new Date(pgcrEntity.period);
    //             startTime = new Date(
    //               startTime.setSeconds(
    //                 startTime.getSeconds() +
    //                   entry.values.startSeconds.basic.value,
    //               ),
    //             );
    //             let endTime = new Date(pgcrEntity.period);
    //             endTime = new Date(
    //               endTime.setSeconds(
    //                 endTime.getSeconds() +
    //                   entry.values.startSeconds.basic.value +
    //                   entry.values.timePlayedSeconds.basic.value,
    //               ),
    //             );
    //             pgcrEntryEntity.timePlayedRange = `[${startTime.toISOString()}, ${endTime.toISOString()}]`;
    //             pgcrEntryEntities.push(pgcrEntryEntity);
    //           }
    //         }
    //       }
    //       resolve();
    //     });
    //     promisesOfCarnage.push(carnageReportPromise);
    //   }
    //   await Promise.all(promisesOfCarnage)
    //     .catch(() =>
    //       this.logger.error(
    //         `Error fetching ${promisesOfCarnage.length} PGCRs from Bungie`,
    //       ),
    //     )
    //     .finally(() =>
    //       this.logger.log(
    //         `Fetched ${promisesOfCarnage.length} PGCRs from Bungie`,
    //       ),
    //     );
    //   const uniqueProfiles = uniqueEntityArray(
    //     destinyProfileEntities,
    //     'membershipId',
    //   );
    //   if (uniqueProfiles.length) {
    //     await upsert(
    //       DestinyProfileEntity,
    //       uniqueProfiles,
    //       'membershipId',
    //     ).finally(() =>
    //       this.logger.log(`Saved ${uniqueProfiles.length} Profiles.`),
    //     );
    //   }
    //   const uniquePgcrs = uniqueEntityArray(pgcrEntities, 'instanceId');
    //   if (uniquePgcrs.length) {
    //     await upsert(PgcrEntity, uniquePgcrs, 'instanceId').finally(() =>
    //       this.logger.log(`Saved ${uniquePgcrs.length} PGCRs.`),
    //     );
    //   }
    //   const uniqueEntryId = Array.from(
    //     new Set(
    //       pgcrEntryEntities.map(
    //         entity =>
    //           `${entity.instance.instanceId},${entity.profile.membershipId}`,
    //       ),
    //     ),
    //   );
    //   const uniqueEntries = [];
    //   for (let i = 0; i < uniqueEntryId.length; i++) {
    //     const instanceId = uniqueEntryId[i].split(',')[0];
    //     const profileId = uniqueEntryId[i].split(',')[1];
    //     if (!instanceId || !profileId) {
    //       continue;
    //     }
    //     for (let j = 0; j < pgcrEntryEntities.length; j++) {
    //       const entity = pgcrEntryEntities[j];
    //       if (
    //         entity.instance.instanceId === instanceId &&
    //         entity.profile.membershipId === profileId
    //       ) {
    //         uniqueEntries.push(entity);
    //         break;
    //       }
    //     }
    //   }
    //   if (uniqueEntries.length) {
    //     await upsert(
    //       PgcrEntryEntity,
    //       uniqueEntries,
    //       'profile", "instance',
    //     ).finally(() =>
    //       this.logger.log(`Saved ${uniqueEntries.length} Entries.`),
    //     );
    //   }
    //   const profileEntity = new DestinyProfileEntity();
    //   if (loadedProfile) {
    //     profileEntity.membershipId = loadedProfile.userInfo.membershipId;
    //     profileEntity.displayName = loadedProfile.userInfo.displayName;
    //     profileEntity.membershipType = loadedProfile.userInfo.membershipType;
    //     profileEntity.activitiesLastChecked = new Date().toISOString();
    //   } else {
    //     profileEntity.membershipId = profile.membershipId;
    //     profileEntity.displayName = profile.displayName;
    //     profileEntity.membershipType = profile.membershipType;
    //     profileEntity.activitiesLastChecked = new Date().toISOString();
    //   }
    //   await upsert(
    //     DestinyProfileEntity,
    //     profileEntity,
    //     'membershipId',
    //   ).finally(() =>
    //     this.logger.log(
    //       `Logged activitiesLastChecked timestamp for ${loadedProfile.userInfo.membershipType}-${loadedProfile.userInfo.membershipId}.`,
    //     ),
    //   );
  }
}
