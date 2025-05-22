import {
  AavePoolAbi,
  createMeeClient,
  mcAUSDC,
  mcAaveV3Pool,
  mcUSDC,
  runtimeERC20BalanceOf,
  toFeeToken,
  toMultichainNexusAccount,
} from '@biconomy/abstractjs';
import {
  PublicClient,
  createPublicClient,
  http,
  parseUnits,
} from 'viem';
import { base } from 'viem/chains';
import { cleanEnv, str } from 'envalid';
import { getTokenBalance } from './utils';
import { privateKeyToAccount } from 'viem/accounts';

const { ALCHEMY_API_KEY, PRIVATE_KEY } = cleanEnv(process.env, {
  ALCHEMY_API_KEY: str(),
  PRIVATE_KEY: str(),
});

const USDC_ADDR = mcUSDC.addressOn(base.id);
const AUSDC_ADDR = mcAUSDC.addressOn(base.id);
const BASE_RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const main = async () => {
  console.log('setting up ...');
  const eoa = privateKeyToAccount(`0x${PRIVATE_KEY}`);
  const oNexus = await toMultichainNexusAccount({
    chains: [base],
    transports: [http(BASE_RPC_URL)],
    signer: eoa,
  });
  const client = createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  }) as PublicClient;

  const meeClient = await createMeeClient({ account: oNexus });

  const eoaAddr = eoa.address;
  const nexusAddr = oNexus.addressOn(base.id);

  const [usdcBalBefore, ausdcBalBefore] = await Promise.all([
    getTokenBalance(client, eoaAddr, USDC_ADDR),
    getTokenBalance(client, eoaAddr, AUSDC_ADDR),
  ]);

  console.log({
    eoaAddr,
    nexusAddr,
    usdcBalBefore,
    ausdcBalBefore,
  });

  console.log('building instructions ...');
  const usdcTransferAmount = parseUnits('0.03', 6);

  // trigger tx is what the user will actually sign, which will kick off the entire orchestration sequence.
  const transferToNexusTrigger = {
    tokenAddress: USDC_ADDR,
    amount: usdcTransferAmount,
    chainId: base.id,
  };

  const approveAAVEtoSpendUSDC = await oNexus.buildComposable({
    type: 'approve',
    data: {
      chainId: base.id,
      tokenAddress: USDC_ADDR,
      spender: mcAaveV3Pool.addressOn(base.id),
      amount: usdcTransferAmount,
    },
  });

  const supplyUSDCToAAVE = await oNexus.buildComposable({
    type: 'default',
    data: {
      abi: AavePoolAbi,
      to: mcAaveV3Pool.addressOn(base.id),
      chainId: base.id,
      functionName: 'supply',
      args: [
        USDC_ADDR,
        usdcTransferAmount,
        oNexus.addressOn(base.id, true),
        0,
      ],
    },
  });

  const transferAusdcToEoa = await oNexus.buildComposable({
    type: 'transfer',
    data: {
      chainId: base.id,
      tokenAddress: AUSDC_ADDR,
      amount: runtimeERC20BalanceOf({
        targetAddress: oNexus.addressOn(base.id, true),
        tokenAddress: AUSDC_ADDR,
      }),
      recipient: eoaAddr,
    },
  });

  console.log('fetching quote ...');
  const quote = await meeClient.getFusionQuote({
    trigger: transferToNexusTrigger,
    feeToken: toFeeToken({
      chainId: base.id,
      mcToken: mcUSDC,
    }),
    instructions: [
      approveAAVEtoSpendUSDC,
      supplyUSDCToAAVE,
      transferAusdcToEoa,
    ],
  });

  const execFee = quote.quote.paymentInfo.tokenValue;
  console.log(`execution fee: $${execFee}`);

  console.log('executing tx ...');
  const { hash } = await meeClient.executeFusionQuote({
    fusionQuote: quote,
  });
  console.log(`tx submitted https://meescan.biconomy.io/details/${hash}`);

  const receipt = await meeClient.waitForSupertransactionReceipt({ hash });
  console.log(`tx confirmed with status [${receipt.transactionStatus}]!`);

  const [usdcBalAfter, ausdcBalAfter] = await Promise.all([
    getTokenBalance(client, eoaAddr, USDC_ADDR),
    getTokenBalance(client, eoaAddr, AUSDC_ADDR),
  ]);

  const usdcDiff = usdcBalAfter - usdcBalBefore;
  const ausdcDiff = ausdcBalAfter - ausdcBalBefore;

  console.log({
    usdcBalAfter,
    ausdcBalAfter,
    usdcDiff,
    ausdcDiff,
  });
};

main();
