import { createHash } from "crypto";
import { z } from "zod";
import type { ProviderDefinition } from "./types";

const ASISMETRO_CALENDAR_URL =
    "https://asismetro-automations.ismola.dev/get-calendar";
const CALENDAR_TIMEZONE = "Europe/Madrid";

const configSchema = z.object({
    username: z.string().trim().min(1, "El usuario de Asismetro es obligatorio"),
    password: z
        .string()
        .trim()
        .min(1, "La contraseña de Asismetro es obligatoria"),
    profileName: z
        .string()
        .trim()
        .min(1, "El nombre mostrado en Asismetro es obligatorio"),
});

const apiResponseSchema = z.object({
    status: z.string(),
    message: z.object({
        actual_calendar: z
            .object({
                sections: z.array(
                    z.object({
                        slots: z.array(
                            z.object({
                                time_range: z.string(),
                                entries: z.array(
                                    z.object({
                                        date: z.string().nullable(),
                                        assignees: z
                                            .array(
                                                z.object({
                                                    name: z.string(),
                                                })
                                            )
                                            .default([]),
                                    })
                                ),
                            })
                        ),
                    })
                ),
            })
            .nullable()
            .optional(),
        next_calendar: z
            .object({
                sections: z.array(
                    z.object({
                        slots: z.array(
                            z.object({
                                time_range: z.string(),
                                entries: z.array(
                                    z.object({
                                        date: z.string().nullable(),
                                        assignees: z
                                            .array(
                                                z.object({
                                                    name: z.string(),
                                                })
                                            )
                                            .default([]),
                                    })
                                ),
                            })
                        ),
                    })
                ),
            })
            .nullable()
            .optional(),
    }),
});

const monthNameToIndex: Record<string, number> = {
    ENERO: 0,
    FEBRERO: 1,
    MARZO: 2,
    ABRIL: 3,
    MAYO: 4,
    JUNIO: 5,
    JULIO: 6,
    AGOSTO: 7,
    SEPTIEMBRE: 8,
    SETIEMBRE: 8,
    OCTUBRE: 9,
    NOVIEMBRE: 10,
    DICIEMBRE: 11,
};

interface LocalDateTimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

interface ShiftEvent {
    start: LocalDateTimeParts;
    end: LocalDateTimeParts;
    summary: string;
    description: string;
    uid: string;
}

function normalizeWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

function normalizeMonthName(value: string): string {
    return value
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
}

function namesMatch(left: string, right: string): boolean {
    return (
        normalizeWhitespace(left).localeCompare(normalizeWhitespace(right), "es", {
            sensitivity: "base",
        }) === 0
    );
}

function parseDateLabel(
    dateLabel: string,
    fallbackYear: number,
    fallbackMonth: number
): { year: number; month: number; day: number } {
    const match = dateLabel.match(/^(\d{1,2})\s+(.+)$/);
    if (!match) {
        throw new Error(`Fecha de turno no valida: ${dateLabel}`);
    }

    const day = Number.parseInt(match[1], 10);
    const parsedMonth = monthNameToIndex[normalizeMonthName(match[2])];
    const month = parsedMonth ?? fallbackMonth;

    let year = fallbackYear;
    if (month === 0 && fallbackMonth === 11) {
        year += 1;
    } else if (month === 11 && fallbackMonth === 0) {
        year -= 1;
    }

    return { year, month, day };
}

function parseTimeRange(timeRange: string): {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
} {
    const match = timeRange.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!match) {
        throw new Error(`Rango horario no valido: ${timeRange}`);
    }

    return {
        startHour: Number.parseInt(match[1], 10),
        startMinute: Number.parseInt(match[2], 10),
        endHour: Number.parseInt(match[3], 10),
        endMinute: Number.parseInt(match[4], 10),
    };
}

function pad(value: number): string {
    return value.toString().padStart(2, "0");
}

function formatLocalDateTime(parts: LocalDateTimeParts): string {
    return `${parts.year}${pad(parts.month + 1)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}00`;
}

function formatUtcTimestamp(date: Date): string {
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeIcsText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string[] {
    const maxLength = 75;
    if (line.length <= maxLength) {
        return [line];
    }

    const chunks: string[] = [];
    let remaining = line;
    while (remaining.length > maxLength) {
        chunks.push(remaining.slice(0, maxLength));
        remaining = ` ${remaining.slice(maxLength)}`;
    }
    chunks.push(remaining);
    return chunks;
}

function buildIcsBody(profileName: string, events: ShiftEvent[]): string {
    const dtStamp = formatUtcTimestamp(new Date());
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Calendar Subscription Hub//Asismetro Automations//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${escapeIcsText(`Asismetro - ${profileName}`)}`,
        `X-WR-TIMEZONE:${CALENDAR_TIMEZONE}`,
    ];

    for (const event of events) {
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${event.uid}`);
        lines.push(`DTSTAMP:${dtStamp}`);
        lines.push(`DTSTART;TZID=${CALENDAR_TIMEZONE}:${formatLocalDateTime(event.start)}`);
        lines.push(`DTEND;TZID=${CALENDAR_TIMEZONE}:${formatLocalDateTime(event.end)}`);
        lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
        lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
        lines.push("STATUS:CONFIRMED");
        lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return lines.flatMap(foldIcsLine).join("\r\n");
}

function buildEventUid(
    profileName: string,
    start: LocalDateTimeParts,
    end: LocalDateTimeParts
): string {
    const hash = createHash("sha256")
        .update(
            [
                profileName,
                formatLocalDateTime(start),
                formatLocalDateTime(end),
            ].join("|")
        )
        .digest("hex");

    return `${hash}@asismetro-automations.calendar-subscription-hub`;
}

function extractEvents(
    calendar: z.infer<typeof apiResponseSchema>['message']['actual_calendar'],
    baseDate: Date,
    profileName: string
): ShiftEvent[] {
    if (!calendar) {
        return [];
    }

    const events = new Map<string, ShiftEvent>();

    for (const section of calendar.sections) {
        for (const slot of section.slots) {
            const timeRange = parseTimeRange(slot.time_range);
            for (const entry of slot.entries) {
                if (!entry.date) {
                    continue;
                }

                const isAssignedToProfile = entry.assignees.some((assignee) =>
                    namesMatch(assignee.name, profileName)
                );
                if (!isAssignedToProfile) {
                    continue;
                }

                const date = parseDateLabel(
                    entry.date,
                    baseDate.getFullYear(),
                    baseDate.getMonth()
                );

                const start = {
                    ...date,
                    hour: timeRange.startHour,
                    minute: timeRange.startMinute,
                };
                const end = {
                    ...date,
                    hour: timeRange.endHour,
                    minute: timeRange.endMinute,
                };
                const uid = buildEventUid(profileName, start, end);

                events.set(uid, {
                    start,
                    end,
                    uid,
                    summary: `Turno ${slot.time_range}`,
                    description: `Turno de ${profileName} sincronizado desde Asismetro Automations.`,
                });
            }
        }
    }

    return Array.from(events.values()).sort((left, right) => {
        const leftKey = formatLocalDateTime(left.start);
        const rightKey = formatLocalDateTime(right.start);
        return leftKey.localeCompare(rightKey);
    });
}

export const asismetroAutomationsProvider: ProviderDefinition = {
    key: "asismetro-automations",
    name: "Asismetro Automations",
    description:
        "Sincroniza los turnos publicados en Asismetro para una persona concreta.",
    enabled: true,
    defaultRefreshMinutes: 60,
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
        {
            key: "profileName",
            label: "Nombre mostrado en Asismetro",
            type: "text",
            required: true,
            secret: false,
            placeholder: "Ismael Treviño",
            helpText:
                "Debe coincidir con el nombre que aparece asignado en los turnos.",
        },
    ],
    validateConfig(config) {
        configSchema.parse(config);
    },
    async sync(config, secretConfig) {
        const parsedConfig = configSchema.parse({
            ...config,
            ...secretConfig,
        });

        const requestUrl = new URL(ASISMETRO_CALENDAR_URL);
        requestUrl.searchParams.set("username", parsedConfig.username);
        requestUrl.searchParams.set("password", parsedConfig.password);

        const response = await fetch(requestUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            const responseBody = await response.text();
            throw new Error(
                `Asismetro devolvio ${response.status}: ${responseBody.slice(0, 300)}`
            );
        }

        const rawResponse: unknown = await response.json();
        const parsedResponse = apiResponseSchema.parse(rawResponse);
        if (parsedResponse.status.toUpperCase() !== "OK") {
            throw new Error("Asismetro devolvio una respuesta no valida");
        }

        const now = new Date();
        const actualMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const events = [
            ...extractEvents(
                parsedResponse.message.actual_calendar,
                actualMonth,
                parsedConfig.profileName
            ),
            ...extractEvents(
                parsedResponse.message.next_calendar,
                nextMonth,
                parsedConfig.profileName
            ),
        ];

        return {
            icsBody: buildIcsBody(parsedConfig.profileName, events),
        };
    },
};