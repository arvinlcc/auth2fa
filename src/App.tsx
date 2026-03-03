import { useState, useEffect, useMemo } from 'react';
import { Shield, Plus, Trash2, Upload, Clipboard } from 'lucide-react';
import { NamespaceList } from './components/NamespaceList';
import { OTPDisplay } from './components/OTPDisplay';
import { AddAccountDialog } from './components/AddAccountDialog';
import { BulkImportDialog } from './components/BulkImportDialog';
import { SearchBar } from './components/SearchBar';
import {
  NamespaceApi,
  AccountApi,
  ClipboardApi,
  AccountDisplay,
} from './lib/api';
import { useBatchedTOTP } from './hooks/useBatchedTOTP';
import { useToast } from './hooks/useToast';
import { logger } from './lib/logger';
import './index.css';

function App() {
  const toast = useToast();
  const [namespaces, setNamespaces] = useState<Array<{ namespace: string; count: number }>>([]);
  const [accounts, setAccounts] = useState<AccountDisplay[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; accountName: string } | null>(null);

  // Extract account IDs for the centralized TOTP timer
  const accountIds = useMemo(() => accounts.map(a => a.id), [accounts]);

  // Use centralized TOTP timer system
  const { getCode, getRemainingSeconds } = useBatchedTOTP(accountIds);

  // Debounced search (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load namespaces
  const loadNamespaces = async () => {
    try {
      logger.debug('Loading namespaces');
      const ns = await NamespaceApi.getAll();
      setNamespaces(ns);
      logger.info('Namespaces loaded', { count: ns.length });
    } catch (error) {
      logger.error('Failed to load namespaces', { error });
    }
  };

  // Load accounts
  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      if (debouncedSearchQuery.trim()) {
        const results = await AccountApi.search({ query: debouncedSearchQuery });
        setAccounts(results);
      } else {
        const acc = await AccountApi.getList(selectedNamespace ? { namespace: selectedNamespace } : undefined);
        setAccounts(acc);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      await loadNamespaces();
      await loadAccounts();
    };
    init();
  }, []);

  // Expose toast functions for testing in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).testToast = {
        success: (msg: string) => toast.success(msg),
        error: (msg: string) => toast.error(msg),
        warning: (msg: string) => toast.warning(msg),
        info: (msg: string) => toast.info(msg),
        showAll: () => {
          toast.success('成功消息 - 操作完成');
          toast.error('错误消息 - 操作失败');
          toast.warning('警告消息 - 请注意');
          toast.info('提示消息 - 仅供参考');
        },
      };
      console.log('Toast testing functions available: testToast.success(), testToast.error(), testToast.warning(), testToast.info(), testToast.showAll()');
    }
    return () => {
      if (import.meta.env.DEV) {
        delete (window as any).testToast;
      }
    };
  }, [toast]);

  // Reload when namespace selection changes or search query changes
  useEffect(() => {
    loadAccounts();
  }, [selectedNamespace, debouncedSearchQuery]);

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Handle delete account
  const handleDeleteAccount = async (id: number, accountName: string) => {
    logger.info('Delete account requested', { accountId: id, accountName });
    setDeleteConfirm({ id, accountName });
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await AccountApi.delete({ id: deleteConfirm.id });
      logger.info('Account deleted successfully', { accountId: deleteConfirm.id });
      await loadAccounts();
      await loadNamespaces();
    } catch (err) {
      logger.error('Failed to delete account', { accountId: deleteConfirm.id, error: err });
      toast.error('删除账户失败');
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Handle quick import from clipboard (single account)
  const handleQuickImport = async () => {
    try {
      logger.debug('Quick import from clipboard requested');
      const parsed = await ClipboardApi.parseOne();
      logger.info('Clipboard parsed successfully', {
        namespace: parsed.namespace,
        accountName: parsed.accountName
      });
      // Open add dialog with pre-filled data
      setIsAddDialogOpen(true);
      // Store parsed data for the dialog to use
      (window as any).__clipboardData = parsed;
    } catch (err) {
      logger.warn('Quick import failed - no valid data in clipboard', { error: err });
      toast.error('剪贴板中没有有效的 2FA 数据。请复制 otpauth:// URL 或 Base32 密钥。');
    }
  };

  // Handle add account success
  const handleAddSuccess = async () => {
    delete (window as any).__clipboardData;
    await loadNamespaces();
    await loadAccounts();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">2FA Authenticator</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleQuickImport}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
            title="从剪贴板快速导入单个账户"
          >
            <Clipboard className="w-4 h-4" />
            <span className="hidden sm:inline">快速导入</span>
          </button>
          <button
            onClick={() => setIsBulkDialogOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
            title="批量导入多个账户"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">批量导入</span>
          </button>
          <button
            onClick={() => setIsAddDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <NamespaceList
            namespaces={namespaces}
            selectedNamespace={selectedNamespace}
            onSelectNamespace={setSelectedNamespace}
            onAddNamespace={() => setIsAddDialogOpen(true)}
          />
        </div>

        {/* Account List */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 bg-white border-b border-gray-200">
            <SearchBar
              onSearch={handleSearch}
              placeholder={searchQuery ? `搜索: "${searchQuery}"` : '搜索账号...'}
              searching={isLoading && searchQuery.trim() !== ''}
              resultCount={searchQuery && !isLoading ? accounts.length : undefined}
            />
          </div>

          {/* Accounts Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Shield className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-700 mb-2">No accounts found</h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery
                    ? `No accounts match "${searchQuery}"`
                    : 'Add your first 2FA account to get started'}
                </p>
                {!searchQuery && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleQuickImport}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                    >
                      <Clipboard className="w-4 h-4" />
                      快速导入
                    </button>
                    <button
                      onClick={() => setIsBulkDialogOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      批量导入
                    </button>
                    <button
                      onClick={() => setIsAddDialogOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      手动添加
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {accounts.map((account) => (
                  <OTPDisplay
                    key={account.id}
                    accountId={account.id}
                    accountName={account.accountName}
                    namespace={account.namespace}
                    createdAt={account.createdAt}
                    getCode={getCode}
                    getRemainingSeconds={getRemainingSeconds}
                    onDelete={() => {
                      handleDeleteAccount(account.id, account.accountName);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Account Dialog */}
      <AddAccountDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={handleAddSuccess}
      />

      {/* Bulk Import Dialog */}
      <BulkImportDialog
        isOpen={isBulkDialogOpen}
        onClose={() => setIsBulkDialogOpen(false)}
        onSuccess={handleAddSuccess}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">确认删除</h2>
            </div>
            <p className="text-gray-600 mb-6">
              确定要删除账户 <strong>"{deleteConfirm.accountName}"</strong> 吗？
              <br />
              <span className="text-red-500 text-sm">此操作不可恢复！</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
