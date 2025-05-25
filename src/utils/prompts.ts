import inquirer from 'inquirer';

export const promptForAmount = async (
  message = 'Enter amount:',
  min = 0,
  max = Infinity,
  defaultAmount = 1000,
): Promise<number> => {
  const { amount } = await inquirer.prompt<{ amount: number }>([{
    type: 'number',
    name: 'amount',
    message,
    default: defaultAmount,
    step: 0.000001,
  }]);

  if (amount < min || amount > max) {
    throw new Error(`Amount must be between ${min} and ${max}`);
  }

  return amount;
};

export const promptOneOf = async <T extends readonly any[]>(
  candidates: T,
  message: string,
): Promise<T[number]> => {
  const { selection } = await inquirer.prompt<{ selection: T[number] }>([
    {
      type: 'list',
      name: 'selection',
      message,
      choices: candidates,
    },
  ]);

  return selection;
};
