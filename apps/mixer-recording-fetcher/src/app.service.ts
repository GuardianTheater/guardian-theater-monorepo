import { Injectable, Logger } from '@nestjs/common';
import { MixerService } from '@services/shared-services';
import { Interval } from '@nestjs/schedule';
import { getConnection } from 'typeorm';
import { MixerChannelEntity } from '@services/shared-services/mixer/mixer-channel.entity';
import { MixerRecordingEntity } from '@services/shared-services/mixer/mixer-recording.entity';
import uniqueEntityArray from '@services/shared-services/helpers/unique-entity-array';
import upsert from '@services/shared-services/helpers/typeorm-upsert';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(
    private readonly logger: Logger,
    private readonly mixerService: MixerService,
  ) {}

  @Interval(60000)
  handleInterval() {
    this.fetchMixerRecordings();
  }

  async fetchMixerRecordings() {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );

    const staleCheck = new Date(
      new Date().setHours(new Date().getHours() - 1),
    ).toISOString();

    const channelsToCheck = await getConnection()
      .createQueryBuilder(MixerChannelEntity, 'channel')
      .orderBy('channel.lastRecordingCheck')
      .where(
        'channel.lastRecordingCheck < :staleCheck OR channel.lastRecordingCheck is null',
        {
          staleCheck,
        },
      )
      .limit(100)
      .getMany();

    // TODO: Ignore channels attached to inactive Destiny Profiles

    const channelsToSave: MixerChannelEntity[] = [];
    const recordingsToSave: MixerRecordingEntity[] = [];
    const recordingsToDelete: MixerRecordingEntity[] = [];

    const recordingsPromises: Promise<any>[] = [];

    for (let i = 0; i < channelsToCheck.length; i++) {
      const loadedChannel = channelsToCheck[i];
      const channel = new MixerChannelEntity();
      channel.id = loadedChannel?.id;
      channel.token = loadedChannel?.token;

      channel.lastRecordingCheck = new Date().toISOString();
      channelsToSave.push(channel);

      const promise = this.mixerService
        .getChannelRecordings(channel.id)
        .then(res => {
          const recordings = res.data;
          const toSave: MixerRecordingEntity[] = [];
          for (let j = 0; j < recordings.length; j++) {
            const recording = recordings[j];
            if (new Date(recording.createdAt) < dateCutOff) {
              break;
            }
            const recordingEntity = new MixerRecordingEntity();
            recordingEntity.channel = channel;
            recordingEntity.expiresAt = recording.expiresAt;
            recordingEntity.id = recording.id;
            recordingEntity.title = recording.name;
            recordingEntity.durationRange = `[${recording.createdAt},${new Date(
              new Date(recording.createdAt).setSeconds(
                new Date(recording.createdAt).getSeconds() + recording.duration,
              ),
            ).toISOString()}]`;

            for (let k = 0; k < recording.vods.length; k++) {
              const vod = recording.vods[k];
              if (vod.format === 'thumbnail') {
                recordingEntity.thumbnail = `${vod.baseUrl}source.png`;
              }
            }
            toSave.push(recordingEntity);
            recordingsToSave.push(recordingEntity);
            return toSave;
          }
        })
        .then(async toSave => {
          const existingRecordings = await getConnection()
            .createQueryBuilder(MixerRecordingEntity, 'recordings')
            .where('recordings.channel = :channelId', {
              channelId: channel.id,
            })
            .getMany()
            .catch(() => {
              this.logger.log(
                `Error fetching exisitnig recordings from database.`,
                'MixerRecordingFetcher',
              );
              return [] as MixerRecordingEntity[];
            });
          if (existingRecordings.length) {
            const newRecordingIds = new Set(toSave.map(vod => vod.id));
            for (let j = 0; j < existingRecordings.length; j++) {
              const existingRecording = existingRecordings[j];
              if (newRecordingIds.has(existingRecording.id)) {
                continue;
              }
              recordingsToDelete.push(existingRecording);
            }
          }
        })
        .catch(() =>
          this.logger.error(
            `Error fetching Mixer Recordings for ${channel.id}`,
            'MixerRecordingFetcher',
          ),
        );
      recordingsPromises.push(promise);
    }

    if (recordingsPromises.length) {
      this.logger.log(
        `Fetching Mixer Recordings for ${recordingsPromises.length} channels.`,
        'MixerRecordingFetcher',
      );
      await Promise.all(recordingsPromises);
      this.logger.log(
        `Fetched Mixer Recordings for ${recordingsPromises.length} channels.`,
        'MixerRecordingFetcher',
      );
    }

    const uniqueChannelEntities: MixerChannelEntity[] = uniqueEntityArray(
      channelsToSave,
      'id',
    );
    const uniqueRecordingEntities: MixerRecordingEntity[] = uniqueEntityArray(
      recordingsToSave,
      'id',
    );
    const uniqueRecordingEntitiesToDelete: MixerRecordingEntity[] = uniqueEntityArray(
      recordingsToDelete,
      'id',
    );

    if (uniqueChannelEntities.length) {
      await upsert(MixerChannelEntity, uniqueChannelEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueChannelEntities.length} Mixer Channels.`,
            'MixerRecordingFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueChannelEntities.length} Mixer Channels.`,
            'MixerRecordingFetcher',
          ),
        );
    }

    if (uniqueRecordingEntities.length) {
      await upsert(MixerRecordingEntity, uniqueRecordingEntities, 'id')
        .then(() =>
          this.logger.log(
            `Saved ${uniqueRecordingEntities.length} Mixer Recordings.`,
            'MixerRecordingFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Error saving ${uniqueRecordingEntities.length} Mixer Recordings.`,
            'MixerRecordingFetcher',
          ),
        );
    }

    if (uniqueRecordingEntitiesToDelete.length) {
      const deletes = [];
      for (let i = 0; i < uniqueRecordingEntitiesToDelete.length; i++) {
        const entity = uniqueRecordingEntitiesToDelete[i];
        const deleteJob = getConnection()
          .createQueryBuilder()
          .delete()
          .from(MixerRecordingEntity)
          .where('id = :id', { id: entity.id })
          .execute();
        deletes.push(deleteJob);
      }
      await Promise.all(deletes)
        .then(() =>
          this.logger.log(
            `Deleted ${uniqueRecordingEntitiesToDelete.length} recordings.`,
            'MixerRecordingFetcher',
          ),
        )
        .catch(() =>
          this.logger.error(
            `Issue deleting ${uniqueRecordingEntitiesToDelete.length} recordings.`,
            'MixerRecordingFetcher',
          ),
        );
    }
  }
}
