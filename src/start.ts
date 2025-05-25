import {
  AavePoolAbi,
  createMeeClient,
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
  stringify,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import assert from 'assert';

import {
  AUSDC_ADDR,
  EthRpc,
  KEY,
  MeeNode,
  USDC_ADDR,
  USDC_DECIMALS,
  getTokenBalance,
  promptForAmount,
  promptOneOf,
  startStep,
} from './utils';

let ok, fail;
const main = async () => {
  const network = await promptOneOf(
    ['local', 'mainnet'],
    'run the script on local Anvil fork or Base mainnet?',
  );

  const isMainnet = network === 'mainnet';
  const [BaseRpcUrl, MeeNodeUrl] = isMainnet
    ? [EthRpc.BASE, MeeNode.PROD]
    : [EthRpc.LOCAL, MeeNode.LOCAL];

  /* ----------------------------- setup ----------------------------- */
  ({ ok, fail } = startStep('setting up'));

  const eoa = privateKeyToAccount(`0x${KEY}`);
  const oNexus = await toMultichainNexusAccount({
    chains: [base],
    transports: [http(BaseRpcUrl)],
    signer: eoa,
  });

  const client = createPublicClient({
    chain: base,
    transport: http(BaseRpcUrl),
  });

  const meeClient = await createMeeClient({
    account: oNexus,
    url: MeeNodeUrl,
  });

  const eoaAddr = eoa.address;
  const nexusAddr = oNexus.addressOn(base.id);
  assert(nexusAddr, 'cannot get nexus address');

  const [usdcBalBefore, ausdcBalBefore, isNexusDeployed] = await Promise.all([
    getTokenBalance(client as PublicClient, eoaAddr, USDC_ADDR),
    getTokenBalance(client as PublicClient, eoaAddr, AUSDC_ADDR),
    client.getCode({ address: nexusAddr }).then(code => code !== undefined),
  ]);

  ok();

  console.log({
    eoaAddr,
    nexusAddr: `${nexusAddr} (deployed: ${isNexusDeployed})`,
    usdcBalBefore,
    ausdcBalBefore,
  });

  const USDC_RESERVE_FOR_FEE = isMainnet ? 0.1 : 100;
  const minAmount = isMainnet ? 0.001 : 1;
  const defaultAmount = isMainnet ? 0.03 : 1000;
  const maxAmount = usdcBalBefore - USDC_RESERVE_FOR_FEE;

  const amountInput = await promptForAmount(
    `Enter amount of USDC to transfer (max: ${maxAmount}, default: ${defaultAmount})`,
    minAmount,
    maxAmount,
    defaultAmount,
  );
  const usdcTransferAmount = parseUnits(amountInput.toString(), USDC_DECIMALS);

  /* ----------------------------- build instructions ----------------------------- */
  ({ ok, fail } = startStep('building instructions'));

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

  ok();

  /* ----------------------------- fetch quote ----------------------------- */
  ({ ok, fail } = startStep('fetching quote'));
  const { timestamp: curTimestamp } = await client.getBlock({
    blockNumber: await client.getBlockNumber(),
  });

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
    lowerBoundTimestamp: Number(curTimestamp),
    upperBoundTimestamp: Number(curTimestamp) + 120,
  });

  const execFee = quote.quote.paymentInfo.tokenValue;
  ok(`execution fee: $${execFee}`);

  const extraUsdcBal = usdcBalBefore - amountInput;
  assert(
    extraUsdcBal > Number(execFee),
    `eoa account does not have enough USDC balance to pay for the execution fee: ${extraUsdcBal} < ${execFee}`,
  );

  if (isMainnet) {
    const proceedInput = await promptOneOf(
      ['yes', 'no'],
      `do you want to proceed with the transaction? (fee: $${execFee})`,
    );
    if (proceedInput === 'no') {
      console.log('user terminated the transaction, bye!');
      return;
    }
  }

  /* ----------------------------- execute tx ----------------------------- */
  ({ ok, fail } = startStep('executing tx'));
  const { hash } = await meeClient.executeFusionQuote({
    fusionQuote: quote,
  });

  const msg = isMainnet
    ? `https://meescan.biconomy.io/details/${hash}`
    : `hash: ${hash}`;
  ok(msg);

  /* ----------------------------- wait for confirmation ----------------------------- */
  ({ ok, fail } = startStep('waiting for confirmation'));
  const receipt = await meeClient.waitForSupertransactionReceipt({ hash });
  ok(`status [${receipt.transactionStatus}]`);

  const [usdcBalAfter, ausdcBalAfter] = await Promise.all([
    getTokenBalance(client as PublicClient, eoaAddr, USDC_ADDR),
    getTokenBalance(client as PublicClient, eoaAddr, AUSDC_ADDR),
  ]);

  const usdcDiff = usdcBalAfter - usdcBalBefore;
  const ausdcDiff = ausdcBalAfter - ausdcBalBefore;

  console.log({
    usdcBalAfter,
    ausdcBalAfter,
    usdcDiff,
    ausdcDiff,
  });

  console.log(
    `🎉🎉 successfully minted [${ausdcDiff}] AUSDC from AAVE with only *ONE* supertransaction, powered by Biconomy MEE stack!`,
  );
};

main().catch(err => {
  fail();
  console.error(err);
  process.exit(1);
});
