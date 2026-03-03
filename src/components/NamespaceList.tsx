import React from 'react';
import { Folder, FolderOpen, Plus } from 'lucide-react';
import { NamespaceInfo } from '../lib/api';
import { cn } from '../lib/utils';

interface NamespaceListProps {
  namespaces: NamespaceInfo[];
  selectedNamespace: string | null;
  onSelectNamespace: (namespace: string | null) => void;
  onAddNamespace: () => void;
}

const NAMESPACE_COLORS: Record<string, string> = {
  'Google': 'bg-blue-500',
  'GitHub': 'bg-purple-500',
  'AWS': 'bg-orange-500',
  'Microsoft': 'bg-sky-500',
  'Facebook': 'bg-indigo-500',
  'Twitter': 'bg-sky-400',
  'Apple': 'bg-gray-700',
  'Work': 'bg-slate-500',
  'Personal': 'bg-green-500',
  'Game': 'bg-red-500',
  'Other': 'bg-gray-400',
};

const getNamespaceColor = (namespace: string): string => {
  return NAMESPACE_COLORS[namespace] || 'bg-emerald-500';
};

export const NamespaceList: React.FC<NamespaceListProps> = ({
  namespaces,
  selectedNamespace,
  onSelectNamespace,
  onAddNamespace,
}) => {
  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Categories</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* All Accounts */}
        <button
          onClick={() => onSelectNamespace(null)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors",
            selectedNamespace === null
              ? "bg-blue-100 text-blue-700"
              : "hover:bg-gray-100 text-gray-700"
          )}
        >
          {selectedNamespace === null ? (
            <FolderOpen className="w-5 h-5" />
          ) : (
            <Folder className="w-5 h-5" />
          )}
          <span className="flex-1 text-left font-medium">All Accounts</span>
          <span className="text-sm text-gray-500">
            {namespaces.reduce((sum, ns) => sum + ns.count, 0)}
          </span>
        </button>

        {/* Namespaces */}
        {namespaces.map((ns) => (
          <button
            key={ns.namespace}
            onClick={() => onSelectNamespace(ns.namespace)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors",
              selectedNamespace === ns.namespace
                ? "bg-blue-100 text-blue-700"
                : "hover:bg-gray-100 text-gray-700"
            )}
          >
            {selectedNamespace === ns.namespace ? (
              <FolderOpen className="w-5 h-5" />
            ) : (
              <Folder className="w-5 h-5" />
            )}
            <div
              className={cn(
                "w-3 h-3 rounded-full",
                getNamespaceColor(ns.namespace)
              )}
            />
            <span className="flex-1 text-left font-medium">{ns.namespace}</span>
            <span className="text-sm text-gray-500">{ns.count}</span>
          </button>
        ))}

        {/* Add New Namespace */}
        <button
          onClick={onAddNamespace}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg mt-2 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">Add Account...</span>
        </button>
      </div>
    </div>
  );
};
