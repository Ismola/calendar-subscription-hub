import assert from "node:assert/strict";
import { test } from "node:test";
import { parseIcsEvents } from "./parse";

function parse(start: string, end: string) {
    return parseIcsEvents(`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test\r\n${start}\r\n${end}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`)[0];
}

test("resolves Asismetro Madrid hours independently of the server timezone", () => {
    const event = parse("DTSTART;TZID=Europe/Madrid:20261010T090000", "DTEND;TZID=Europe/Madrid:20261010T120000");
    assert.equal(event.startsAt.toISOString(), "2026-10-10T07:00:00.000Z");
    assert.equal(event.endsAt?.toISOString(), "2026-10-10T10:00:00.000Z");
});

test("uses the timezone offset for each date across daylight saving changes", () => {
    for (const [date, utcHour] of [["20260328", "08"], ["20260329", "07"], ["20261024", "07"], ["20261025", "08"]]) {
        const event = parse(`DTSTART;TZID=Europe/Madrid:${date}T090000`, `DTEND;TZID=Europe/Madrid:${date}T120000`);
        assert.equal(event.startsAt.getUTCHours(), Number(utcHour));
    }
});

test("preserves UTC timestamps and all-day events", () => {
    const utc = parse("DTSTART:20261010T070000Z", "DTEND:20261010T100000Z");
    assert.equal(utc.startsAt.toISOString(), "2026-10-10T07:00:00.000Z");
    assert.equal(utc.allDay, false);
    const day = parse("DTSTART;VALUE=DATE:20261010", "DTEND;VALUE=DATE:20261011");
    assert.equal(day.allDay, true);
    assert.equal(day.startsAt.getDate(), 10);
    assert.equal(day.endsAt?.getDate(), 11);
});

test("does not substitute the server timezone for an invalid TZID", () => {
    assert.equal(parse("DTSTART;TZID=Invalid/Zone:20261010T090000", "DTEND:20261010T100000Z"), undefined);
});
