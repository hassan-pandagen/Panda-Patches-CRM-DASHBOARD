import React, { useState, useRef, useEffect } from 'react';
import { Bookmark, ChevronDown, X, Plus } from 'lucide-react';
import { useSearchParams, useLocation } from 'react-router-dom';

interface SavedView {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

const STORAGE_KEY = 'crm_saved_filters';

function loadViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveViews(views: SavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

const SavedFilters: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [showNameInput, setShowNameInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowNameInput(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showNameInput && inputRef.current) inputRef.current.focus();
  }, [showNameInput]);

  const currentUrl = `${location.pathname}${location.search}`;
  const hasFilters = searchParams.toString().length > 0;

  const handleSave = () => {
    if (!newName.trim()) return;
    const newView: SavedView = {
      id: Date.now().toString(36),
      name: newName.trim(),
      url: currentUrl,
      createdAt: new Date().toISOString(),
    };
    const updated = [...views, newView];
    setViews(updated);
    saveViews(updated);
    setNewName('');
    setShowNameInput(false);
  };

  const handleDelete = (id: string) => {
    const updated = views.filter(v => v.id !== id);
    setViews(updated);
    saveViews(updated);
  };

  const handleLoad = (view: SavedView) => {
    const url = new URL(view.url, window.location.origin);
    setSearchParams(url.searchParams, { replace: true });
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
          views.length > 0
            ? 'bg-slate-800 border border-slate-600 text-white hover:bg-slate-700'
            : 'bg-slate-900/40 border border-white/10 text-slate-400 hover:text-white hover:border-white/20'
        }`}
      >
        <Bookmark className="w-4 h-4" />
        <span className="hidden sm:inline">Saved Views</span>
        {views.length > 0 && (
          <span className="bg-brand-orange/20 text-brand-orange px-1.5 py-0.5 rounded text-[10px] font-bold">{views.length}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Save current view */}
          {hasFilters && (
            <div className="p-3 border-b border-white/5">
              {showNameInput ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder="View name..."
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-brand-orange focus:border-brand-orange"
                  />
                  <button onClick={handleSave} className="p-2 bg-brand-orange hover:bg-orange-600 rounded-lg text-white transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNameInput(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-orange hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Save current filter
                </button>
              )}
            </div>
          )}

          {/* Saved views list */}
          <div className="max-h-[300px] overflow-y-auto">
            {views.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>No saved views yet</p>
                <p className="text-xs mt-1">Apply filters, then save the view</p>
              </div>
            ) : (
              views.map((view) => (
                <div key={view.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 group">
                  <button
                    onClick={() => handleLoad(view)}
                    className="flex-1 text-left text-sm text-slate-200 hover:text-white transition-colors truncate"
                  >
                    {view.name}
                  </button>
                  <button
                    onClick={() => handleDelete(view.id)}
                    className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SavedFilters;
