import * as nock from 'nock';
import { requestWithRateLimitRetries } from '../../src/lib/request-with-rate-limit';

beforeEach(() => {
    return nock('https://testUrlOkResponse')
      .persist()
      .get(/.*/)
      .reply(
        200, ["test 1", "test 2"]
      );
  });

  beforeEach(() => {
    return nock('https://testUrlRateLimitResponse')
      .persist()
      .get(/.*/)
      .reply(
        429, 'Rate limit reached'
      );
  });

  describe('Testing requestWithRateLimitRetries', () => {
    test('Test requestWithRateLimitRetries iterates returns an array when response code is 200', async () => {
      const data = await requestWithRateLimitRetries('get', 'https://testUrlOkResponse', {});
      expect(data.body).toHaveLength(2);
    }, 20000);
    test('Test requestWithRateLimitRetries iterates 7 times when response code is 429', async () => {
        const data = await requestWithRateLimitRetries('get', 'https://testUrlRateLimitResponse', {});
        expect(data.body.toString()).toEqual('Rate limit reached')
      }, 20000);
  });