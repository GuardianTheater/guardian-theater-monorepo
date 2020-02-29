import { Injectable, HttpService } from '@nestjs/common';
import { XboxGameClipsResponse } from './xbox.types';
import { AxiosResponse } from 'axios';

@Injectable()
export class XboxService {
  titleIdConsole = 144389848;
  titleIdPc = 1762047744;

  constructor(private readonly httpService: HttpService) {}

  async fetchConsoleDestiny2ClipsForGamertag(
    gamertag?: string,
  ): Promise<AxiosResponse<XboxGameClipsResponse>> {
    const uri = `https://api.xboxrecord.us/gameclips/gamertag/${gamertag}/titleid/${this.titleIdConsole}`;
    return this.httpService.get(uri).toPromise();
  }

  //   async updateClipsForGamertag(gamertag: string) {
  //     const xboxAccount = await this.xboxAccountRespository.findOne(gamertag);
  //     xboxAccount.lastClipCheck = new Date().toISOString();

  //     const clips = await this.fetchClipsFromXRU(gamertag);
  //     console.log('fetched new clips for', gamertag);

  //     const dateCutOff = new Date(
  //       new Date().setDate(new Date().getDate() - this.daysOfHistory),
  //     );

  //     const xboxClips: XboxClipEntity[] = [];
  //     clips.data?.gameClips?.some(clip => {
  //       const endStamp = new Date(clip.dateRecorded);
  //       if (endStamp < dateCutOff) {
  //         return true;
  //       }
  //       endStamp.setSeconds(endStamp.getSeconds() + clip.durationInSeconds);
  //       const xboxClipEntity = new XboxClipEntity();
  //       xboxClipEntity.gameClipId = clip.gameClipId;
  //       xboxClipEntity.xboxAccount = xboxAccount;
  //       xboxClipEntity.xuid = clip.xuid;
  //       xboxClipEntity.scid = clip.scid;
  //       xboxClipEntity.thumbnailUri = clip.thumbnails.pop().uri;
  //       xboxClipEntity.dateRecordedRange = `[${
  //         clip.dateRecorded
  //       }, ${endStamp.toISOString()}]`;
  //       xboxClips.push(xboxClipEntity);
  //     });

  //     await this.xboxClipRespository
  //       .find({ where: { xboxAccount: gamertag } })
  //       .then(oldClips => {
  //         for (let i = 0; i < oldClips.length; i++) {
  //           const oldClip = oldClips[i];
  //           let match = false;
  //           xboxClips.some(newClip => {
  //             if (newClip.gameClipId === oldClip.gameClipId) {
  //               match = true;
  //               return true;
  //             }
  //           });
  //           if (!match) {
  //             this.xboxClipRespository.delete(oldClip.gameClipId);
  //           }
  //         }
  //         console.log('deleted old clips for', gamertag);
  //       });

  //     await getConnection().manager.save(xboxClips);
  //     console.log('created new clips for', gamertag);
  //   }

  //   async updateClipsForAllAccounts() {
  //     const accounts = await this.xboxAccountRespository.find();

  //     accounts.forEach(account => {
  //       this.updateClipsForGamertag(account.gamertag);
  //     });
  //   }
}
