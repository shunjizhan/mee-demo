import { Address, PublicClient, erc20Abi, formatUnits } from 'viem';

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

