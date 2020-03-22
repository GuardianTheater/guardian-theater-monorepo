import { Entity, PrimaryColumn, Column, OneToMany, Index } from 'typeorm';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { PgcrEntryEntity } from './pgcr-entry.entity';

@Entity()
export class PgcrEntity {
  @PrimaryColumn()
  @Index({ unique: true })
  instanceId: string;

  @Column()
  membershipType: BungieMembershipType;

  @Column({ type: 'timestamptz' })
  @Index()
  period: string;

  @Column({ nullable: true })
  activityHash?: string;

  @Column({ nullable: true })
  @Index()
  directorActivityHash?: string;

  @OneToMany(
    () => PgcrEntryEntity,
    entry => entry.instance,
  )
  entries: PgcrEntryEntity[];
}
