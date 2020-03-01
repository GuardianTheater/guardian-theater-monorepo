import { Injectable, Logger } from '@nestjs/common';
import { TwitchService } from '@services/shared-services';

@Injectable()
export class AppService {
  constructor(
    private readonly twitchService: TwitchService,
    private readonly logger: Logger,
  ) {}

  async twitchNameMatch() {
    this.twitchService
      .getUsersFromLogin(['chrisfried', 'Menos del Oso', 'RealAngryMonkey'])
      .then(res => console.log(res))
      .catch(e => console.log(e));
  }
}
