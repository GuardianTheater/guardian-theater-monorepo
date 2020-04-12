import { Module, HttpModule } from '@nestjs/common';
import { BungieService } from './bungie/bungie.service';
import { MixerService } from './mixer/mixer.service';
import { TwitchService } from './twitch/twitch.service';
import { XboxService } from './xbox/xbox.service';
import { ConfigModule } from '@nestjs/config';
import { FirestoreService } from './firestore/firestore.service';

@Module({
  imports: [ConfigModule.forRoot(), HttpModule],
  providers: [
    BungieService,
    MixerService,
    TwitchService,
    XboxService,
    FirestoreService,
  ],
  exports: [
    BungieService,
    MixerService,
    TwitchService,
    XboxService,
    FirestoreService,
  ],
})
export class SharedServicesModule {}
