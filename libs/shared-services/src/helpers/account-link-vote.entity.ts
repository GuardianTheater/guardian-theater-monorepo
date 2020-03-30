import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { BungieProfileEntity } from '../bungie/bungie-profile.entity';
import { AccountLinkEntity } from './account-link.entity';

@Entity()
export class AccountLinkVoteEntity {
  @PrimaryColumn()
  id: string;

  @ManyToOne(
    () => BungieProfileEntity,
    profile => profile.votes,
    {
      primary: true,
    },
  )
  @JoinColumn({
    name: 'bnetProfile',
  })
  bnetProfile: BungieProfileEntity;

  @ManyToOne(
    () => AccountLinkEntity,
    link => link.votes,
    {
      primary: true,
    },
  )
  @JoinColumn({
    name: 'link',
  })
  @Index()
  link: AccountLinkEntity;

  @Column()
  vote: -1 | 0 | 1;
}
