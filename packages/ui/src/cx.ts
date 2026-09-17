/** Une clases ignorando los valores falsos, sin traer una dependencia para eso. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
