import React, { useState, useMemo } from 'react'
import PriceFeedComparison from './PriceFeedComparison'
import { useGHOHistoricalData } from './hooks/useGHOHistoricalData'
import { useMultiSourcePrices } from './hooks/useMultiSourcePrices'

function App() {
  // Tab state
  const [activeTab, setActiveTab] = useState('solver-metrics')

  // Fetch real historical GHO data from CoinGecko (30 days) - for Price Feeds tab
  const { historicalData, depegStats: coinGeckoDepegStats, loading: historicalLoading, lastUpdate: historicalLastUpdate } = useGHOHistoricalData(30)

  // Fetch real-time prices from all sources (Curve, Fluid, CoinGecko) - for Solver Metrics
  const { prices: multiSourcePrices, depegMetrics, loading: pricesLoading, lastUpdate: pricesLastUpdate, sampleCount } = useMultiSourcePrices()

  // Reserve Parameters
  const [tvl, setTvl] = useState(250000) // Current TVL
  const [usdcWeight, setUsdcWeight] = useState(80)

  // Rebalancing Parameters
  const [rebalanceCyclesPerDay, setRebalanceCyclesPerDay] = useState(12) // How many times reserve can fully cycle
  const [rebalanceEfficiency, setRebalanceEfficiency] = useState(90) // % of theoretical rebalance achieved

  // Market Parameters - Now using REAL DATA from DEX pools (Curve, Fluid)
  const depegTimePercent = depegMetrics.aggregated.avgDexDepegPercent // Real % of time DEX pools are depegged
  const avgDepegBps = depegMetrics.aggregated.maxDexDepegBps || 0 // Current max spread across DEX pools

  // IOU Fee Distribution (from the 80% protocol fees portion)
  const [solverShareOfFees, setSolverShareOfFees] = useState(50) // % of the 80% protocol fees that go to solver

  // Volume tracking
  const [actualDailyVolume, setActualDailyVolume] = useState(0) // Real volume processed (initially 0)

  // Swap Distribution (realistic market data)
  const swapDistribution = [
    { label: '<$1k', pctCount: 45, pctVolume: 0.3, avgSize: 500 },
    { label: '$1k-$10k', pctCount: 30, pctVolume: 3.2, avgSize: 5000 },
    { label: '$10k-$100k', pctCount: 20, pctVolume: 21.5, avgSize: 50000 },
    { label: '$100k-$1M', pctCount: 4, pctVolume: 41.3, avgSize: 500000 },
    { label: '$1M+', pctCount: 1, pctVolume: 33.6, avgSize: 2000000 },
  ]

  // Calculate all metrics
  const metrics = useMemo(() => {
    const usdcBuffer = tvl * (usdcWeight / 100)
    const efficiency = rebalanceEfficiency / 100
    const effectiveCycles = rebalanceCyclesPerDay * efficiency

    // Core capacity metrics
    const maxSingleSwap = usdcBuffer
    const dailyCapacity = usdcBuffer * effectiveCycles
    const hourlyCapacity = dailyCapacity / 24

    // Route availability
    const activeHoursPerDay = 24 * (depegTimePercent / 100)
    const activeCapacityPerHour = hourlyCapacity * (depegTimePercent / 100)

    // IOU Economics
    const DEPEG_THRESHOLD_BPS = 5 // $0.9995 threshold = 5 bps
    const avgSpreadBps = avgDepegBps // The current spread available (market price below peg)

    // For fee calculations: use threshold spread as minimum (route only opens at threshold)
    // If current spread is higher, use that instead
    const effectiveSpreadBps = avgSpreadBps >= DEPEG_THRESHOLD_BPS ? avgSpreadBps : DEPEG_THRESHOLD_BPS

    // IOU Distribution Constants
    const TRADER_SHARE = 0.20 // 20% of IOUs go to trader
    const PROTOCOL_FEES_SHARE = 0.80 // 80% of IOUs are protocol fees

    // From the 80% protocol fees, split between solver and protocol
    const solverShareOfProtocolFees = solverShareOfFees / 100 // User adjustable
    const protocolShareOfProtocolFees = 1 - solverShareOfProtocolFees

    // Effective shares of total IOUs
    const traderEffectiveShare = TRADER_SHARE // 20%
    const solverEffectiveShare = PROTOCOL_FEES_SHARE * solverShareOfProtocolFees // e.g., 80% × 50% = 40%
    const protocolEffectiveShare = PROTOCOL_FEES_SHARE * protocolShareOfProtocolFees // e.g., 80% × 50% = 40%

    // Profit per swap tier (in IOUs) - uses current spread for actual calculations
    const profitByTier = swapDistribution.map(tier => ({
      ...tier,
      totalIOUs: tier.avgSize * (avgSpreadBps / 10000), // Total IOUs minted at current spread
      traderIOUs: tier.avgSize * (avgSpreadBps / 10000) * TRADER_SHARE,
      solverIOUs: tier.avgSize * (avgSpreadBps / 10000) * solverEffectiveShare,
      protocolIOUs: tier.avgSize * (avgSpreadBps / 10000) * protocolEffectiveShare,
    }))

    // Max daily fees calculation (uses effective spread)
    const maxDailyFees = dailyCapacity * (effectiveSpreadBps / 10000) * PROTOCOL_FEES_SHARE

    // Coverage analysis
    const supportedTiers = swapDistribution.filter(tier => tier.avgSize <= maxSingleSwap)
    const volumeCoverage = supportedTiers.reduce((sum, tier) => sum + tier.pctVolume, 0)
    const countCoverage = supportedTiers.reduce((sum, tier) => sum + tier.pctCount, 0)

    // Daily metrics using ACTUAL volume
    const dailyVolume = actualDailyVolume || 0
    const totalDailyIOUs = dailyVolume * (avgSpreadBps / 10000)
    const dailyTraderIOUs = totalDailyIOUs * TRADER_SHARE
    const dailySolverIOUs = totalDailyIOUs * solverEffectiveShare
    const dailyProtocolIOUs = totalDailyIOUs * protocolEffectiveShare

    return {
      // Liquidity
      tvl,
      usdcBuffer,
      maxSingleSwap,
      liquidityRefreshRate: rebalanceCyclesPerDay,

      // Capacity
      dailyCapacity,
      hourlyCapacity,
      activeCapacityPerHour,

      // Availability
      depegTimePercent,
      activeHoursPerDay,

      // IOU Economics
      avgSpreadBps,
      effectiveSpreadBps,
      depegThresholdBps: DEPEG_THRESHOLD_BPS,
      traderEffectiveShare: traderEffectiveShare * 100,
      solverEffectiveShare: solverEffectiveShare * 100,
      protocolEffectiveShare: protocolEffectiveShare * 100,
      solverShareOfFees,
      profitByTier,
      maxDailyFees,

      // Daily Metrics
      dailyVolume,
      totalDailyIOUs,
      dailyTraderIOUs,
      dailySolverIOUs,
      dailyProtocolIOUs,

      // Coverage
      volumeCoverage,
      countCoverage,
      supportedTiers,

      // Utilization (based on actual volume)
      capacityUtilization: dailyVolume > 0 ? (dailyVolume / dailyCapacity) * 100 : 0,
    }
  }, [tvl, usdcWeight, rebalanceCyclesPerDay, rebalanceEfficiency, depegTimePercent, avgDepegBps, solverShareOfFees, actualDailyVolume])

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`
    return `$${value.toFixed(0)}`
  }

  const formatPercent = (value) => `${value.toFixed(1)}%`

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Clear Protocol: Solver Integration Dashboard</h1>
          <p className="text-gray-400">Liquidity, capacity, and profitability metrics for DEX aggregators and solvers</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('solver-metrics')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'solver-metrics'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              📊 Solver Metrics
            </button>
            <button
              onClick={() => setActiveTab('price-feeds')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'price-feeds'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              💱 Price Feeds
            </button>
          </div>
        </div>

        {/* Tab Content: Price Feeds */}
        {activeTab === 'price-feeds' && (
          <div className="mb-6">
            <PriceFeedComparison
              historicalData={historicalData}
              depegStats={coinGeckoDepegStats}
              lastUpdate={historicalLastUpdate}
            />
          </div>
        )}

        {/* Tab Content: Solver Metrics */}
        {activeTab === 'solver-metrics' && (
          <>

        {/* Parameters Control Panel */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            ⚙️ Configuration Parameters
            <span className="text-xs text-gray-400 font-normal">(Adjust to model different scenarios)</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Current TVL</label>
              <input
                type="number"
                value={tvl}
                onChange={(e) => setTvl(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min="1000"
                step="1000"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">USDC Weight (%)</label>
              <input
                type="number"
                value={usdcWeight}
                onChange={(e) => setUsdcWeight(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Rebalances/Day</label>
              <input
                type="number"
                value={rebalanceCyclesPerDay}
                onChange={(e) => setRebalanceCyclesPerDay(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min="1"
                max="1000"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Efficiency (%)</label>
              <input
                type="number"
                value={rebalanceEfficiency}
                onChange={(e) => setRebalanceEfficiency(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Solver Share of Fees (%)</label>
              <input
                type="number"
                value={solverShareOfFees}
                onChange={(e) => setSolverShareOfFees(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min="0"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">Of 80% protocol fees</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Actual Daily Volume</label>
              <input
                type="number"
                value={actualDailyVolume}
                onChange={(e) => setActualDailyVolume(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
                min="0"
                step="10000"
              />
              <p className="text-xs text-gray-500 mt-1">Real processed volume</p>
            </div>
          </div>

          {/* Real Market Data Section */}
          <div className={`border rounded p-3 ${
            avgDepegBps >= 5
              ? 'bg-green-900/20 border-green-700'
              : 'bg-gray-800/50 border-gray-600'
          }`}>
            <p className="text-xs mb-2 flex items-center gap-2">
              {avgDepegBps >= 5 ? (
                <>
                  <span className="text-green-300">✓ Route OPEN - Using Real DEX Pool Prices (Curve + Fluid)</span>
                  {pricesLastUpdate && (
                    <span className="text-gray-400">
                      • Updated: {pricesLastUpdate.toLocaleTimeString()}
                      {sampleCount > 0 && ` • ${sampleCount} samples`}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-gray-400">⚠️ Route CLOSED - Spread below threshold (need ≥5 bps to open)</span>
                  {pricesLastUpdate && (
                    <span className="text-gray-500">
                      • Updated: {pricesLastUpdate.toLocaleTimeString()}
                    </span>
                  )}
                </>
              )}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
              <div>
                <span className="text-gray-400">Active Time (Depeg %):</span>
                <span className="ml-2 text-yellow-400 font-semibold">{depegTimePercent.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-gray-400">Current Max Spread:</span>
                <span className={`ml-2 font-semibold ${avgDepegBps >= 5 ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {avgDepegBps.toFixed(1)} bps {avgDepegBps < 5 && '(below 5 bps threshold)'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Depegged DEX Pools:</span>
                <span className="ml-2 text-red-400 font-semibold">
                  {Object.entries(depegMetrics.bySource)
                    .filter(([source, metrics]) => source !== 'COINGECKO' && metrics.isDepegged)
                    .length} / 3
                </span>
              </div>
            </div>

            {/* Current Depeg Status by Pool */}
            <div className="text-xs">
              <p className="text-gray-500 mb-1">Current Status:</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1">
                  <span className="text-gray-400">Curve GHO/crvUSD</span>
                  <span className={depegMetrics.bySource.CURVE_GHO_CRVUSD.isDepegged ? 'text-red-400' : 'text-green-400'}>
                    {depegMetrics.bySource.CURVE_GHO_CRVUSD.isDepegged
                      ? `${depegMetrics.bySource.CURVE_GHO_CRVUSD.depegBps.toFixed(1)} bps`
                      : '✓ At peg'}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1">
                  <span className="text-gray-400">Curve GHO/USDe</span>
                  <span className={depegMetrics.bySource.CURVE_GHO_USDE.isDepegged ? 'text-red-400' : 'text-green-400'}>
                    {depegMetrics.bySource.CURVE_GHO_USDE.isDepegged
                      ? `${depegMetrics.bySource.CURVE_GHO_USDE.depegBps.toFixed(1)} bps`
                      : '✓ At peg'}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1">
                  <span className="text-gray-400">Fluid Protocol</span>
                  <span className={depegMetrics.bySource.FLUID.isDepegged ? 'text-red-400' : 'text-green-400'}>
                    {depegMetrics.bySource.FLUID.isDepegged
                      ? `${depegMetrics.bySource.FLUID.depegBps.toFixed(1)} bps`
                      : '✓ At peg'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border border-blue-700 rounded-lg p-4">
            <p className="text-sm text-blue-300 mb-1">Max Daily Fees (at Capacity)</p>
            <p className="text-2xl font-bold text-blue-400">
              {formatCurrency(metrics.maxDailyFees)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {metrics.avgSpreadBps >= metrics.depegThresholdBps
                ? `At ${metrics.effectiveSpreadBps.toFixed(0)} bps spread`
                : `At ${metrics.depegThresholdBps} bps threshold`}
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 border border-green-700 rounded-lg p-4">
            <p className="text-sm text-green-300 mb-1">Daily Capacity</p>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(metrics.dailyCapacity)}</p>
            <p className="text-xs text-gray-400 mt-1">{formatCurrency(metrics.hourlyCapacity)}/hour</p>
          </div>

          <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border border-purple-700 rounded-lg p-4">
            <p className="text-sm text-purple-300 mb-1">Max Single Swap</p>
            <p className="text-2xl font-bold text-purple-400">{formatCurrency(metrics.maxSingleSwap)}</p>
            <p className="text-xs text-gray-400 mt-1">Per transaction limit</p>
          </div>

          <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 border border-yellow-700 rounded-lg p-4">
            <p className="text-sm text-yellow-300 mb-1">Route Active Time</p>
            {pricesLoading ? (
              <p className="text-2xl font-bold text-gray-400">Loading...</p>
            ) : (
              <p className="text-2xl font-bold text-yellow-400">{formatPercent(metrics.depegTimePercent)}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {pricesLoading ? 'Fetching DEX pool data' : `${metrics.activeHoursPerDay.toFixed(1)} hours/day • DEX pools`}
            </p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Fee Matrix: Volume × Depeg Price */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="font-semibold mb-4">💵 Fee Matrix: Volume × Depeg Price</h2>
            <p className="text-xs text-gray-400 mb-3">
              Max daily protocol fees (80% of IOUs) at different volume and depeg scenarios
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-2 text-gray-400"></th>
                    <th className="text-right py-2 px-2 text-gray-400">$0</th>
                    <th className="text-right py-2 px-2 text-gray-400">{formatCurrency(metrics.dailyCapacity * 0.25)}</th>
                    <th className="text-right py-2 px-2 text-gray-400">{formatCurrency(metrics.dailyCapacity * 0.50)}</th>
                    <th className="text-right py-2 px-2 text-gray-400">{formatCurrency(metrics.dailyCapacity * 0.75)}</th>
                    <th className="text-right py-2 px-2 text-gray-400">{formatCurrency(metrics.dailyCapacity)}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { price: 0.9995, label: '$0.9995', spread: 5, color: 'text-yellow-400' },
                    { price: 0.999, label: '$0.999', spread: 10, color: 'text-yellow-300' },
                    { price: 0.995, label: '$0.995', spread: 50, color: 'text-yellow-300' },
                    { price: 0.990, label: '$0.990', spread: 100, color: 'text-yellow-300' },
                    { price: 0.985, label: '$0.985', spread: 150, color: 'text-orange-400' },
                    { price: 0.980, label: '$0.980', spread: 200, color: 'text-orange-300' },
                    { price: 0.975, label: '$0.975', spread: 250, color: 'text-red-400' },
                    { price: 0.970, label: '$0.970', spread: 300, color: 'text-red-300' },
                    { price: 0.965, label: '$0.965', spread: 350, color: 'text-pink-400' },
                    { price: 0.960, label: '$0.960', spread: 400, color: 'text-pink-300' },
                    { price: 0.955, label: '$0.955', spread: 450, color: 'text-purple-400' },
                    { price: 0.950, label: '$0.950', spread: 500, color: 'text-purple-300' },
                  ].map((row) => {
                    const volumeLevels = [0, 0.25, 0.50, 0.75, 1.0]
                    return (
                      <tr key={row.price} className="border-b border-gray-700/50">
                        <td className={`py-2 px-2 font-medium ${row.color}`}>
                          {row.label}
                          <span className="text-gray-500 ml-1">({row.spread}bps)</span>
                        </td>
                        {volumeLevels.map((volumePct) => {
                          const volume = metrics.dailyCapacity * volumePct
                          const fees = volume * (row.spread / 10000) * 0.80
                          return (
                            <td key={volumePct} className="text-right py-2 px-2">
                              <span className={fees > 0 ? 'text-green-400 font-semibold' : 'text-gray-600'}>
                                {formatCurrency(fees)}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              <p>💡 Example: At $0.980 (200 bps) with 50% capacity → {formatCurrency(metrics.dailyCapacity * 0.5 * 0.02 * 0.8)} daily fees</p>
            </div>
          </div>

          {/* Route Availability */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              ⏱️ Route Availability by Pool
              <span className="text-xs bg-green-900/50 text-green-400 px-2 py-1 rounded border border-green-700">
                Real DEX Data
              </span>
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <span className="text-gray-400">Avg Active Time (DEX Pools)</span>
                <span className="font-semibold text-lg text-yellow-400">{formatPercent(metrics.depegTimePercent)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <span className="text-gray-400">Active Hours per Day</span>
                <span className="font-semibold">{metrics.activeHoursPerDay.toFixed(1)} hours</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <span className="text-gray-400">Currently Depegged Pools</span>
                <span className="font-semibold text-red-400">{depegMetrics.aggregated.depeggedSources.length} / 3</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                <span className="text-gray-400">Capacity During Active Hours</span>
                <span className="font-semibold text-green-400">{formatCurrency(metrics.activeCapacityPerHour)}/hr</span>
              </div>

              {/* Depeg Location Breakdown - Only show depegged pools */}
              {depegMetrics.aggregated.depeggedSources.filter(s => s !== 'COINGECKO').length > 0 && (
                <div className="bg-blue-900/20 border border-blue-700 rounded p-3 mt-4">
                  <p className="text-xs text-blue-300 mb-3 font-semibold">📍 Currently Depegged Pools</p>
                  <div className="space-y-2">
                    {Object.entries(depegMetrics.bySource)
                      .filter(([source, metrics]) => source !== 'COINGECKO' && metrics.isDepegged)
                      .map(([source, metrics]) => {
                        const sourceNames = {
                          'CURVE_GHO_CRVUSD': 'Curve GHO/crvUSD',
                          'CURVE_GHO_USDE': 'Curve GHO/USDe',
                          'FLUID': 'Fluid Protocol'
                        }
                        const samplePeriod = metrics.historical.samplePeriodHours

                        return (
                          <div key={source} className="bg-gray-800/50 rounded p-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-gray-300">{sourceNames[source]}</span>
                              <span className="text-xs font-semibold text-red-400">
                                Depegged ${metrics.price?.toFixed(4)} ({metrics.depegBps.toFixed(1)} bps)
                              </span>
                            </div>
                            {samplePeriod > 0 && (
                              <div className="text-xs text-gray-500">
                                Historical: {metrics.historical.depegPercent.toFixed(1)}% depegged
                                ({metrics.historical.depeggedSamples}/{metrics.historical.totalSamples} samples over {samplePeriod.toFixed(1)}h)
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Show message if no pools are depegged */}
              {depegMetrics.aggregated.depeggedSources.filter(s => s !== 'COINGECKO').length === 0 && (
                <div className="bg-gray-800/50 border border-gray-700 rounded p-3 mt-4">
                  <p className="text-xs text-gray-400 text-center">
                    ✓ All DEX pools currently at peg (above $0.9995)
                  </p>
                </div>
              )}

              <div className="bg-green-900/20 border border-green-700 rounded p-3">
                <p className="text-xs text-green-300 mb-2">
                  ✓ Real-time DEX pool monitoring
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  Clear Protocol route is active when ANY DEX pool (Curve, Fluid) is depegged below $0.9995.
                </p>
                <div className="text-xs text-gray-500">
                  {sampleCount > 0
                    ? `Collecting samples every minute • ${sampleCount} samples in last 24h`
                    : 'Starting to collect historical samples...'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Capacity Evolution Over Time */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-4">📈 Protocol Fee Capacity Evolution (24 Hours)</h2>
          <p className="text-sm text-gray-400 mb-4">
            Shows available protocol fee capacity (80% of IOUs) depleting as swaps occur and renewing at rebalancing events
            • Rebalancing every <span className="text-blue-400 font-semibold">{(24 / rebalanceCyclesPerDay).toFixed(1)} hours</span>
            • Protocol fee capacity: <span className="text-green-400 font-semibold">{formatCurrency(metrics.usdcBuffer * 0.8)}</span> (80% of {formatCurrency(metrics.usdcBuffer)} USDC buffer)
          </p>

          <div className="relative bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            {/* SVG Graph */}
            <svg viewBox="0 0 1000 300" className="w-full" style={{ height: '300px' }}>
              {/* Grid lines - 0% to 80% scale */}
              {[0, 20, 40, 60, 80].map((pct) => (
                <g key={pct}>
                  <line
                    x1="50"
                    y1={250 - (pct * 2.5)}
                    x2="950"
                    y2={250 - (pct * 2.5)}
                    stroke="#374151"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                  <text x="10" y={255 - (pct * 2.5)} fill="#9ca3af" fontSize="12">
                    {pct}%
                  </text>
                </g>
              ))}

              {/* Time axis labels */}
              {[0, 6, 12, 18, 24].map((hour) => (
                <text
                  key={hour}
                  x={50 + (hour / 24) * 900}
                  y="280"
                  fill="#9ca3af"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {hour}h
                </text>
              ))}

              {/* Capacity evolution line */}
              {(() => {
                const points = []
                const hoursPerCycle = 24 / rebalanceCyclesPerDay
                const volumePerHour = metrics.dailyVolume / 24 // Swaps distributed over 24h
                const efficiency = rebalanceEfficiency / 100
                const PROTOCOL_FEES_SHARE = 0.80 // 80% of IOUs are protocol fees

                // Starting capacity is 80% of USDC buffer (protocol fee portion)
                const maxProtocolCapacity = metrics.usdcBuffer * PROTOCOL_FEES_SHARE
                let currentCapacity = maxProtocolCapacity

                // Calculate fees per cycle
                const volumePerCycle = metrics.dailyVolume / rebalanceCyclesPerDay
                const feesPerCycle = volumePerCycle * (metrics.effectiveSpreadBps / 10000) * PROTOCOL_FEES_SHARE

                for (let hour = 0; hour <= 24; hour += 0.25) {
                  // Check if rebalancing event
                  const cycleNumber = Math.floor(hour / hoursPerCycle)
                  const hourInCycle = hour - (cycleNumber * hoursPerCycle)

                  if (hourInCycle === 0 && hour > 0) {
                    // Rebalancing event - restore capacity to 80% × efficiency
                    currentCapacity = maxProtocolCapacity * efficiency
                  } else {
                    // Deplete capacity from swaps (only consume the protocol fees portion)
                    const volumeThisQuarter = volumePerHour * 0.25
                    const capacityUsed = volumeThisQuarter // Each swap uses capacity
                    currentCapacity = Math.max(0, currentCapacity - capacityUsed)
                  }

                  const x = 50 + (hour / 24) * 900
                  // Scale to 0-80% range (capacity as % of max protocol capacity)
                  const capacityPct = (currentCapacity / metrics.usdcBuffer) * 100
                  const y = 250 - (capacityPct * 2.5) // 2.5 multiplier for 0-80% scale

                  points.push({ x, y, hour, capacity: currentCapacity, cycleNumber })
                }

                const pathData = points.map((p, i) =>
                  `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`
                ).join(' ')

                return (
                  <>
                    {/* Area under curve */}
                    <path
                      d={`${pathData} L 950,250 L 50,250 Z`}
                      fill="rgba(59, 130, 246, 0.1)"
                    />
                    {/* Line */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                    />

                    {/* Rebalancing event markers + Fee labels */}
                    {Array.from({ length: rebalanceCyclesPerDay + 1 }, (_, i) => {
                      const eventHour = i * hoursPerCycle
                      const nextEventHour = Math.min((i + 1) * hoursPerCycle, 24)
                      const midpointHour = (eventHour + nextEventHour) / 2

                      // Show fee label between rebalancing events
                      const showFeeLabel = i < rebalanceCyclesPerDay

                      return (
                        <g key={i}>
                          {/* Rebalancing line (skip first at hour 0) */}
                          {eventHour > 0 && (
                            <>
                              <line
                                x1={50 + (eventHour / 24) * 900}
                                y1="50"
                                x2={50 + (eventHour / 24) * 900}
                                y2="250"
                                stroke="#10b981"
                                strokeWidth="2"
                                strokeDasharray="4,4"
                              />
                              <text
                                x={50 + (eventHour / 24) * 900}
                                y="40"
                                fill="#10b981"
                                fontSize="10"
                                textAnchor="middle"
                              >
                                ↻ Rebalance
                              </text>
                            </>
                          )}

                          {/* Fee label between events */}
                          {showFeeLabel && (
                            <text
                              x={50 + (midpointHour / 24) * 900}
                              y="20"
                              fill="#fbbf24"
                              fontSize="12"
                              textAnchor="middle"
                              fontWeight="bold"
                            >
                              {formatCurrency(feesPerCycle)} fees
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {/* Current position marker (if actual volume > 0) */}
                    {metrics.dailyVolume > 0 && (
                      <circle
                        cx={50 + (12 / 24) * 900}
                        cy={points[Math.floor(points.length / 2)]?.y || 150}
                        r="5"
                        fill="#ef4444"
                      />
                    )}
                  </>
                )
              })()}
            </svg>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-blue-400"></div>
                <span className="text-gray-400">Protocol Fee Capacity (80% of capacity)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-green-400 border-dashed"></div>
                <span className="text-gray-400">Rebalancing Event</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-2 bg-yellow-400"></div>
                <span className="text-gray-400">Fees Captured per Period</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <span className="text-gray-400">Current Time (simulation)</span>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-500">Protocol Fee Capacity</p>
                <p className="text-blue-400 font-semibold">{formatCurrency(metrics.usdcBuffer * 0.8)}</p>
                <p className="text-gray-600 text-xs">80% of USDC buffer</p>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-500">Fees per Cycle</p>
                <p className="text-yellow-400 font-semibold">
                  {formatCurrency((metrics.dailyVolume / rebalanceCyclesPerDay) * (metrics.effectiveSpreadBps / 10000) * 0.80)}
                </p>
                <p className="text-gray-600 text-xs">Max before rebalance</p>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-500">Rebalance Efficiency</p>
                <p className="text-green-400 font-semibold">{rebalanceEfficiency}%</p>
                <p className="text-gray-600 text-xs">Capacity restoration</p>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-500">Volume Depletion Rate</p>
                <p className="text-orange-400 font-semibold">
                  {formatCurrency(metrics.dailyVolume / 24)}/hour
                </p>
                <p className="text-gray-600 text-xs">Swap processing</p>
              </div>
            </div>
          </div>
        </div>

        {/* IOU Economics & Profitability */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            💰 IOU Economics & Distribution
            <span className="text-xs bg-green-900/50 text-green-400 px-2 py-1 rounded border border-green-700">
              Real Spread Data
            </span>
          </h2>

          {/* IOU Distribution Overview */}
          <div className="bg-blue-900/20 border border-blue-700 rounded p-4 mb-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-3">📊 IOU Split Model</h3>
            <p className="text-xs text-gray-400 mb-3">
              When users swap depegged GHO at peg price ($1.00), the delta is paid in IOUs. Distribution:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-purple-900/30 border border-purple-700 rounded p-3">
                <p className="text-xs text-purple-300 mb-1">Trader Incentive</p>
                <p className="text-2xl font-bold text-purple-400">20%</p>
                <p className="text-xs text-gray-400 mt-1">Better rate than other DEXs</p>
              </div>
              <div className="bg-green-900/30 border border-green-700 rounded p-3">
                <p className="text-xs text-green-300 mb-1">Solver Earnings</p>
                <p className="text-2xl font-bold text-green-400">{formatPercent(metrics.solverEffectiveShare)}</p>
                <p className="text-xs text-gray-400 mt-1">{solverShareOfFees}% of 80% fees</p>
              </div>
              <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3">
                <p className="text-xs text-yellow-300 mb-1">Protocol Revenue</p>
                <p className="text-2xl font-bold text-yellow-400">{formatPercent(metrics.protocolEffectiveShare)}</p>
                <p className="text-xs text-gray-400 mt-1">{100 - solverShareOfFees}% of 80% fees</p>
              </div>
            </div>
          </div>

          {/* Current Spread Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
              <p className="text-sm text-gray-300 mb-1">Current Max Spread (DEX)</p>
              <p className="text-3xl font-bold text-cyan-400">{metrics.avgSpreadBps.toFixed(1)} bps</p>
              <p className="text-xs text-gray-400 mt-1">{formatPercent(metrics.avgSpreadBps / 100)} below peg</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
              <p className="text-sm text-gray-300 mb-1">IOUs per $100k Swap</p>
              <p className="text-3xl font-bold text-blue-400">
                {formatCurrency(100000 * (metrics.avgSpreadBps / 10000))}
              </p>
              <p className="text-xs text-gray-400 mt-1">At current spread</p>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
              <p className="text-sm text-gray-300 mb-1">Solver Earns per $100k</p>
              <p className="text-3xl font-bold text-green-400">
                {formatCurrency(100000 * (metrics.avgSpreadBps / 10000) * (metrics.solverEffectiveShare / 100))}
              </p>
              <p className="text-xs text-gray-400 mt-1">In IOUs</p>
            </div>
          </div>

          {/* Daily Metrics */}
          <div className="bg-gray-900/50 border border-gray-700 rounded p-4">
            <h3 className="text-sm font-semibold text-yellow-300 mb-3">
              📈 Daily Metrics {metrics.dailyVolume === 0 ? '(Enter Actual Volume Above)' : `(${formatCurrency(metrics.dailyVolume)} processed)`}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-gray-400 text-sm mb-1">Daily Volume</p>
                <p className="text-2xl font-bold text-white">
                  {metrics.dailyVolume > 0 ? formatCurrency(metrics.dailyVolume) : '$0'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Total IOUs Minted</p>
                <p className="text-2xl font-bold text-blue-400">{formatCurrency(metrics.totalDailyIOUs)}</p>
                <p className="text-xs text-gray-500 mt-1">= Volume × Spread</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Solver Daily IOUs</p>
                <p className="text-2xl font-bold text-green-400">{formatCurrency(metrics.dailySolverIOUs)}</p>
                <p className="text-xs text-gray-500 mt-1">{formatPercent(metrics.solverEffectiveShare)} of IOUs</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Protocol Daily IOUs</p>
                <p className="text-2xl font-bold text-yellow-400">{formatCurrency(metrics.dailyProtocolIOUs)}</p>
                <p className="text-xs text-gray-500 mt-1">{formatPercent(metrics.protocolEffectiveShare)} of IOUs</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Capacity Utilization</span>
                <span className="text-xl font-bold" style={{ color: metrics.capacityUtilization > 100 ? '#ef4444' : metrics.capacityUtilization > 75 ? '#eab308' : '#22c55e' }}>
                  {formatPercent(metrics.capacityUtilization)}
                </span>
              </div>
              {metrics.capacityUtilization > 100 && (
                <p className="text-xs text-red-400 mt-1">⚠️ Over capacity - need to increase TVL</p>
              )}
            </div>
          </div>
        </div>

        {/* Key Formulas */}
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-300 mb-3">📐 Core Formulas (IOU Model)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-sm">
            <div>
              <p className="text-gray-400">Total IOUs Minted:</p>
              <p className="text-blue-300">Swap Amount × (1.0 - Market Price)</p>
              <p className="text-yellow-400 text-xs mt-1">Example: $100k × (1.0 - 0.997) = $100k × 0.003 = $300</p>
            </div>
            <div>
              <p className="text-gray-400">Solver IOUs (per swap):</p>
              <p className="text-blue-300">Total IOUs × 80% × Solver%</p>
              <p className="text-yellow-400 text-xs mt-1">Example: $300 × 80% × {solverShareOfFees}% = ${(300 * 0.8 * solverShareOfFees / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-gray-400">Daily Capacity:</p>
              <p className="text-blue-300">USDC Buffer × Cycles × Efficiency</p>
              <p className="text-yellow-400 text-xs mt-1">= {formatCurrency(metrics.usdcBuffer)} × {rebalanceCyclesPerDay} × {rebalanceEfficiency}% = {formatCurrency(metrics.dailyCapacity)}</p>
            </div>
            <div>
              <p className="text-gray-400">Active Hours per Day:</p>
              <p className="text-blue-300">24 hours × Depeg% (Real DEX Data)</p>
              <p className="text-yellow-400 text-xs mt-1">= 24 × {formatPercent(metrics.depegTimePercent)} = {metrics.activeHoursPerDay.toFixed(1)} hours</p>
            </div>
          </div>

          {/* IOU Distribution Example */}
          <div className="mt-4 pt-4 border-t border-blue-700">
            <p className="text-blue-300 font-semibold mb-2">Example: $100k swap when GHO at $0.997</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="bg-blue-900/30 rounded p-2">
                <p className="text-gray-400">User gets USDC at peg</p>
                <p className="text-white font-semibold">$100,000</p>
              </div>
              <div className="bg-blue-900/30 rounded p-2">
                <p className="text-gray-400">Total IOUs minted</p>
                <p className="text-blue-400 font-semibold">$300</p>
              </div>
              <div className="bg-purple-900/30 rounded p-2">
                <p className="text-gray-400">Trader receives (20%)</p>
                <p className="text-purple-400 font-semibold">$60 in IOUs</p>
              </div>
              <div className="bg-green-900/30 rounded p-2">
                <p className="text-gray-400">Solver receives ({solverShareOfFees}% of 80%)</p>
                <p className="text-green-400 font-semibold">${(300 * 0.8 * solverShareOfFees / 100).toFixed(0)} in IOUs</p>
              </div>
              <div className="bg-yellow-900/30 rounded p-2">
                <p className="text-gray-400">Protocol receives ({100 - solverShareOfFees}% of 80%)</p>
                <p className="text-yellow-400 font-semibold">${(300 * 0.8 * (100 - solverShareOfFees) / 100).toFixed(0)} in IOUs</p>
              </div>
            </div>
          </div>
        </div>

          </>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Clear Protocol Solver Integration Dashboard • Built for DEX aggregator and solver analysis
        </div>
      </div>
    </div>
  )
}

export default App
