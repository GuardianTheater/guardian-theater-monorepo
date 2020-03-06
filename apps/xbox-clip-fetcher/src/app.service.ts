import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { XboxAccountEntity } from '@services/shared-services/xbox/xbox-account.entity';
import { Interval } from '@nestjs/schedule';
import { XboxService } from '@services/shared-services';
import { XboxClipEntity } from '@services/shared-services/xbox/xbox-clip.entity';
import upsert from '@services/shared-services/helpers/typeorm-upsert';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(
    private readonly xboxService: XboxService,
    private readonly logger: Logger,
  ) {}

  @Interval(60000)
  handleInterval() {
    this.fetchXboxClips().catch(() =>
      this.logger.error(`Issue running fetchXboxClips`, 'XboxClipFetcher'),
    );
  }

  async fetchXboxClips() {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );

    const staleCheck = new Date(
      new Date().setHours(new Date().getHours() - 1),
    ).toISOString();

    const accountsToCheck = await getConnection()
      .createQueryBuilder(XboxAccountEntity, 'xboxAccount')
      .orderBy('xboxAccount.lastClipCheck')
      .where(
        'xboxAccount.lastClipCheck < :staleCheck OR xboxAccount.lastClipCheck is null',
        {
          staleCheck,
        },
      )
      .limit(100)
      .getMany()
      .catch(() => {
        this.logger.error(
          `Error fetching Xbox Accounts from database`,
          'XboxClipFetcher',
        );
        return [] as XboxAccountEntity[];
      });

    // TODO: Check if any linked profiles have played Destiny since the dateCutOff,
    // skip checking clips if they have not

    // TODO: Skip loading clips if the user hasn't played since the last clip check

    const xboxAccountEntities: XboxAccountEntity[] = [];
    const xboxClipEntitiesToSave: XboxClipEntity[] = [];
    const xboxClipEntitiesToDelete: XboxClipEntity[] = [];

    const xboxClipFetchers: Promise<any>[] = [];

    for (let i = 0; i < accountsToCheck.length; i++) {
      const loadedAccount = accountsToCheck[i];

      const xboxAccount = new XboxAccountEntity();
      xboxAccount.gamertag = loadedAccount.gamertag;
      xboxAccount.lastClipCheck = new Date().toISOString();

      xboxAccountEntities.push(xboxAccount);

      const clipFetcher = this.xboxService
        .fetchConsoleDestiny2ClipsForGamertag(xboxAccount.gamertag)
        .then(res => {
          const toSave: XboxClipEntity[] = [];
          if (res?.data?.gameClips) {
            for (let j = 0; j < res.data.gameClips.length; j++) {
              const clip = res.data.gameClips[j];
              const endStamp = new Date(clip.dateRecorded);
              if (endStamp < dateCutOff) {
                break;
              }
              const xboxClipEntity = new XboxClipEntity();
              xboxClipEntity.gameClipId = clip.gameClipId;
              xboxClipEntity.scid = clip.scid;
              xboxClipEntity.xuid = clip.xuid;
              xboxClipEntity.xboxAccount = xboxAccount;
              xboxClipEntity.thumbnailUri = clip.thumbnails.pop().uri;
              xboxClipEntity.dateRecordedRange = `[${
                clip.dateRecorded
              }, ${endStamp.toISOString()}]`;

              toSave.push(xboxClipEntity);
              xboxClipEntitiesToSave.push(xboxClipEntity);
            }
          }
          return toSave;
        })
        .then(async toSave => {
          if (xboxAccount.gamertag) {
            const existingClips = await getConnection()
              .createQueryBuilder(XboxClipEntity, 'xboxClip')
              .where('xboxClip.xboxAccount = :gamertag', {
                gamertag: xboxAccount.gamertag,
              })
              .getMany()
              .catch(() => {
                this.logger.log(
                  `Error fetching exisitng clips from database.`,
                  'XboxClipFetcher',
                );
                return [] as XboxClipEntity[];
              });
            if (existingClips.length) {
              const newClipIds = new Set(toSave.map(clip => clip.gameClipId));
              for (let j = 0; j < xboxAccount.clips.length; j++) {
                const existingClip = xboxAccount.clips[j];
                if (newClipIds.has(existingClip.gameClipId)) {
                  continue;
                }
                xboxClipEntitiesToDelete.push(existingClip);
              }
            }
          }
        })
        .catch(() =>
          this.logger.error(
            `Error fetching Xbox Clips for ${xboxAccount.gamertag}`,
            'XboxClipFetcher',
          ),
        );

      xboxClipFetchers.push(clipFetcher);
    }

    if (xboxClipFetchers.length) {
      this.logger.log(
        `Fetching Xbox Clips for ${xboxClipFetchers.length} profiles.`,
        'XboxClipFetcher',
      );
      await Promise.all(xboxClipFetchers);
      this.logger.log(
        `Fetched Xbox Clips for ${xboxClipFetchers.length} profiles.`,
        'XboxClipFetcher',
      );
    }

    const uniqueXboxAccountEntities = uniqueEntityArray(
      xboxAccountEntities,
      'gamertag',
    );

    const uniqueXboxClipEntitiesToSave = uniqueEntityArray(
      xboxClipEntitiesToSave,
      'gameClipId',
    );

    // const uniqueXboxClipEntitiesToDelete = uniqueEntityArray(
    //   xboxClipEntitiesToDelete,
    //   'gameClipId',
    // );

    if (uniqueXboxAccountEntities.length) {
      await upsert(XboxAccountEntity, uniqueXboxAccountEntities, 'gamertag')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueXboxAccountEntities.length} Xbox Accounts.`,
            'XboxClipFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueXboxAccountEntities.length} Xbox Accounts.`,
            'XboxClipFetcher',
          ),
        );
    }

    if (uniqueXboxClipEntitiesToSave.length) {
      await upsert(XboxClipEntity, uniqueXboxClipEntitiesToSave, 'gameClipId')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueXboxClipEntitiesToSave.length} Xbox Clips.`,
            'XboxClipFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueXboxClipEntitiesToSave.length} Xbox Clips.`,
            'XboxClipFetcher',
          ),
        );
    }

    // TODO: Delete contents of uniqueXboxClipEntitiesToDelete
  }
}
