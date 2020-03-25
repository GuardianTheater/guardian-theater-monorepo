import { PrimaryColumn, Entity, Column, OneToMany, Index } from 'typeorm';
import { TwitchVideoEntity } from './twitch-video.entity';

@Entity()
export class TwitchAccountEntity {
  @PrimaryColumn()
  @Index()
  id: string;

  @Column()
  login: string;

  @Column()
  displayName: string;

  @OneToMany(
    () => TwitchVideoEntity,
    clip => clip.user,
  )
  videos: TwitchVideoEntity[];

  @Column('timestamptz', {
    nullable: true,
  })
  lastRecordingCheck?: string;
}
