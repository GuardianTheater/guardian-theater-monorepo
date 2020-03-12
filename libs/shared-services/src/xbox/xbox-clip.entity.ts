import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { XboxAccountEntity } from './xbox-account.entity';

@Entity()
export class XboxClipEntity {
  @PrimaryColumn()
  gameClipId: string;

  @Column()
  scid: string;

  @Column()
  xuid: string;

  @ManyToOne(
    () => XboxAccountEntity,
    xboxAccount => xboxAccount.clips,
    {
      eager: true,
    },
  )
  @JoinColumn({ name: 'xboxAccount' })
  xboxAccount: XboxAccountEntity;

  @Column('tstzrange')
  dateRecordedRange: string;

  @Column()
  thumbnailUri: string;
}
