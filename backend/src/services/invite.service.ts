import crypto from 'crypto';
import { AppDataSource } from '../db/data-source';
import { Invite, InviteRole } from '../entities/Invite';
import { Resident } from '../entities/Resident';
import { Unit } from '../entities/Unit';
import { User } from '../entities/User';
import { logger } from '../utils/logger';
import { LessThan } from 'typeorm';

const inviteRepository = AppDataSource.getRepository(Invite);
const residentRepository = AppDataSource.getRepository(Resident);
const userRepository = AppDataSource.getRepository(User);
const unitRepository = AppDataSource.getRepository(Unit);

export class InviteService {
  /**
   * Create invite
   */
  async createInvite(data: {
    unitId: string;
    email: string;
    role: InviteRole;
    expiresInDays?: number;
  }): Promise<Invite> {
    try {
      // Check if unit exists
      const unit = await unitRepository.findOne({
        where: { id: data.unitId },
      });

      if (!unit) {
        throw new Error('Unit not found');
      }

      // Check if user already exists and is resident
      const existingUser = await userRepository.findOne({
        where: { email: data.email },
      });

      if (existingUser) {
        const existingResident = await residentRepository.findOne({
          where: {
            userId: existingUser.id,
            unitId: data.unitId,
            isActive: true,
          },
        });

        if (existingResident) {
          throw new Error('User is already a resident of this unit');
        }
      }

      // Check if invite already exists
      const existingInvite = await inviteRepository.findOne({
        where: {
          unitId: data.unitId,
          email: data.email,
          acceptedAt: null,
        },
      });

      if (existingInvite && existingInvite.expiresAt > new Date()) {
        throw new Error('Active invite already exists for this email');
      }

      // Generate token
      const token = crypto.randomBytes(32).toString('hex');

      // Calculate expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays || 7));

      const invite = inviteRepository.create({
        unitId: data.unitId,
        email: data.email,
        role: data.role,
        token,
        expiresAt,
      });

      await inviteRepository.save(invite);

      logger.info('Invite created', {
        inviteId: invite.id,
        email: data.email,
        unitId: data.unitId,
      });

      return invite;
    } catch (error) {
      logger.error('Failed to create invite', { error });
      throw error;
    }
  }

  /**
   * Get invite by token
   */
  async getInviteByToken(token: string): Promise<Invite | null> {
    try {
      return await inviteRepository.findOne({
        where: { token },
        relations: ['unit', 'unit.entrance', 'unit.entrance.building', 'unit.entrance.building.condo'],
      });
    } catch (error) {
      logger.error('Failed to get invite by token', { error });
      throw error;
    }
  }

  /**
   * Accept invite
   */
  async acceptInvite(token: string, userId: string): Promise<Resident> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invite = await inviteRepository.findOne({
        where: { token },
      });

      if (!invite) {
        throw new Error('Invite not found');
      }

      if (invite.acceptedAt) {
        throw new Error('Invite already accepted');
      }

      if (invite.expiresAt < new Date()) {
        throw new Error('Invite expired');
      }

      // Create resident
      const resident = residentRepository.create({
        userId,
        unitId: invite.unitId,
        role: invite.role as any,
      });

      await queryRunner.manager.save(resident);

      // Mark invite as accepted
      invite.acceptedAt = new Date();
      await queryRunner.manager.save(invite);

      await queryRunner.commitTransaction();

      logger.info('Invite accepted', {
        inviteId: invite.id,
        userId,
        unitId: invite.unitId,
      });

      return resident;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to accept invite', { error, token });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get invites by unit
   */
  async getInvitesByUnit(unitId: string): Promise<Invite[]> {
    try {
      return await inviteRepository.find({
        where: { unitId },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      logger.error('Failed to get invites by unit', { error, unitId });
      throw error;
    }
  }

  /**
   * Revoke invite
   */
  async revokeInvite(inviteId: string): Promise<void> {
    try {
      const invite = await inviteRepository.findOne({
        where: { id: inviteId },
      });

      if (!invite) {
        throw new Error('Invite not found');
      }

      // Set expiration to now
      invite.expiresAt = new Date();
      await inviteRepository.save(invite);

      logger.info('Invite revoked', { inviteId });
    } catch (error) {
      logger.error('Failed to revoke invite', { error, inviteId });
      throw error;
    }
  }

  /**
   * Clean up expired invites
   */
  async cleanupExpiredInvites(): Promise<number> {
    try {
      const result = await inviteRepository.delete({
        expiresAt: LessThan(new Date()),
        acceptedAt: null,
      });

      logger.info('Cleaned up expired invites', { count: result.affected });
      return result.affected || 0;
    } catch (error) {
      logger.error('Failed to cleanup expired invites', { error });
      throw error;
    }
  }
}

export const inviteService = new InviteService();
