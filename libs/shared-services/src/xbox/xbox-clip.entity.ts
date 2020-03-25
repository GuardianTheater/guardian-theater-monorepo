import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  RelationId,
} from 'typeorm';
import { XboxAccountEntity } from './xbox-account.entity';

@Entity()
export class XboxClipEntity {
  @PrimaryColumn()
  @Index()
  gameClipId: string;

  @Column()
  scid: string;

  @Column()
  xuid: string;

  @RelationId((clip: XboxClipEntity) => clip.xboxAccount)
  xboxAccountId: string;

  @ManyToOne(
    () => XboxAccountEntity,
    xboxAccount => xboxAccount.clips,
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
