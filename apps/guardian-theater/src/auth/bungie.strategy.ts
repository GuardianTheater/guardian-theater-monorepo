import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-bungie-oauth2';
import { AuthService } from './auth.service';

@Injectable()
export class BungieStrategy extends PassportStrategy(Strategy, 'bungie') {
  constructor(private readonly authService: AuthService) {
    super({
      authorizationURL: 'https://www.bungie.net/en/oauth/authorize',
      tokenURL: 'https://www.bungie.net/platform/app/oauth/token/',
      clientID: process.env.BUNGIE_CLIENT_ID,
      clientSecret: process.env.BUNGIE_CLIENT_SECRET,
    });
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: { membershipId: string },
    done: Function,
  ) {
    try {
      const jwt: string = await this.authService.validateOAuthLogin(
        profile,
        'bungie',
      );
      const user = {
        jwt,
        refreshToken,
      };

      done(null, user);
    } catch (err) {
      done(err, false);
    }
  }
}
