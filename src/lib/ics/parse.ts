export interface ParsedIcsEvent {
    uid: string;
    summary: string;
    description: string;
    startsAt: Date;
    endsAt: Date | null;
    allDay: boolean;
}

function unfoldIcsLines(icsBody: string): string[] {
    const rawLines = icsBody.split(/\r?\n/);
    const unfolded: string[] = [];

    for (const line of rawLines) {
        if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
            unfolded[unfolded.length - 1] += line.slice(1);
            continue;
        }

        unfolded.push(line);
    }

    return unfolded;
}

function unescapeIcsText(value: string): string {
    return value
        .replace(/\\n/gi, "\n")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\");
}

function parseIcsDate(value: string, valueType: string | null): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (valueType === "DATE" || /^\d{8}$/.test(trimmed)) {
        const year = Number(trimmed.slice(0, 4));
        const month = Number(trimmed.slice(4, 6));
        const day = Number(trimmed.slice(6, 8));
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
            return null;
        }
        return new Date(year, month - 1, day);
    }

    const utcMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(trimmed);
    if (utcMatch) {
        const [, y, m, d, hh, mm, ss] = utcMatch;
        return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    }

    const localMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(trimmed);
    if (localMatch) {
        const [, y, m, d, hh, mm, ss] = localMatch;
        return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    }

    return null;
}

interface RawEventValues {
    uid?: string;
    summary?: string;
    description?: string;
    dtstart?: string;
    dtstartValueType?: string | null;
    dtend?: string;
    dtendValueType?: string | null;
}

function parseProperty(line: string): {
    name: string;
    value: string;
    params: Record<string, string>;
} | null {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) return null;

    const left = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);

    const [namePart, ...paramParts] = left.split(";");
    const name = namePart.toUpperCase();
    const params: Record<string, string> = {};

    for (const part of paramParts) {
        const [rawKey, rawValue] = part.split("=");
        if (!rawKey || !rawValue) continue;
        params[rawKey.toUpperCase()] = rawValue;
    }

    return { name, value, params };
}

function toParsedEvent(raw: RawEventValues): ParsedIcsEvent | null {
    if (!raw.dtstart) return null;

    const startsAt = parseIcsDate(raw.dtstart, raw.dtstartValueType ?? null);
    if (!startsAt) return null;

    const endsAt = raw.dtend
        ? parseIcsDate(raw.dtend, raw.dtendValueType ?? raw.dtstartValueType ?? null)
        : null;

    return {
        uid: raw.uid ?? `${startsAt.toISOString()}-${raw.summary ?? "event"}`,
        summary: unescapeIcsText(raw.summary ?? "Untitled event"),
        description: unescapeIcsText(raw.description ?? ""),
        startsAt,
        endsAt,
        allDay: (raw.dtstartValueType ?? null) === "DATE" || /^\d{8}$/.test(raw.dtstart),
    };
}

export function parseIcsEvents(icsBody: string): ParsedIcsEvent[] {
    const lines = unfoldIcsLines(icsBody);
    const events: ParsedIcsEvent[] = [];

    let inEvent = false;
    let rawEvent: RawEventValues = {};

    for (const line of lines) {
        if (line === "BEGIN:VEVENT") {
            inEvent = true;
            rawEvent = {};
            continue;
        }

        if (line === "END:VEVENT") {
            if (inEvent) {
                const parsed = toParsedEvent(rawEvent);
                if (parsed) events.push(parsed);
            }
            inEvent = false;
            rawEvent = {};
            continue;
        }

        if (!inEvent) continue;

        const prop = parseProperty(line);
        if (!prop) continue;

        if (prop.name === "UID") rawEvent.uid = prop.value;
        if (prop.name === "SUMMARY") rawEvent.summary = prop.value;
        if (prop.name === "DESCRIPTION") rawEvent.description = prop.value;
        if (prop.name === "DTSTART") {
            rawEvent.dtstart = prop.value;
            rawEvent.dtstartValueType = prop.params.VALUE ?? null;
        }
        if (prop.name === "DTEND") {
            rawEvent.dtend = prop.value;
            rawEvent.dtendValueType = prop.params.VALUE ?? null;
        }
    }

    return events;
}
