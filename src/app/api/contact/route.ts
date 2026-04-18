import { NextRequest, NextResponse } from "next/server";
import { getSameOriginError } from "@/lib/csrf";

interface ContactBody {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function isValidContactBody(body: unknown): body is ContactBody {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;

  return (
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.trim().length <= 120 &&
    typeof value.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) &&
    value.email.trim().length <= 320 &&
    typeof value.subject === "string" &&
    value.subject.trim().length > 0 &&
    value.subject.trim().length <= 200 &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    value.message.trim().length <= 5000
  );
}

export async function POST(request: NextRequest) {
  const csrfError = getSameOriginError(request);
  if (csrfError) {
    return NextResponse.json({ error: csrfError }, { status: 403 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_FORM_TO_EMAIL ?? "contact@getpolis.vote";
  const from =
    process.env.CONTACT_FORM_FROM_EMAIL ?? "Polis Contact <onboarding@resend.dev>";

  if (!resendApiKey) {
    return NextResponse.json(
      { error: "Contact form is not configured yet." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!isValidContactBody(body)) {
    return NextResponse.json(
      { error: "Invalid contact form submission." },
      { status: 400 }
    );
  }

  const name = body.name.trim();
  const email = body.email.trim();
  const subject = body.subject.trim();
  const message = body.message.trim();

  const html = `
    <div>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <hr />
      <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject: `[Polis Contact] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    return NextResponse.json(
      {
        error:
          error || "Contact form email could not be sent.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
