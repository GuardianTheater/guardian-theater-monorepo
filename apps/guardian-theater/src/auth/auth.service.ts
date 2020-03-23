import {
  Injectable,
  InternalServerErrorException,
  HttpService,
} from '@nestjs/common';
import { AxiosResponse } from 'axios';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly JWT_SECRET_KEY = process.env.JWT_SECRET_KEY; // <- replace this with your secret key

  constructor(
    /*private readonly usersService: UsersService*/
    private httpService: HttpService,
    private jwtService: JwtService,
  ) {
    //
  }

  async validateOAuthLogin(
    profile: { membershipId: string },
    provider: 'bungie' | 'twitch' | 'mixer',
  ): Promise<string> {
    try {
      // You can add some registration logic here,
      // to register the user using their thirdPartyId (in this case their googleId)
      // let user: IUser = await this.usersService.findOneByThirdPartyId(thirdPartyId, provider);

      // if (!user)
      // user = await this.usersService.registerOAuthUser(thirdPartyId, provider);

      const payload = {
        membershipId: profile.membershipId,
        provider,
      };

      const jwt: string = this.jwtService.sign(payload);
      return jwt;
    } catch (err) {
      throw new InternalServerErrorException('validateOAuthLogin', err.message);
    }
  }

  async getTwitchToken(code: string) {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${process.env.BASE_URL}/auth/twitch/callback`;
    const res = await this.httpService
      .post(url)
      .toPromise()
      .catch(e => {
        return {} as AxiosResponse<any>;
      });
    const userInfoUrl = `https://id.twitch.tv/oauth2/userinfo`;
    const userInfo = await this.httpService
      .get(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${res.data.access_token}`,
        },
      })
      .toPromise()
      .catch(e => {
        return {} as AxiosResponse<any>;
      });
    const jwt = this.jwtService.sign({
      provider: 'twitch',
      userId: userInfo.data.sub,
    });
    return jwt;
  }

  // async getMixerToken(code: string) {
  //   const url = `https://mixer.com/api/v1/oauth/token?client_id=${process.env.MIXER_CLIENT_ID}&client_secret=${process.env.MIXER_CLIENT_SECRET}&code=${code}&grant_type=authorization_code`;
  //   const res = await this.httpService
  //     .post(url)
  //     .toPromise()
  //     .catch(e => {
  //       console.log(e);
  //       return {} as AxiosResponse<any>;
  //     });
  //   console.log(res);
  //   return '';
  //   // const userInfoUrl = `https://id.twitch.tv/oauth2/userinfo`;
  //   // const userInfo = await this.httpService
  //   //   .get(userInfoUrl, {
  //   //     headers: {
  //   //       Authorization: `Bearer ${res.data.access_token}`,
  //   //     },
  //   //   })
  //   //   .toPromise()
  //   //   .catch(e => {
  //   //     console.log(e);
  //   //     return {} as AxiosResponse<any>;
  //   //   });
  //   // const jwt = sign(
  //   //   {
  //   //     provider: 'twitch',
  //   //     userId: userInfo.data.sub,
  //   //   },
  //   //   this.JWT_SECRET_KEY,
  //   //   {
  //   //     expiresIn: 3600,
  //   //   },
  //   // );
  //   // return jwt;
  // }
}
