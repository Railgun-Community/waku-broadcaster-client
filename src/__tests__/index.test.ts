import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {RailgunWakuRelayerClient} from '../index';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('index', () => {
  it('Should load index', async () => {
    expect(RailgunWakuRelayerClient).to.be.a('function');
  });
});
