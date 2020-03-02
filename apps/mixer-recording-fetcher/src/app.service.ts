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
      .limit(150)
      .getMany();

    // TODO: Ignore channels attached to inactive Destiny Profiles

    const channelsToSave: MixerChannelEntity[] = [];
    const recordingsToSave: MixerRecordingEntity[] = [];

    const recordingsPromises: Promise<any>[] = [];

    for (let i = 0; i < channelsToCheck.length; i++) {
      const channel = channelsToCheck[i];
      channel.lastRecordingCheck = new Date().toISOString();
      channelsToSave.push(channel);

      const promise = this.mixerService
        .getChannelRecordings(channel.id)
        .then(res => {
          const recordings = res.data;
          for (let j = 0; j < recordings.length; j++) {
            const recording = recordings[j];
            if (new Date(recording.createdAt) < dateCutOff) {
              break;
            }
            const recordingEntity = new MixerRecordingEntity();
            recordingEntity.channel = channel;
            recordingEntity.expiresAt = recording.expiresAt;
            recordingEntity.id = recording.id;
            recordingEntity.durationRange = `[${recording.createdAt},${new Date(
              new Date(recording.createdAt).setSeconds(
                new Date(recording.createdAt).getSeconds() + recording.duration,
              ),
            ).toISOString()}]`;
            recordingsToSave.push(recordingEntity);
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
        'XboxClipFetcher',
      );
      await Promise.all(recordingsPromises);
      this.logger.log(
        `Fetched Mixer Recordings for ${recordingsPromises.length} channels.`,
        'XboxClipFetcher',
      );
    }

    const uniqueChannelEntities = uniqueEntityArray(channelsToSave, 'id');
    const uniqueRecordingEntities = uniqueEntityArray(recordingsToSave, 'id');

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
  }
}
