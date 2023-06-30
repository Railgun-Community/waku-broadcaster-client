import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  MOCK_CHAIN_ETHEREUM,
  MOCK_FALLBACK_PROVIDER_JSON_CONFIG,
  MOCK_RAILGUN_WALLET_ADDRESS,
} from '../../tests/mocks.test';
import sinon, { SinonStub } from 'sinon';
import { WakuRelayerWakuCore } from '../../waku/waku-relayer-waku-core';
import { RelayerTransaction } from '../relayer-transaction';
import { delay, networkForChain } from '@railgun-community/shared-models';
import { RelayerTransactResponse } from '../relayer-transact-response';
import { utf8ToBytes } from '../../utils/conversion';
import { encryptJSONDataWithSharedKey } from '@railgun-community/engine';
import { initTestEngine } from '../../tests/setup.test';
import { loadProvider } from '@railgun-community/wallet';

chai.use(chaiAsPromised);
const { expect } = chai;

let wakuRelayerRelayMessageStub: SinonStub;

const chain = MOCK_CHAIN_ETHEREUM;

const MOCK_TX_HASH = 'txid';

const encryptResponseData = (
  data: object,
  sharedKey: Uint8Array,
): [string, string] => {
  return encryptJSONDataWithSharedKey(data, sharedKey);
};

describe('relayer-transaction', () => {
  before(async function run() {
    this.timeout(5000);

    initTestEngine();

    const network = networkForChain(chain);
    if (network == null) {
      throw new Error('Network is null');
    }
    await loadProvider(MOCK_FALLBACK_PROVIDER_JSON_CONFIG, network.name);

    wakuRelayerRelayMessageStub = sinon
      .stub(WakuRelayerWakuCore, 'relayMessage')
      .resolves();
  });

  afterEach(() => {
    wakuRelayerRelayMessageStub.resetHistory();
  });

  after(() => {
    wakuRelayerRelayMessageStub.restore();
  });

  it('Should generate and relay a Relayer transaction', async () => {
    const relayerRailgunAddress = MOCK_RAILGUN_WALLET_ADDRESS;
    const relayerFeesID = 'abc';
    const nullifiers = ['0x012345'];
    const overallBatchMinGasPrice = BigInt('0x0100');
    const useRelayAdapt = true;

    const relayerTransaction = await RelayerTransaction.create(
      '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', // to
      '0x1234abcdef', // data
      relayerRailgunAddress,
      relayerFeesID,
      chain,
      nullifiers,
      overallBatchMinGasPrice,
      useRelayAdapt,
    );

    const mockDelayedResponse = async () => {
      await delay(2000);
      const { sharedKey } = RelayerTransactResponse;
      if (!sharedKey) {
        throw new Error('No shared key');
      }
      const response = { txHash: MOCK_TX_HASH };
      const encryptedResponse = encryptResponseData(response, sharedKey);
      const payload = utf8ToBytes(
        JSON.stringify({ result: encryptedResponse }),
      );
      await RelayerTransactResponse.handleRelayerTransactionResponseMessage({
        payload,
      });
    };

    const [response] = await Promise.all([
      relayerTransaction.send(),
      mockDelayedResponse(),
    ]);

    expect(response).to.equal(MOCK_TX_HASH);
  }).timeout(10000);
});
