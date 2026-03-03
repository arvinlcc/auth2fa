import React, { useState, useEffect } from 'react';
import { X, Upload, Check, Trash2, AlertTriangle } from 'lucide-react';
import { AccountApi, ParsedAccountData } from '../lib/api';
import { logger } from '../lib/logger';

interface BulkImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportItem {
  id: string;
  namespace: string;
  accountName: string;
  secretKey: string;
  algorithm?: string;
  digits?: number;
  period?: number;
  isDuplicate: boolean;
  originalIndex?: number;
}

export const BulkImportDialog: React.FC<BulkImportDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [inputText, setInputText] = useState('');
  const [parsedItems, setParsedItems] = useState<ImportItem[]>([]);
  const [existingAccounts, setExistingAccounts] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'review' | 'success'>('input');
  const [actualImportedCount, setActualImportedCount] = useState(0);

  // Load existing accounts when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadExistingAccounts();
    }
  }, [isOpen]);

  const loadExistingAccounts = async () => {
    try {
      logger.debug('Loading existing accounts for duplicate detection');
      const accounts = await AccountApi.getList();
      const accountKeys = new Set(
        accounts.map(acc => `${acc.namespace}:${acc.accountName}`.toLowerCase())
      );
      setExistingAccounts(accountKeys);
      logger.debug('Loaded existing accounts', { count: accounts.length });
    } catch (error) {
      logger.error('Failed to load existing accounts', { error });
    }
  };

  // Parse input text and detect duplicates
  const parseInput = (text: string): ImportItem[] => {
    const items: ImportItem[] = [];
    const seenInInput = new Set<string>();

    for (let i = 0; i < text.length; i++) {
      text.charCodeAt(i);
    }

    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Parse as otpauth URL or Base32 secret
      const parsed = parseLine(trimmed);
      if (parsed) {
        const key = `${parsed.namespace}:${parsed.accountName}`.toLowerCase();
        const isDuplicateInInput = seenInInput.has(key);
        const isDuplicateInDb = existingAccounts.has(key);

        seenInInput.add(key);

        items.push({
          id: `import-${index}`,
          namespace: parsed.namespace,
          accountName: parsed.accountName,
          secretKey: parsed.secretKey,
          algorithm: parsed.algorithm,
          digits: parsed.digits,
          period: parsed.period,
          isDuplicate: isDuplicateInInput || isDuplicateInDb,
          originalIndex: index,
        });
      }
    });

    return items;
  };

  const parseLine = (line: string): ParsedAccountData | null => {
    // Try parsing as otpauth URL
    if (line.startsWith('otpauth://totp/')) {
      try {
        const url = new URL(line);
        const label = url.pathname.slice(1); // Remove leading /
        const params = new URLSearchParams(url.search);

        const secret = params.get('secret')?.toUpperCase();
        if (!secret) return null;

        // Parse label as "Issuer:Account" or just "Account"
        let namespace = 'DEFAULT';
        let accountName = label;

        const colonIndex = label.indexOf(':');
        if (colonIndex > 0) {
          namespace = label.slice(0, colonIndex);
          accountName = label.slice(colonIndex + 1);
        }

        // Use issuer from query if available
        const issuer = params.get('issuer');
        if (issuer) {
          namespace = issuer;
        }

        return {
          namespace,
          accountName,
          secretKey: secret,
          algorithm: params.get('algorithm') || undefined,
          digits: params.get('digits') ? parseInt(params.get('digits')!) : undefined,
          period: params.get('period') ? parseInt(params.get('period')!) : undefined,
        };
      } catch {
        return null;
      }
    }

    // Try parsing as Base32 secret (uppercase, alphanumeric, padding)
    if (line.length >= 16 && /^[A-Z2-7]+=*$/.test(line)) {
      return {
        namespace: 'DEFAULT',
        accountName: `Account ${line.slice(0, 8)}`,
        secretKey: line,
      };
    }

    return null;
  };

  const handleParseFromInput = () => {
    setError(null);
    const items = parseInput(inputText);

    if (items.length === 0) {
      setError('无法识别任何有效的 2FA 数据。支持格式：\n• otpauth://totp/...\n• Base32 密钥');
      return;
    }

    setParsedItems(items);
    setStep('review');
  };

  const handleImport = async () => {
    setError(null);
    setIsImporting(true);

    try {
      // Filter out duplicates
      const itemsToImport = parsedItems.filter(item => !item.isDuplicate);

      logger.info('Starting bulk import', {
        totalItems: parsedItems.length,
        newItems: itemsToImport.length,
        duplicateItems: parsedItems.length - itemsToImport.length
      });

      if (itemsToImport.length === 0) {
        setError('没有可导入的账户（全部为重复）');
        setIsImporting(false);
        return;
      }

      // Pre-validation: check for empty required fields
      for (const item of itemsToImport) {
        if (!item.namespace.trim()) {
          setError('有账户的命名空间为空，请检查后再导入');
          setIsImporting(false);
          return;
        }
        if (!item.accountName.trim()) {
          setError(`账户 ${item.namespace || '(未命名)'} 的账号名为空，请检查后再导入`);
          setIsImporting(false);
          return;
        }
        if (!item.secretKey.trim()) {
          setError(`账户 ${item.namespace}:${item.accountName} 的密钥为空，请检查后再导入`);
          setIsImporting(false);
          return;
        }
        // Check Base32 format
        const secretKey = item.secretKey.trim().toUpperCase();
        if (!/^[A-Z2-7=]+$/.test(secretKey)) {
          setError(`账户 ${item.namespace}:${item.accountName} 的密钥格式无效，只能包含 A-Z、2-7 和等号`);
          setIsImporting(false);
          return;
        }
        if (secretKey.length < 8) {
          setError(`账户 ${item.namespace}:${item.accountName} 的密钥长度不能少于8位`);
          setIsImporting(false);
          return;
        }
      }

      // Import items one by one to handle duplicates gracefully
      let successCount = 0;
      let failedItems: string[] = [];

      for (const item of itemsToImport) {
        try {
          await AccountApi.bulkImport({
            accounts: [{
              namespace: item.namespace,
              accountName: item.accountName,
              secretKey: item.secretKey,
              algorithm: item.algorithm,
              digits: item.digits,
              period: item.period,
            }]
          });
          successCount++;
        } catch (err: any) {
          // Extract error message
          let errorMsg = '';
          if (err?.message) {
            errorMsg = err.message;
          } else if (typeof err === 'string') {
            errorMsg = err;
          }

          // Check if it's a duplicate error
          if (errorMsg.includes('CONSTRAINT') || errorMsg.includes('UNIQUE') || errorMsg.includes('already exists')) {
            failedItems.push(`${item.namespace}:${item.accountName} (已存在)`);
          } else {
            failedItems.push(`${item.namespace}:${item.accountName} (${errorMsg || '未知错误'})`);
          }
        }
      }

      // Store actual imported count
      setActualImportedCount(successCount);
      setStep('success');

      logger.info('Bulk import completed', {
        total: itemsToImport.length,
        success: successCount,
        failed: failedItems.length
      });

      // Show warning if some items failed
      if (failedItems.length > 0) {
        logger.warn('Some items failed to import', { failedItems });
        console.warn('Failed to import some items:', failedItems);
      }

      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err: any) {
      logger.error('Bulk import failed', { error: err });
      let errorMsg = '导入失败';
      if (err?.message) {
        errorMsg = err.message;
      } else if (typeof err === 'string') {
        errorMsg = err;
      }
      setError(errorMsg);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setStep('input');
    setInputText('');
    setParsedItems([]);
    setError(null);
    setActualImportedCount(0);
    onClose();
  };

  const removeItem = (id: string) => {
    setParsedItems(prev => prev.filter(item => item.id !== id));
  };

  const editItem = (id: string, field: keyof ImportItem, value: string) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id === id) {
        let updated = { ...item, [field]: value };

        // Auto-uppercase secret key
        if (field === 'secretKey') {
          updated = { ...updated, secretKey: value.toUpperCase() };
        }

        // Re-check duplicate
        const key = `${updated.namespace}:${updated.accountName}`.toLowerCase();
        const isDuplicate = existingAccounts.has(key);
        return { ...updated, isDuplicate };
      }
      return item;
    }));
  };

  // Calculate statistics
  const duplicateCount = parsedItems.filter(item => item.isDuplicate).length;
  const newCount = parsedItems.length - duplicateCount;
  const totalCount = parsedItems.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">批量导入账户</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isImporting}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
              {error}
            </div>
          )}

          {/* Step 1: Input */}
          {step === 'input' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">批量导入说明</h3>
                <p className="text-blue-800 mb-3 text-sm">
                  每行一个账户，支持以下格式：
                </p>
                <div className="bg-blue-100 rounded-lg p-3 font-mono text-xs space-y-1 text-blue-900">
                  <p>otpauth://totp/Google:test@gmail.com?secret=XXX&issuer=Google</p>
                  <p>otpauth://totp/GitHub:user@github.com?secret=YYY&issuer=GitHub</p>
                  <p>JBSWY3DPEHPK3PXP (Base32 密钥)</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  粘贴或输入数据（每行一个）
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="otpauth://totp/Service:account@example.com?secret=..."
                  className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                onClick={handleParseFromInput}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                <Upload className="w-5 h-5" />
                解析数据
              </button>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  解析结果
                </h3>
                <button
                  onClick={() => setStep('input')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  返回编辑
                </button>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalCount}</p>
                  <p className="text-xs text-blue-700">总条数</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{newCount}</p>
                  <p className="text-xs text-green-700">新增</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{duplicateCount}</p>
                  <p className="text-xs text-yellow-700">重复</p>
                </div>
              </div>

              {/* Items List */}
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-80 overflow-y-auto">
                {parsedItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "p-3 space-y-2",
                      item.isDuplicate && "bg-yellow-50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        {item.isDuplicate && (
                          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 grid grid-cols-4 gap-2 text-sm">
                          <input
                            type="text"
                            value={item.namespace}
                            onChange={(e) => editItem(item.id, 'namespace', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            placeholder="命名空间"
                          />
                          <input
                            type="text"
                            value={item.accountName}
                            onChange={(e) => editItem(item.id, 'accountName', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            placeholder="账号名"
                          />
                          <input
                            type="text"
                            value={item.secretKey}
                            onChange={(e) => editItem(item.id, 'secretKey', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded font-mono text-xs focus:ring-1 focus:ring-blue-500"
                            placeholder="密钥"
                          />
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-600"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {item.isDuplicate && (
                              <span className="text-xs text-yellow-600">重复</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {parsedItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    没有可导入的账户
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleImport}
                  disabled={isImporting || newCount === 0}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      导入中...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      导入 {newCount} 个账户
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">导入成功！</h3>
              <p className="text-gray-600">已成功导入 {actualImportedCount} 个账户</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function for className
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
