import { Entity, ManyToOne, Column, JoinColumn } from 'typeorm';
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
  instance: PgcrEntity;

  @Column('tstzrange')
  timePlayedRange: string;

  @Column({
    nullable: true,
  })
  team?: number;
}
