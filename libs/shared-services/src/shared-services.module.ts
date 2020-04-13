import { Module, HttpModule } from '@nestjs/common';
import { BungieService } from './bungie/bungie.service';
import { MixerService } from './mixer/mixer.service';
import { TwitchService } from './twitch/twitch.service';
import { XboxService } from './xbox/xbox.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { XboxClipEntity } from './xbox/xbox-clip.entity';
import { XboxAccountEntity } from './xbox/xbox-account.entity';
import { BungieProfileEntity } from './bungie/bungie-profile.entity';
import { DestinyProfileEntity } from './bungie/destiny-profile.entity';
import { PgcrEntity } from './bungie/pgcr.entity';
import { PgcrEntryEntity } from './bungie/pgcr-entry.entity';
import { TwitchAccountEntity } from './twitch/twitch-account.entity';
import { TwitchVideoEntity } from './twitch/twitch-video.entity';
import { MixerAccountEntity } from './mixer/mixer-account.entity';
import { MixerChannelEntity } from './mixer/mixer-channel.entity';
import { MixerRecordingEntity } from './mixer/mixer-recording.entity';
import { AccountLinkEntity } from './helpers/account-link.entity';
import { AccountLinkVoteEntity } from './helpers/account-link-vote.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    HttpModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT, 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [
        XboxClipEntity,
        XboxAccountEntity,
        BungieProfileEntity,
        DestinyProfileEntity,
        PgcrEntity,
        PgcrEntryEntity,
        TwitchAccountEntity,
        TwitchVideoEntity,
        MixerAccountEntity,
        MixerChannelEntity,
        MixerRecordingEntity,
        AccountLinkEntity,
        AccountLinkVoteEntity,
      ],
      synchronize: true,
      ssl: {
        ca: process.env.DATABASE_CERT,
        rejectUnauthorized: false,
      },
      extra: {
        max: 3,
      },
    }),
    TypeOrmModule.forFeature([
      XboxClipEntity,
      XboxAccountEntity,
      BungieProfileEntity,
      DestinyProfileEntity,
      PgcrEntity,
      PgcrEntryEntity,
      TwitchAccountEntity,
      TwitchVideoEntity,
      MixerAccountEntity,
      MixerChannelEntity,
      MixerRecordingEntity,
      AccountLinkEntity,
      AccountLinkVoteEntity,
    ]),
  ],
  providers: [BungieService, MixerService, TwitchService, XboxService],
  exports: [BungieService, MixerService, TwitchService, XboxService],
})
export class SharedServicesModule {}
