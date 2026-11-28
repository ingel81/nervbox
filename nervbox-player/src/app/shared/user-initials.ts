/**
 * Kürzel für einen Benutzer ohne Avatarbild: immer aus dem Benutzernamen
 * (erste zwei Buchstaben/Ziffern), nie aus Vor-/Nachname. So trägt jede
 * Person überall dasselbe Kürzel und der echte Name bleibt verborgen.
 */
export function userInitials(username: string | null | undefined): string {
  return (
    (username ?? '')
      .replace(/[^A-Za-zÄÖÜäöüß0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}
