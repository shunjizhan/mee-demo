import {
  PublicClient,
  createPublicClient,
  http,
  parseUnits,
} from 'viem';
import { base, optimism } from 'viem/chains';
import {
  createMeeClient,
  mcUSDC,
  safeMultiplier,
  toFeeToken,
  toMultichainNexusAccount,
} from '@biconomy/abstractjs';
import { privateKeyToAccount } from 'viem/accounts';
import assert from 'assert';

import {
  EthRpc,
  KEY,
  MeeNode,
  USDC_DECIMALS,
  getTokenBalance,
  promptForAmount,
  promptOneOf,
  startStep,
} from './utils';

let ok, fail;
const main = async () => {
  const BaseRpcUrl = EthRpc.BASE;
  const OpRpcUrl = EthRpc.OP;
  const MeeNodeUrl = MeeNode.PROD;

  const direction = await promptOneOf(['base-to-op', 'op-to-base'], 'select the direction of the flow');
  const isFromBase = direction === 'base-to-op';

  /* ----------------------------- setup ----------------------------- */
  ({ ok, fail } = startStep('setting up'));

  const eoa = privateKeyToAccount(`0x${KEY}`);
  const oNexus = await toMultichainNexusAccount({
    chains: [base, optimism],
    transports: [http(BaseRpcUrl), http(OpRpcUrl)],
    signer: eoa,
  });

  const clientBase = createPublicClient({
    chain: base,
    transport: http(BaseRpcUrl),
  });

  const clientOp = createPublicClient({
    chain: optimism,
    transport: http(OpRpcUrl),
  });

  const meeClient = await createMeeClient({
    account: oNexus,
    url: MeeNodeUrl,
  });

  const eoaAddr = eoa.address;
  const nexusAddrBase = oNexus.addressOn(base.id);
  const nexusAddrOp = oNexus.addressOn(optimism.id);
  assert(nexusAddrBase, 'cannot get nexus address on base');
  assert(nexusAddrOp, 'cannot get nexus address on op');

  const [
    srcClient, srcNexus, srcChain,
    dstClient, dstNexus, dstChain,
  ] = isFromBase
    ? [
      clientBase, nexusAddrBase, base,
      clientOp, nexusAddrOp, optimism,
    ]
    : [
      clientOp, nexusAddrOp, optimism,
      clientBase, nexusAddrBase, base,
    ];

  const [
    srcUsdcBalBefore,
    dstUsdcBalBefore,
    isSrcNexusDeployed,
    isDstNexusDeployed,
  ] = await Promise.all([
    getTokenBalance(srcClient as PublicClient, eoaAddr, mcUSDC.addressOn(srcChain.id)),
    getTokenBalance(dstClient as PublicClient, eoaAddr, mcUSDC.addressOn(dstChain.id)),
    oNexus.deploymentOn(srcChain.id)?.isDeployed(),
    oNexus.deploymentOn(dstChain.id)?.isDeployed(),
  ]);

  ok();

  console.log({
    eoaAddr,
    srcNexus: `${srcNexus} (deployed: ${isSrcNexusDeployed})`,
    dstNexus: `${dstNexus} (deployed: ${isDstNexusDeployed})`,
    srcUsdcBalBefore,
    dstUsdcBalBefore,
  });

  const USDC_RESERVE_FOR_FEE = 0.3;
  const minAmount = 0.1;
  const defaultAmount = 1;
  const maxAmount = srcUsdcBalBefore - USDC_RESERVE_FOR_FEE;

  const amountInput = await promptForAmount(
    `Enter amount of USDC to transfer (max: ${maxAmount}, default: ${defaultAmount})`,
    minAmount,
    maxAmount,
    defaultAmount,
  );
  // const amountInput = 100;
  const usdcTransferAmount = parseUnits(amountInput.toString(), USDC_DECIMALS);

  /* ----------------------------- build instructions ----------------------------- */
  ({ ok, fail } = startStep('building instructions'));

  // trigger tx is what the user will actually sign, which will kick off the entire orchestration sequence.
  const transferToNexusTrigger = {
    tokenAddress: mcUSDC.addressOn(srcChain.id),
    amount: usdcTransferAmount,
    chainId: srcChain.id,
  };

  const bridgeToDst = await oNexus.build({
    type: 'intent',
    data: {
      amount: usdcTransferAmount,
      mcToken: mcUSDC,
      toChain: dstChain,
      mode: 'OPTIMISTIC',
    },
  });

  const transferUsdcToEoaOnDst = await oNexus.build({
    type: 'transfer',
    data: {
      chainId: dstChain.id,
      tokenAddress: mcUSDC.addressOn(dstChain.id),
      amount: safeMultiplier(usdcTransferAmount, 0.8),
      recipient: eoaAddr,
    },
  });

  ok();

  /* ----------------------------- fetch quote ----------------------------- */
  ({ ok, fail } = startStep('fetching quote'));
  const { timestamp: curTimestamp } = await clientBase.getBlock({
    blockNumber: await clientBase.getBlockNumber(),
  });

  const quote = await meeClient.getFusionQuote({
    trigger: transferToNexusTrigger,
    feeToken: toFeeToken({
      chainId: srcChain.id,
      mcToken: mcUSDC,
    }),
    instructions: [
      bridgeToDst,
      transferUsdcToEoaOnDst,
    ],
    lowerBoundTimestamp: Number(curTimestamp),
    upperBoundTimestamp: Number(curTimestamp) + 300,
  });

  const execFee = quote.quote.paymentInfo.tokenValue;
  ok(`execution fee: $${execFee}`);

  const extraUsdcBal = srcUsdcBalBefore - amountInput;
  assert(
    extraUsdcBal > Number(execFee),
    `eoa account does not have enough USDC balance to pay for the execution fee: ${extraUsdcBal} < ${execFee}`,
  );

  const proceedInput = await promptOneOf(
    ['yes', 'no'],
    `proceed with the transaction? (fee: $${execFee})`,
  );
  if (proceedInput === 'no') {
    console.log('user terminated the transaction, bye!');
    return;
  }

  /* ----------------------------- execute tx ----------------------------- */
  ({ ok, fail } = startStep('executing tx'));
  const { hash } = await meeClient.executeFusionQuote({
    fusionQuote: quote,
  });

  ok(`https://meescan.biconomy.io/details/${hash}`);

  /* ----------------------------- wait for confirmation ----------------------------- */
  ({ ok, fail } = startStep('waiting for confirmation'));
  const receipt = await meeClient.waitForSupertransactionReceipt({ hash });
  ok(`status [${receipt.transactionStatus}]`);

  const [srcUsdcBalAfter, dstUsdcBalAfter] = await Promise.all([
    getTokenBalance(srcClient as PublicClient, eoaAddr, mcUSDC.addressOn(srcChain.id)),
    getTokenBalance(dstClient as PublicClient, eoaAddr, mcUSDC.addressOn(dstChain.id)),
  ]);

  const srcUsdcDiff = srcUsdcBalAfter - srcUsdcBalBefore;
  const dstUsdcDiff = dstUsdcBalAfter - dstUsdcBalBefore;

  console.log({
    srcUsdcBalAfter,
    dstUsdcBalAfter,
    srcUsdcDiff,
    dstUsdcDiff,
  });

  console.log(
    `🎉🎉 successfully transferred [${dstUsdcDiff}] USDC from ${srcChain.name} to ${dstChain.name} with only *ONE* supertransaction, powered by Biconomy MEE stack!`,
  );
};

main().catch(err => {
  fail();
  console.error(err);
  process.exit(1);
});
