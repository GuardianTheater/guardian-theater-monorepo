import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  Column,
  JoinColumn,
  Index,
  RelationId,
} from 'typeorm';
import { TwitchAccountEntity } from './twitch-account.entity';

@Entity()
export class TwitchVideoEntity {
  @PrimaryColumn()
  @Index()
  id: string;

  @RelationId((video: TwitchVideoEntity) => video.user)
  userId: string;

  @ManyToOne(
    () => TwitchAccountEntity,
    account => account.videos,
  )
  @JoinColumn({
    name: 'user',
  })
  @Index()
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
