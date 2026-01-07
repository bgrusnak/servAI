import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { Poll } from '../../entities/Poll';
import { PollOption } from '../../entities/PollOption';
import { PollVote } from '../../entities/PollVote';
import {
  createTestUser,
  createTestCompany,
  createTestCondo,
  createTestUnit,
} from '../utils/fixtures';

describe('Poll Service Tests', () => {
  let userRepo: any;
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let pollRepo: any;
  let pollOptionRepo: any;
  let pollVoteRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    pollRepo = testDataSource.getRepository(Poll);
    pollOptionRepo = testDataSource.getRepository(PollOption);
    pollVoteRepo = testDataSource.getRepository(PollVote);
  });

  describe('Poll Creation', () => {
    it('should create a poll with options', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const poll = await pollRepo.save({
        condoId: condo.id,
        createdBy: user.id,
        title: 'Install playground?',
        description: 'Vote to install new playground',
        pollType: 'simple',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'active',
        requiresQuorum: false,
        allowMultipleChoices: false,
        allowAbstain: true,
        isAnonymous: false,
        totalVotes: 0,
      });

      const options = ['Yes', 'No', 'Abstain'];
      for (const optionText of options) {
        await pollOptionRepo.save({
          pollId: poll.id,
          optionText,
          voteCount: 0,
        });
      }

      const savedOptions = await pollOptionRepo.find({
        where: { pollId: poll.id },
      });

      expect(poll.id).toBeDefined();
      expect(poll.status).toBe('active');
      expect(savedOptions.length).toBe(3);
    });

    it('should create poll with quorum requirement', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const poll = await pollRepo.save({
        condoId: condo.id,
        createdBy: user.id,
        title: 'Major renovation',
        pollType: 'budget',
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'active',
        requiresQuorum: true,
        quorumPercent: 50, // 50% required
        totalVotes: 0,
      });

      expect(poll.requiresQuorum).toBe(true);
      expect(poll.quorumPercent).toBe(50);
    });
  });

  describe('Voting', () => {
    it('should record a vote', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);

      const poll = await pollRepo.save({
        condoId: condo.id,
        createdBy: user.id,
        title: 'Test Poll',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active',
        totalVotes: 0,
      });

      const option = await pollOptionRepo.save({
        pollId: poll.id,
        optionText: 'Yes',
        voteCount: 0,
      });

      const vote = await pollVoteRepo.save({
        pollId: poll.id,
        optionId: option.id,
        userId: user.id,
        unitId: unit.id,
        weight: 1.0,
      });

      option.voteCount = 1;
      await pollOptionRepo.save(option);

      poll.totalVotes = 1;
      await pollRepo.save(poll);

      expect(vote.id).toBeDefined();
      expect(vote.weight).toBe(1.0);
    });

    it('should prevent duplicate votes from same user', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);

      const poll = await pollRepo.save({
        condoId: condo.id,
        createdBy: user.id,
        title: 'No double voting',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active',
        allowMultipleChoices: false,
      });

      const option = await pollOptionRepo.save({
        pollId: poll.id,
        optionText: 'Option 1',
        voteCount: 0,
      });

      await pollVoteRepo.save({
        pollId: poll.id,
        optionId: option.id,
        userId: user.id,
        unitId: unit.id,
        weight: 1.0,
      });

      // Try to vote again with same option
      await expect(
        pollVoteRepo.save({
          pollId: poll.id,
          optionId: option.id,
          userId: user.id,
          unitId: unit.id,
          weight: 1.0,
        })
      ).rejects.toThrow();
    });

    it('should calculate quorum', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id, {
        totalUnits: 100,
      });
      const user = await createTestUser(userRepo);

      const poll = await pollRepo.save({
        condoId: condo.id,
        createdBy: user.id,
        title: 'Quorum Test',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active',
        requiresQuorum: true,
        quorumPercent: 50,
        totalVotes: 45,
      });

      const quorumRequired = condo.totalUnits * (poll.quorumPercent / 100);
      const quorumMet = poll.totalVotes >= quorumRequired;

      expect(quorumRequired).toBe(50);
      expect(quorumMet).toBe(false); // 45 < 50
    });
  });

  describe('Poll Status', () => {
    it('should close poll after end date', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const poll = await pollRepo.save({
        condoId: condo.id,
        createdBy: user.id,
        title: 'Expired Poll',
        startDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        endDate: pastDate,
        status: 'closed',
      });

      expect(poll.status).toBe('closed');
      expect(poll.endDate.getTime()).toBeLessThan(Date.now());
    });
  });
});
