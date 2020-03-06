import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { PgcrEntryEntity } from './pgcr-entry.entity';

@Entity()
export class PgcrEntity {
  @PrimaryColumn()
  instanceId: string;

  @Column()
  membershipType: BungieMembershipType;

  @Column({ type: 'timestamptz' })
  period: string;

  @Column()
  activityHash: string;

  @OneToMany(
    () => PgcrEntryEntity,
    entry => entry.instance,
  )
  entries: PgcrEntryEntity[];
}
