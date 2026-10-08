import { NAME_MAX, PALETTE, PHRASE_MAX, colorHex } from '@holdem/engine';
import { useState } from 'react';

export interface NameFieldsProps {
  idPrefix: string;
  nameLabel: string;
  name: string;
  onName: (v: string) => void;
  namePlaceholder: string;
  color: string;
  onColor: (id: string) => void;
  phrase: string;
  onPhrase: (v: string) => void;
  phrasePlaceholder: string;
  /** Colors already used at the table, with who has them. */
  taken?: Map<string, string>;
}

/** Name with a color swatch, the palette when it's open, and the catchphrase. */
export function NameFields(p: NameFieldsProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={`${p.idPrefix}-name`} className="caps">
          {p.nameLabel}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id={`${p.idPrefix}-name`}
            className="field inset"
            type="text"
            maxLength={NAME_MAX}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="next"
            placeholder={p.namePlaceholder}
            value={p.name}
            onChange={(e) => p.onName(e.target.value)}
            style={{ height: 54, padding: '0 60px 0 18px', borderRadius: 18, fontSize: 17, fontWeight: 700 }}
          />
          <button
            type="button"
            className="btn swatch hit"
            aria-label={`Your color: ${PALETTE.find((c) => c.id === p.color)?.label ?? p.color}. Change it`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            style={{
              position: 'absolute',
              right: 11,
              top: 11,
              background: colorHex(p.color),
              transition: 'background 260ms ease, transform 140ms ease',
            }}
          />
        </div>
        {open && (
          <div
            className="popUp"
            role="radiogroup"
            aria-label="Colors"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
              justifyItems: 'center',
              gap: 4,
              padding: '8px 0 2px',
            }}
          >
            {PALETTE.map((c) => {
              const owner = p.taken?.get(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === p.color}
                  className={c.id === p.color ? 'btn swatch hit sel' : 'btn swatch hit'}
                  disabled={!!owner}
                  aria-label={owner ? `${c.label}, taken by ${owner}` : c.label}
                  onClick={() => {
                    p.onColor(c.id);
                    setOpen(false);
                  }}
                  style={{ background: c.hex }}
                />
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={`${p.idPrefix}-phrase`} className="caps">
          Catchphrase
        </label>
        <input
          id={`${p.idPrefix}-phrase`}
          className="field inset"
          type="text"
          maxLength={PHRASE_MAX}
          enterKeyHint="done"
          placeholder={p.phrasePlaceholder}
          value={p.phrase}
          onChange={(e) => p.onPhrase(e.target.value)}
          style={{ height: 54, padding: '0 18px', borderRadius: 18, fontSize: 16 }}
        />
      </div>
    </>
  );
}
