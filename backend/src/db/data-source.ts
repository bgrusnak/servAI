import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config';

// Import entities
import { User } from '../entities/User';
import { Company } from '../entities/Company';
import { Condo } from '../entities/Condo';
import { Building } from '../entities/Building';
import { Entrance } from '../entities/Entrance';
import { Unit } from '../entities/Unit';
import { Resident } from '../entities/Resident';
import { Invite } from '../entities/Invite';
import { RefreshToken } from '../entities/RefreshToken';
import { AuditLog } from '../entities/AuditLog';
import { TelegramMessage } from '../entities/TelegramMessage';
import { MeterType } from '../entities/MeterType';
import { Meter } from '../entities/Meter';
import { MeterReading } from '../entities/MeterReading';
import { Invoice } from '../entities/Invoice';
import { InvoiceItem } from '../entities/InvoiceItem';
import { Payment } from '../entities/Payment';
import { Poll } from '../entities/Poll';
import { PollOption } from '../entities/PollOption';
import { PollVote } from '../entities/PollVote';
import { TicketCategory } from '../entities/TicketCategory';
import { Ticket } from '../entities/Ticket';
import { TicketComment } from '../entities/TicketComment';
import { Vehicle } from '../entities/Vehicle';
import { Document } from '../entities/Document';
import { Notification } from '../entities/Notification';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.database.url,
  synchronize: false, // Never true in production
  logging: config.env === 'development',
  entities: [
    User,
    Company,
    Condo,
    Building,
    Entrance,
    Unit,
    Resident,
    Invite,
    RefreshToken,
    AuditLog,
    TelegramMessage,
    MeterType,
    Meter,
    MeterReading,
    Invoice,
    InvoiceItem,
    Payment,
    Poll,
    PollOption,
    PollVote,
    TicketCategory,
    Ticket,
    TicketComment,
    Vehicle,
    Document,
    Notification,
  ],
  migrations: ['src/db/migrations/*.ts'],
  subscribers: [],
  ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
});
