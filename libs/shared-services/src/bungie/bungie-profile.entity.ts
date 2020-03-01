import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { DestinyProfileEntity } from './destiny-profile.entity';
import { BungieMembershipType } from 'bungie-api-ts/user';

@Entity()
export class BungieProfileEntity {
  @PrimaryColumn()
  membershipId: string;

  @Column()
  membershipType: BungieMembershipType;

  @Column({ nullable: true })
  twitchPartnershipIdentifier?: string;

  @OneToMany(
    () => DestinyProfileEntity,
    profile => profile.bnetProfile,
  )
  profiles?: DestinyProfileEntity[];
}
