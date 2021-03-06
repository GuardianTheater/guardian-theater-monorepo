import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MixerChannelEntity } from './mixer-channel.entity';

@Entity()
export class MixerRecordingEntity {
  @PrimaryColumn()
  @Index()
  id: number;

  @Column('timestamptz')
  expiresAt: string;

  @Column('tstzrange')
  durationRange: string;

  @Column({ nullable: true })
  title?: string;

  @Column({
    nullable: true,
  })
  thumbnail?: string;

  @ManyToOne(
    () => MixerChannelEntity,
    channel => channel.recordings,
  )
  @JoinColumn({
    name: 'channel',
  })
  @Index()
  channel: MixerChannelEntity;
}
