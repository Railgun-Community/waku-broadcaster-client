import { ByteUtils, RailgunWallet } from '@railgun-community/engine';
import {
  createRailgunWallet,
  fullWalletForID,
} from '@railgun-community/wallet';
import { BroadcasterFeeMessageData } from '@railgun-community/shared-models';
import { type IMessage } from '@waku/sdk';
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
import { BroadcasterConfig } from '../../models/broadcaster-config.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN_ETHEREUM;
const contentTopic = contentTopics.fees(chain);

const validTimestamp = new Date();
const fees = { '0x1234': '100' };
const validExpiration = Date.now() + 1000000;
const feesID = 'abc';
const identifier = 'ID1';
const availableWallets = 2;
const version = '8.1.0';
const relayAdapt = '0xabcd';

let walletTrusted: RailgunWallet;
let walletUntrusted: RailgunWallet;
let validFeeMessageData: BroadcasterFeeMessageData;

let broadcasterFeeCacheStub: SinonStub;
let broadcasterAuthorizedFeeCacheStub: SinonStub;

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

describe('handle-fees-message limits', function () {
  this.timeout(60000);

  before(async () => {
    await initTestEngine();

    const railgunWalletInfo = await createRailgunWallet(
      MOCK_DB_ENCRYPTION_KEY,
      MOCK_MNEMONIC,
      undefined,
    );
    walletTrusted = fullWalletForID(railgunWalletInfo.id);

    const railgunWalletInfo2 = await createRailgunWallet(
      MOCK_DB_ENCRYPTION_KEY,
      MOCK_MNEMONIC_2,
      undefined,
    );
    walletUntrusted = fullWalletForID(railgunWalletInfo2.id);

    validFeeMessageData = {
      fees,
      feeExpiration: validExpiration,
      feesID,
      railgunAddress: walletTrusted.getAddress(),
      identifier,
      availableWallets,
      version,
      relayAdapt,
      requiredPOIListKeys: [],
      reliability: 1,
    };
  });

  beforeEach(() => {
    broadcasterFeeCacheStub = sinon.stub(BroadcasterFeeCache, 'addTokenFees');
    broadcasterAuthorizedFeeCacheStub = sinon.stub(BroadcasterFeeCache, 'addAuthorizedFees');
    BroadcasterConfig.trustedFeeSigner = walletTrusted.getAddress();
  });

  afterEach(() => {
    broadcasterFeeCacheStub.restore();
    broadcasterAuthorizedFeeCacheStub.restore();
    BroadcasterConfig.trustedFeeSigner = '';
    // Reset authorized fees
    (BroadcasterFeeCache as any).authorizedFees = {};
  });

  it('Should accept fees from trusted signer and update authorized fees', async () => {
    const message: IMessage = {
      payload: await createPayload(validFeeMessageData, walletTrusted),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    expect(broadcasterFeeCacheStub.calledOnce).to.be.true;
    expect(broadcasterAuthorizedFeeCacheStub.calledOnce).to.be.true;
  });

  it('Should ignore fees from untrusted signer if no authorized fees set', async () => {
    const untrustedData = { ...validFeeMessageData, railgunAddress: walletUntrusted.getAddress() };
    const message: IMessage = {
      payload: await createPayload(untrustedData, walletUntrusted),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    expect(broadcasterFeeCacheStub.notCalled).to.be.true;
  });

  it('Should accept fees from untrusted signer if within variance', async () => {
    // First set authorized fees
    const authorizedFee = {
      feePerUnitGas: '100',
      expiration: validExpiration,
      feesID,
      availableWallets,
      relayAdapt,
      reliability: 1,
    };
    (BroadcasterFeeCache as any).authorizedFees = { '0x1234': authorizedFee };

    // Untrusted fee: 104 (within 5% of 100)
    const untrustedData = {
      ...validFeeMessageData,
      railgunAddress: walletUntrusted.getAddress(),
      fees: { '0x1234': '104' }
    };
    const message: IMessage = {
      payload: await createPayload(untrustedData, walletUntrusted),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    expect(broadcasterFeeCacheStub.calledOnce).to.be.true;
    // Should NOT update authorized fees
    expect(broadcasterAuthorizedFeeCacheStub.notCalled).to.be.true;
  });

  it('Should ignore fees from untrusted signer if outside variance', async () => {
    // First set authorized fees
    const authorizedFee = {
      feePerUnitGas: '100',
      expiration: validExpiration,
      feesID,
      availableWallets,
      relayAdapt,
      reliability: 1,
    };
    (BroadcasterFeeCache as any).authorizedFees = { '0x1234': authorizedFee };

    // Untrusted fee: 131 (outside 30% of 100)
    const untrustedData = {
      ...validFeeMessageData,
      railgunAddress: walletUntrusted.getAddress(),
      fees: { '0x1234': '131' }
    };
    const message: IMessage = {
      payload: await createPayload(untrustedData, walletUntrusted),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    expect(broadcasterFeeCacheStub.notCalled).to.be.true;
  });

  it('Should accept all fees if no trusted signer configured', async () => {
    BroadcasterConfig.trustedFeeSigner = '';

    const untrustedData = { ...validFeeMessageData, railgunAddress: walletUntrusted.getAddress() };
    const message: IMessage = {
      payload: await createPayload(untrustedData, walletUntrusted),
      timestamp: validTimestamp,
    };

    await handleBroadcasterFeesMessage(chain, message, contentTopic);

    expect(broadcasterFeeCacheStub.calledOnce).to.be.true;
  });
});
