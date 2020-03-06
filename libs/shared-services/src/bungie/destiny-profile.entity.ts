import {
  Entity,
  JoinColumn,
  Column,
  OneToMany,
  PrimaryColumn,
  ManyToOne,
} from 'typeorm';
import { PgcrEntryEntity } from './pgcr-entry.entity';
import { BungieProfileEntity } from './bungie-profile.entity';
import { AccountLinkEntity } from '../helpers/account-link.entity';

@Entity()
export class DestinyProfileEntity {
  @PrimaryColumn()
  membershipId: string;

  @Column()
  membershipType: number;

  @Column()
  displayName: string;

  @ManyToOne(
    () => BungieProfileEntity,
    profile => profile.profiles,
    {
      nullable: true,
    },
  )
  @JoinColumn({
    name: 'bnetProfile',
  })
  bnetProfile?: BungieProfileEntity;

  @OneToMany(
    () => PgcrEntryEntity,
    entry => entry.profile,
  )
  entries?: PgcrEntryEntity[];

  @OneToMany(
    () => AccountLinkEntity,
    link => link.destinyProfile,
  )
  accountLinks?: AccountLinkEntity[];

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  pageLastVisited?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  bnetProfileChecked?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  activitiesLastChecked?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  xboxNameMatchChecked?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  twitchNameMatchChecked?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  mixerNameMatchChecked?: string;
}
