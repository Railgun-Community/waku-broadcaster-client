import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { nameForRelayer } from '../relayer-util';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('relayer-util', () => {
  it('Should get Relayer names', () => {
    expect(nameForRelayer('0zk1234567890', undefined)).to.equal(
      '0zk12345...7890',
    );
    expect(nameForRelayer('0zk1234567890', 'G')).to.equal('0zk12345...7890: G');
  });
});
