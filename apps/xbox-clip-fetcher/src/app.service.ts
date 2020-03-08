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
  ) {
    this.logger.setContext('XboxClipFetcher');
  }

  @Interval(60000)
  handleInterval() {
    this.fetchXboxClips().catch(() =>
      this.logger.error(`Issue running fetchXboxClips`),
    );
  }

  async fetchXboxClips() {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );

    const accountsToCheck = await getConnection()
      .createQueryBuilder(XboxAccountEntity, 'xboxAccount')
      .orderBy('xboxAccount.lastClipCheck', 'ASC', 'NULLS FIRST')
      .take(100)
      .getMany()
      .catch(() => {
        this.logger.error(`Error fetching Xbox Accounts from database`);
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
                this.logger.error(
                  `Error fetching exisitng clips from database.`,
                );
                return [] as XboxClipEntity[];
              });
            if (existingClips.length) {
              const newClipIds = new Set(toSave.map(clip => clip.gameClipId));
              for (let j = 0; j < existingClips.length; j++) {
                const existingClip = existingClips[j];
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
          ),
        );

      xboxClipFetchers.push(clipFetcher);
    }

    if (xboxClipFetchers.length) {
      this.logger.log(
        `Fetching Xbox Clips for ${xboxClipFetchers.length} profiles.`,
      );
      await Promise.all(xboxClipFetchers);
      this.logger.log(
        `Fetched Xbox Clips for ${xboxClipFetchers.length} profiles.`,
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

    const uniqueXboxClipEntitiesToDelete: XboxClipEntity[] = uniqueEntityArray(
      xboxClipEntitiesToDelete,
      'gameClipId',
    );

    if (uniqueXboxAccountEntities.length) {
      await upsert(XboxAccountEntity, uniqueXboxAccountEntities, 'gamertag')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueXboxAccountEntities.length} Xbox Accounts.`,
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueXboxAccountEntities.length} Xbox Accounts.`,
          ),
        );
    }

    if (uniqueXboxClipEntitiesToSave.length) {
      await upsert(XboxClipEntity, uniqueXboxClipEntitiesToSave, 'gameClipId')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueXboxClipEntitiesToSave.length} Xbox Clips.`,
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueXboxClipEntitiesToSave.length} Xbox Clips.`,
          ),
        );
    }

    if (uniqueXboxClipEntitiesToDelete.length) {
      const deletes = [];
      for (let i = 0; i < uniqueXboxClipEntitiesToDelete.length; i++) {
        const entity = uniqueXboxClipEntitiesToDelete[i];
        const deleteJob = getConnection()
          .createQueryBuilder()
          .delete()
          .from(XboxClipEntity)
          .where('gameClipId = :gameClipId', { gameClipId: entity.gameClipId })
          .execute()
          .catch(() =>
            this.logger.error(`Error deleting Xbox Clip ${entity.gameClipId}`),
          );
        deletes.push(deleteJob);
      }
      await Promise.all(deletes)
        .then(() =>
          this.logger.log(
            `Deleted ${uniqueXboxClipEntitiesToDelete.length} clips.`,
          ),
        )
        .catch(() =>
          this.logger.error(
            `Issue deleting ${uniqueXboxClipEntitiesToDelete.length} clips`,
          ),
        );
    }
  }
}
