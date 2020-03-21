import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MixerChannelEntity } from './mixer-channel.entity';

@Entity()
export class MixerAccountEntity {
  @PrimaryColumn()
  @Index({ unique: true })
  id: number;

  @Column()
  username: string;

  @OneToOne(() => MixerChannelEntity)
  @JoinColumn({
    name: 'channel',
  })
  channel: MixerChannelEntity;
}
