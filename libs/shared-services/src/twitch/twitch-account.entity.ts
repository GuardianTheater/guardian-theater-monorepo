import { PrimaryColumn, Entity, Column, OneToMany } from 'typeorm';
import { TwitchVideoEntity } from './twitch-video.entity';

@Entity()
export class TwitchAccountEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  login: string;

  @OneToMany(
    () => TwitchVideoEntity,
    clip => clip.user,
  )
  videos: TwitchVideoEntity[];
}
