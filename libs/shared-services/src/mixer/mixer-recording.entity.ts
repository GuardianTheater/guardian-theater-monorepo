import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { MixerChannelEntity } from './mixer-channel.entity';

@Entity()
export class MixerRecordingEntity {
  @PrimaryColumn()
  id: number;

  @Column('timestamptz')
  expiresAt: string;

  @Column('tstzrange')
  durationRange: string;

  @ManyToOne(
    () => MixerChannelEntity,
    channel => channel.recordings,
  )
  @JoinColumn({
    name: 'channel',
  })
  channel: MixerChannelEntity;
}
