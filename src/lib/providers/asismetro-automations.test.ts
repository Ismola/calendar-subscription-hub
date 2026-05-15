import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

const originalEnv = {
    ASISMETRO_API_BASE_URL: process.env.ASISMETRO_API_BASE_URL,
    ASISMETRO_BEARER_TOKEN: process.env.ASISMETRO_BEARER_TOKEN,
    ASISMETRO_MIN_SYNC_HOURS: process.env.ASISMETRO_MIN_SYNC_HOURS,
    NODE_ENV: process.env.NODE_ENV,
};

const sampleApiResponse = {
    status: "OK",
    message: {
        actual_calendar: {
            sections: [
                {
                    slots: [
                        {
                            time_range: "08:00 - 16:00",
                            entries: [
                                {
                                    date: "15 MAYO",
                                    assignees: [{ name: "Ismael Treviño" }],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        next_calendar: null,
    },
};

async function loadProvider() {
    return import("./asismetro-automations");
}

beforeEach(() => {
    process.env.ASISMETRO_API_BASE_URL = "https://asismetro.example";
    process.env.ASISMETRO_BEARER_TOKEN = "test-token";
    process.env.ASISMETRO_MIN_SYNC_HOURS = "4";
    process.env.NODE_ENV = "test";
});

afterEach(() => {
    mock.restoreAll();

    if (originalEnv.ASISMETRO_API_BASE_URL === undefined) {
        delete process.env.ASISMETRO_API_BASE_URL;
    } else {
        process.env.ASISMETRO_API_BASE_URL = originalEnv.ASISMETRO_API_BASE_URL;
    }

    if (originalEnv.ASISMETRO_BEARER_TOKEN === undefined) {
        delete process.env.ASISMETRO_BEARER_TOKEN;
    } else {
        process.env.ASISMETRO_BEARER_TOKEN = originalEnv.ASISMETRO_BEARER_TOKEN;
    }

    if (originalEnv.ASISMETRO_MIN_SYNC_HOURS === undefined) {
        delete process.env.ASISMETRO_MIN_SYNC_HOURS;
    } else {
        process.env.ASISMETRO_MIN_SYNC_HOURS = originalEnv.ASISMETRO_MIN_SYNC_HOURS;
    }

    if (originalEnv.NODE_ENV === undefined) {
        delete process.env.NODE_ENV;
    } else {
        process.env.NODE_ENV = originalEnv.NODE_ENV;
    }
});

test("asismetroAutomationsProvider.sync builds an ICS calendar from the API response", async () => {
    const fixedNow = new Date("2026-05-15T12:00:00Z");
    const originalDate = globalThis.Date;

    class FixedDate extends Date {
        constructor(...args: ConstructorParameters<typeof Date>) {
            if (args.length === 0) {
                super(fixedNow);
                return;
            }

            super(...args);
        }
    }

    Object.defineProperty(globalThis, "Date", {
        configurable: true,
        value: FixedDate,
    });

    const fetchMock = mock.method(globalThis, "fetch", async () =>
        Response.json(sampleApiResponse, {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })
    );

    try {
        const { asismetroAutomationsProvider } = await loadProvider();

        const result = await asismetroAutomationsProvider.sync(
            { profileName: "Ismael Treviño" },
            { username: "ismael@example.com", password: "secret" }
        );

        const normalizedIcs = result.icsBody.replace(/\r\n[ \t]/g, "");

        assert.equal(fetchMock.mock.calls.length, 1);
        assert.match(normalizedIcs, /BEGIN:VCALENDAR/);
        assert.match(normalizedIcs, /SUMMARY:Turno 08:00 - 16:00/);
        assert.match(
            normalizedIcs,
            /DESCRIPTION:Turno de Ismael Treviño sincronizado desde Asismetro Automations\./
        );
        assert.match(normalizedIcs, /DTSTART;TZID=Europe\/Madrid:20260515T080000/);
        assert.match(normalizedIcs, /DTEND;TZID=Europe\/Madrid:20260515T160000/);

        const [requestUrl, requestInit] = fetchMock.mock.calls[0].arguments as [
            string,
            RequestInit,
        ];
        assert.equal(requestUrl, "https://asismetro.example/get-calendar");
        assert.equal(requestInit.method, "POST");
        assert.equal(
            (requestInit.headers as Record<string, string>).Authorization,
            "Bearer test-token"
        );
        assert.equal(
            requestInit.body,
            JSON.stringify({
                username: "ismael@example.com",
                password: "secret",
            })
        );
    } finally {
        Object.defineProperty(globalThis, "Date", {
            configurable: true,
            value: originalDate,
        });
    }
});