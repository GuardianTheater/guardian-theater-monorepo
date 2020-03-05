import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { DestinyProfileEntity } from './destiny-profile.entity';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { AccountLinkVoteEntity } from '../helpers/account-link-vote.entity';

@Entity()
export class BungieProfileEntity {
  @PrimaryColumn()
  membershipId: string;

  @Column()
  membershipType: BungieMembershipType;

  @OneToMany(
    () => DestinyProfileEntity,
    profile => profile.bnetProfile,
  )
  profiles?: DestinyProfileEntity[];

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  twitchPartnershipMatchChecked?: string;

  @OneToMany(
    () => AccountLinkVoteEntity,
    vote => vote.bnetProfile,
  )
  votes?: AccountLinkVoteEntity[];
}
