import {
  Entity,
  OneToOne,
  JoinColumn,
  Column,
  OneToMany,
  PrimaryColumn,
  ManyToOne,
} from 'typeorm';
import { XboxAccountEntity } from '../xbox/xbox-account.entity';
import { TwitchAccountEntity } from '../twitch/twitch-account.entity';
import { MixerAccountEntity } from '../mixer/mixer-account.entity';
import { PgcrEntryEntity } from './pgcr-entry.entity';
import { BungieProfileEntity } from './bungie-profile.entity';

@Entity()
export class DestinyProfileEntity {
  @PrimaryColumn()
  membershipId: string;

  @Column()
  membershipType: number;

  @Column()
  displayName: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  pageLastVisited?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  activitiesLastChecked?: string;

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

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  bnetProfileChecked?: string;

  @OneToMany(
    () => PgcrEntryEntity,
    entry => entry.profile,
  )
  entries?: PgcrEntryEntity[];

  @OneToOne(() => XboxAccountEntity, {
    nullable: true,
  })
  @JoinColumn({
    name: 'xboxNameMatch',
  })
  xboxNameMatch?: XboxAccountEntity;

  @ManyToOne(() => TwitchAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'twitchNameMatch' })
  twitchNameMatch?: TwitchAccountEntity;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  twitchNameMatchChecked?: string;

  @ManyToOne(() => MixerAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'mixerNameMatch' })
  mixerNameMatch?: MixerAccountEntity;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  mixerNameMatchChecked?: string;
}
