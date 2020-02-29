import { Injectable, HttpService } from '@nestjs/common';
import { HttpClientConfig } from 'bungie-api-ts/http';
import { map } from 'rxjs/operators';

@Injectable()
export class BungieService {
  constructor(private readonly httpService: HttpService) {}

  async bungieRequest(config: HttpClientConfig) {
    const requestConfig = {
      ...config,
      headers: {
        'X-API-Key': process.env.BUNGIE_API_KEY,
      },
    };
    return this.httpService
      .request(requestConfig)
      .pipe(map(res => res.data))
      .toPromise();
  }
}
