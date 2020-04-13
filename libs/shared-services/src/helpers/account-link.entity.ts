import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  OneToMany,
  PrimaryColumn,
  Index,
  RelationId,
} from 'typeorm';
import { DestinyProfileEntity } from '../bungie/destiny-profile.entity';
import { TwitchAccountEntity } from '../twitch/twitch-account.entity';
import { MixerAccountEntity } from '../mixer/mixer-account.entity';
import { AccountLinkVoteEntity } from './account-link-vote.entity';
import { XboxAccountEntity } from '../xbox/xbox-account.entity';

@Entity()
export class AccountLinkEntity {
  @PrimaryColumn()
  id: string;

  @RelationId((link: AccountLinkEntity) => link.destinyProfile)
  destinyProfileId: string;

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

  @RelationId((link: AccountLinkEntity) => link.twitchAccount)
  twitchAccountId: string;

  @ManyToOne(() => TwitchAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'twitchAccount' })
  twitchAccount?: TwitchAccountEntity;

  @RelationId((link: AccountLinkEntity) => link.mixerAccount)
  mixerAccountId: number;

  @ManyToOne(() => MixerAccountEntity, {
    nullable: true,
  })
  @JoinColumn({ name: 'mixerAccount' })
  mixerAccount?: MixerAccountEntity;

  @RelationId((link: AccountLinkEntity) => link.xboxAccount)
  xboxAccountId: string;

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
