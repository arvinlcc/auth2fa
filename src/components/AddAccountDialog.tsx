import React, { useState, useEffect } from 'react';
import { X, Plus, Clipboard } from 'lucide-react';
import { AccountApi, NamespaceApi, ClipboardApi } from '../lib/api';
import { logger } from '../lib/logger';

interface AddAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const COMMON_NAMESPACES = ['Google', 'GitHub', 'AWS', 'Microsoft', 'Facebook', 'Twitter', 'Apple'];

export const AddAccountDialog: React.FC<AddAccountDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    namespace: '',
    accountName: '',
    secretKey: '',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset form when opening
      setError(null);
      setSuccessMsg(null);
      loadNamespaces();

      // Check for pre-filled clipboard data from quick import
      const clipboardData = (window as any).__clipboardData;
      if (clipboardData) {
        setFormData({
          namespace: clipboardData.namespace || '',
          accountName: clipboardData.accountName || '',
          secretKey: clipboardData.secretKey || '',
          algorithm: clipboardData.algorithm || 'SHA1',
          digits: clipboardData.digits || 6,
          period: clipboardData.period || 30,
        });
        setSuccessMsg(`已从剪贴板导入: ${clipboardData.namespace} - ${clipboardData.accountName}`);
      } else {
        // Reset to default values when opening without clipboard data
        setFormData({
          namespace: '',
          accountName: '',
          secretKey: '',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
        });
      }
    }
  }, [isOpen]);

  const loadNamespaces = async () => {
    try {
      logger.debug('Loading namespaces for dialog');
      const nsList = await NamespaceApi.getAll();
      const nsNames = nsList.map((ns) => ns.namespace);
      setNamespaces(nsNames);

      // Pre-fill first namespace if available
      if (nsNames.length > 0 && !formData.namespace) {
        setFormData((prev) => ({ ...prev, namespace: nsNames[0] }));
      }

      logger.debug('Namespaces loaded for dialog', { count: nsNames.length });
    } catch (error) {
      logger.error('Failed to load namespaces for dialog', { error });
    }
  };

  const handleImportFromClipboard = async () => {
    setError(null);
    setSuccessMsg(null);
    setIsImporting(true);

    try {
      logger.debug('Importing from clipboard in dialog');
      const parsed = await ClipboardApi.parseOne();

      logger.info('Clipboard import successful', {
        namespace: parsed.namespace,
        accountName: parsed.accountName
      });

      // Update form with parsed data
      setFormData((prev) => ({
        ...prev,
        namespace: parsed.namespace || prev.namespace,
        accountName: parsed.accountName || prev.accountName,
        secretKey: parsed.secretKey || prev.secretKey,
        algorithm: parsed.algorithm || prev.algorithm,
        digits: parsed.digits || prev.digits,
        period: parsed.period || prev.period,
      }));

      setSuccessMsg(`已从剪贴板导入: ${parsed.namespace} - ${parsed.accountName}`);
    } catch (err: any) {
      logger.warn('Failed to import from clipboard in dialog', { error: err });
      // Extract clean error message
      let errorMsg = '无法识别剪贴板内容';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Frontend validation (quick checks before API call)
    if (!formData.namespace.trim()) {
      setError('命名空间不能为空');
      return;
    }
    if (!formData.accountName.trim()) {
      setError('账号名不能为空');
      return;
    }
    const secretKey = formData.secretKey.trim().toUpperCase();
    if (!secretKey) {
      setError('密钥不能为空');
      return;
    }
    if (secretKey.length < 8) {
      setError('密钥长度不能少于8位');
      return;
    }
    // Check for valid Base32 characters
    if (!/^[A-Z2-7=]+$/.test(secretKey)) {
      setError('密钥格式无效：只能包含 A-Z、2-7 和等号');
      return;
    }

    try {
      logger.info('Adding account', {
        namespace: formData.namespace,
        accountName: formData.accountName
      });

      setIsLoading(true);
      await AccountApi.add({
        namespace: formData.namespace,
        accountName: formData.accountName,
        secretKey: formData.secretKey,
        algorithm: formData.algorithm,
        digits: formData.digits,
        period: formData.period,
      });

      logger.info('Account added successfully', {
        namespace: formData.namespace,
        accountName: formData.accountName
      });

      // Reset form
      setFormData({
        namespace: namespaces[0] || '',
        accountName: '',
        secretKey: '',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      logger.error('Failed to add account', {
        namespace: formData.namespace,
        accountName: formData.accountName,
        error: err
      });
      // Extract clean error message
      let errorMsg = '添加账户失败';
      if (err?.message) {
        errorMsg = err.message;
      } else if (typeof err === 'string') {
        errorMsg = err;
      }
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">添加账户</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Success message */}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">
              {successMsg}
            </div>
          )}

          {/* Quick Import - Compact */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clipboard className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">快捷导入</span>
            </div>
            <p className="text-xs text-blue-700 mb-2">
              复制 otpauth:// 链接后点击导入
            </p>
            <button
              type="button"
              onClick={handleImportFromClipboard}
              disabled={isImporting}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-wait text-sm"
            >
              {isImporting ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  导入中...
                </>
              ) : (
                '从剪贴板导入'
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 bg-white text-xs text-gray-500">或手动输入</span>
            </div>
          </div>

          {/* Namespace */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              分类 / 命名空间
            </label>
            <div className="flex gap-2">
              <select
                value={formData.namespace}
                onChange={(e) =>
                  setFormData({ ...formData, namespace: e.target.value })
                }
                className="flex-1 px-2.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">选择...</option>
                {namespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
                {COMMON_NAMESPACES.filter((ns) => !namespaces.includes(ns)).map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="或输入新的"
                value={formData.namespace}
                onChange={(e) =>
                  setFormData({ ...formData, namespace: e.target.value })
                }
                className="flex-1 px-2.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Account Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              账号名
            </label>
            <input
              type="text"
              placeholder="例如: example@gmail.com"
              value={formData.accountName}
              onChange={(e) =>
                setFormData({ ...formData, accountName: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              required
            />
          </div>

          {/* Secret Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密钥 (Secret Key)
            </label>
            <input
              type="text"
              placeholder="Base32 格式的密钥"
              value={formData.secretKey}
              onChange={(e) =>
                setFormData({ ...formData, secretKey: e.target.value.toUpperCase() })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              required
            />
          </div>

          {/* Advanced Options - Collapsible style */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">高级选项</p>
            <div className="grid grid-cols-3 gap-2">
              {/* Algorithm */}
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">算法</label>
                <select
                  value={formData.algorithm}
                  onChange={(e) =>
                    setFormData({ ...formData, algorithm: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                >
                  <option value="SHA1">SHA1</option>
                  <option value="SHA256">SHA256</option>
                  <option value="SHA512">SHA512</option>
                </select>
              </div>

              {/* Digits */}
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">位数</label>
                <select
                  value={formData.digits}
                  onChange={(e) =>
                    setFormData({ ...formData, digits: parseInt(e.target.value) })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                >
                  <option value="6">6 位</option>
                  <option value="8">8 位</option>
                </select>
              </div>

              {/* Period */}
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">周期</label>
                <select
                  value={formData.period}
                  onChange={(e) =>
                    setFormData({ ...formData, period: parseInt(e.target.value) })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                >
                  <option value="30">30 秒</option>
                  <option value="60">60 秒</option>
                </select>
              </div>
            </div>
          </div>
        </form>

        {/* Footer - Fixed with Actions */}
        <div className="flex gap-2 p-4 border-t border-gray-200 shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2 text-sm"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                添加中...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                添加账户
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
