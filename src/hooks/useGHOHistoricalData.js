import { useState, useEffect, useMemo } from 'react'

/**
 * Custom hook to fetch and analyze GHO historical price data
 * @param {number} days - Number of days of historical data to fetch
 * @returns {Object} - Historical data and depeg statistics
 */
export function useGHOHistoricalData(days = 30) {
  const [historicalData, setHistoricalData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  // Fetch historical GHO prices from CoinGecko
  const fetchHistoricalData = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/gho/market_chart?vs_currency=usd&days=${days}&interval=hourly`
      )

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`)
      }

      const data = await response.json()

      // Process data to calculate depeg metrics
      const prices = data.prices.map(([timestamp, price]) => ({
        timestamp,
        date: new Date(timestamp).toISOString(),
        price,
        isDepegged: price < 0.9995,
        depegBps: price < 1.0 ? ((1.0 - price) * 10000) : 0
      }))

      setHistoricalData(prices)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      console.error('Error fetching GHO historical data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistoricalData()

    // Refresh every 5 minutes
    const interval = setInterval(fetchHistoricalData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [days])

  // Calculate depeg statistics from historical data
  const depegStats = useMemo(() => {
    if (historicalData.length === 0) {
      return {
        depegPercent: 0,
        avgDepegBps: 0,
        maxDepegBps: 0,
        depeggedHours: 0,
        totalHours: 0,
        atPegPercent: 100,
        activeHoursPerDay: 0,
      }
    }

    const depeggedHours = historicalData.filter(d => d.isDepegged).length
    const totalHours = historicalData.length
    const depegPercent = (depeggedHours / totalHours) * 100

    const depegPeriods = historicalData.filter(d => d.isDepegged)
    const avgDepegBps = depegPeriods.length > 0
      ? depegPeriods.reduce((sum, d) => sum + d.depegBps, 0) / depegPeriods.length
      : 0

    const maxDepegBps = depegPeriods.length > 0
      ? Math.max(...depegPeriods.map(d => d.depegBps))
      : 0

    const activeHoursPerDay = 24 * (depegPercent / 100)

    return {
      depegPercent: depegPercent,
      avgDepegBps: avgDepegBps,
      maxDepegBps: maxDepegBps,
      depeggedHours,
      totalHours,
      atPegPercent: 100 - depegPercent,
      activeHoursPerDay,
    }
  }, [historicalData])

  return {
    historicalData,
    depegStats,
    loading,
    error,
    lastUpdate,
    refresh: fetchHistoricalData,
  }
}
