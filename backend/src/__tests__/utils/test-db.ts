import { DataSource } from 'typeorm';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { Building } from '../../entities/Building';
import { Entrance } from '../../entities/Entrance';
import { Resident } from '../../entities/Resident';
import { UserRole } from '../../entities/UserRole';
import { Meter } from '../../entities/Meter';
import { MeterType } from '../../entities/MeterType';
import { MeterReading } from '../../entities/MeterReading';
import { Invoice } from '../../entities/Invoice';
import { InvoiceItem } from '../../entities/InvoiceItem';
import { Payment } from '../../entities/Payment';
import { Ticket } from '../../entities/Ticket';
import { TicketCategory } from '../../entities/TicketCategory';
import { TicketComment } from '../../entities/TicketComment';
import { Poll } from '../../entities/Poll';
import { PollOption } from '../../entities/PollOption';
import { PollVote } from '../../entities/PollVote';
import { Notification } from '../../entities/Notification';
import { Document } from '../../entities/Document';
import { Vehicle } from '../../entities/Vehicle';
import { VehicleAccessLog } from '../../entities/VehicleAccessLog';
import { RefreshToken } from '../../entities/RefreshToken';
import { Invite } from '../../entities/Invite';
import { TelegramMessage } from '../../entities/TelegramMessage';
import { AuditLog } from '../../entities/AuditLog';

export async function createTestDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    username: process.env.TEST_DB_USER || 'servai_test',
    password: process.env.TEST_DB_PASSWORD || 'servai_test',
    database: process.env.TEST_DB_NAME || 'servai_test',
    entities: [
      User, Company, Condo, Building, Entrance, Unit,
      Resident, UserRole, Meter, MeterType, MeterReading,
      Invoice, InvoiceItem, Payment, Ticket, TicketCategory,
      TicketComment, Poll, PollOption, PollVote, Notification,
      Document, Vehicle, VehicleAccessLog, RefreshToken,
      Invite, TelegramMessage, AuditLog
    ],
    synchronize: true,
    dropSchema: true,
    logging: false,
  });

  await dataSource.initialize();
  return dataSource;
}
