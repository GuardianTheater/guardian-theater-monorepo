import { Entity, PrimaryColumn, OneToMany, Column } from 'typeorm';
import { MixerAccountEntity } from './mixer-account.entity';
import { MixerRecordingEntity } from './mixer-recording.entity';

@Entity()
export class MixerChannelEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  token: string;

  @OneToMany(
    () => MixerRecordingEntity,
    recording => recording.channel,
  )
  recordings: MixerAccountEntity[];

  @Column('timestamptz', {
    nullable: true,
  })
  lastRecordingCheck?: string;
}
