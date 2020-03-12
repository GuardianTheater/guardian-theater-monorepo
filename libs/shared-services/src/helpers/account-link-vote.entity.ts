import { Entity, ManyToOne, JoinColumn, Column } from 'typeorm';
import { BungieProfileEntity } from '../bungie/bungie-profile.entity';
import { AccountLinkEntity } from './account-link.entity';

@Entity()
export class AccountLinkVoteEntity {
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
  link: AccountLinkEntity;

  @Column()
  vote: -1 | 0 | 1;
}
