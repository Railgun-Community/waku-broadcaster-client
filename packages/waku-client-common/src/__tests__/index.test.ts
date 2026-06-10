import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { WakuBroadcasterClient } from '../index.js';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('index', () => {
  it('Should load index', async () => {
    expect(WakuBroadcasterClient).to.be.a('function');
  });
});
