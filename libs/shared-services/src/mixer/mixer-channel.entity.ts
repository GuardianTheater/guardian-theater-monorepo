import { Entity, PrimaryColumn, OneToMany } from 'typeorm';
import { MixerAccountEntity } from './mixer-account.entity';
import { MixerRecordingEntity } from './mixer-recording.entity';

@Entity()
export class MixerChannelEntity {
  @PrimaryColumn()
  id: number;

  @OneToMany(
    () => MixerRecordingEntity,
    recording => recording.channel,
  )
  recordings: MixerAccountEntity[];
}
