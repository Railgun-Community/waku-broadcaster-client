import { ByteUtils, RailgunWallet } from '@railgun-community/engine';
import {
  createRailgunWallet,
  fullWalletForID,
} from '@railgun-community/wallet';
import { BroadcasterFeeMessageData } from '@railgun-community/shared-models';
import { IMessage } from '@waku/interfaces';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon, { SinonStub } from 'sinon';
import {
  MOCK_DB_ENCRYPTION_KEY,
  MOCK_MNEMONIC,
  MOCK_MNEMONIC_2,
  MOCK_CHAIN,
} from '../../tests/mocks.test.js';
import { initTestEngine } from '../../tests/setup.test.js';
import { utf8ToBytes } from '../../utils/conversion.js';
import { contentTopics } from '../../waku/waku-topics.js';
import { handleBroadcasterFeesMessage } from '../handle-fees-message.js';
import { BroadcasterFeeCache } from '../broadcaster-fee-cache.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN;
const contentTopic = contentTopics.fees(chain);

const fees = { '0x1234': '0x9999' };
const validTimestamp = new Date('2024-10-15T23:45:00.000Z');
const feesID = 'abc';
const identifier = 'ID1';
const availableWallets = 2;
const version = '7.1.0';
const relayAdapt = '0xabcd';

let walletA: RailgunWallet;
let walletB: RailgunWallet;
let validFeeMessageData: BroadcasterFeeMessageData;

let broadcasterFeeCacheStub: SinonStub;

const createPayload = async (
  feeMessageData: BroadcasterFeeMessageData,
  signingWallet: RailgunWallet,
): Promise<Uint8Array> => {
  const utf8String = JSON.stringify(feeMessageData);
  const hex = ByteUtils.hexlify(new TextEncoder().encode(utf8String));
  const signature = ByteUtils.hexlify(
    await signingWallet.signWithViewingKey(ByteUtils.hexStringToBytes(hex)),
  );
  const payload = {
    data: hex,
    signature,
  };
  return utf8ToBytes(JSON.stringify(payload));
};

describe('handle-fees-message', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(async () => {
    clock = sinon.useFakeTimers(new Date('2024-10-15T23:45:00.000Z').getTime());

    await initTestEngine();

    broadcasterFeeCacheStub = sinon
      .stub(BroadcasterFeeCache, 'addTokenFees')
      .returns();

    const railgunWalletInfoA = await createRailgunWallet(
      MOCK_DB_ENCRYPTION_KEY,
      MOCK_MNEMONIC,
      undefined,
    );
    walletA = fullWalletForID(railgunWalletInfoA.id);

    const railgunWalletInfoB = await createRailgunWallet(
      MOCK_DB_ENCRYPTION_KEY,
      MOCK_MNEMONIC_2,
      undefined,
    );
    walletB = fullWalletForID(railgunWalletInfoB.id);

    validFeeMessageData = {
      fees,
      feeExpiration: new Date('2024-10-16T00:01:44.982Z').getTime(),
      feesID,
      railgunAddress: walletA.getAddress(),
      identifier,
      availableWallets,
      version,
      relayAdapt,
      requiredPOIListKeys: ['test_list'],
      reliability: 0.99,
    };
  });

  beforeEach(() => {
    broadcasterFeeCacheStub.resetHistory();
  });

  afterEach(() => {
    clock.restore();
    broadcasterFeeCacheStub.resetHistory();
    sinon.restore();
  });

  it('Should not cache fees with invalid signature', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletB), // Sign with WalletB
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(broadcasterFeeCacheStub.notCalled).to.be.true;
  });

  it('Should not cache fees with invalid payloads', async () => {
    const message: IMessage = {
      payload: new Uint8Array(),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    expect(broadcasterFeeCacheStub.notCalled).to.be.true;
  });

  it('Should not cache fees with invalid contentTopic', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletA),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(
      chain,
      message,
      contentTopics.transact(chain),
    );
    expect(broadcasterFeeCacheStub.notCalled).to.be.true;
  });

  it('Should not cache fees with invalid timestamp', async () => {
    const invalidTimestamp = new Date('2024-10-15T23:44:14.982Z'); // 46 seconds ago
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletA),
      timestamp: invalidTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(broadcasterFeeCacheStub.notCalled).to.be.true;
  });

  it('Should not cache fees with invalid version', async () => {
    const message: IMessage = {
      payload: await createPayload(
        {
          ...validFeeMessageData,
          version: '2.0',
        },
        walletA,
      ),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(broadcasterFeeCacheStub.notCalled).to.be.true;
  });

  it('Should cache fees with valid fields and signature', async () => {
    // Create mock message to be received by handleBroadcasterFeesMessage
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletA),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    // Ensure addTokenFees was called once
    expect(broadcasterFeeCacheStub.calledOnce).to.be.true;
  });

  it('Should cache fees with valid fields, no timestamp', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletA),
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(broadcasterFeeCacheStub.calledOnce).to.be.true;
  });
});
