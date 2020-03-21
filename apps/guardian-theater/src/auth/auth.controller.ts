/* eslint-disable @typescript-eslint/camelcase */
import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  Post,
  Body,
  HttpService,
  Query,
} from '@nestjs/common';
import * as qs from 'querystring';
import { AxiosResponse } from 'axios';
import { AuthService } from './auth.service';
import { BungieAuthGuard } from './bungie-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private httpService: HttpService,
    private authService: AuthService,
  ) {}

  @Get('bungie')
  @UseGuards(BungieAuthGuard)
  bungieLogin() {
    //
  }

  @Get('bungie/callback')
  @UseGuards(BungieAuthGuard)
  bungieLoginCallback(@Req() req, @Res() res) {
    const jwt: string = req.user.jwt;
    const refreshToken: string = req.user.refreshToken;
    if (jwt)
      res.redirect(
        `${process.env.ORIGIN}/login/success/${encodeURIComponent(
          jwt,
        )}/${encodeURIComponent(refreshToken)}`,
      );
    else res.redirect(`${process.env.ORIGIN}/login/failure`);
  }

  @Get('twitch')
  twitchLogin(@Req() req, @Res() res) {
    res.redirect(
      `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.BASE_URL}/auth/twitch/callback&response_type=code`,
    );
  }

  @Get('twitch/callback')
  async twitchLoginCallback(@Query('code') code, @Req() req, @Res() res) {
    const jwt: string = await this.authService.getTwitchToken(code);
    if (jwt)
      res.redirect(
        `${process.env.ORIGIN}/login/success/${encodeURIComponent(jwt)}/null`,
      );
    else res.redirect(`${process.env.ORIGIN}/login/failure`);
  }

  // @Get('mixer')
  // mixerLogin(@Req() req, @Res() res) {
  //   res.redirect(
  //     `https://mixer.com/oauth/authorize?client_id=${process.env.MIXER_CLIENT_ID}&redirect_uri=https://api.guardian.theater/auth/mixer/callback&response_type=code`,
  //   );
  // }

  // @Get('mixer/callback')
  // async mixerLoginCallback(@Query('code') code, @Req() req, @Res() res) {
  //   const jwt: string = await this.authService.getMixerToken(code);
  //   // const refreshToken: string = req.user.refreshToken;
  //   // if (jwt)
  //   //   res.redirect(
  //   //     `${process.env.ORIGIN}/login/success/${encodeURIComponent(
  //   //       jwt,
  //   //     )}/${encodeURIComponent(refreshToken)}`,
  //   //   );
  //   // else res.redirect(`${process.env.ORIGIN}/login/failure`);
  // }

  @Post('bungie/refresh')
  async refreshBungieJwt(@Body() refreshBungieDto: { refreshToken: string }) {
    const requestBody = {
      client_id: process.env.BUNGIE_CLIENT_ID,
      client_secret: process.env.BUNGIE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshBungieDto.refreshToken,
    };
    try {
      const res = await this.httpService
        .post(
          'https://www.bungie.net/Platform/App/OAuth/token/',
          qs.stringify(requestBody),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        )
        .toPromise()
        .catch(e => {
          return {} as AxiosResponse<any>;
        });
      const jwt: string = await this.authService.validateOAuthLogin(
        { membershipId: res.data.membership_id },
        'bungie',
      );
      const refreshToken = res.data.refresh_token;
      return {
        jwt,
        refreshToken,
      };
    } catch (e) {}
  }
}
