import { z } from "zod";
import { env } from "../env";
import type { ProviderDefinition } from "./types";

const configSchema = z.object({
    username: z.string().trim().min(1, "El usuario de Asismetro es obligatorio"),
    password: z.string().min(1, "La contraseña de Asismetro es obligatoria"),
});

const eventSchema = z.object({
    uid: z.string().min(1),
    start: z.iso.datetime({ local: true, offset: true }),
    end: z.iso.datetime({ local: true, offset: true }).nullable(),
    all_day: z.boolean(),
    summary: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]),
});

const calendarSchema = z.object({
    name: z.string(),
    timezone: z.string().refine((value) => {
        try {
            new Intl.DateTimeFormat("en", { timeZone: value });
            return !/[\r\n;:]/.test(value);
        } catch {
            return false;
        }
    }, "Zona horaria no valida"),
    events: z.array(eventSchema),
});

const apiResponseSchema = z.object({
    status: z.literal("OK"),
    message: z.object({
        actual_calendar: calendarSchema.nullable(),
        next_calendar: calendarSchema.nullable(),
    }),
});

type Calendar = z.infer<typeof calendarSchema>;

function escapeIcsText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 limits each physical line to 75 octets, including continuation spaces.
function foldIcsLine(line: string): string {
    const lines: string[] = [];
    let chunk = "";
    let bytes = 0;
    for (const character of line) {
        const size = Buffer.byteLength(character, "utf8");
        if (bytes + size > 75) {
            lines.push(chunk);
            chunk = " ";
            bytes = 1;
        }
        chunk += character;
        bytes += size;
    }
    lines.push(chunk);
    return lines.join("\r\n");
}

function formatDateProperty(
    property: string,
    value: string,
    allDay: boolean,
    timezone: string
): string {
    if (allDay) {
        return `${property};VALUE=DATE:${value.slice(0, 10).replace(/-/g, "")}`;
    }
    if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
        return `${property}:${new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
    }
    // Local timestamps belong to the timezone supplied by Asismetro, not the server.
    const timestamp = value.slice(0, 19).replace(/[-:]/g, "");
    return `${property};TZID=${timezone}:${timestamp.length === 13 ? `${timestamp}00` : timestamp}`;
}

function buildIcsBody(calendars: Calendar[]): string {
    const names = [...new Set(calendars.map((calendar) => calendar.name))];
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Calendar Subscription Hub//Asismetro Automations//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${escapeIcsText(names.join(" / ") || "Asismetro")}`,
    ];
    if (calendars[0]) lines.push(`X-WR-TIMEZONE:${calendars[0].timezone}`);
    const dtstamp = formatDateProperty("DTSTAMP", new Date().toISOString(), false, "UTC");
    const seen = new Set<string>();
    for (const calendar of calendars) {
        for (const event of calendar.events) {
            if (seen.has(event.uid)) continue;
            seen.add(event.uid);
            lines.push("BEGIN:VEVENT", `UID:${escapeIcsText(event.uid)}`, dtstamp);
            lines.push(formatDateProperty("DTSTART", event.start, event.all_day, calendar.timezone));
            if (event.end !== null) {
                lines.push(formatDateProperty("DTEND", event.end, event.all_day, calendar.timezone));
            }
            lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
            if (event.description !== null) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
            if (event.location !== null) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
            lines.push(`STATUS:${event.status}`, "END:VEVENT");
        }
    }
    lines.push("END:VCALENDAR");
    return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export const asismetroAutomationsProvider: ProviderDefinition = {
    key: "asismetro-automations",
    name: "Asismetro Automations",
    description: "Sincroniza los turnos publicados en Asismetro para tu usuario.",
    enabled: true,
    defaultRefreshMinutes: env.defaultRefreshMinutes(),
    minSyncIntervalMinutes: env.asismetroMinSyncHours() * 60,
    fields: [
        {
            key: "username",
            label: "Usuario de Asismetro",
            type: "text",
            required: true,
            secret: true,
            placeholder: "usuario@ejemplo.com",
            helpText: "Se envia a la API externa para obtener el calendario.",
        },
        {
            key: "password",
            label: "Contrasena de Asismetro",
            type: "password",
            required: true,
            secret: true,
            helpText: "Se cifra en la base de datos antes de guardarse.",
        },
    ],
    validateConfig(config) {
        configSchema.parse(config);
    },
    async sync(config, secretConfig) {
        const parsedConfig = configSchema.parse({ ...config, ...secretConfig });
        const response = await fetch(`${env.asismetroApiBaseUrl().replace(/\/$/, "")}/get-calendar`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.asismetroBearerToken()}`,
            },
            body: JSON.stringify(parsedConfig),
            signal: AbortSignal.timeout(env.asismetroRequestTimeoutMs()),
        });
        if (!response.ok) {
            throw new Error(`Asismetro devolvio ${response.status}`);
        }
        const parsedResponse = apiResponseSchema.safeParse(await response.json());
        if (!parsedResponse.success) {
            throw new Error("Asismetro devolvio una respuesta no valida");
        }
        const calendars = [
            parsedResponse.data.message.actual_calendar,
            parsedResponse.data.message.next_calendar,
        ].filter((calendar): calendar is Calendar => calendar !== null);
        return { icsBody: buildIcsBody(calendars) };
    },
};
