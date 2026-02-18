import { useState, useRef } from 'react';
import './InputBar.css';

const SHORTCUT_KEYS = [
  { label: '^C', key: 'C-c' },
  { label: '^D', key: 'C-d' },
  { label: '^Z', key: 'C-z' },
  { label: '\u2191', key: 'Up' },
  { label: '\u2193', key: 'Down' },
  { label: 'Tab', key: 'Tab' },
  { label: '^L', key: 'C-l' },
];

export default function InputBar({ onSubmit, onSpecialKey }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text) {
      onSubmit(text);
      onSpecialKey('Enter');
      setText('');
    } else {
      onSpecialKey('Enter');
    }
  };

  return (
    <div className="input-bar">
      <div className="shortcut-row">
        {SHORTCUT_KEYS.map(({ label, key }) => (
          <button
            key={key}
            className="shortcut-btn"
            onClick={() => {
              onSpecialKey(key);
              inputRef.current?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <form className="input-row" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="input-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Input..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <button type="submit" className="send-btn">
          {'\u23CE'}
        </button>
      </form>
    </div>
  );
}
