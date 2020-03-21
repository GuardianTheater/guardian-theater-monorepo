import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  Column,
  JoinColumn,
  Index,
} from 'typeorm';
import { TwitchAccountEntity } from './twitch-account.entity';

@Entity()
export class TwitchVideoEntity {
  @PrimaryColumn()
  @Index({ unique: true })
  id: string;

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
  @Index()
  durationRange: string;

  @Column()
  title: string;

  @Column()
  url: string;

  @Column()
  thumbnailUrl: string;
}
