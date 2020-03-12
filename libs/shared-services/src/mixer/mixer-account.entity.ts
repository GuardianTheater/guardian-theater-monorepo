import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { MixerChannelEntity } from './mixer-channel.entity';

@Entity()
export class MixerAccountEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  username: string;

  @OneToOne(() => MixerChannelEntity)
  @JoinColumn({
    name: 'channel',
  })
  channel: MixerChannelEntity;
}
