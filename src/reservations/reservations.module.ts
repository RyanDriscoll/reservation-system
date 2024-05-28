import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronService } from 'src/cron/cron.service';
import { Appointment } from 'src/entities/reservations/appointment.entity';
import { Availability } from 'src/entities/reservations/availability.entity';
import { Provider } from 'src/entities/users/provider.entity';
import { AppointmentsController } from './appointment.controller';
import { AvailabilityController } from './availability.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Availability, Appointment, Provider])],
  providers: [ReservationsService, CronService],
  controllers: [AvailabilityController, AppointmentsController],
})
export class ReservationsModule {}
