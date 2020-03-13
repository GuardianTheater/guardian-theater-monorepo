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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import * as qs from 'querystring';
import { AxiosResponse } from 'axios';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private httpService: HttpService,
    private authService: AuthService,
  ) {}

  @Get('bungie')
  @UseGuards(AuthGuard('bungie'))
  bungieLogin() {
    //
  }

  @Get('bungie/callback')
  @UseGuards(AuthGuard('bungie'))
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

  @Get('protected')
  @UseGuards(AuthGuard('jwt'))
  protectedResource() {
    return 'JWT is working!';
  }

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
          console.log(e);
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
