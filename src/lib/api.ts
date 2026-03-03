import { invoke } from '@tauri-apps/api/core';
import { logger } from './logger';

// ============== Type Definitions ==============

export interface NamespaceInfo {
  namespace: string;
  count: number;
}

export interface AccountDisplay {
  id: number;
  namespace: string;
  accountName: string;
  algorithm: string;
  digits: number;
  period: number;
  createdAt: string;
}

export interface TotpResponse {
  code: string;
  remainingSeconds: number;
}

export interface BulkTotpItem {
  accountId: number;
  code: string;
  remainingSeconds: number;
}

export interface AddAccountParams {
  namespace: string;
  accountName: string;
  secretKey: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

export interface AddAccountResponse {
  id: number;
}

export interface ParsedAccountData {
  namespace: string;
  accountName: string;
  secretKey: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

export interface BulkImportResponse {
  ids: number[];
}

// ============== API Client Wrapper ==============

/**
 * Unified API client wrapper with error handling and logging
 */
async function invokeApi<T>(
  command: string,
  payload?: object
): Promise<T> {
  const startTime = Date.now();

  logger.debug('API call started', { command });

  try {
    const result = await invoke<T>(command, payload as any);

    const duration = Date.now() - startTime;
    logger.info('API call succeeded', {
      command,
      duration: `${duration}ms`
    });

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;

    logger.error('API call failed', {
      command,
      duration: `${duration}ms`,
      error: err?.message || err
    });

    // Unified error handling
    console.error(`[API ERROR] ${command}`, err);

    // Future: can extend to errorCode parsing
    throw new Error(err?.message ?? 'Unknown error');
  }
}

// ============== Domain API Groups ==============

/**
 * Namespace API
 */
export const NamespaceApi = {
  /**
   * Get all namespaces with account counts
   */
  getAll(): Promise<NamespaceInfo[]> {
    return invokeApi('get_namespaces');
  },
};

/**
 * Account API
 */
export const AccountApi = {
  /**
   * Get accounts, optionally filtered by namespace
   */
  getList(req?: { namespace?: string }): Promise<AccountDisplay[]> {
    return invokeApi('get_accounts', req);
  },

  /**
   * Add a new account
   */
  add(req: AddAccountParams): Promise<AddAccountResponse> {
    return invokeApi('add_account', { req });
  },

  /**
   * Delete an account
   */
  delete(req: { id: number }): Promise<void> {
    return invokeApi('delete_account', req);
  },

  /**
   * Search accounts by namespace or account name
   */
  search(req: { query: string }): Promise<AccountDisplay[]> {
    return invokeApi('search_accounts', req);
  },

  /**
   * Bulk import accounts
   */
  bulkImport(req: { accounts: ParsedAccountData[] }): Promise<BulkImportResponse> {
    return invokeApi('bulk_import_accounts', req);
  },
};

/**
 * TOTP API
 */
export const TotpApi = {
  /**
   * Get TOTP code for a specific account
   */
  getOne(req: { accountId: number }): Promise<TotpResponse> {
    return invokeApi('get_totp_code', req);
  },

  /**
   * Get TOTP codes for multiple accounts at once
   */
  getBulk(req: { accountIds: number[] }): Promise<BulkTotpItem[]> {
    return invokeApi('get_bulk_totp_codes', { req });
  },
};

/**
 * Clipboard API
 */
export const ClipboardApi = {
  /**
   * Parse clipboard content (single entry)
   */
  parseOne(): Promise<ParsedAccountData> {
    return invokeApi('parse_clipboard');
  },

  /**
   * Parse multiple accounts from clipboard (bulk import)
   */
  parseBulk(): Promise<ParsedAccountData[]> {
    return invokeApi('parse_bulk_clipboard');
  },
};

