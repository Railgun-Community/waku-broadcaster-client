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
  MOCK_CHAIN_ETHEREUM,
  MOCK_DB_ENCRYPTION_KEY,
  MOCK_MNEMONIC,
  MOCK_MNEMONIC_2,
} from '../../tests/mocks.test.js';
import { initTestEngine } from '../../tests/setup.test.js';
import { utf8ToBytes } from '../../utils/conversion.js';
import { contentTopics } from '../../waku/waku-topics.js';
import { handleBroadcasterFeesMessage } from '../handle-fees-message.js';
import { BroadcasterFeeCache } from '../broadcaster-fee-cache.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN_ETHEREUM;
const contentTopic = contentTopics.fees(chain);

const validTimestamp = new Date();
const invalidTimestamp = new Date(Date.now() - 46 * 1000); // 46 seconds ago.
const fees = { '0x1234': '0x9999' };
const validExpiration = Date.now() + 1000000;
const feesID = 'abc';
const identifier = 'ID1';
const availableWallets = 2;
const version = '4.1.0';
const relayAdapt = '0xabcd';

let walletA: RailgunWallet;
let walletB: RailgunWallet;
let validFeeMessageData: BroadcasterFeeMessageData;

let relayerFeeCacheStub: SinonStub;

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
  before(async () => {
    await initTestEngine();

    relayerFeeCacheStub = sinon
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
      feeExpiration: validExpiration,
      feesID,
      railgunAddress: walletA.getAddress(),
      identifier,
      availableWallets,
      version,
      relayAdapt,
      requiredPOIListKeys: ['test_list'],
    };
  });

  afterEach(() => {
    relayerFeeCacheStub.resetHistory();
  });

  after(() => {
    relayerFeeCacheStub.restore();
  });

  it('Should not cache fees with invalid signature', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletB), // Sign with WalletB
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(relayerFeeCacheStub.notCalled).to.be.true;
  });

  it('Should not cache fees with invalid payloads', async () => {
    const message: IMessage = {
      payload: new Uint8Array(),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    expect(relayerFeeCacheStub.notCalled).to.be.true;
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
    expect(relayerFeeCacheStub.notCalled).to.be.true;
  });

  it('Should not cache fees with invalid timestamp', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletA),
      timestamp: invalidTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(relayerFeeCacheStub.notCalled).to.be.true;
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
    expect(relayerFeeCacheStub.notCalled).to.be.true;
  });

  it('Should cache fees with valid fields and signature', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletA),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(relayerFeeCacheStub.calledOnce).to.be.true;
  });

  it('Should cache fees with valid fields, no timestamp', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletA),
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);
    expect(relayerFeeCacheStub.calledOnce).to.be.true;
  });
});
