import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { PgcrEntryEntity } from './pgcr-entry.entity';
import { DestinyActivityModeType } from 'bungie-api-ts/destiny2';

@Entity()
export class PgcrEntity {
  @PrimaryColumn()
  instanceId: string;

  @Column()
  membershipType: BungieMembershipType;

  @Column({ type: 'timestamptz' })
  period: string;

  @Column({ nullable: true })
  activityHash?: string;

  @Column({ nullable: true })
  directorActivityHash?: string;

  @Column({ nullable: true })
  mode?: DestinyActivityModeType;

  @OneToMany(
    () => PgcrEntryEntity,
    entry => entry.instance,
  )
  entries: PgcrEntryEntity[];
}
