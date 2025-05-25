import { base } from 'viem/chains';
import { cleanEnv, str } from 'envalid';
import { mcAUSDC, mcUSDC } from '@biconomy/abstractjs';
import dotenv from 'dotenv';

dotenv.config();

export const { KEY } = cleanEnv(process.env, { KEY: str() });

export const USDC_ADDR = mcUSDC.addressOn(base.id);
export const AUSDC_ADDR = mcAUSDC.addressOn(base.id);
export const USDC_DECIMALS = 6;

export enum EthRpc {
  BASE = 'https://base-rpc.publicnode.com',
  OP = 'https://optimism-rpc.publicnode.com',
  LOCAL = 'http://0.0.0.0:8545',
}

export enum MeeNode {
  LOCAL = 'http://localhost:3000/v3',
  PROD = 'https://network.biconomy.io/v1',
}
