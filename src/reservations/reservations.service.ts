import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateAvailabilityDto } from 'src/dto/create-availability.dto';
import { Appointment } from 'src/entities/reservations/appointment.entity';
import { Availability } from 'src/entities/reservations/availability.entity';
import { Provider } from 'src/entities/users/provider.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Availability)
    private availabilityRepository: Repository<Availability>,
    @InjectRepository(Appointment)
    private appointmentRespository: Repository<Appointment>,
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
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

  getJsDate(dateString?: string): Date {
    let jsDate = new Date(dateString);
    if (jsDate.toString() === 'Invalid Date') {
      jsDate = new Date();
    }
    return jsDate;
  }
}
