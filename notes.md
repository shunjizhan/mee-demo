# Notes
Some notes of my development process, thoughts, and questions.

## Process
I broke this down into three steps:

### Step 1: write the script on Base mainnet
First, I wrote a script that works directly on Base mainnet. This is similar to "variable control" in scientific experiments. On mainnet, both the network and the MEE node are stable, so I can focus purely on the script itself -- if anything goes wrong, I know it's the script.

There are also explorers on the mainnet, so I can get a deeper understanding of the flow.

I followed the example in the docs, and everything worked smoothly. (thanks to the detailed documentation!)

Note: without this step, it would have taken much longer to solve [challenge 4](#challenge-4-gas-payment-tx-reverted), since I would have wasted time debugging the script when the issue was actually with the local setup.

### Step 2: migrate the local testnet
After the script worked on Base mainnet, I migrated to the local testnet. Thanks to the first step, I could focus entirely on the anvil and MEE node setup, knowing the script logic was sound. If anything goes wrong, then it's likely to be either from Anvil or local MEE node.

This wasn't too difficult either, since the architecture is quite similar to our asset router at Acala, where a smart contract handles all transactions for the user, and a relayer triggers the transactions. In this case, the nexus account serves as the asset router contract, and the MEE node acts as the relayer.

Thanks to this architectural similarity, I was able to set up the local testnet quickly.

### Step 3: write documentation
After everything worked locally, I wrote detailed instructions on how to reproduce the flow. I also double-checked that the docs were solid by cloning a fresh repo and following the instructions, and everything worked as expected.

## Challenges
### Challenge 1: understand the flow and concepts
First, I needed to get to know all the Biconomy concepts, such as nexus, mee, and supertransaction.

#### solution
This one is not too tricky, I just needed to take some time and read through the docs, as well as the introduction articles. Thanks to the detailed documentation, I was able to pick up the concepts quickly. Also, with the help of modern AI tools, I can even get a deeper understanding by asking questions.

### Challenge 2: setup local mee node
When starting the MEE node, I got errors: didn't support `trace_rpc`, and rate limited.

#### solution
This one is also straightforward, just go to Alchemy, add a credit card, and initialize a new project with `trace` plugin enabled.

### Challenge 3: failed to create meeClient
When implementing the flow script, I got an error when creating `createMeeClient` saying `cannot read property 'supportedChains' of undefined`.

#### solution
Since the error wasn't obvious, I ran a debugger into the script and stepped through it line by line until it stopped at the place where the error happened.

I found that the MEE node was returning a different response format than expected. I suspected I might be passing the wrong URL, so I rechecked the guide and found that I forgot to put `v3` at the end of the local MEE URL. After using the correct URL, the error was gone.

This one was a little tricky because instead of throwing a `no response` error for the wrong URL, the RPC server returned a different response format that meeClient couldn't parse (probably a v1 response?). Since the error message was not obvious, I had to run a debugger into the script and step it line by line to find the root cause.

### Challenge 4: gas payment tx reverted
When executing the flow script, I got error saying `gas payment tx reverted`.

#### solution
Since the script already worked on mainnet (thanks to [step 1](#step-1-write-the-script-on-base-mainnet)!), there was a high probability that the error came from either the local anvil fork or the MEE node. I double-checked the MEE node setup, which looked good, so I turned my attention to the anvil fork. I tried to gather more info by running anvil with the verbose `-v` flag, but somehow it threw an error! Anvil should support this flag, so I might be using an outdated version.

I upgraded to the latest anvil version, started the fork again with `-v` and `--print-traces` flags, trying to see the detailed trace of the failed transaction. And magically, everything worked!!

So it was basically an anvil "bug" on my end. I think the root cause was that the outdated anvil didn't support some features that MEE relies on, possibly something from `Pectra`?

## Questions
### about the flow
- How do async supertransactions work? For example, with a bridge, what happens if a middle transaction reverts? TON contracts have a built-in `bounce` mechanism, but we still need complex bounce handling logic.
- Fee collection is a separate transaction—why don't we make that part of the supertransaction?
- Why is the MEE execution fee 10 USDC locally, but only ~0.02 USDC on mainnet?
- Does this fusion transaction mainly use EIP-4337 style transactions, and is EIP-7702 involved at all?

### about the setup
- How do we usually test multichain orchestration locally? Based on my experience, this can be quite tricky:
  - We "unit" test the flow after assets arrive at the router by manually sending tokens directly to the router (i.e., it doesn't matter where the asset comes from, as long as it reaches the router contract)
  - For e2e tests, we have to set up long-running testnets, which are time-consuming and hard to maintain

### about the infra
- Are there any places to see transaction history associated with a nexus/EOA account?
  - The explorer looks quite basic—are we planning to add more features? For example, the LayerZero explorer can search by actual on-chain transaction hash and return the complete orchestration result.
- Do we have a healthcheck endpoint for MEE node?

### about the codes
- For forking, should we put `"isTestChain": true` in the chain config? What are the differences?
- Why is `oNexus.buildComposable` a async function? Isn't it suppose to be some sort of pure function-for the same input, always return the same tx data?
- When I run the debugger into abstractjs source code, Cursor throws an error saying "source file not found." I had to fall back to the compiled code—is there a way to debug the source code directly?

## Thoughts
### about EIP-4337
It seems that EIP-4337 Account Abstraction has interesting similarities to TON's contract model—both support "lazy deployment" where contracts can be deployed on-demand when first needed, with initialization code included in the transaction that creates them.

### about abstract.js
I was really surprised to find the transaction building with abstract.js is super similar to my vision for our [asset router v2](https://hackmd.io/muJYZtO9TB2VjHsrxl9JNg?view#Example-2-build-steps-with-sdk) at Acala, which uses TypeScript to declare the flow. Unfortunately, we never got a chance to implement and roll out v2, so it's exciting to see this concept already production-ready with Biconomy!


