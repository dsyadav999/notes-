import { useEffect, useMemo, useRef, useState } from "react";

export default function PublisherFilter({
  publishers,
  query,
  selectedPublisher,
  onQueryChange,
  onSelectPublisher,
  onClear,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return publishers;
    return publishers.filter((p) => p.name.toLowerCase().includes(q));
  }, [publishers, query]);

  const handleInputChange = (e) => {
    const next = e.target.value;
    if (selectedPublisher) {
      onSelectPublisher(null);
    }
    onQueryChange(next);
    setOpen(true);
  };

  const handlePick = (pub) => {
    onSelectPublisher(pub);
    onQueryChange(pub.name);
    setOpen(false);
  };

  const handleClear = () => {
    onClear();
    setOpen(false);
  };

  const isFiltering = Boolean(selectedPublisher || query.trim());

  return (
    <div className="pub-filter" ref={rootRef}>
      <div className="pub-input-wrap">
        <span className="pub-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5.25" r="2.75" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M2.75 13.5c.7-2.45 2.75-3.75 5.25-3.75s4.55 1.3 5.25 3.75"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          className="search pub-search"
          type="text"
          placeholder="Search publisher name..."
          aria-label="Filter world notes by publisher name"
          aria-expanded={open}
          value={selectedPublisher ? selectedPublisher.name : query}
          onFocus={() => setOpen(true)}
          onChange={handleInputChange}
        />
        {isFiltering && (
          <button
            type="button"
            className="search-clear"
            onClick={handleClear}
            aria-label="Clear publisher filter"
          >
            Clear
          </button>
        )}
      </div>

      {open && publishers.length > 0 && (
        <div className="pub-menu" role="listbox" aria-label="Public publishers">
          <div className="pub-menu-head">
            <span>Publishers ({suggestions.length})</span>
            <span>Public notes</span>
          </div>
          {suggestions.length === 0 ? (
            <div className="pub-menu-empty">No publisher matches &ldquo;{query}&rdquo;</div>
          ) : (
            <div className="pub-menu-list">
              {suggestions.map((pub) => {
                const isSelected = selectedPublisher?.id === pub.id;
                return (
                  <button
                    key={pub.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`pub-option${isSelected ? " selected" : ""}`}
                    onClick={() => handlePick(pub)}
                  >
                    <span className="pub-option-name">{pub.name}</span>
                    <span className="pub-option-count tabular-nums">{pub.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedPublisher && (
        <div className="pub-active-bar">
          <span>
            Showing public notes by <strong>{selectedPublisher.name}</strong>
          </span>
          <button type="button" className="pub-active-clear" onClick={handleClear}>
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
