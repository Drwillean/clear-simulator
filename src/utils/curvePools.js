import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

// Curve Pool ABI - minimal for price reading
const CURVE_POOL_ABI = [
  {
    stateMutability: 'view',
    type: 'function',
    name: 'get_dy',
    inputs: [
      { name: 'i', type: 'int128' },
      { name: 'j', type: 'int128' },
      { name: 'dx', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
]

// Curve Pool Addresses on Mainnet
export const CURVE_POOLS = {
  GHO_CRVUSD: {
    address: '0x635EF0056A597D13863B73825CcA297236578595',
    name: 'GHO/crvUSD',
    ghoIndex: 0,
    stableIndex: 1,
  },
  GHO_USDE: {
    address: '0x670a72e6d22b0956c0d2573288f82dcc5d6e3a61',
    name: 'GHO/USDe',
    ghoIndex: 1, // GHO is at index 1, not 0
    stableIndex: 0, // USDe is at index 0
  }
}

// Create viem client
const getClient = () => {
  const rpcUrl = import.meta.env.VITE_ETHEREUM_RPC_URL || 'https://eth.public-rpc.com'

  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl)
  })
}

/**
 * Fetch GHO price from a Curve pool
 * @param {string} poolAddress - Curve pool contract address
 * @param {number} ghoIndex - Index of GHO token in pool
 * @param {number} stableIndex - Index of stablecoin (USDC/USDT) in pool
 * @returns {Promise<number>} - GHO price in USD
 */
export async function fetchCurvePoolPrice(poolAddress, ghoIndex = 0, stableIndex = 1) {
  try {
    const client = getClient()

    // Get output amount for 1 GHO (1e18)
    const outputAmount = await client.readContract({
      address: poolAddress,
      abi: CURVE_POOL_ABI,
      functionName: 'get_dy',
      args: [ghoIndex, stableIndex, BigInt(1e18)] // 1 GHO
    })

    // Curve pools normalize to 18 decimals internally
    const price = Number(outputAmount) / 1e18

    return price
  } catch (error) {
    console.error(`Error fetching Curve pool price for ${poolAddress}:`, error)
    return null
  }
}

/**
 * Fetch GHO prices from all Curve pools
 * @returns {Promise<Object>} - Object with pool names as keys and prices as values
 */
export async function fetchAllCurvePrices() {
  try {
    const results = await Promise.all([
      fetchCurvePoolPrice(
        CURVE_POOLS.GHO_CRVUSD.address,
        CURVE_POOLS.GHO_CRVUSD.ghoIndex,
        CURVE_POOLS.GHO_CRVUSD.stableIndex
      ),
      fetchCurvePoolPrice(
        CURVE_POOLS.GHO_USDE.address,
        CURVE_POOLS.GHO_USDE.ghoIndex,
        CURVE_POOLS.GHO_USDE.stableIndex
      )
    ])

    return {
      GHO_CRVUSD: results[0],
      GHO_USDE: results[1]
    }
  } catch (error) {
    console.error('Error fetching all Curve prices:', error)
    return {
      GHO_CRVUSD: null,
      GHO_USDE: null
    }
  }
}
