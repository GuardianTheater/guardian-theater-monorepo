import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { DestinyProfileEntity } from '../bungie/destiny-profile.entity';
import { TwitchAccountEntity } from '../twitch/twitch-account.entity';
import { MixerAccountEntity } from '../mixer/mixer-account.entity';
import { AccountLinkVoteEntity } from './account-link-vote.entity';

@Entity()
export class AccountLinkEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  linkType: 'bungiePartner' | 'nameMatch' | 'authentication' | 'ocr';

  @Column()
  accountType: 'xbox' | 'mixer' | 'twitch';

  @ManyToOne(
    () => DestinyProfileEntity,
    destinyProfile => destinyProfile.accountLinks,
  )
  @JoinColumn({
    name: 'destinyProfile',
  })
  destinyProfile?: DestinyProfileEntity;

  @ManyToOne(() => TwitchAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'twitchAccount' })
  twitchAccount?: TwitchAccountEntity;

  @ManyToOne(() => MixerAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'mixerAccount' })
  mixerAccount?: MixerAccountEntity;

  @OneToMany(
    () => AccountLinkVoteEntity,
    vote => vote.link,
  )
  votes?: AccountLinkVoteEntity[];
}
