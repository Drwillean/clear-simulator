import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

// Fluid configuration for GHO
export const FLUID_GHO_CONFIG = {
  pool: '0xdE632C3a214D5f14C1d8ddF0b92F8BCd188fee45',
  token: '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f', // GHO
  dexReserveResolver: '0xC93876C0EEd99645DD53937b25433e311881A27C',
  amountIn: '1000000000000000000', // 1 GHO (18 decimals)
  amountOutDecimals: 6, // USDC has 6 decimals
}

// Fluid Dex Reserve Resolver ABI
const DEX_RESERVE_RESOLVER_ABI = [
  {
    stateMutability: 'view',
    type: 'function',
    name: 'estimateSwapIn',
    inputs: [
      { name: 'dex_', type: 'address' },
      { name: 'swap0to1_', type: 'bool' },
      { name: 'amountIn_', type: 'uint256' },
      { name: 'amountOutMin_', type: 'uint256' }
    ],
    outputs: [{ name: 'amountOut_', type: 'uint256' }]
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'getPoolTokens',
    inputs: [{ name: 'pool_', type: 'address' }],
    outputs: [
      { name: 'token0_', type: 'address' },
      { name: 'token1_', type: 'address' }
    ]
  }
]

// Create viem client
const getClient = () => {
  const rpcUrl = import.meta.env.VITE_ETHEREUM_RPC_URL || 'https://eth.public-rpc.com'

  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl)
  })
}

/**
 * Fetch GHO price from Fluid protocol
 * @returns {Promise<number>} - GHO price in USD
 */
export async function fetchFluidGHOPrice() {
  try {
    const client = getClient()

    // First, get pool tokens to determine which is GHO
    const [token0, token1] = await client.readContract({
      address: FLUID_GHO_CONFIG.dexReserveResolver,
      abi: DEX_RESERVE_RESOLVER_ABI,
      functionName: 'getPoolTokens',
      args: [FLUID_GHO_CONFIG.pool]
    })

    // Determine if we're swapping token0 to token1 or vice versa
    const isGHOToken0 = token0.toLowerCase() === FLUID_GHO_CONFIG.token.toLowerCase()
    const swap0to1 = isGHOToken0

    // Estimate swap: 1 GHO → ? stablecoin
    const amountOut = await client.readContract({
      address: FLUID_GHO_CONFIG.dexReserveResolver,
      abi: DEX_RESERVE_RESOLVER_ABI,
      functionName: 'estimateSwapIn',
      args: [
        FLUID_GHO_CONFIG.pool,
        swap0to1,
        BigInt(FLUID_GHO_CONFIG.amountIn), // 1 GHO (18 decimals)
        BigInt(0) // No minimum output requirement
      ]
    })

    // Convert based on output token decimals (6 for USDC/USDT)
    const price = Number(amountOut) / (10 ** FLUID_GHO_CONFIG.amountOutDecimals)

    return price
  } catch (error) {
    console.error('Error fetching Fluid GHO price:', error)
    return null
  }
}
