import React, { useState, useMemo, useCallback } from 'react';
import { Copy, Check, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface TOTPCode {
  code: string;
  remainingSeconds: number;
}

interface OTPDisplayProps {
  accountId: number;
  accountName: string;
  namespace: string;
  createdAt: string;
  getCode?: (accountId: number) => TOTPCode | undefined;
  getRemainingSeconds?: (accountId: number) => number;
  onDelete?: () => void;
}

export const OTPDisplay = React.memo<OTPDisplayProps>(({
  accountId,
  accountName,
  namespace,
  createdAt,
  getCode,
  getRemainingSeconds,
  onDelete,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Get code and remaining time from centralized store
  const totpData = useMemo(() => {
    if (getCode && getRemainingSeconds) {
      const code = getCode(accountId);
      const remainingSeconds = getRemainingSeconds(accountId);
      if (code) {
        return { code: code.code, remainingSeconds };
      }
    }
    // Fallback for backward compatibility
    return { code: '------', remainingSeconds: 30 };
  }, [accountId, getCode, getRemainingSeconds]);

  const formatCode = useCallback((code: string): string => {
    // Format as XXX XXX for better readability
    if (code.length === 6) {
      return `${code.slice(0, 3)} ${code.slice(3)}`;
    }
    return code;
  }, []);

  const formattedCode = useMemo(() => formatCode(totpData.code), [totpData.code, formatCode]);
  const isExpiringSoon = totpData.remainingSeconds < 10;

  const copyCode = useCallback(async () => {
    const plainCode = formattedCode.replace(/\s/g, '');
    try {
      await navigator.clipboard.writeText(plainCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }, [formattedCode]);

  const copyAccount = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accountName);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    } catch (error) {
      console.error('Failed to copy account:', error);
    }
  }, [accountName]);

  // Format created date: yyyy-MM-dd hh:mm
  const formattedDate = useMemo(() => {
    try {
      if (!createdAt || createdAt === '') return '';

      // Handle SQLite format: YYYY-MM-DD HH:MM:SS
      // SQLite CURRENT_TIMESTAMP returns UTC time
      let date: Date;

      // Check if it's SQLite format (has space between date and time)
      if (createdAt.includes(' ') && createdAt.includes(':')) {
        // Parse SQLite format manually to handle timezone
        const [datePart, timePart] = createdAt.split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes, seconds] = timePart.split(':').map(Number);
        date = new Date(year, month - 1, day, hours, minutes, seconds || 0);
      } else if (createdAt.includes('T')) {
        // ISO format
        date = new Date(createdAt);
      } else {
        // Try parsing as is
        date = new Date(createdAt);
      }

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return createdAt;
      }

      const formattedYear = date.getFullYear();
      const formattedMonth = String(date.getMonth() + 1).padStart(2, '0');
      const formattedDay = String(date.getDate()).padStart(2, '0');
      const formattedHours = String(date.getHours()).padStart(2, '0');
      const formattedMinutes = String(date.getMinutes()).padStart(2, '0');

      return `${formattedYear}-${formattedMonth}-${formattedDay} ${formattedHours}:${formattedMinutes}`;
    } catch {
      return createdAt || '';
    }
  }, [createdAt]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow relative pointer-events-auto">
      {/* Header: Namespace and Created Date */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">{namespace}</span>
        <div className="flex items-center gap-2">
          {formattedDate && (
            <span className="text-xs text-gray-400" title="添加时间">
              {formattedDate}
            </span>
          )}
          {/* Delete button */}
          {onDelete && (
            <div
              onClick={onDelete}
              className="p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="删除账户（不可恢复）"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>

      {/* Account Name - separate row */}
      <div
        onClick={copyAccount}
        className="w-full flex items-center justify-between gap-2 mb-3 text-left group cursor-pointer"
        title="点击复制账号名"
      >
        <span className="text-base font-semibold text-gray-900 truncate flex-1">
          {accountName || '未命名账户'}
        </span>
        {copiedAccount ? (
          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
        ) : (
          <Copy className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
        )}
      </div>

      {/* OTP Code with Copy Button and Timer in one row */}
      <div className="flex items-center gap-3">
        {/* Code Display */}
        <span
          className={cn(
            "text-2xl font-mono font-bold tracking-wider flex-1",
            isExpiringSoon ? "text-red-500" : "text-gray-900"
          )}
        >
          {formattedCode}
        </span>

        {/* Copy Button */}
        <div
          onClick={copyCode}
          className={cn(
            "p-2 rounded-lg transition-all flex-shrink-0 cursor-pointer",
            copiedCode
              ? "bg-green-100 text-green-600"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
          title="复制验证码"
        >
          {copiedCode ? (
            <Check className="w-5 h-5" />
          ) : (
            <Copy className="w-5 h-5" />
          )}
        </div>

        {/* Timer */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 flex-shrink-0">
          <div
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              isExpiringSoon ? "bg-red-500 animate-pulse" : "bg-blue-500"
            )}
          />
          <span
            className={cn(
              "text-sm font-semibold min-w-[2rem]",
              isExpiringSoon ? "text-red-500" : "text-gray-600"
            )}
          >
            {totpData.remainingSeconds}s
          </span>
        </div>
      </div>
    </div>
  );
});
