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
      .limit(150)
      .getMany();

    // TODO: Ignore channels attached to inactive Destiny Profiles

    const accountsToSave: TwitchAccountEntity[] = [];
    const vodsToSave: TwitchVideoEntity[] = [];

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
            vodsToSave.push(vodEntity);
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
        `Fetching Twitch Vod for ${vodPromises.length} channels.`,
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
  }
}
