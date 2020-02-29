import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { MixerChannelEntity } from './mixer-channel.entity';
import { MixerVodEntity } from './mixer-vod.entity';

@Entity()
export class MixerRecordingEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  name: string;

  @Column('timestamptz')
  expiresAt: string;

  @Column('tstzrange')
  durationRange: string;

  @Column()
  contentId: string;

  @ManyToOne(
    () => MixerChannelEntity,
    channel => channel.recordings,
  )
  @JoinColumn({
    name: 'channel',
  })
  channel: MixerChannelEntity;

  @OneToMany(
    () => MixerVodEntity,
    vod => vod.recording,
  )
  vods: MixerVodEntity[];
}
