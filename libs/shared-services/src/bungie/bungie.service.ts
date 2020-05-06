import { Injectable, HttpService } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { AxiosRequestConfig } from 'axios';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { getLinkedProfiles } from 'bungie-api-ts/destiny2';

@Injectable()
export class BungieService {
  bungieKeys = [];

  constructor(private readonly httpService: HttpService) {}

  async getRootProfile(
    membershipId: string,
    membershipType: BungieMembershipType,
  ) {
    const linkedProfiles = await getLinkedProfiles(
      config => this.bungieRequest(config),
      {
        membershipType,
        membershipId,
        getAllMemberships: true,
      },
    );
    return (
      linkedProfiles?.Response?.bnetMembership ||
      linkedProfiles?.Response?.profiles[0] ||
      linkedProfiles?.Response?.profilesWithErrors[0].infoCard ||
      undefined
    );
  }

  async bungieRequest(config: AxiosRequestConfig, stats?: boolean) {
    const requestConfig = {
      ...config,
      headers: {
        'X-API-Key': this.bungieKeys[
          Math.floor(Math.random() * this.bungieKeys.length)
        ],
        'User-Agent': `Guardian Theater/1.0 AppId/10839 (+guardian.theater;fried.chris+theater@gmail.com)`,
      },
    };
    if (stats) {
      requestConfig.url = requestConfig.url.replace(
        'https://www.bungie.net/',
        'https://stats.bungie.net/',
      );
    }
    return this.httpService
      .request(requestConfig)
      .pipe(map(res => res.data))
      .toPromise();
  }
}
