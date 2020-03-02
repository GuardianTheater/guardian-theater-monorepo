import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DestinyProfileEntity } from './destiny-profile.entity';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { TwitchAccountEntity } from '../twitch/twitch-account.entity';

@Entity()
export class BungieProfileEntity {
  @PrimaryColumn()
  membershipId: string;

  @Column()
  membershipType: BungieMembershipType;

  @ManyToOne(() => TwitchAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'twitchPartnershipMatch' })
  twitchPartnershipMatch?: TwitchAccountEntity;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  twitchPartnershipMatchChecked?: string;

  @OneToMany(
    () => DestinyProfileEntity,
    profile => profile.bnetProfile,
  )
  profiles?: DestinyProfileEntity[];
}
