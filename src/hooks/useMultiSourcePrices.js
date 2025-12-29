import { useState, useEffect, useMemo } from 'react'
import { fetchAllCurvePrices } from '../utils/curvePools'
import { fetchFluidGHOPrice } from '../utils/fluidPools'

/**
 * Custom hook to fetch GHO prices from multiple sources and track depeg metrics
 * @returns {Object} - Current prices, depeg stats per source, and aggregated metrics
 */
export function useMultiSourcePrices() {
  const [prices, setPrices] = useState({
    COINGECKO: null,
    CURVE_GHO_CRVUSD: null,
    CURVE_GHO_USDE: null,
    FLUID: null,
  })
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [historicalSamples, setHistoricalSamples] = useState([])

  // Fetch CoinGecko price
  const fetchCoinGeckoPrice = async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=gho&vs_currencies=usd&include_24hr_change=true'
      )
      const data = await response.json()
      return data.gho?.usd || null
    } catch (error) {
      console.error('CoinGecko fetch error:', error)
      return null
    }
  }

  // Fetch all prices
  const fetchAllPrices = async () => {
    setLoading(true)

    try {
      const [coinGeckoPrice, curvePrices, fluidPrice] = await Promise.all([
        fetchCoinGeckoPrice(),
        fetchAllCurvePrices(),
        fetchFluidGHOPrice(),
      ])

      const newPrices = {
        COINGECKO: coinGeckoPrice,
        CURVE_GHO_CRVUSD: curvePrices.GHO_CRVUSD,
        CURVE_GHO_USDE: curvePrices.GHO_USDE,
        FLUID: fluidPrice,
      }

      setPrices(newPrices)

      // Add to historical samples with timestamp
      const sample = {
        timestamp: Date.now(),
        prices: newPrices,
      }

      setHistoricalSamples(prev => {
        // Keep last 24 hours of samples (at 1 min intervals = max 1440 samples)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
        const filtered = prev.filter(s => s.timestamp > oneDayAgo)
        return [...filtered, sample]
      })

      setLastUpdate(new Date())
    } catch (error) {
      console.error('Error fetching all prices:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllPrices()

    // Refresh every 60 seconds
    const interval = setInterval(fetchAllPrices, 60000)
    return () => clearInterval(interval)
  }, [])

  // Calculate depeg metrics per source
  const depegMetrics = useMemo(() => {
    const DEPEG_THRESHOLD = 0.9995

    const sourceMetrics = {}

    Object.entries(prices).forEach(([source, price]) => {
      const isDepegged = price !== null && price < DEPEG_THRESHOLD
      const depegBps = price !== null && price < 1.0 ? ((1.0 - price) * 10000) : 0

      sourceMetrics[source] = {
        price,
        isDepegged,
        depegBps,
        status: price === null ? 'loading' : (isDepegged ? 'depegged' : 'pegged'),
      }
    })

    // Calculate historical metrics from samples
    const sourceSampleCounts = {
      COINGECKO: { depegged: 0, total: 0 },
      CURVE_GHO_CRVUSD: { depegged: 0, total: 0 },
      CURVE_GHO_USDE: { depegged: 0, total: 0 },
      FLUID: { depegged: 0, total: 0 },
    }

    historicalSamples.forEach(sample => {
      Object.entries(sample.prices).forEach(([source, price]) => {
        if (price !== null) {
          sourceSampleCounts[source].total++
          if (price < DEPEG_THRESHOLD) {
            sourceSampleCounts[source].depegged++
          }
        }
      })
    })

    // Add historical stats to each source
    Object.entries(sourceSampleCounts).forEach(([source, counts]) => {
      const depegPercent = counts.total > 0
        ? (counts.depegged / counts.total) * 100
        : 0

      sourceMetrics[source] = {
        ...sourceMetrics[source],
        historical: {
          depeggedSamples: counts.depegged,
          totalSamples: counts.total,
          depegPercent,
          samplePeriodHours: historicalSamples.length > 0
            ? (Date.now() - historicalSamples[0].timestamp) / (1000 * 60 * 60)
            : 0,
        }
      }
    })

    // Aggregated metrics across all DEX sources (excluding CoinGecko)
    const dexSources = ['CURVE_GHO_CRVUSD', 'CURVE_GHO_USDE', 'FLUID']
    const anyDexDepegged = dexSources.some(source => sourceMetrics[source].isDepegged)

    const dexDepegBps = Math.max(
      ...dexSources
        .map(source => sourceMetrics[source].depegBps)
        .filter(bps => bps > 0)
    )

    // Calculate average depeg % across DEX pools (from historical samples)
    const avgDexDepegPercent = dexSources
      .map(source => sourceMetrics[source].historical.depegPercent)
      .reduce((sum, pct) => sum + pct, 0) / dexSources.length

    return {
      bySource: sourceMetrics,
      aggregated: {
        anyDexDepegged,
        maxDexDepegBps: dexDepegBps > 0 ? dexDepegBps : 0,
        avgDexDepegPercent,
        depeggedSources: Object.entries(sourceMetrics)
          .filter(([_, metrics]) => metrics.isDepegged)
          .map(([source]) => source),
      }
    }
  }, [prices, historicalSamples])

  return {
    prices,
    depegMetrics,
    loading,
    lastUpdate,
    sampleCount: historicalSamples.length,
    refresh: fetchAllPrices,
  }
}
