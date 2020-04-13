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
import {
  FirestoreService,
  DestinyProfile,
  Entry,
  Instance,
} from '@services/shared-services/firestore/firestore.service';
import { Interval } from '@nestjs/schedule';

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

  @Interval(60000)
  handleInterval() {
    this.startHarvestQueue();
  }

  async startHarvestQueue() {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );

    const profilesToHarvest = (await this.firestoreService.getDestinyProfilesToHarvest()) as DestinyProfile[];

    const activities: DestinyHistoricalStatsPeriodGroup[] = [];
    const instances: Instance[] = [];
    const profiles: DestinyProfile[] = [];

    for (let i = 0; i < profilesToHarvest.length; i++) {
      const profile = profilesToHarvest[i];
      profiles.unshift({
        membershipId: profile?.membershipId,
        membershipType: profile?.membershipType,
        displayName: profile?.displayName,
        timestamps: {
          activitiesLastChecked: new Date(),
        },
      });

      this.logger.log(`Harvesting activites for ${profile?.displayName}`);

      const entries = await this.firestoreService.getEntriesByMembershipId(
        profile?.membershipId,
      );

      const skipActivities = new Set(entries.map(entry => entry.instanceId));

      const profileResponse: ServerResponse<DestinyProfileResponse> = await getProfile(
        config => this.bungieService.bungieRequest(config),
        {
          components: [DestinyComponentType.Profiles],
          destinyMembershipId: profile?.membershipId,
          membershipType: profile?.membershipType,
        },
      )
        .catch(() => {
          this.logger.error(
            `Error fetching Profile for ${profile?.membershipType}-${profile?.membershipId} from Bungie`,
          );
          return {} as ServerResponse<DestinyProfileResponse>;
        })
        .finally(() => {
          this.logger.log(
            `Fetched Profile for ${profile?.membershipType}-${profile?.membershipId} from Bungie`,
          );
        });

      const loadedProfile = profileResponse?.Response?.profile?.data;
      for (let j = 0; j < loadedProfile?.characterIds?.length; j++) {
        const characterId = loadedProfile?.characterIds[j];
        const history: ServerResponse<DestinyActivityHistoryResults> = await getActivityHistory(
          config => this.bungieService.bungieRequest(config),
          {
            membershipType: profile?.membershipType,
            destinyMembershipId: profile?.membershipId,
            characterId,
            count: 250,
          },
        )
          .catch(() => {
            this.logger.error(
              `Error fetching Activity History for ${profile?.membershipType}-${profile?.membershipId}-${characterId}`,
            );
            return {} as ServerResponse<DestinyActivityHistoryResults>;
          })
          .finally(() => {
            this.logger.log(
              `Fetched Activity History for ${profile?.membershipType}-${profile?.membershipId}-${characterId} from Bungie`,
            );
          });
        if (!history?.Response?.activities) {
          continue;
        }
        for (let k = 0; k < history?.Response?.activities?.length; k++) {
          const activity = history?.Response?.activities[k];
          if (new Date(activity?.period) < dateCutOff) {
            break;
          }
          if (skipActivities.has(activity.activityDetails.instanceId)) {
            continue;
          }
          activities.push(activity);
        }
      }
    }

    const uniqueInstanceId = Array.from(
      new Set(activities.map(activity => activity.activityDetails.instanceId)),
    );
    const uniqueActivities: DestinyHistoricalStatsPeriodGroup[] = [];
    for (let i = 0; i < uniqueInstanceId?.length; i++) {
      for (let j = 0; j < activities?.length; j++) {
        if (
          activities[j]?.activityDetails?.instanceId === uniqueInstanceId[i]
        ) {
          uniqueActivities.push(activities[j]);
          break;
        }
      }
    }

    const promisesOfCarnage = [];
    for (let i = 0; i < uniqueActivities.length; i++) {
      const activity = uniqueActivities[i];
      const carnageReportPromise = new Promise(async resolve => {
        const pgcr = await getPostGameCarnageReport(
          config => this.bungieService.bungieRequest(config, true),
          {
            activityId: activity?.activityDetails?.instanceId,
          },
        ).catch(() => {
          this.logger.error(
            `Error fetching PGCR for ${activity?.activityDetails?.instanceId}`,
          );
          return {} as ServerResponse<DestinyPostGameCarnageReportData>;
        });
        const instance: Instance = {
          instanceId: pgcr?.Response?.activityDetails?.instanceId,
          period: new Date(pgcr?.Response?.period),
          entries: [],
          activityHash: pgcr?.Response?.activityDetails?.referenceId + '',
          directorActivityHash:
            pgcr?.Response?.activityDetails?.directorActivityHash + '',
          membershipType: pgcr?.Response?.activityDetails?.membershipType,
        };
        instances.push(instance);

        for (let j = 0; j < pgcr?.Response?.entries?.length; j++) {
          const entry = pgcr.Response.entries[j];
          const instanceEntry: Entry = {
            instanceId: instance?.instanceId,
            membershipId: entry?.player?.destinyUserInfo?.membershipId,
            team: entry?.values?.team?.basic?.value,
            timeStart: new Date(pgcr?.Response?.period),
            timeStop: new Date(pgcr?.Response?.period),
          };
          profiles.push({
            membershipId: entry?.player?.destinyUserInfo?.membershipId,
            membershipType: entry?.player?.destinyUserInfo?.membershipType,
            displayName: entry?.player?.destinyUserInfo?.displayName,
          });
          instanceEntry.timeStart = new Date(
            instanceEntry.timeStart.setSeconds(
              instanceEntry.timeStart.getSeconds() +
                entry?.values?.startSeconds?.basic?.value,
            ),
          );
          instanceEntry.timeStop = new Date(
            instanceEntry.timeStop.setSeconds(
              instanceEntry.timeStop.getSeconds() +
                entry?.values?.startSeconds?.basic?.value +
                entry?.values?.timePlayedSeconds?.basic?.value,
            ),
          );
          instance.entries.push(instanceEntry);
        }
        resolve();
      });
      promisesOfCarnage.push(carnageReportPromise);
    }
    await Promise.all(promisesOfCarnage)
      .catch(() =>
        this.logger.error(
          `Error fetching ${promisesOfCarnage.length} PGCRs from Bungie`,
        ),
      )
      .finally(() =>
        this.logger.log(
          `Fetched ${promisesOfCarnage.length} PGCRs from Bungie`,
        ),
      );

    const uniqueMembershipIds = Array.from(
      new Set(profiles.map(prof => prof.membershipId)),
    );
    const uniqueProfiles: DestinyProfile[] = [];
    for (let i = 0; i < uniqueMembershipIds?.length; i++) {
      for (let j = 0; j < profiles?.length; j++) {
        if (profiles[j]?.membershipId === uniqueMembershipIds[i]) {
          uniqueProfiles.push(profiles[j]);
          break;
        }
      }
    }

    this.firestoreService.updateDestinyProfiles(uniqueProfiles);
    this.firestoreService.updateInstances(instances);
  }
}
