import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  MOCK_CHAIN_ETHEREUM,
  MOCK_FALLBACK_PROVIDER_JSON_CONFIG,
  MOCK_RAILGUN_WALLET_ADDRESS,
} from '../../tests/mocks.test.js';
import sinon, { SinonStub } from 'sinon';
import { WakuBroadcasterWakuCore } from '../../waku/waku-broadcaster-waku-core.js';
import { BroadcasterTransaction } from '../broadcaster-transaction.js';
import {
  TXIDVersion,
  delay,
  networkForChain,
} from '@railgun-community/shared-models';
import { BroadcasterTransactResponse } from '../broadcaster-transact-response.js';
import { utf8ToBytes } from '../../utils/conversion.js';
import { encryptJSONDataWithSharedKey } from '@railgun-community/engine';
import { initTestEngine } from '../../tests/setup.test.js';
import {
  loadProvider,
  stopRailgunEngine,
  unloadProvider,
} from '@railgun-community/wallet';

chai.use(chaiAsPromised);
const { expect } = chai;

let wakuBroadcastMessageStub: SinonStub;

const chain = MOCK_CHAIN_ETHEREUM;

const MOCK_TX_HASH = 'txid';

const encryptResponseData = (
  data: object,
  sharedKey: Uint8Array,
): [string, string] => {
  return encryptJSONDataWithSharedKey(data, sharedKey);
};

describe('broadcaster-transaction', () => {
  before(async function run() {
    this.timeout(60000);

    await initTestEngine();

    const network = networkForChain(chain);
    if (network == null) {
      throw new Error('Network is null');
    }
    await loadProvider(MOCK_FALLBACK_PROVIDER_JSON_CONFIG, network.name);

    wakuBroadcastMessageStub = sinon
      .stub(WakuBroadcasterWakuCore, 'broadcastMessage')
      .resolves();
  });

  afterEach(() => {
    wakuBroadcastMessageStub.resetHistory();
  });

  after(async () => {
    wakuBroadcastMessageStub.restore();
    await unloadProvider(networkForChain(chain)!.name);
    stopRailgunEngine();
  });

  it('Should generate and broadcast a Broadcaster transaction', async () => {
    const broadcasterRailgunAddress = MOCK_RAILGUN_WALLET_ADDRESS;
    const broadcasterFeesID = 'abc';
    const nullifiers = ['0x012345'];
    const overallBatchMinGasPrice = BigInt('0x0100');
    const useRelayAdapt = true;

    const broadcasterTransaction = await BroadcasterTransaction.create(
      TXIDVersion.V2_PoseidonMerkle,
      '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', // to
      '0x1234abcdef', // data
      broadcasterRailgunAddress,
      broadcasterFeesID,
      chain,
      nullifiers,
      overallBatchMinGasPrice,
      useRelayAdapt,
      {}, // preTransactionPOIsPerTxidLeafPerList
    );

    const mockDelayedResponse = async () => {
      await delay(2000);
      const { sharedKey } = BroadcasterTransactResponse;
      if (!sharedKey) {
        throw new Error('No shared key');
      }
      const response = { txHash: MOCK_TX_HASH };
      const encryptedResponse = encryptResponseData(response, sharedKey);
      const payload = utf8ToBytes(
        JSON.stringify({ result: encryptedResponse }),
      );
      await BroadcasterTransactResponse.handleBroadcasterTransactionResponseMessage(
        {
          payload,
        },
      );
    };

    const [response] = await Promise.all([
      broadcasterTransaction.send(),
      mockDelayedResponse(),
    ]);

    expect(response).to.equal(MOCK_TX_HASH);
  }).timeout(10000);
});
