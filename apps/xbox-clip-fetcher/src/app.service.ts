import { Injectable, Logger } from '@nestjs/common';
import { getConnection } from 'typeorm';
import { DestinyProfileEntity } from '@services/shared-services/bungie/destiny-profile.entity';
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
    this.fetchXboxClips();
  }

  async fetchXboxClips() {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );

    const staleCheck = new Date(
      new Date().setHours(new Date().getHours() - 1),
    ).toISOString();

    const profilesToCheck = await getConnection()
      .createQueryBuilder(DestinyProfileEntity, 'profile')
      .leftJoinAndSelect('profile.xboxAccount', 'xboxAccount')
      .orderBy('xboxAccount.lastClipCheck')
      .where(
        'profile.membershipType = 1 AND (profile.xboxAccount is null OR xboxAccount.lastClipCheck < :staleCheck OR xboxAccount.lastClipCheck is null)',
        {
          staleCheck,
        },
      )
      .limit(100)
      .getMany();

    // TODO: Check if any linked profiles have played Destiny since the dateCutOff,
    // skip checking clips if they have not

    // TODO: Skip loading clips if the user hasn't played since the last clip check

    const destinyProfileEntities: DestinyProfileEntity[] = [];
    const xboxAccountEntities: XboxAccountEntity[] = [];
    const xboxClipEntitiesToSave: XboxClipEntity[] = [];
    const xboxClipEntitiesToDelete: XboxClipEntity[] = [];

    const xboxClipFetchers: Promise<any>[] = [];

    for (let i = 0; i < profilesToCheck.length; i++) {
      const loadedProfile = profilesToCheck[i];
      const profile = new DestinyProfileEntity();
      profile.membershipId = loadedProfile.membershipId;
      profile.membershipType = loadedProfile.membershipType;
      profile.displayName = loadedProfile.displayName;

      const xboxAccount = new XboxAccountEntity();
      xboxAccount.gamertag = profile.displayName;
      xboxAccount.lastClipCheck = new Date().toISOString();

      profile.xboxAccount = xboxAccount;

      destinyProfileEntities.push(profile);
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
          if (profile?.xboxAccount?.gamertag) {
            const existingClips = await getConnection()
              .createQueryBuilder(XboxClipEntity, 'clip')
              .where('clip.xboxAccount = :gamertag', {
                gamertag: profile.xboxAccount.gamertag,
              })
              .getMany();
            if (existingClips.length) {
              const newClipIds = new Set(toSave.map(clip => clip.gameClipId));
              for (let j = 0; j < profile.xboxAccount.clips.length; j++) {
                const existingClip = profile.xboxAccount.clips[j];
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
            `Error fetching Xbox Clips for ${profile.xboxAccount.gamertag}`,
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

    const uniqueDestinyProfileEntities = uniqueEntityArray(
      destinyProfileEntities,
      'membershipId',
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

    if (uniqueDestinyProfileEntities.length) {
      await upsert(
        DestinyProfileEntity,
        uniqueDestinyProfileEntities,
        'membershipId',
      )
        .then(() =>
          this.logger.log(
            `Saved ${uniqueDestinyProfileEntities.length} Destiny Profiles.`,
            'XboxClipFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueDestinyProfileEntities.length} Destiny Profiles.`,
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
