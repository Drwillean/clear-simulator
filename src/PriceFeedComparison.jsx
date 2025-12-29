import React, { useState, useEffect } from 'react'
import { fetchAllCurvePrices } from './utils/curvePools'
import { fetchFluidGHOPrice } from './utils/fluidPools'

// Price feed sources for GHO
const PRICE_SOURCES = {
  COINGECKO: {
    name: 'CoinGecko',
    type: 'Aggregated CEX',
    icon: '🦎',
    color: 'green',
  },
  CURVE_GHO_CRVUSD: {
    name: 'Curve GHO/crvUSD',
    type: 'On-chain DEX',
    icon: '🌊',
    color: 'blue',
    poolAddress: '0x635EF0056A597D13863B73825CcA297236578595', // GHO/crvUSD pool on mainnet
  },
  CURVE_GHO_USDE: {
    name: 'Curve GHO/USDe',
    type: 'On-chain DEX',
    icon: '🌊',
    color: 'cyan',
    poolAddress: '0x670a72e6d22b0956c0d2573288f82dcc5d6e3a61', // GHO/USDe pool on mainnet
  },
  UNISWAP_V3: {
    name: 'Uniswap V3',
    type: 'On-chain DEX',
    icon: '🦄',
    color: 'pink',
    poolAddress: '0x...' // GHO/USDC Uniswap V3
  },
  BALANCER: {
    name: 'Balancer',
    type: 'On-chain DEX',
    icon: '⚖️',
    color: 'purple',
  },
  FLUID: {
    name: 'Fluid Protocol',
    type: 'Lending Market',
    icon: '💧',
    color: 'indigo',
  },
  CHAINLINK: {
    name: 'Chainlink',
    type: 'Oracle',
    icon: '🔗',
    color: 'blue',
  }
}

function PriceFeedComparison({ historicalData = [], depegStats = null, lastUpdate = null }) {
  const [priceData, setPriceData] = useState({})
  const [loading, setLoading] = useState(true)
  const [priceUpdateTime, setPriceUpdateTime] = useState(null)

  // Fetch price from CoinGecko
  const fetchCoinGeckoPrice = async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=gho&vs_currencies=usd&include_24hr_change=true'
      )
      const data = await response.json()
      return {
        price: data.gho?.usd || null,
        change24h: data.gho?.usd_24h_change || null,
      }
    } catch (error) {
      console.error('CoinGecko fetch error:', error)
      return { price: null, change24h: null }
    }
  }

  // Fetch all price sources
  const fetchAllPrices = async () => {
    setLoading(true)

    const [coinGeckoData, curvePrices, fluidPrice] = await Promise.all([
      fetchCoinGeckoPrice(),
      fetchAllCurvePrices(), // Fetch Curve pool prices
      fetchFluidGHOPrice(), // Fetch Fluid protocol price
    ])

    // Helper to create price data object
    const createPriceData = (price) => {
      if (!price) return { price: null, status: 'loading', depegBps: 0 }
      return {
        price,
        status: price < 0.9995 ? 'depegged' : 'pegged',
        depegBps: price < 1.0 ? ((1.0 - price) * 10000).toFixed(1) : 0,
      }
    }

    setPriceData({
      COINGECKO: {
        price: coinGeckoData.price,
        change24h: coinGeckoData.change24h,
        status: coinGeckoData.price ? (coinGeckoData.price < 0.9995 ? 'depegged' : 'pegged') : 'unknown',
        depegBps: coinGeckoData.price && coinGeckoData.price < 1.0
          ? ((1.0 - coinGeckoData.price) * 10000).toFixed(1)
          : 0,
      },
      // Curve pools - now with real on-chain data!
      CURVE_GHO_CRVUSD: createPriceData(curvePrices.GHO_CRVUSD),
      CURVE_GHO_USDE: createPriceData(curvePrices.GHO_USDE),
      // Placeholders for other sources
      UNISWAP_V3: {
        price: null,
        status: 'loading',
        depegBps: 0,
      },
      BALANCER: {
        price: null,
        status: 'loading',
        depegBps: 0,
      },
      FLUID: createPriceData(fluidPrice),
      CHAINLINK: {
        price: null,
        status: 'loading',
        depegBps: 0,
      }
    })

    setPriceUpdateTime(new Date())
    setLoading(false)
  }

  useEffect(() => {
    fetchAllPrices()

    // Refresh every 60 seconds
    const interval = setInterval(fetchAllPrices, 60000)
    return () => clearInterval(interval)
  }, [])

  // depegStats now comes from props (shared with main dashboard)

  const formatPrice = (price) => {
    if (price === null || price === undefined) return '--'
    return `$${price.toFixed(4)}`
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pegged': return 'text-green-400'
      case 'depegged': return 'text-red-400'
      case 'loading': return 'text-gray-500'
      default: return 'text-gray-400'
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pegged': return <span className="px-2 py-1 rounded text-xs bg-green-900/50 text-green-400 border border-green-700">At Peg</span>
      case 'depegged': return <span className="px-2 py-1 rounded text-xs bg-red-900/50 text-red-400 border border-red-700">Depegged</span>
      case 'loading': return <span className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-500">Loading...</span>
      default: return <span className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-500">Unknown</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold mb-1">📊 GHO Price Feed Comparison</h2>
          <p className="text-sm text-gray-400">
            Real-time prices from multiple sources • Track where depegs occur
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {lastUpdate && `Historical data: ${lastUpdate.toLocaleTimeString()}`}
          {priceUpdateTime && ` • Prices: ${priceUpdateTime.toLocaleTimeString()}`}
        </div>
      </div>

      {/* Historical Depeg Stats (30 days) */}
      {depegStats && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-yellow-300 mb-3">
            📈 Historical Depeg Analysis (Last 30 Days - CoinGecko Data)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Depeg Time %</p>
              <p className="text-2xl font-bold text-yellow-400">{depegStats.depegPercent.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">{depegStats.depeggedHours} of {depegStats.totalHours} hours</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Avg Depeg Spread</p>
              <p className="text-2xl font-bold text-orange-400">{depegStats.avgDepegBps.toFixed(1)} bps</p>
              <p className="text-xs text-gray-500">When depegged</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Max Depeg Spread</p>
              <p className="text-2xl font-bold text-red-400">{depegStats.maxDepegBps.toFixed(1)} bps</p>
              <p className="text-xs text-gray-500">Peak depeg</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Data Source</p>
              <p className="text-lg font-bold text-green-400">CoinGecko</p>
              <p className="text-xs text-gray-500">Hourly data</p>
            </div>
          </div>
        </div>
      )}

      {/* Price Feed Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.entries(PRICE_SOURCES).map(([key, source]) => {
          const data = priceData[key] || {}
          const isImplemented = ['COINGECKO', 'CURVE_GHO_CRVUSD', 'CURVE_GHO_USDE', 'FLUID'].includes(key)

          return (
            <div
              key={key}
              className={`bg-gray-800 rounded-lg p-4 border ${
                data.status === 'depegged'
                  ? 'border-red-500/50'
                  : data.status === 'pegged'
                  ? 'border-green-500/50'
                  : 'border-gray-700'
              } ${!isImplemented ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{source.icon}</span>
                  <div>
                    <h3 className="font-semibold text-sm">{source.name}</h3>
                    <p className="text-xs text-gray-500">{source.type}</p>
                  </div>
                </div>
                {getStatusBadge(data.status)}
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Current Price</p>
                  <p className={`text-2xl font-bold ${getStatusColor(data.status)}`}>
                    {formatPrice(data.price)}
                  </p>
                </div>

                {data.change24h !== undefined && data.change24h !== null && (
                  <div>
                    <p className="text-xs text-gray-400">24h Change</p>
                    <p className={`text-sm font-semibold ${data.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {data.change24h >= 0 ? '+' : ''}{data.change24h?.toFixed(2)}%
                    </p>
                  </div>
                )}

                {data.depegBps > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <p className="text-xs text-gray-400">Depeg Spread</p>
                    <p className="text-lg font-bold text-red-400">{data.depegBps} bps</p>
                  </div>
                )}

                {!isImplemented && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <p className="text-xs text-yellow-600">⚠️ Coming soon - on-chain integration</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Arbitrage Opportunities */}
      <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-300 mb-2">
          💡 Why Multiple Sources Matter
        </h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• <span className="text-blue-300">Arbitrage Detection:</span> Price differences = profit opportunities for solvers</li>
          <li>• <span className="text-blue-300">Depeg Timing:</span> Some venues depeg before others (early signals)</li>
          <li>• <span className="text-blue-300">Liquidity Routing:</span> Know which pools have the best prices</li>
          <li>• <span className="text-blue-300">Risk Management:</span> Oracle failures on one source don't stop operations</li>
        </ul>
      </div>

      {/* Implementation Status */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">🔧 Implementation Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-400">CoinGecko API (Aggregated CEX price)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-400">Historical 30-day depeg analysis</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-400">Curve GHO/crvUSD pool (on-chain via Alchemy)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-400">Curve GHO/USDe pool (on-chain via Alchemy)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">⏳</span>
            <span className="text-gray-400">Uniswap V3 TWAP oracle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-400">Fluid protocol oracle (on-chain via Alchemy)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">⏳</span>
            <span className="text-gray-400">Balancer pool price</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">⏳</span>
            <span className="text-gray-400">Chainlink price feed</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PriceFeedComparison
