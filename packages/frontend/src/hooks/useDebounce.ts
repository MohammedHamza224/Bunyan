import { useState, useEffect } from 'react'

/**
 * Custom hook to debounce a value by a specified delay.
 * Prevents rapid repeated API queries on user input.
 *
 * @param value The value to debounce
 * @param delay Milliseconds to delay updating the debounced value (default 300ms)
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
