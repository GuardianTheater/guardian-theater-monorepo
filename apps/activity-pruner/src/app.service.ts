import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { getConnection } from 'typeorm';
import { PgcrEntity } from '@services/shared-services/bungie/pgcr.entity';
import { PgcrEntryEntity } from '@services/shared-services/bungie/pgcr-entry.entity';

@Injectable()
export class AppService {
  daysOfHistory = parseInt(process.env.DAYS_OF_HISTORY, 10);

  constructor(public readonly logger: Logger) {
    this.logger.setContext('ActivityPruner');
  }

  @Interval(10800000)
  handleInterval() {
    this.pruneActivityHistory().catch(() =>
      this.logger.error(`Error running pruneActivityHistory`),
    );
  }

  async pruneActivityHistory() {
    const dateCutOff = new Date(
      new Date().setDate(new Date().getDate() - this.daysOfHistory),
    );
    this.logger.log('deleting old activities...');
    const deletedEntries = await getConnection()
      .createQueryBuilder()
      .delete()
      .from(PgcrEntryEntity)
      .where(
        `instance = ANY (SELECT "instance"."instanceId" AS "instanceId" FROM "pgcr_entity" "instance" WHERE "instance"."period" < '${dateCutOff.toISOString()}')`,
      )
      .execute();
    this.logger.log(deletedEntries);
    const deletedInstances = await getConnection()
      .createQueryBuilder()
      .delete()
      .from(PgcrEntity)
      .where(`period < '${dateCutOff.toISOString()}'`)
      .execute();
    this.logger.log(deletedInstances);

    // this.logger.log('refreshing streamervsstreamer');
    // await getConnection()
    //   .query(`REFRESH MATERIALIZED VIEW CONCURRENTLY svs`)
    //   .catch(e => this.logger.error(e));
    // this.logger.log('refreshed streamervsstreamer');
  }
}
