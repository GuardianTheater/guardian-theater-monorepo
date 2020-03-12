import { Entity, PrimaryColumn, OneToMany, Column } from 'typeorm';
import { MixerRecordingEntity } from './mixer-recording.entity';

@Entity()
export class MixerChannelEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  token: string;

  @OneToMany(
    () => MixerRecordingEntity,
    recording => recording.channel,
  )
  recordings: MixerRecordingEntity[];

  @Column('timestamptz', {
    nullable: true,
  })
  lastRecordingCheck?: string;
}
