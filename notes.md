# Notes
Some notes of my development process, thoughts, and questions.

## 💻 Process
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

## 🚀 Challenges
### Challenge 1: understand the flow and concepts (difficulty: ⭐)
First, I needed to get to know all the Biconomy concepts, such as nexus, mee, and supertransaction.

#### solution
This one is not too tricky, I just needed to take some time and read through the docs, as well as the introduction articles. Thanks to the detailed documentation, I was able to pick up the concepts quickly. Also, with the help of modern AI tools, I can even get a deeper understanding by asking questions.

### Challenge 2: setup local mee node (difficulty: ⭐)
When starting the MEE node, I got errors: didn't support `trace_rpc`, and rate limited.

#### solution
This one is also straightforward, just go to Alchemy, add a credit card, and initialize a new project with `trace` plugin enabled.

### Challenge 3: failed to create meeClient (difficulty: ⭐⭐)
When implementing the flow script, I got an error when creating `createMeeClient` saying `cannot read property 'supportedChains' of undefined`.

#### solution
Since the error wasn't obvious, I ran a debugger into the script and stepped through it line by line until it stopped at the place where the error happened.

I found that the MEE node was returning a different response format than expected. I suspected I might be passing the wrong URL, so I rechecked the guide and found that I forgot to put `v3` at the end of the local MEE URL. After using the correct URL, the error was gone.

This one was a little tricky because instead of throwing a `no response` error for the wrong URL, the RPC server returned a different response format that meeClient couldn't parse (probably a v1 response?). Since the error message was not obvious, I had to run a debugger into the script and step it line by line to find the root cause.

### Challenge 4: gas payment tx reverted (difficulty: ⭐⭐)
When executing the flow script, I got error saying `gas payment tx reverted`.

#### solution
Since the script already worked on mainnet (thanks to [step 1](#step-1-write-the-script-on-base-mainnet)!), there was a high probability that the error came from either the local anvil fork or the MEE node. I double-checked the MEE node setup, which looked good, so I turned my attention to the anvil fork. I tried to gather more info by running anvil with the verbose `-v` flag, but somehow it threw an error! Anvil should support this flag, so I might be using an outdated version.

I upgraded to the latest anvil version, started the fork again with `-v` and `--print-traces` flags, trying to see the detailed trace of the failed transaction. And magically, everything worked!!

So it was basically an anvil "bug" on my end. I think the root cause was that the outdated anvil didn't support some features that MEE relies on, possibly something from `Pectra`?

### Challenge 5: failed to deploy smart account (difficulty: ⭐⭐⭐)
After adding support for running on mainnet, I attempted to run the script locally again to ensure the new code didn't break the existing local flow. However, I started encountering the error `AA13 initCode failed or OOG`.

This error is documented in the Biconomy docs and is likely due to insufficient `verificationGasLimit` being provided.

However, this parameter is set by the node, and according to my understanding, it should normally be handled by the node itself (similar to how when sending EVM transactions we don't need to manually specify `gasLimit`, which is handled internally by tools via `eth_estimateGas`). I couldn't find a way to override `verificationGasLimit` for the supertransaction either.

The strange part was that it had worked before for the exact same account, but not anymore. I double-checked that nothing had happened to that account on mainnet between "before" and "now", so there was no state change at all.

#### solution
Initially, I suspected it could be a cache issue (which happens frequently in local environments). However, after cleaning all caches, the issue persisted.

I then tried using a brand new address by randomly generating a new private key, and the entire flow worked perfectly for this new account!

This suggested that something specific was affecting the account `0x75E480dB528101a381Ce68544611C169Ad7EB342`, though I'm not entirely certain what caused this behavior.

I wanted to verify if it had worked before by forking at a historical block, but encountered the error `AA22 Expired or not due` instead. (This relates to my second question in [about the setup](#about-the-setup))

## 🙋 Questions
### about the flow
- How do async supertransactions work? For example, with a bridge, what happens if a middle transaction reverts? TON contracts have a built-in `bounce` mechanism, but we still need complex bounce handling logic.
- Fee collection is a separate transaction—why don't we make that part of the supertransaction?
- Why is the MEE execution fee 10 USDC locally, but only ~0.02 USDC on mainnet?
- Currently, the fusion transaction mainly uses EIP-4337 style transactions. What will be the role of EIP-7702, EIP-77*, and other upcoming EIPs in the future? Will they create new flows or improve the current flow?
- Do we have api to track the exact status of the supertransaction? Layer0 and Jumper etc have this very detailed status tracking via api.
- Differences between Nexus/Smart/Companion accounts? These terms seem be to inter-used a lot.
- Does multichain orchestration fully works for production? I tried one but it got stuck forever ([tx](https://meescan.biconomy.io/details/0xa740e87bf1c5edc3611f32341880fd240ade43c7e70e4978384d61c5a7f59f7f)).
- Does runtime balance injection works for bridges? (in the docs: not for api calls at least)

### about the setup
- How do we usually test multichain orchestration locally? Based on my experience, this can be quite tricky:
  - We "unit" test the flow after assets arrive at the router by manually sending tokens directly to the router (i.e., it doesn't matter where the asset comes from, as long as it reaches the router contract)
  - For e2e tests, we have to set up long-running testnets, which are time-consuming and hard to maintain
- How do we test locally for historical blocks? I tried forking at a specific block, but the transaction failed with error `AA22 Expired or not due`. It seems the node wasn't building the transaction data correctly?
- How to test smart session locally?

### about the infra
- Are there any places to see transaction history associated with a nexus/EOA account?
  - The explorer looks quite basic—are we planning to add more features? For example, the LayerZero explorer can search by actual on-chain transaction hash and return the complete orchestration result.
- It seems that Mee explorer sometimes show error even for a successful supertransaction ([example](https://meescan.biconomy.io/details/0xcf6f416391a3a6daa2b7dcc763a71e8cadbf3f29be275e3580f5b0fe825593e6)). This one is also a odd one, it has an extra token flow.

### about the codes
- For forking, should we put `"isTestChain": true` in the chain config? What are the differences?
- When I run the debugger into abstractjs source code, Cursor throws an error saying "source file not found." I had to fall back to the compiled code—is there a way to debug the source code directly?
- Why did I get `gas payment tx reverted` error in the old version of anvil?
- For runtime parameter injection, are there any security concerns? This part seems to be the most vulnerable part of the entire flow.
- Why do we need `@rhinestone/module-sdk`?
- Why do we default to using `https://network.biconomy.io/v1`, the pathfinder URL for MEE client? Is MEE client just a pathfinder?
- How do I quote using ETH as payment with abstract.js? It seems the feeToken parameter is required. (in the doc: use `0x00` addr)
- Why is `oNexus.buildComposable` a async function? Isn't it suppose to be some sort of pure function-for the same input, always return the same tx data? (determine if we need init data?)

### about the functionalities
- Do we support branching? For example, swapping 100 USDC to 100 USDT, but if it reverts, swap to DAI instead?
- Do we support output-based composition? For example, if the user's intent is to get 100 USDC, and they have 50 DAI and 60 USDT across multiple chains, can they swap these USDT and DAI to obtain 100 USDC with one supertransaction?
- Now that MEE supports paying gas with ERC20 tokens, that's great—how about gas sponsoring? Do we support scenarios where the app pays for the user? (in the doc: yes, and details are TBA)
- How does recurring payment work? (specify future timestamp)

### about the roadmap
- It seems that the MEE stack already works well in a full production environment—this is amazing. What are the next steps? What else do we plan to enhance?
- What are some apps that are already using this MEE stack in production? (I'm eager to test them out!)
- Do we plan to support other non-EVM chains? (this might be tricky since 4337 and 7702 are Ethereum stuff)
- Who are the competitors, and what are our advantages?

## 💡 Thoughts
### about EIP-4337
It seems that EIP-4337 Account Abstraction has interesting similarities to TON's contract model—both support "lazy deployment" where contracts can be deployed on-demand when first needed, with initialization code included in the transaction that creates them.

### about abstract.js
I was really surprised to find the transaction building with abstract.js is super similar to my vision for our [asset router v2](https://hackmd.io/muJYZtO9TB2VjHsrxl9JNg?view#Example-2-build-steps-with-sdk) at Acala, which uses TypeScript to declare the flow. Unfortunately, we never got a chance to implement and roll out v2, so it's exciting to see this concept already production-ready with Biconomy!


