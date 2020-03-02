import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { XboxClipEntity } from './xbox-clip.entity';

@Entity()
export class XboxAccountEntity {
  @PrimaryColumn()
  gamertag: string;

  @OneToMany(
    () => XboxClipEntity,
    clip => clip.xboxAccount,
  )
  clips?: XboxClipEntity[];

  @Column('timestamptz', {
    nullable: true,
  })
  lastClipCheck?: string;
}
