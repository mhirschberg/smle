const campaignRepository = require('../campaignRepository');
const dbFactory = require('../../storage/dbFactory');

// Mock dbFactory and db instance
jest.mock('../../storage/dbFactory');

describe('CampaignRepository', () => {
    let mockDb;

    beforeEach(() => {
        // Reset the singleton's db instance to ensure it gets the fresh mockDb
        campaignRepository.db = null;

        mockDb = {
            query: jest.fn(),
            get: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
            insert: jest.fn()
        };
        dbFactory.getDB.mockResolvedValue(mockDb);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getById', () => {
        it('should fetch campaign by id', async () => {
            const campaignId = '123';
            const mockCampaign = { id: campaignId, name: 'Test Campaign' };
            mockDb.get.mockResolvedValue(mockCampaign);

            const result = await campaignRepository.getById(campaignId);

            expect(dbFactory.getDB).toHaveBeenCalled();
            expect(mockDb.get).toHaveBeenCalledWith('searches', campaignId);
            expect(result).toEqual(mockCampaign);
        });
    });

    describe('create', () => {
        it('should upsert campaign', async () => {
            const campaignData = { id: '123', name: 'New Campaign' };
            mockDb.upsert.mockResolvedValue({ cas: '123' });

            await campaignRepository.create(campaignData);

            expect(mockDb.upsert).toHaveBeenCalledWith('searches', campaignData.id, campaignData);
        });
    });

    describe('getRunningCount', () => {
        it('should return count of running searches', async () => {
            const campaignId = '123';
            mockDb.query.mockResolvedValue([{ count: 5 }]);

            const count = await campaignRepository.getRunningCount(campaignId);

            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('SELECT COUNT(*)'), {
                parameters: { campaignId }
            });
            expect(count).toBe(5);
        });

        it('should return 0 if no result', async () => {
            const campaignId = '123';
            mockDb.query.mockResolvedValue([]);

            const count = await campaignRepository.getRunningCount(campaignId);

            expect(count).toBe(0);
        });
    });
});
