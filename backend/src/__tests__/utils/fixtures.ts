import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Building } from '../../entities/Building';
import { Entrance } from '../../entities/Entrance';
import { Unit } from '../../entities/Unit';
import { MeterType } from '../../entities/MeterType';
import { Meter } from '../../entities/Meter';
import { TicketCategory } from '../../entities/TicketCategory';

export async function createTestUser(userRepo: Repository<User>, data: Partial<User> = {}): Promise<User> {
  const hashedPassword = await bcrypt.hash(data.password || 'TestPass123!', 10);
  
  const user = userRepo.create({
    email: data.email || `test-${Date.now()}@example.com`,
    passwordHash: hashedPassword,
    firstName: data.firstName || 'Test',
    lastName: data.lastName || 'User',
    phone: data.phone || '+79001234567',
    isActive: data.isActive ?? true,
    emailVerified: data.emailVerified ?? true,
    ...data,
  });

  return await userRepo.save(user);
}

export async function createTestCompany(companyRepo: Repository<Company>, data: Partial<Company> = {}): Promise<Company> {
  const company = companyRepo.create({
    name: data.name || `Test Company ${Date.now()}`,
    email: data.email || `company-${Date.now()}@example.com`,
    phone: data.phone || '+79001234567',
    address: data.address || 'Test Address',
    isActive: data.isActive ?? true,
    ...data,
  });

  return await companyRepo.save(company);
}

export async function createTestCondo(condoRepo: Repository<Condo>, companyId: string, data: Partial<Condo> = {}): Promise<Condo> {
  const condo = condoRepo.create({
    companyId,
    name: data.name || `Test Condo ${Date.now()}`,
    address: data.address || 'Test Address, 1',
    city: data.city || 'Moscow',
    state: data.state || 'Moscow',
    zipCode: data.zipCode || '101000',
    country: data.country || 'Russia',
    totalUnits: data.totalUnits || 100,
    ...data,
  });

  return await condoRepo.save(condo);
}

export async function createTestBuilding(buildingRepo: Repository<Building>, condoId: string, data: Partial<Building> = {}): Promise<Building> {
  const building = buildingRepo.create({
    condoId,
    name: data.name || `Building ${Date.now()}`,
    address: data.address || 'Building Address',
    floors: data.floors || 10,
    ...data,
  });

  return await buildingRepo.save(building);
}

export async function createTestEntrance(entranceRepo: Repository<Entrance>, buildingId: string, data: Partial<Entrance> = {}): Promise<Entrance> {
  const entrance = entranceRepo.create({
    buildingId,
    number: data.number || '1',
    floors: data.floors || 10,
    ...data,
  });

  return await entranceRepo.save(entrance);
}

export async function createTestUnit(unitRepo: Repository<Unit>, condoId: string, data: Partial<Unit> = {}): Promise<Unit> {
  const unit = unitRepo.create({
    condoId,
    unitNumber: data.unitNumber || `${Date.now()}`,
    floor: data.floor || 5,
    area: data.area || 65.5,
    rooms: data.rooms || 3,
    ownerName: data.ownerName || 'Test Owner',
    ownerPhone: data.ownerPhone || '+79001234567',
    ownerEmail: data.ownerEmail || `owner-${Date.now()}@example.com`,
    isOccupied: data.isOccupied ?? true,
    ...data,
  });

  return await unitRepo.save(unit);
}

export async function createTestMeterType(meterTypeRepo: Repository<MeterType>, data: Partial<MeterType> = {}): Promise<MeterType> {
  const meterType = meterTypeRepo.create({
    name: data.name || `Meter Type ${Date.now()}`,
    unitOfMeasurement: data.unitOfMeasurement || 'kWh',
    description: data.description || 'Test meter type',
    ...data,
  });

  return await meterTypeRepo.save(meterType);
}

export async function createTestMeter(meterRepo: Repository<Meter>, unitId: string, meterTypeId: string, data: Partial<Meter> = {}): Promise<Meter> {
  const meter = meterRepo.create({
    unitId,
    meterTypeId,
    serialNumber: data.serialNumber || `SN-${Date.now()}`,
    installationDate: data.installationDate || new Date('2024-01-01'),
    lastReadingDate: data.lastReadingDate,
    lastReadingValue: data.lastReadingValue,
    isActive: data.isActive ?? true,
    ...data,
  });

  return await meterRepo.save(meter);
}

export async function createTestTicketCategory(categoryRepo: Repository<TicketCategory>, data: Partial<TicketCategory> = {}): Promise<TicketCategory> {
  const category = categoryRepo.create({
    name: data.name || `Category ${Date.now()}`,
    description: data.description || 'Test category',
    color: data.color || '#FF0000',
    ...data,
  });

  return await categoryRepo.save(category);
}
