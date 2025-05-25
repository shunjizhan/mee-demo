import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';


const main = async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  console.log({
    privateKey,
    address: account.address,
  });
};

main();
