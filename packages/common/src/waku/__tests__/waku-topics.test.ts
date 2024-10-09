import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { contentTopics } from '../waku-topics.js';
import { MOCK_CHAIN } from '../../tests/mocks.test.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN;

describe('waku-topics', () => {
  it('Should get correct content topics for mock chain', () => {
    expect(contentTopics.fees(chain)).to.equal(
      `/railgun/v2/0-${chain.id}-fees/json`,
    );
    expect(contentTopics.transact(chain)).to.equal(
      `/railgun/v2/0-${chain.id}-transact/json`,
    );
    expect(contentTopics.transactResponse(chain)).to.equal(
      `/railgun/v2/0-${chain.id}-transact-response/json`,
    );
  });
});
