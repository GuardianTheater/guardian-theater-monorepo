import { Entity, ManyToOne, Column, JoinColumn, Index } from 'typeorm';
import { PgcrEntity } from './pgcr.entity';
import { DestinyProfileEntity } from './destiny-profile.entity';

@Entity()
export class PgcrEntryEntity {
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
  @Index()
  team?: number;
}
