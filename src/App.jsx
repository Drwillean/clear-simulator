import React, { useState, useMemo } from 'react'

function App() {
  // Reserve Parameters
  const [usdcWeight, setUsdcWeight] = useState(70)
  const [ghoWeight, setGhoWeight] = useState(30)
  
  // Rebalancing Parameters
  const [rebalanceCyclesPerDay, setRebalanceCyclesPerDay] = useState(24) // How many times reserve can fully cycle
  const [rebalanceEfficiency, setRebalanceEfficiency] = useState(90) // % of theoretical rebalance achieved
  
  // Market Parameters  
  const [depegTimePercent, setDepegTimePercent] = useState(60) // % of day GHO is depegged
  const [avgDepegBps, setAvgDepegBps] = useState(10) // average depeg in basis points
  
  // Swap Distribution (from user's data)
  const swapDistribution = [
    { label: '<$1k', pctCount: 45, pctVolume: 0.3, avgSize: 500 },
    { label: '$1k-$10k', pctCount: 30, pctVolume: 3.2, avgSize: 5000 },
    { label: '$10k-$100k', pctCount: 20, pctVolume: 21.5, avgSize: 50000 },
    { label: '$100k-$1M', pctCount: 4, pctVolume: 41.3, avgSize: 500000 },
    { label: '$1M+', pctCount: 1, pctVolume: 33.6, avgSize: 2000000 },
  ]

  // Calculate capacity for given TVL (in USD)
  const calculateCapacity = (tvl) => {
    const usdcBuffer = tvl * (usdcWeight / 100)
    
    // Max single swap = available USDC buffer
    const maxSingleSwap = usdcBuffer
    
    // During depeg time, swaps consume USDC buffer
    // During at-peg time, rebalancing restores buffer
    const depegRatio = depegTimePercent / 100
    const efficiency = rebalanceEfficiency / 100
    
    // Effective daily cycles considering depeg time distribution
    // Only depeg periods generate swap demand, at-peg periods allow rebalancing
    const effectiveCycles = rebalanceCyclesPerDay * efficiency
    
    // Daily processable volume = buffer × cycles
    // But we need to account for the depeg/repeg rhythm
    const dailyCapacity = usdcBuffer * effectiveCycles
    
    return {
      maxSingleSwap,
      dailyCapacity,
      tvl,
      usdcBuffer
    }
  }

  // Generate heatmap data
  const heatmapData = useMemo(() => {
    // TVL range: $10k to $1M
    const tvlRange = [10000, 25000, 50000, 100000, 150000, 200000, 300000, 400000, 500000, 750000, 1000000]

    // Volume range: $100k to $20M
    const volumeRange = [100000, 250000, 500000, 1000000, 2000000, 5000000, 10000000, 15000000, 18000000, 20000000]
    
    const data = []
    
    volumeRange.forEach(volume => {
      tvlRange.forEach(tvl => {
        const capacity = calculateCapacity(tvl)
        
        // Calculate utilization and stress
        const utilization = volume / capacity.dailyCapacity
        
        let stress
        if (utilization <= 0.5) stress = 0
        else if (utilization <= 0.75) stress = 25
        else if (utilization <= 0.9) stress = 50
        else if (utilization <= 1.0) stress = 75
        else stress = 100
        
        // Check which swap tiers can be handled
        const handledTiers = swapDistribution.filter(tier => tier.avgSize <= capacity.maxSingleSwap)
        const volumeCoverage = handledTiers.reduce((sum, tier) => sum + tier.pctVolume, 0)
        
        data.push({
          tvl,
          volume,
          stress,
          utilization,
          dailyCapacity: capacity.dailyCapacity,
          maxSingleSwap: capacity.maxSingleSwap,
          volumeCoverage,
          feasible: utilization <= 1.0
        })
      })
    })
    
    return { data, tvlRange, volumeRange }
  }, [usdcWeight, rebalanceCyclesPerDay, rebalanceEfficiency, depegTimePercent])

  // Find recommended TVL for target volume
  const findRecommendedTVL = (targetVolume, maxSwapNeeded) => {
    for (let tvl = 1000; tvl <= 10000000; tvl += 1000) {
      const cap = calculateCapacity(tvl)
      if (cap.dailyCapacity >= targetVolume && cap.maxSingleSwap >= maxSwapNeeded) {
        return tvl
      }
    }
    return null
  }

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`
    return `$${value.toFixed(0)}`
  }

  const getColor = (stress) => {
    if (stress <= 25) return '#22c55e'
    if (stress <= 50) return '#84cc16'
    if (stress <= 75) return '#eab308'
    if (stress <= 90) return '#f97316'
    return '#ef4444'
  }

  // Quick calculations
  const targetVolume = 18000000 // $18M
  const maxWhaleSwap = 1000000 // $1M whale swap
  const recommendedTVL = findRecommendedTVL(targetVolume, maxWhaleSwap)
  const minTVLfor100k = findRecommendedTVL(targetVolume, 100000)

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Clear Protocol: TVL vs Volume Simulator</h1>
          <p className="text-gray-400">Model reserve capacity based on rebalancing frequency and USDC weight</p>
        </div>

        {/* Key Formula */}
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-300 mb-2">📐 Core Formula</h2>
          <div className="font-mono text-sm space-y-1">
            <p><span className="text-yellow-300">Daily Capacity</span> = USDC Buffer × Rebalance Cycles × Efficiency</p>
            <p><span className="text-yellow-300">Max Single Swap</span> = TVL × USDC Weight</p>
            <p className="text-gray-400 text-xs mt-2">
              With {rebalanceCyclesPerDay} cycles/day and {usdcWeight}% USDC: 
              <span className="text-green-400"> 1 TVL unit → {(rebalanceCyclesPerDay * usdcWeight/100 * rebalanceEfficiency/100).toFixed(1)}x daily volume capacity</span>
            </p>
          </div>
        </div>

        {/* Parameters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-4">⚙️ Parameters</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">USDC Weight (%)</label>
              <input
                type="number"
                value={usdcWeight}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setUsdcWeight(val)
                  setGhoWeight(100 - val)
                }}
                className="w-full bg-gray-700 rounded px-3 py-2"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Rebalance Cycles/Day</label>
              <input
                type="number"
                value={rebalanceCyclesPerDay}
                onChange={(e) => setRebalanceCyclesPerDay(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2"
                min="1"
                max="1000"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Rebalance Efficiency (%)</label>
              <input
                type="number"
                value={rebalanceEfficiency}
                onChange={(e) => setRebalanceEfficiency(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Depeg Time (%)</label>
              <input
                type="number"
                value={depegTimePercent}
                onChange={(e) => setDepegTimePercent(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2"
                min="0"
                max="100"
              />
            </div>
          </div>
        </div>

        {/* Quick Results */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 border border-green-700 rounded-lg p-4">
            <p className="text-sm text-green-300">TVL for $18M/day + $100k swaps</p>
            <p className="text-3xl font-bold text-green-400">
              {minTVLfor100k ? formatCurrency(minTVLfor100k) : 'N/A'}
            </p>
          </div>
          <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 border border-yellow-700 rounded-lg p-4">
            <p className="text-sm text-yellow-300">TVL for $18M/day + $1M swaps</p>
            <p className="text-3xl font-bold text-yellow-400">
              {recommendedTVL ? formatCurrency(recommendedTVL) : 'N/A'}
            </p>
          </div>
          <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border border-purple-700 rounded-lg p-4">
            <p className="text-sm text-purple-300">$50k TVL Daily Capacity</p>
            <p className="text-3xl font-bold text-purple-400">
              {formatCurrency(calculateCapacity(50000).dailyCapacity)}
            </p>
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 overflow-x-auto">
          <h2 className="font-semibold mb-4">🗺️ TVL vs Volume Heatmap</h2>
          
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
            <span className="text-gray-400">Utilization:</span>
            {[
              { color: '#22c55e', label: '< 50%' },
              { color: '#84cc16', label: '50-75%' },
              { color: '#eab308', label: '75-90%' },
              { color: '#f97316', label: '90-100%' },
              { color: '#ef4444', label: '> 100%' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }}></div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <div className="inline-block min-w-full">
            {/* Header */}
            <div className="flex">
              <div className="w-20 shrink-0"></div>
              {heatmapData.tvlRange.map(tvl => (
                <div key={tvl} className="w-16 text-xs text-gray-400 text-center shrink-0">
                  {formatCurrency(tvl)}
                </div>
              ))}
            </div>
            
            {/* Rows */}
            {heatmapData.volumeRange.slice().reverse().map(volume => (
              <div key={volume} className="flex items-center">
                <div className="w-20 text-xs text-gray-400 text-right pr-2 shrink-0">
                  {formatCurrency(volume)}
                </div>
                {heatmapData.tvlRange.map(tvl => {
                  const cell = heatmapData.data.find(d => d.tvl === tvl && d.volume === volume)
                  return (
                    <div
                      key={`${tvl}-${volume}`}
                      className="w-16 h-10 border border-gray-700 flex items-center justify-center text-xs font-medium shrink-0 cursor-pointer hover:border-white transition-colors group relative"
                      style={{ backgroundColor: getColor(cell.stress) }}
                    >
                      <span className="text-gray-900">
                        {(cell.utilization * 100).toFixed(0)}%
                      </span>
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                        <div className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs whitespace-nowrap shadow-lg text-white">
                          <div className="font-semibold mb-1">TVL: {formatCurrency(tvl)}</div>
                          <div>Volume: {formatCurrency(volume)}</div>
                          <div>Capacity: {formatCurrency(cell.dailyCapacity)}</div>
                          <div>Max Swap: {formatCurrency(cell.maxSingleSwap)}</div>
                          <div className={cell.feasible ? 'text-green-400' : 'text-red-400'}>
                            {cell.feasible ? '✓ Feasible' : '✗ Over capacity'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            
            {/* X-axis label */}
            <div className="text-center text-gray-400 text-sm mt-2 ml-20">
              Reserve TVL →
            </div>
          </div>
        </div>

        {/* Swap Size Coverage Table */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-4">🐋 Swap Size Coverage by TVL</h2>
          <p className="text-sm text-gray-400 mb-4">
            Which swap tiers can be handled at each TVL level (max single swap = {usdcWeight}% of TVL)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2">TVL</th>
                  <th className="text-right py-2">Max Swap</th>
                  <th className="text-center py-2">&lt;$1k</th>
                  <th className="text-center py-2">$1k-$10k</th>
                  <th className="text-center py-2">$10k-$100k</th>
                  <th className="text-center py-2">$100k-$1M</th>
                  <th className="text-center py-2">$1M+</th>
                  <th className="text-right py-2">Volume Coverage</th>
                </tr>
              </thead>
              <tbody>
                {[10000, 25000, 50000, 100000, 150000, 250000, 500000, 1000000, 1500000, 3000000].map(tvl => {
                  const cap = calculateCapacity(tvl)
                  const maxSwap = cap.maxSingleSwap
                  const thresholds = [1000, 10000, 100000, 1000000, 2000000]
                  
                  let volumeCoverage = 0
                  swapDistribution.forEach((tier, i) => {
                    if (maxSwap >= thresholds[i]) {
                      volumeCoverage += tier.pctVolume
                    }
                  })
                  
                  return (
                    <tr key={tvl} className="border-b border-gray-700">
                      <td className="py-2 font-medium">{formatCurrency(tvl)}</td>
                      <td className="text-right">{formatCurrency(maxSwap)}</td>
                      {thresholds.map((threshold, i) => (
                        <td key={i} className="text-center">
                          {maxSwap >= threshold ? (
                            <span className="text-green-400">✓</span>
                          ) : (
                            <span className="text-red-400">✗</span>
                          )}
                        </td>
                      ))}
                      <td className="text-right">
                        <span className={volumeCoverage >= 95 ? 'text-green-400' : volumeCoverage >= 75 ? 'text-yellow-400' : 'text-red-400'}>
                          {volumeCoverage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Calculator */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-4">🧮 Quick Calculator</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm text-gray-400 mb-2">Given TVL, what's my capacity?</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  id="calc-tvl"
                  placeholder="Enter TVL in USD"
                  className="flex-1 bg-gray-700 rounded px-3 py-2"
                  defaultValue={50000}
                />
                <button
                  onClick={() => {
                    const tvl = Number(document.getElementById('calc-tvl').value)
                    const cap = calculateCapacity(tvl)
                    document.getElementById('calc-result-1').textContent = 
                      `Daily Capacity: ${formatCurrency(cap.dailyCapacity)} | Max Swap: ${formatCurrency(cap.maxSingleSwap)}`
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                >
                  Calculate
                </button>
              </div>
              <p id="calc-result-1" className="mt-2 text-green-400"></p>
            </div>
            
            <div>
              <h3 className="text-sm text-gray-400 mb-2">Given volume target, what TVL do I need?</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  id="calc-volume"
                  placeholder="Target daily volume"
                  className="flex-1 bg-gray-700 rounded px-3 py-2"
                  defaultValue={18000000}
                />
                <button
                  onClick={() => {
                    const volume = Number(document.getElementById('calc-volume').value)
                    const tvlNeeded = findRecommendedTVL(volume, 100000)
                    document.getElementById('calc-result-2').textContent = 
                      tvlNeeded ? `Required TVL: ${formatCurrency(tvlNeeded)} (for $100k max swaps)` : 'Unable to calculate'
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                >
                  Calculate
                </button>
              </div>
              <p id="calc-result-2" className="mt-2 text-green-400"></p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Clear Protocol TVL Simulator • Built for reserve capacity planning
        </div>
      </div>
    </div>
  )
}

export default App
