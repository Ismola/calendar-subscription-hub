import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { asismetroAutomationsProvider as provider } from "./asismetro-automations";

const originalEnv = { ...process.env };
const credentials = { username: "user@example.com", password: " secret " };
const event = {
    uid: "5714994109223",
    start: "2026-10-10T09:00:00",
    end: "2026-10-10T12:00:00",
    all_day: false,
    summary: "Callao",
    description: null,
    location: "PPAM",
    status: "CONFIRMED",
};
const calendar = { name: "PPAM", timezone: "Europe/Madrid", events: [event] };
const response = { status: "OK", message: { actual_calendar: calendar, next_calendar: null } };

beforeEach(() => {
    process.env.ASISMETRO_API_BASE_URL = "http://asismetro.example/";
    process.env.ASISMETRO_BEARER_TOKEN = "test-token";
});
afterEach(() => {
    mock.restoreAll();
    process.env = { ...originalEnv };
});

function mockResponse(body: unknown) {
    return mock.method(globalThis, "fetch", async () => Response.json(body));
}
function unfold(body: string) {
    return body.replace(/\r\n[ \t]/g, "");
}

test("converts the real normalized response without a profile name", async () => {
    const fetchMock = mockResponse(response);
    provider.validateConfig(credentials);
    assert.deepEqual(provider.fields.map((field) => field.key), ["username", "password"]);
    const { icsBody } = await provider.sync({}, credentials);
    assert.match(icsBody, /X-WR-CALNAME:PPAM/);
    assert.match(icsBody, /UID:5714994109223\r\n/);
    assert.match(icsBody, /DTSTART;TZID=Europe\/Madrid:20261010T090000/);
    assert.match(icsBody, /DTEND;TZID=Europe\/Madrid:20261010T120000/);
    assert.match(icsBody, /SUMMARY:Callao/);
    assert.match(icsBody, /LOCATION:PPAM/);
    assert.match(icsBody, /STATUS:CONFIRMED/);
    assert.doesNotMatch(icsBody, /DESCRIPTION:/);
    assert.ok(icsBody.endsWith("END:VCALENDAR\r\n"));
    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, "http://asismetro.example/get-calendar");
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(init.body as string), credentials);
    assert.ok(init.signal instanceof AbortSignal);
});

test("includes both months using response years and keeps UIDs stable for legacy configs", async () => {
    mockResponse({ status: "OK", message: {
        actual_calendar: { ...calendar, events: [{ ...event, start: "2026-12-31T23:00:00", end: "2027-01-01T01:00:00" }] },
        next_calendar: { ...calendar, events: [{ ...event, uid: "january", start: "2027-01-10T09:00:00", end: "2027-01-10T12:00:00" }] },
    } });
    const first = unfold((await provider.sync({}, credentials)).icsBody);
    const legacy = unfold((await provider.sync({ profileName: "Old display name" }, credentials)).icsBody);
    assert.match(first, /DTEND;TZID=Europe\/Madrid:20270101T010000/);
    assert.match(first, /DTSTART;TZID=Europe\/Madrid:20270110T090000/);
    assert.equal((first.match(/BEGIN:VEVENT/g) ?? []).length, 2);
    assert.deepEqual(first.match(/UID:.+/g), legacy.match(/UID:.+/g));
});

test("deduplicates overlapping events by upstream UID", async () => {
    mockResponse({ status: "OK", message: { actual_calendar: calendar, next_calendar: calendar } });
    assert.equal(((await provider.sync({}, credentials)).icsBody.match(/BEGIN:VEVENT/g) ?? []).length, 1);
});

test("preserves all-day dates, UTC offsets, optional ends and upstream statuses", async () => {
    mockResponse({ status: "OK", message: { actual_calendar: { ...calendar, events: [
        { ...event, uid: "day", all_day: true, start: "2026-10-10T00:00:00", end: "2026-10-11T00:00:00", status: "TENTATIVE" },
        { ...event, uid: "offset", start: "2026-10-10T09:00:00+02:00", end: "2026-10-10T10:00:00Z", status: "CANCELLED" },
        { ...event, uid: "no-end", end: null },
    ] }, next_calendar: null } });
    const ics = (await provider.sync({}, credentials)).icsBody;
    assert.match(ics, /DTSTART;VALUE=DATE:20261010/);
    assert.match(ics, /DTEND;VALUE=DATE:20261011/);
    assert.match(ics, /DTSTART:20261010T070000Z/);
    assert.match(ics, /DTEND:20261010T100000Z/);
    assert.match(ics, /STATUS:TENTATIVE/);
    assert.match(ics, /STATUS:CANCELLED/);
    const noEnd = ics.split("BEGIN:VEVENT").find((block) => block.includes("UID:no-end"))!;
    assert.doesNotMatch(noEnd, /DTEND/);
});

test("escapes text and folds Unicode lines at 75 UTF-8 octets", async () => {
    const summary = "á😀".repeat(50) + ",;\\\nFin";
    mockResponse({ status: "OK", message: { actual_calendar: { ...calendar, events: [{ ...event, summary, description: "Uno\r\nDos", location: "A,B;C" }] }, next_calendar: null } });
    const ics = (await provider.sync({}, credentials)).icsBody;
    assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
    const unfolded = unfold(ics);
    assert.ok(unfolded.includes(`SUMMARY:${"á😀".repeat(50)}\\,\\;\\\\\\nFin`));
    assert.match(unfolded, /DESCRIPTION:Uno\\nDos/);
    assert.match(unfolded, /LOCATION:A\\,B\\;C/);
});

test("supports an empty calendar without inventing events", async () => {
    mockResponse({ status: "OK", message: { actual_calendar: null, next_calendar: null } });
    const ics = (await provider.sync({}, credentials)).icsBody;
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.doesNotMatch(ics, /BEGIN:VEVENT/);
});

test("rejects API errors, old responses and invalid dates instead of storing an empty snapshot", async () => {
    const fetchMock = mockResponse(response);
    for (const body of [
        { status: "ERROR", message: "Authentication failed" },
        { status: "OK", message: { actual_calendar: { sections: [] }, next_calendar: null } },
        { status: "OK", message: {} },
        { status: "OK", message: { actual_calendar: { ...calendar, events: [{ ...event, start: "2026-02-30T09:00:00" }] }, next_calendar: null } },
        { status: "OK", message: { actual_calendar: { ...calendar, timezone: "Invalid/Zone" }, next_calendar: null } },
    ]) {
        fetchMock.mock.mockImplementation(async () => Response.json(body));
        await assert.rejects(provider.sync({}, credentials), /respuesta no valida/);
    }
});

test("does not expose upstream response bodies in HTTP errors", async () => {
    mock.method(globalThis, "fetch", async () => new Response("private upstream data", { status: 401 }));
    await assert.rejects(provider.sync({}, credentials), { message: "Asismetro devolvio 401" });
});
