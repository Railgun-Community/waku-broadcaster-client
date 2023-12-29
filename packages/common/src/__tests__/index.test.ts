import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { WakuRelayerClient } from '../index.js';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('index', () => {
  it('Should load index', async () => {
    expect(WakuRelayerClient).to.be.a('function');
  });
});
