import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  OneToMany,
  PrimaryColumn,
  Index,
} from 'typeorm';
import { DestinyProfileEntity } from '../bungie/destiny-profile.entity';
import { TwitchAccountEntity } from '../twitch/twitch-account.entity';
import { MixerAccountEntity } from '../mixer/mixer-account.entity';
import { AccountLinkVoteEntity } from './account-link-vote.entity';
import { XboxAccountEntity } from '../xbox/xbox-account.entity';

@Entity()
export class AccountLinkEntity {
  @PrimaryColumn({ unique: true })
  id: string;

  @ManyToOne(
    () => DestinyProfileEntity,
    destinyProfile => destinyProfile.accountLinks,
  )
  @JoinColumn({
    name: 'destinyProfile',
  })
  @Index()
  destinyProfile: DestinyProfileEntity;

  @Column()
  linkType: 'bungiePartner' | 'nameMatch' | 'authentication' | 'ocr';

  @Column()
  accountType: 'xbox' | 'mixer' | 'twitch';

  @Column({ nullable: true })
  rejected?: boolean;

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

  @ManyToOne(() => XboxAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'xboxAccount' })
  xboxAccount?: XboxAccountEntity;

  @OneToMany(
    () => AccountLinkVoteEntity,
    vote => vote.link,
  )
  votes?: AccountLinkVoteEntity[];
}
