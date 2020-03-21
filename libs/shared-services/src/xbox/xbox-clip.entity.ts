import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { XboxAccountEntity } from './xbox-account.entity';

@Entity()
export class XboxClipEntity {
  @PrimaryColumn()
  @Index({ unique: true })
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
  @Index()
  xboxAccount: XboxAccountEntity;

  @Column('tstzrange')
  @Index()
  dateRecordedRange: string;

  @Column()
  thumbnailUri: string;
}
