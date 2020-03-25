import { Entity, PrimaryColumn, OneToMany, Column, Index } from 'typeorm';
import { MixerRecordingEntity } from './mixer-recording.entity';

@Entity()
export class MixerChannelEntity {
  @PrimaryColumn()
  @Index()
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
