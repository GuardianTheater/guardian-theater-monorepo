import {
  Entity,
  ManyToOne,
  Column,
  JoinColumn,
  Index,
  RelationId,
} from 'typeorm';
import { PgcrEntity } from './pgcr.entity';
import { DestinyProfileEntity } from './destiny-profile.entity';

@Entity()
@Index(['team', 'instance'])
export class PgcrEntryEntity {
  @RelationId((entry: PgcrEntryEntity) => entry.profile)
  profileId: string;

  @ManyToOne(
    () => DestinyProfileEntity,
    profile => profile.entries,
    {
      primary: true,
    },
  )
  @JoinColumn({
    name: 'profile',
  })
  @Index()
  profile: DestinyProfileEntity;

  @RelationId((entry: PgcrEntryEntity) => entry.instance)
  instanceId: string;

  @ManyToOne(
    () => PgcrEntity,
    pgcr => pgcr.entries,
    {
      primary: true,
    },
  )
  @JoinColumn({
    name: 'instance',
  })
  @Index()
  instance: PgcrEntity;

  @Column('tstzrange')
  @Index()
  timePlayedRange: string;

  @Column({
    nullable: true,
  })
  team?: number;
}
