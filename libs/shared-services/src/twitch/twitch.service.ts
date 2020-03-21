/* eslint-disable @typescript-eslint/camelcase */
import { Injectable, HttpService } from '@nestjs/common';
import { GetUsersResponse, GetVideosResponse } from './twitch.types';
import { AxiosResponse } from 'axios';

@Injectable()
export class TwitchService {
  accessToken: string;
  tokenExpiration: Date;
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(private readonly httpService: HttpService) {}

  async authenticateTwitch() {
    if (this.accessToken && new Date() < this.tokenExpiration) {
      return {
        Authorization: `Bearer ${this.accessToken}`,
      };
    } else {
      const res = await this.httpService
        .request({
          url: `https://id.twitch.tv/oauth2/token`,
          method: 'post',
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials',
          },
        })
        .toPromise();
      this.tokenExpiration = new Date();
      this.tokenExpiration = new Date(
        this.tokenExpiration.setSeconds(
          this.tokenExpiration.getSeconds() + res.data.expires_in - 100,
        ),
      );
      this.accessToken = res.data.access_token;
      return {
        Authorization: `Bearer ${this.accessToken}`,
      };
    }
  }

  async getUsersFromLogin(
    logins: string[],
  ): Promise<AxiosResponse<GetUsersResponse>> {
    const headers = await this.authenticateTwitch();

    const strippedLogins = [];

    for (let i = 0; i < logins.length; i++) {
      let login = logins[i];
      login = login.replace(/\s/g, '');
      if (/^(\w+)$/.test(login) && login.length > 3 && login.length < 26) {
        strippedLogins.push(encodeURIComponent(login));
      }
    }

    const joinedLogins = strippedLogins.join('&login=');

    return this.httpService
      .request({
        url: `https://api.twitch.tv/helix/users?login=${joinedLogins}`,
        method: 'get',
        headers,
      })
      .toPromise();
  }

  async getUserFromId(id: string): Promise<AxiosResponse<GetUsersResponse>> {
    const headers = await this.authenticateTwitch();
    return this.httpService
      .request({
        url: `https://api.twitch.tv/helix/users?id=${id}`,
        method: 'get',
        headers,
      })
      .toPromise();
  }

  async getClips(broadcaster_id: string) {
    const headers = await this.authenticateTwitch();
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );
    return this.httpService
      .request({
        url: `https://api.twitch.tv/helix/clips`,
        method: 'get',
        headers,
        params: {
          broadcaster_id,
          first: 100,
          started_at: dateCutOff.toISOString(),
          ended_at: new Date().toISOString(),
        },
      })
      .toPromise();
  }

  async getVideos(user_id: string): Promise<AxiosResponse<GetVideosResponse>> {
    const headers = await this.authenticateTwitch();
    return this.httpService
      .request({
        url: `https://api.twitch.tv/helix/videos`,
        method: 'get',
        headers,
        params: {
          user_id,
          first: 100,
          type: 'archive',
        },
      })
      .toPromise();
  }
}
