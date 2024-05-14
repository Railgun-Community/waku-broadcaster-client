import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { cachedFeeExpired, nameForRelayer } from '../broadcaster-util.js';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('broadcaster-util', () => {
  it('Should get display names for Relayers', () => {
    expect(nameForRelayer('0zk1234567890', undefined)).to.equal(
      '0zk12345...7890',
    );
    expect(nameForRelayer('0zk1234567890', 'G')).to.equal('0zk12345...7890: G');
  });

  it('Should expire fees at 40 seconds', () => {
    expect(cachedFeeExpired(Date.now() + 41000)).to.be.false;
    expect(cachedFeeExpired(Date.now() + 39000)).to.be.true;
  });
});
