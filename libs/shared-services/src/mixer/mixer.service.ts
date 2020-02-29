import { Injectable, HttpService } from '@nestjs/common';
import { UserWithChannel } from './mixer.types';
import { AxiosResponse } from 'axios';

@Injectable()
export class MixerService {
  constructor(private readonly httpService: HttpService) {}

  async searchUser(query: string): Promise<AxiosResponse<UserWithChannel[]>> {
    return this.httpService
      .request({
        method: 'get',
        url: 'https://mixer.com/api/v1/users/search',
        params: {
          query,
          limit: 1,
        },
      })
      .toPromise();
  }

  async getChannelRecordings(channelId: number) {
    return this.httpService
      .request({
        method: 'get',
        url: `https://mixer.com/api/v1/channels/${channelId}/recordings`,
        params: {
          limit: 100,
        },
      })
      .toPromise();
  }
}
