import { useEffect, useRef, useState } from "react";

export default function CategoryPicker({
  value,
  options,
  onChange,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setAdding(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (adding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [adding]);

  const handleSelect = (cat) => {
    onChange(cat);
    setOpen(false);
    setAdding(false);
  };

  const handleCreateCustom = (e) => {
    e.preventDefault();
    const cleaned = customName.trim().slice(0, 30);
    if (!cleaned) return;
    onChange(cleaned);
    setCustomName("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <div className="cat-picker" ref={rootRef}>
      <button
        type="button"
        id="category"
        className="cat-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setAdding(false);
        }}
      >
        <span className="cat-trigger-label">{value || "General"}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className={`cat-chevron${open ? " open" : ""}`}
        >
          <path
            d="M3.5 5.25 7 8.75l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="cat-menu" role="listbox" aria-label="Select category">
          <div className="cat-menu-grid">
            {options.map((cat) => {
              const selected = cat === value;
              return (
                <button
                  type="button"
                  key={cat}
                  role="option"
                  aria-selected={selected}
                  className={`cat-option${selected ? " selected" : ""}`}
                  onClick={() => handleSelect(cat)}
                >
                  <span className="cat-option-name">{cat}</span>
                  {selected && (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M3 7.25 5.75 10 11 4.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          <div className="cat-menu-foot">
            {adding ? (
              <form className="cat-new-form" onSubmit={handleCreateCustom}>
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={30}
                  placeholder="New category name"
                  aria-label="New category name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <button type="submit" className="cat-new-apply">
                  Add
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="cat-new-trigger"
                onClick={() => setAdding(true)}
              >
                + New category
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
