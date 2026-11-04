// The Report's two status icons (the prototype's i-check and i-alert), decorative: the sentence
// beside them says the same thing.

export function CheckIcon() {
  return (
    <svg className="good" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg className="warn" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" d="M12 3l10 18H2z" />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M12 10v5M12 18v.01" />
    </svg>
  );
}
