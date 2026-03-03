import { useState, useEffect, useRef, useCallback } from 'react';
import { TotpApi } from '../lib/api';

interface TOTPCode {
  code: string;
  remainingSeconds: number;
}

/**
 * Centralized hook for managing TOTP codes for multiple accounts.
 * Uses a single global timer and batches API calls to improve performance.
 */
export function useBatchedTOTP(accountIds: number[]) {
  const [codes, setCodes] = useState<Map<number, TOTPCode>>(new Map());
  const [remainingSeconds, setRemainingSeconds] = useState<Map<number, number>>(new Map());
  const intervalRef = useRef<number | null>(null);
  const processedIdsRef = useRef<Set<number>>(new Set());

  // Initialize remaining seconds for new account IDs and fetch their codes
  useEffect(() => {
    if (accountIds.length === 0) return;

    // Find new account IDs that haven't been processed yet
    const newIds = accountIds.filter(id => !processedIdsRef.current.has(id));

    if (newIds.length > 0) {
      // Add new IDs to the processed set
      processedIdsRef.current = new Set([...processedIdsRef.current, ...newIds]);

      // Initialize remaining seconds for new accounts
      setRemainingSeconds((prev) => {
        const newMap = new Map(prev);
        newIds.forEach((id) => {
          newMap.set(id, 30);
        });
        return newMap;
      });

      // Immediately fetch codes for new accounts
      TotpApi.getBulk({ accountIds: newIds }).then(results => {
        setCodes(prev => {
          const newMap = new Map(prev);
          results.forEach((item) => {
            newMap.set(item.accountId, {
              code: item.code,
              remainingSeconds: item.remainingSeconds,
            });
          });
          return newMap;
        });
        setRemainingSeconds(prev => {
          const newMap = new Map(prev);
          results.forEach((item) => {
            newMap.set(item.accountId, item.remainingSeconds);
          });
          return newMap;
        });
      }).catch(err => {
        console.error('Failed to fetch TOTP codes for new accounts:', err);
      });
    }

    // Remove IDs that are no longer in the list
    setRemainingSeconds((prev) => {
      const newMap = new Map(prev);
      for (const [id] of newMap) {
        if (!accountIds.includes(id)) {
          newMap.delete(id);
          processedIdsRef.current.delete(id);
        }
      }
      return newMap;
    });

    // Also clean up codes for removed accounts
    setCodes((prev) => {
      const newMap = new Map(prev);
      for (const [id] of newMap) {
        if (!accountIds.includes(id)) {
          newMap.delete(id);
        }
      }
      return newMap;
    });
  }, [accountIds]);

  // Fetch codes for accounts that need refresh
  const fetchCodes = useCallback(async (idsToRefresh: number[]) => {
    if (idsToRefresh.length === 0) return;

    try {
      const results = await TotpApi.getBulk({ accountIds: idsToRefresh });

      setCodes(prev => {
        const newMap = new Map(prev);
        results.forEach((item) => {
          newMap.set(item.accountId, {
            code: item.code,
            remainingSeconds: item.remainingSeconds,
          });
        });
        return newMap;
      });

      setRemainingSeconds(prev => {
        const newMap = new Map(prev);
        results.forEach((item) => {
          newMap.set(item.accountId, item.remainingSeconds);
        });
        return newMap;
      });
    } catch (error) {
      console.error('Failed to fetch TOTP codes:', error);
    }
  }, []);

  // Global timer - ticks every second
  useEffect(() => {
    if (accountIds.length === 0) return;

    intervalRef.current = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const newMap = new Map(prev);
        const idsToRefresh: number[] = [];

        // Decrement all timers and collect expired ones
        for (const [id, seconds] of newMap) {
          if (seconds <= 1) {
            idsToRefresh.push(id);
            // Reset to 30 temporarily, will be updated by API response
            newMap.set(id, 30);
          } else {
            newMap.set(id, seconds - 1);
          }
        }

        // Fetch new codes for expired accounts
        if (idsToRefresh.length > 0) {
          fetchCodes(idsToRefresh);
        }

        return newMap;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [accountIds, fetchCodes]);

  // Get code for a specific account
  const getCode = useCallback((accountId: number): TOTPCode | undefined => {
    return codes.get(accountId);
  }, [codes]);

  // Get remaining seconds for a specific account
  const getRemainingSeconds = useCallback((accountId: number): number => {
    return remainingSeconds.get(accountId) ?? 30;
  }, [remainingSeconds]);

  return {
    getCode,
    getRemainingSeconds,
  };
}
