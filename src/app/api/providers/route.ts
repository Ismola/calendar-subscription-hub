import { NextResponse } from "next/server";
import { getProviders } from "@/lib/providers/registry";

export async function GET() {
    const providers = getProviders().map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        defaultRefreshMinutes: p.defaultRefreshMinutes,
        fields: p.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            secret: f.secret,
            placeholder: f.placeholder,
            helpText: f.helpText,
            options: f.options,
        })),
    }));

    return NextResponse.json({ providers });
}
