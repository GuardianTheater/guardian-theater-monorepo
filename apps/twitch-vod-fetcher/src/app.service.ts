import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TwitchService } from '@services/shared-services';
import { TwitchAccountEntity } from '@services/shared-services/twitch/twitch-account.entity';
import { getConnection } from 'typeorm';
import { TwitchVideoEntity } from '@services/shared-services/twitch/twitch-video.entity';
import { convertTwitchDurationToSeconds } from '@services/shared-services/helpers/twitch-duration-conversion';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';
import upsert from '@services/shared-services/helpers/typeorm-upsert';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(
    private readonly logger: Logger,
    private readonly twitchService: TwitchService,
  ) {}

  @Interval(60000)
  handleInterval() {
    this.fetchTwitchVods();
  }

  async fetchTwitchVods() {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );

    const staleCheck = new Date(
      new Date().setHours(new Date().getHours() - 1),
    ).toISOString();

    const accountsToCheck = await getConnection()
      .createQueryBuilder(TwitchAccountEntity, 'account')
      .orderBy('account.lastRecordingCheck')
      .where(
        'account.lastRecordingCheck < :staleCheck OR account.lastRecordingCheck is null',
        {
          staleCheck,
        },
      )
      .limit(100)
      .getMany();

    // TODO: Ignore channels attached to inactive Destiny Profiles

    const accountsToSave: TwitchAccountEntity[] = [];
    const vodsToSave: TwitchVideoEntity[] = [];
    const vodsToDelete: TwitchVideoEntity[] = [];

    const vodPromises: Promise<any>[] = [];

    for (let i = 0; i < accountsToCheck.length; i++) {
      const loadedAccount = accountsToCheck[i];
      const account = new TwitchAccountEntity();
      account.id = loadedAccount.id;
      account.displayName = loadedAccount.displayName;
      account.login = loadedAccount.login;

      account.lastRecordingCheck = new Date().toISOString();
      accountsToSave.push(account);

      const promise = this.twitchService
        .getVideos(account.id)
        .then(res => {
          const vods = res?.data?.data;
          const toSave: TwitchVideoEntity[] = [];
          for (let j = 0; j < vods.length; j++) {
            const vod = vods[j];
            if (new Date(vod.created_at) < dateCutOff) {
              break;
            }
            const vodEntity = new TwitchVideoEntity();
            vodEntity.id = vod.id;
            vodEntity.user = account;
            vodEntity.thumbnailUrl = vod.thumbnail_url;
            vodEntity.title = vod.title;
            vodEntity.url = vod.url;
            vodEntity.durationRange = `[${vod.created_at},${new Date(
              new Date(vod.created_at).setSeconds(
                new Date(vod.created_at).getSeconds() +
                  convertTwitchDurationToSeconds(vod.duration),
              ),
            ).toISOString()}]`;
            toSave.push(vodEntity);
            vodsToSave.push(vodEntity);
          }
          return toSave;
        })
        .then(async toSave => {
          const existingVods = await getConnection()
            .createQueryBuilder(TwitchVideoEntity, 'vods')
            .where('vods.user = :accountId', { accountId: account.id })
            .getMany()
            .catch(() => {
              this.logger.log(
                `Error fetching exisitng vods from database.`,
                'TwitchVodFetcher',
              );
              return [] as TwitchVideoEntity[];
            });
          if (existingVods.length) {
            const newVodIds = new Set(toSave.map(vod => vod.id));
            for (let j = 0; j < existingVods.length; j++) {
              const existingVod = existingVods[j];
              if (newVodIds.has(existingVod.id)) {
                continue;
              }
              vodsToDelete.push(existingVod);
            }
          }
        })
        .catch(() =>
          this.logger.error(
            `Error fetching Twitch Vods for ${account.id}`,
            'TwitchVodFetcher',
          ),
        );
      vodPromises.push(promise);
    }

    if (vodPromises.length) {
      this.logger.log(
        `Fetching Twitch Vods for ${vodPromises.length} channels.`,
        'TwitchVodFetcher',
      );
      await Promise.all(vodPromises);
      this.logger.log(
        `Fetched Twitch Vod for ${vodPromises.length} channels.`,
        'TwitchVodFetcher',
      );
    }

    const uniqueAccountEntities = uniqueEntityArray(accountsToSave, 'id');
    const uniqueVodEntities = uniqueEntityArray(vodsToSave, 'id');
    const uniqueVodEntitiesToDelete: TwitchVideoEntity[] = uniqueEntityArray(
      vodsToDelete,
      'id',
    );

    if (uniqueAccountEntities.length) {
      await upsert(TwitchAccountEntity, uniqueAccountEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueAccountEntities.length} Twitch Accounts.`,
            'TwitchVodFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueAccountEntities.length} Twitch Accounts.`,
            'TwitchVodFetcher',
          ),
        );
    }

    if (uniqueVodEntities.length) {
      await upsert(TwitchVideoEntity, uniqueVodEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueVodEntities.length} VODs.`,
            'TwitchVodFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueVodEntities.length} VODs.`,
            'TwitchVodFetcher',
          ),
        );
    }

    if (uniqueVodEntitiesToDelete.length) {
      const deletes = [];
      for (let i = 0; i < uniqueVodEntitiesToDelete.length; i++) {
        const entity = uniqueVodEntitiesToDelete[i];
        const deleteJob = getConnection()
          .createQueryBuilder()
          .delete()
          .from(TwitchVideoEntity)
          .where('id = :id', { id: entity.id })
          .execute();
        deletes.push(deleteJob);
      }
      await Promise.all(deletes)
        .then(() =>
          this.logger.log(
            `Deleted ${uniqueVodEntitiesToDelete.length} vods.`,
            'TwitchVodFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Issue deleting ${uniqueVodEntitiesToDelete.length} vods.`,
            'TwitchVodFetcher',
          ),
        );
    }
  }
}
