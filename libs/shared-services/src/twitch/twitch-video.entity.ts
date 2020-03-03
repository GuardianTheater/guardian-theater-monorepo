import { Entity, PrimaryColumn, ManyToOne, Column, JoinColumn } from 'typeorm';
import { TwitchAccountEntity } from './twitch-account.entity';

@Entity()
export class TwitchVideoEntity {
  @PrimaryColumn()
  id: string;

  @ManyToOne(
    () => TwitchAccountEntity,
    account => account.videos,
  )
  @JoinColumn({
    name: 'user',
  })
  user: TwitchAccountEntity;

  @Column('tstzrange')
  durationRange: string;

  @Column()
  title: string;

  @Column()
  url: string;

  @Column()
  thumbnailUrl: string;
}
