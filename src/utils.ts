import { Address, PublicClient, erc20Abi, formatUnits } from 'viem';
import inquirer from 'inquirer';
import ora from 'ora';

type TokenBalType<T extends boolean> = T extends true ? number : bigint;
export const getTokenBalance = async <T extends boolean = true>(
  client: PublicClient,
  address: Address,
  tokenAddress: Address,
  format: T = true as T,   // format to human readable number?
): Promise<TokenBalType<T>> => {
  const [balance, decimals] = await client.multicall({
    contracts: [
      {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      },
      {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      },
    ],
    allowFailure: false,
  });

  if (format) {
    return Number(formatUnits(balance, decimals)) as TokenBalType<T>;
  }

  return balance as TokenBalType<T>;
};

// terminal UX util to better display the progress
const MINUTES = 60 * 1000;
export const startStep = (msg: string, timeout = 10 * MINUTES) => {
  const spinner = ora({
    text: msg,
    spinner: 'star',
    color: 'yellow',
  }).start();

  const trigger = setTimeout(() => spinner.fail(`${msg} | timed out`), timeout);

  const ok = (extraMsg?: string) => {
    clearTimeout(trigger);

    extraMsg
      ? spinner.succeed(`${msg} ▶️ ${extraMsg}`)
      : spinner.succeed();
  };

  const update = (extraMsg: string) => spinner.text = `${msg} | ${extraMsg}`;
  const fail = () => {
    clearTimeout(trigger);
    spinner.fail();
  };

  return {
    ok,
    update,
    fail,
  };
};

export const promptForAmount = async (
  message = 'Enter amount:',
  min = 0,
  max = Infinity,
): Promise<number> => {
  const { amount } = await inquirer.prompt<{ amount: number }>([{
    type: 'number',
    name: 'amount',
    message,
    default: 1000,
  }]);

  if (amount < min || amount > max) {
    throw new Error(`Amount must be between ${min} and ${max}`);
  }

  return amount;
};
