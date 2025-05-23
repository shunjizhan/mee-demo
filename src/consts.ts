import { base } from 'viem/chains';
import { cleanEnv, str } from 'envalid';
import { mcAUSDC, mcUSDC } from '@biconomy/abstractjs';
import dotenv from 'dotenv';

dotenv.config();

export const { KEY } = cleanEnv(process.env, { KEY: str() });

export const USDC_ADDR = mcUSDC.addressOn(base.id);
export const AUSDC_ADDR = mcAUSDC.addressOn(base.id);
export const BASE_RPC_URL = 'http://0.0.0.0:8545';
export const MEE_NOR_URL = 'http://localhost:3000/v3';
