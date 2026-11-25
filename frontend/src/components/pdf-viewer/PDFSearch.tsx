import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

interface SearchResult {
  pageIndex: number;
  matchIndex: number;
}

interface PDFSearchProps {
  numPages: number;
  onNavigateToPage: (page: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

const PDFSearch = ({ numPages, onNavigateToPage, isOpen, onClose }: PDFSearchProps) => {
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // Clear highlights when search closes or text changes
  const clearHighlights = useCallback(() => {
    document.querySelectorAll('.search-highlight').forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });
  }, []);

  // Highlight text in the text layer
  const highlightMatches = useCallback((text: string) => {
    if (!text.trim()) return;

    const textLayers = document.querySelectorAll('.react-pdf__Page__textContent');
    const newResults: SearchResult[] = [];
    const searchLower = text.toLowerCase();

    textLayers.forEach((layer, pageIndex) => {
      const spans = layer.querySelectorAll('span');
      
      spans.forEach((span) => {
        const content = span.textContent || '';
        const contentLower = content.toLowerCase();
        let lastIndex = 0;
        let matchCount = 0;

        if (contentLower.includes(searchLower)) {
          const fragment = document.createDocumentFragment();
          let currentIndex = 0;

          while ((currentIndex = contentLower.indexOf(searchLower, lastIndex)) !== -1) {
            // Add text before match
            if (currentIndex > lastIndex) {
              fragment.appendChild(
                document.createTextNode(content.slice(lastIndex, currentIndex))
              );
            }

            // Add highlighted match
            const mark = document.createElement('mark');
            mark.className = 'search-highlight bg-yellow-300 text-black rounded px-0.5';
            mark.textContent = content.slice(currentIndex, currentIndex + text.length);
            fragment.appendChild(mark);

            newResults.push({ pageIndex: pageIndex + 1, matchIndex: matchCount });
            matchCount++;
            lastIndex = currentIndex + text.length;
          }

          // Add remaining text
          if (lastIndex < content.length) {
            fragment.appendChild(document.createTextNode(content.slice(lastIndex)));
          }

          span.textContent = '';
          span.appendChild(fragment);
        }
      });
    });

    setResults(newResults);
    setCurrentResultIndex(0);
  }, []);

  const performSearch = useCallback(() => {
    if (!searchText.trim()) {
      clearHighlights();
      setResults([]);
      return;
    }

    setIsSearching(true);
    clearHighlights();

    // Small delay to ensure text layers are rendered
    setTimeout(() => {
      highlightMatches(searchText);
      setIsSearching(false);
    }, 100);
  }, [searchText, clearHighlights, highlightMatches]);

  // Navigate to result
  const navigateToResult = useCallback((index: number) => {
    if (results.length === 0) return;

    const normalizedIndex = ((index % results.length) + results.length) % results.length;
    setCurrentResultIndex(normalizedIndex);

    const result = results[normalizedIndex];
    onNavigateToPage(result.pageIndex);

    // Highlight current result differently
    setTimeout(() => {
      const highlights = document.querySelectorAll('.search-highlight');
      highlights.forEach((el, i) => {
        if (i === normalizedIndex) {
          el.classList.remove('bg-yellow-300');
          el.classList.add('bg-orange-400', 'ring-2', 'ring-orange-600');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          el.classList.remove('bg-orange-400', 'ring-2', 'ring-orange-600');
          el.classList.add('bg-yellow-300');
        }
      });
    }, 150);
  }, [results, onNavigateToPage]);

  const handlePrevious = () => navigateToResult(currentResultIndex - 1);
  const handleNext = () => navigateToResult(currentResultIndex + 1);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        handlePrevious();
      } else if (results.length > 0) {
        handleNext();
      } else {
        performSearch();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Search when text changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText, performSearch]);

  // Clear on close
  useEffect(() => {
    if (!isOpen) {
      clearHighlights();
      setSearchText('');
      setResults([]);
    }
  }, [isOpen, clearHighlights]);

  // Navigate to first result when found
  useEffect(() => {
    if (results.length > 0) {
      navigateToResult(0);
    }
  }, [results.length]); // Only trigger when results length changes

  if (!isOpen) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search in document..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-4"
          autoFocus
        />
      </div>

      {searchText && (
        <span className="text-sm text-muted-foreground min-w-[5rem]">
          {isSearching ? (
            'Searching...'
          ) : results.length > 0 ? (
            `${currentResultIndex + 1} of ${results.length}`
          ) : (
            'No results'
          )}
        </span>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePrevious}
          disabled={results.length === 0}
          aria-label="Previous result"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNext}
          disabled={results.length === 0}
          aria-label="Next result"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close search">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default PDFSearch;
