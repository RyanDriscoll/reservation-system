import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class CronService {
  constructor(private schedulerRegistry: SchedulerRegistry) {}

  scheduleJob(jobName: string, date: Date, callback: () => void) {
    const job = new CronJob(date, callback);
    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }
}
