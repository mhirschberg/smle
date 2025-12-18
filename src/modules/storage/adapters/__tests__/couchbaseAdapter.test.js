const CouchbaseAdapter = require('../couchbaseAdapter');
const couchbase = require('couchbase');

// Mock couchbase sdk
jest.mock('couchbase');

describe('CouchbaseAdapter', () => {
    let adapter;
    let mockCluster;
    let mockBucket;
    let mockCollection;

    const config = {
        couchbase: {
            connectionString: 'couchbase://test',
            username: 'user',
            password: 'pass',
            bucketName: 'test-bucket'
        }
    };

    beforeEach(() => {
        // Setup mocks
        mockCollection = {
            get: jest.fn(),
            insert: jest.fn(),
            upsert: jest.fn(),
            remove: jest.fn()
        };

        mockBucket = {
            scope: jest.fn().mockReturnValue({
                collection: jest.fn().mockReturnValue(mockCollection)
            })
        };

        mockCluster = {
            bucket: jest.fn().mockReturnValue(mockBucket),
            close: jest.fn(),
            query: jest.fn()
        };

        couchbase.connect.mockResolvedValue(mockCluster);
    });

    it('should connect to couchbase', async () => {
        adapter = new CouchbaseAdapter(config);
        await adapter.connect();

        expect(couchbase.connect).toHaveBeenCalledWith(
            config.couchbase.connectionString,
            expect.objectContaining({
                username: config.couchbase.username,
                password: config.couchbase.password
            })
        );
        expect(adapter.cluster).toBeDefined();
        expect(adapter.bucket).toBeDefined();
        // Check collections initialized
        expect(adapter.collections.searches).toBeDefined();
    });

    it('should get a document', async () => {
        adapter = new CouchbaseAdapter(config);
        await adapter.connect();

        const key = 'doc-1';
        const docContent = { id: key, val: 1 };
        mockCollection.get.mockResolvedValue({ content: docContent });

        const result = await adapter.get('searches', key);

        expect(mockCollection.get).toHaveBeenCalledWith(key);
        expect(result).toEqual(docContent);
    });

    it('should return null if document not found', async () => {
        adapter = new CouchbaseAdapter(config);
        await adapter.connect();

        const error = new Error('not found');
        error.name = 'DocumentNotFoundError';
        mockCollection.get.mockRejectedValue(error);

        const result = await adapter.get('searches', 'missing');
        expect(result).toBeNull();
    });

    it('should insert a document', async () => {
        adapter = new CouchbaseAdapter(config);
        await adapter.connect();

        const key = 'new-doc';
        const doc = { foo: 'bar' };
        mockCollection.insert.mockResolvedValue({ cas: '123' });

        await adapter.insert('searches', key, doc);

        expect(mockCollection.insert).toHaveBeenCalledWith(key, doc);
    });
});
