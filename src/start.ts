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
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import assert from 'assert';

import { AUSDC_ADDR, BASE_RPC_URL, KEY, MEE_NOR_URL, USDC_ADDR } from './consts';
import { getTokenBalance, promptForAmount, startStep } from './utils';

let ok, fail;
const main = async () => {
  /* ----------------------------- setup ----------------------------- */
  ({ ok, fail } = startStep('setting up'));

  const eoa = privateKeyToAccount(`0x${KEY}`);
  const oNexus = await toMultichainNexusAccount({
    chains: [base],
    transports: [http(BASE_RPC_URL)],
    signer: eoa,
  });

  const client = createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });

  const meeClient = await createMeeClient({
    account: oNexus,
    url: MEE_NOR_URL,
  });

  const eoaAddr = eoa.address;
  const nexusAddr = oNexus.addressOn(base.id);
  assert(nexusAddr, 'cannot get nexus address');

  const [usdcBalBefore, ausdcBalBefore] = await Promise.all([
    getTokenBalance(client as PublicClient, eoaAddr, USDC_ADDR),
    getTokenBalance(client as PublicClient, eoaAddr, AUSDC_ADDR),
  ]);

  ok();

  console.log({
    eoaAddr,
    nexusAddr,
    usdcBalBefore,
    ausdcBalBefore,
  });

  const USDC_RESERVE_FOR_FEE = 100;
  const maxUsdcTransferAmount = usdcBalBefore - USDC_RESERVE_FOR_FEE;
  const minUsdcTransferAmount = 1;

  const amountInput = await promptForAmount(
    `Enter amount of USDC to transfer (max: ${maxUsdcTransferAmount}, default: 1000)`,
    minUsdcTransferAmount,
    maxUsdcTransferAmount,
  );
  const usdcTransferAmount = parseUnits(amountInput.toString(), 6);

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
  ok(`execution fee: $${execFee}`);

  const extraUsdcBal = usdcBalBefore - amountInput;
  assert(
    extraUsdcBal > Number(execFee),
    `eoa account does not have enough USDC balance to pay for the execution fee: ${extraUsdcBal} < ${execFee}`,
  );

  /* ----------------------------- execute tx ----------------------------- */
  ({ ok, fail } = startStep('executing tx'));
  const { hash } = await meeClient.executeFusionQuote({
    fusionQuote: quote,
  });
  ok(`hash: ${hash}`);

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
