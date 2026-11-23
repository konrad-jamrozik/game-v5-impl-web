/** AVIEW, STVIEW, ACQVIEW: the sword icon after a weapon damage, the shield icon after an armor, and the Ammo short warning. */

export function SwordIcon() {
  return (
    <svg className="eq-icon" width="13" height="13" viewBox="0 0 16 16" role="img" aria-label="damage">
      <path
        d="M13.5 2.5 6 10M13.5 2.5H10.5M13.5 2.5V5.5M3.8 8.8l3.4 3.4M5.5 10.5l-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArmorIcon() {
  return (
    <svg className="eq-icon" width="13" height="13" viewBox="0 0 16 16" role="img" aria-label="armor">
      <path
        d="M8 1.8 13 3.6v4.1c0 3.1-2.1 5.4-5 6.5-2.9-1.1-5-3.4-5-6.5V3.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** EQUIP, Ammo short: the warning icon in Warning, with the numbers in its tooltip. */
export function AmmoWarning(props: { title: string }) {
  return (
    <svg
      className="eq-icon eq-warn"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      role="img"
      aria-label={props.title}
    >
      <title>{props.title}</title>
      <path d="M8 2 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3.2M8 11.8v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
