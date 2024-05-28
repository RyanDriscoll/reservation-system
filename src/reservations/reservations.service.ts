import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { addDays, addMinutes, endOfDay, isEqual, startOfDay } from 'date-fns';
import { CronService } from 'src/cron/cron.service';
import { CreateAppointmentDto } from 'src/dto/create-appointment.dto copy';
import { CreateAvailabilityDto } from 'src/dto/create-availability.dto';
import { Appointment } from 'src/entities/reservations/appointment.entity';
import { Availability } from 'src/entities/reservations/availability.entity';
import { Provider } from 'src/entities/users/provider.entity';
import { Between, DeleteResult, Repository } from 'typeorm';

const RESERVATION_EXPIRATION_MINUTES = 30;

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Availability)
    private availabilityRepository: Repository<Availability>,
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    private cronService: CronService,
  ) {}

  async createAvailability(
    createAvailabilityDto: CreateAvailabilityDto,
  ): Promise<Availability> {
    const provider = await this.providersRepository.findOne({
      where: { providerId: createAvailabilityDto.providerId },
    });
    if (!provider) {
      throw new Error(
        `Provider with id: ${createAvailabilityDto.providerId} does not exist`,
      );
    }
    const availability = this.availabilityRepository.create({
      ...createAvailabilityDto,
      provider,
    });
    await this.availabilityRepository.save(availability);
    return availability;
  }

  async getAvailability({
    providerId,
    startDate,
    numDays,
  }: {
    providerId: number;
    startDate?: string;
    numDays?: number;
  }): Promise<Availability[]> {
    const startDateJs = startOfDay(this.getJsDate(startDate));
    // default to 7 days from now
    const endDateJs = endOfDay(addDays(startDateJs, numDays ?? 7));

    const availability = await this.availabilityRepository.find({
      where: {
        provider: {
          providerId,
        },
        date: Between(startDateJs, endDateJs),
      },
      relations: ['appointments'],
    });

    const availabilityWithOpenAppointments =
      this.getAvailabilityWithOpenAppointments(availability);

    return availabilityWithOpenAppointments;
  }

  /**
   * getAvailabilityWithOpenAppointments
   *
   * This is a cool function that really should have been unit tested rather
   * than relying on e2e tests.
   *
   * It takes a provider's availability with the existing appointments, determines
   * which time slots are available, and returns the availability with the open
   * appointments rather than the reserved ones
   */
  getAvailabilityWithOpenAppointments(
    availability: Availability[],
  ): Availability[] {
    return availability.map((avail) => {
      const { startTime, endTime, appointments } = avail;
      const availableAppointments = [];
      const existingAppoinments = appointments.map(
        ({ appointmentTime }) => new Date(appointmentTime),
      );
      let date = new Date(startTime);
      while (!isEqual(date, new Date(endTime))) {
        if (existingAppoinments.every((d) => !isEqual(date, d))) {
          availableAppointments.push({
            appointmentTime: date.toISOString(),
          });
        }
        date = addMinutes(date, 15);
      }
      return { ...avail, appointments: availableAppointments };
    });
  }

  async createAppointment(
    createAppointmentDto: CreateAppointmentDto,
  ): Promise<Appointment> {
    const availability = await this.availabilityRepository.findOne({
      where: {
        availabilityId: createAppointmentDto.availabilityId,
      },
      relations: ['appointments'],
    });
    let appointment = this.appointmentRepository.create(createAppointmentDto);

    appointment.availability = availability;

    appointment = await this.appointmentRepository.save(appointment);

    // schedule cron job
    this.cronService.scheduleJob(
      `appointment-${appointment.appointmentId}`,
      this.getDateThirtyMinutesFromNow(),
      this.deleteUnconfirmedAppointment(appointment.appointmentId),
    );

    // remove existing appointments because it's nobody's business
    delete appointment.availability.appointments;
    return appointment;
  }

  async confirmAppointment(appointmentId: number) {
    await this.appointmentRepository.update(
      {
        appointmentId,
      },
      { confirmed: true },
    );
    return this.appointmentRepository.findOne({ where: { appointmentId } });
  }

  deleteUnconfirmedAppointment(
    appointmentId: number,
  ): () => Promise<DeleteResult> {
    return () =>
      this.appointmentRepository.delete({
        appointmentId,
        confirmed: false,
      });
  }

  getDateThirtyMinutesFromNow() {
    const date = new Date();
    date.setMinutes(date.getMinutes() + RESERVATION_EXPIRATION_MINUTES);
    return date;
  }

  getJsDate(dateString?: string): Date {
    let jsDate = new Date(dateString);
    if (jsDate.toString() === 'Invalid Date') {
      jsDate = new Date();
    }
    return jsDate;
  }
}
