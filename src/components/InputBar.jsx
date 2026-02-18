import './InputBar.css';

const MIN_FONT_SIZE = 3;
const MAX_FONT_SIZE = 28;

const SHORTCUT_KEYS = [
  { label: '^C', key: 'C-c' },
  { label: '^D', key: 'C-d' },
  { label: '^Z', key: 'C-z' },
  { label: '\u2191', key: 'Up' },
  { label: '\u2193', key: 'Down' },
  { label: 'Tab', key: 'Tab' },
  { label: '^L', key: 'C-l' },
];

export default function InputBar({ onSpecialKey, fontSize, onFontSizeChange }) {
  return (
    <div className="input-bar">
      <div className="shortcut-row">
        {SHORTCUT_KEYS.map(({ label, key }) => (
          <button
            key={key}
            className="shortcut-btn"
            onClick={() => onSpecialKey(key)}
          >
            {label}
          </button>
        ))}
        <span className="font-size-separator" />
        <button
          className="shortcut-btn font-btn"
          onClick={() => onFontSizeChange?.(Math.max(MIN_FONT_SIZE, (fontSize || 13) - 1))}
        >
          A-
        </button>
        <button
          className="shortcut-btn font-btn"
          onClick={() => onFontSizeChange?.(Math.min(MAX_FONT_SIZE, (fontSize || 13) + 1))}
        >
          A+
        </button>
      </div>
    </div>
  );
}
