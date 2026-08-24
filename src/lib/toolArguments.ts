/**
 * Tool arguments keep the type the tool asked for.
 *
 * The automation builder's "Use a connected app" step collects arguments for
 * a Composio tool, and every one of them used to be stored as the raw string
 * from its input. That quietly broke any argument that wasn't text: a
 * duration of 30 became "30", a flag could not be expressed at all, and the
 * provider rejected otherwise valid steps on schema validation.
 *
 * Its own module rather than locals in NodeEditorCard so the behaviour can be
 * tested directly — and because a component file that also exports helpers
 * breaks fast refresh.
 */

export function isBooleanParam(type: string): boolean {
  return type.toLowerCase() === 'boolean';
}

export function isNumericParam(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'number' || t === 'integer';
}

export function isStructuredParam(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'array' || t === 'object';
}

export function placeholderFor(param: { name: string; type: string; required: boolean }): string {
  const suffix = param.required ? ' (required)' : '';
  if (isStructuredParam(param.type)) return `${param.name} — JSON${suffix}`;
  return `${param.name}${suffix}`;
}

/** What to show in the field for a stored value of any type. */
export function displayArgument(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    // A structured argument round-trips as the JSON the creator typed,
    // rather than "[object Object]".
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

/**
 * Turns what was typed into what the tool expects.
 *
 * A `{{contact.name}}` placeholder is always left as a string, whatever the
 * declared type: it is resolved server-side at run time, and coercing it here
 * would turn it into NaN before it ever reached the substitution that gives
 * it a value.
 *
 * Anything that can't be parsed as its declared type is also left as text.
 * That is deliberate on two counts: the provider's own validation is a better
 * error than a silent NaN, and a half-typed number ("-", "1.") must not be
 * destroyed mid-keystroke.
 */
export function coerceArgument(raw: string, type: string): unknown {
  if (raw.includes('{{')) return raw;
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  if (isNumericParam(type)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (isStructuredParam(type)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}
