import { Controller, Get, UseGuards, Req, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  @Get('bungie')
  @UseGuards(AuthGuard('bungie'))
  bungieLogin() {
    //
  }

  @Get('bungie/callback')
  @UseGuards(AuthGuard('bungie'))
  bungieLoginCallback(@Req() req, @Res() res) {
    const jwt: string = req.user.jwt;
    if (jwt) res.redirect('http://localhost:4200/login/succes/' + jwt);
    else res.redirect('http://localhost:4200/login/failure');
  }

  @Get('protected')
  @UseGuards(AuthGuard('jwt'))
  protectedResource() {
    return 'JWT is working!';
  }
}
