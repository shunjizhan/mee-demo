#!/bin/bash

# MEE Demo Setup Script
# This script automates the funding of EOA account with USDC from a "lucky user"

set -e  # Exit on any error

echo "🚀 Starting MEE Demo Setup..."

USDC="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
LUCKY_USER=${LUCKY_USER:-"0xD6216fC19DB775Df9774a6E33526131dA7D19a2c"}  # Kucoin wallet
TRANSFER_AMOUNT=${TRANSFER_AMOUNT:-"10000000000"}                       # 10,000 USDC (6 decimals)

# ======== Step 0: Check if variables are set ================ #
if [ -z "$USDC" ]; then
    echo "❌ Error: USDC environment variable is not set"
    echo "Please set the USDC address: export USDC=<usdc_address>"
    exit 1
fi

if [ -z "$MY_EOA" ]; then
    echo "❌ Error: MY_EOA environment variable is not set"
    echo "Please set your EOA address: export MY_EOA=<your_eoa_address>"
    exit 1
fi

if [ -z "$LUCKY_USER" ]; then
    echo "❌ Error: LUCKY_USER environment variable is not set"
    echo "Please set the lucky user address: export LUCKY_USER=<lucky_user_address>"
    exit 1
fi

if [ -z "$TRANSFER_AMOUNT" ]; then
    echo "❌ Error: TRANSFER_AMOUNT environment variable is not set"
    echo "Please set the transfer amount: export TRANSFER_AMOUNT=<transfer_amount>"
    exit 1
fi

echo "📋 Setup Configuration:"
echo "  USDC Token: $USDC"
echo "  Lucky User: $LUCKY_USER"
echo "  Your EOA:   $MY_EOA"
echo "  Amount:     $TRANSFER_AMOUNT (10,000 USDC)"
echo ""

# ======== Step 1: Check the balance of the lucky user ================ #
echo "1️⃣  Checking lucky user's USDC balance..."
LUCKY_BALANCE_RAW=$(cast call $USDC "balanceOf(address)(uint256)" $LUCKY_USER)
LUCKY_BALANCE=$(echo $LUCKY_BALANCE_RAW | cut -d' ' -f1)  # Extract just the number part
echo "Lucky user balance: $LUCKY_BALANCE_RAW"

if [ "$LUCKY_BALANCE" -lt "$TRANSFER_AMOUNT" ]; then
    echo "❌ Error: Lucky user doesn't have enough USDC balance"
    echo "   Required: $TRANSFER_AMOUNT, Available: $LUCKY_BALANCE"
    exit 1
fi

echo "✅ Sufficient balance available"

# ======== Step 2: Impersonate the lucky user ================ #
echo ""
echo "2️⃣  Impersonating lucky user account..."
cast rpc anvil_impersonateAccount $LUCKY_USER
echo "✅ Lucky user account impersonated"

# ======== Step 3: Send USDC to EOA account ================ #
echo ""
echo "3️⃣  Transferring $TRANSFER_AMOUNT USDC to your EOA..."
cast send $USDC \
  --unlocked \
  --from $LUCKY_USER \
  "transfer(address,uint256)(bool)" \
  $MY_EOA \
  $TRANSFER_AMOUNT

echo "✅ Transfer transaction sent"

# ======== Step 4: Verify the transfer ================ #
echo ""
echo "4️⃣  Verifying transfer completion..."

EOA_BALANCE_RAW=$(cast call $USDC "balanceOf(address)(uint256)" $MY_EOA)
EOA_BALANCE=$(echo $EOA_BALANCE_RAW | cut -d' ' -f1)  # Extract just the number part
echo "   Your EOA balance: $EOA_BALANCE_RAW"

if [ "$EOA_BALANCE" -ge "$TRANSFER_AMOUNT" ]; then
    echo "✅ Setup completed successfully!"
    echo "   Your EOA now has sufficient USDC to run the MEE demo"

    # Convert to human readable format (if bc is available)
    if command -v bc >/dev/null 2>&1; then
        USDC_AMOUNT_HUMAN=$(echo "scale=2; $EOA_BALANCE / 1000000" | bc)
        echo "   Balance: $USDC_AMOUNT_HUMAN USDC"
    fi
else
    echo "⚠️  Warning: Transfer may not have completed yet"
    echo "   Expected: $TRANSFER_AMOUNT, Got: $EOA_BALANCE"
    echo "   Please check your balance again in a few seconds"
fi

echo ""
echo "🎉 setup completed!"
