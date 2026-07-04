import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const unfoldIcsLines = (text: string) =>
  String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .reduce<string[]>((lines, line) => {
      if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
        return lines;
      }

      lines.push(line);
      return lines;
    }, []);

const parseProperty = (line: string) => {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return null;

  const rawKey = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...rawParams] = rawKey.split(";");
  const params = Object.fromEntries(
    rawParams
      .map((entry) => entry.split("="))
      .filter(([key, paramValue]) => key && typeof paramValue !== "undefined")
      .map(([key, paramValue]) => [key.toUpperCase(), paramValue]),
  );

  return { name: name.toUpperCase(), params, value };
};

const parseIcsDate = (value: string, params: Record<string, string> = {}) => {
  const cleaned = String(value || "").trim();
  const isAllDay = params.VALUE === "DATE" || /^\d{8}$/.test(cleaned);

  if (isAllDay) {
    const year = Number(cleaned.slice(0, 4));
    const month = Number(cleaned.slice(4, 6)) - 1;
    const day = Number(cleaned.slice(6, 8));
    return {
      date: new Date(Date.UTC(year, month, day, 0, 0, 0)),
      allDay: true,
      timezone: params.TZID || "UTC",
    };
  }

  const hasZulu = cleaned.endsWith("Z");
  const compact = hasZulu ? cleaned.slice(0, -1) : cleaned;
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6)) - 1;
  const day = Number(compact.slice(6, 8));
  const hour = Number(compact.slice(9, 11));
  const minute = Number(compact.slice(11, 13));
  const second = Number(compact.slice(13, 15) || 0);

  return {
    date: hasZulu
      ? new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15) || "00"}Z`)
      : new Date(Date.UTC(year, month, day, hour, minute, second)),
    allDay: false,
    timezone: params.TZID || "UTC",
  };
};

type IcsEventMap = Record<string, { value: string; params: Record<string, string> }>;

const parseFeed = (icsText: string) => {
  const lines = unfoldIcsLines(icsText);
  const events: IcsEventMap[] = [];
  let current: IcsEventMap | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) {
        events.push(current);
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const property = parseProperty(line);
    if (!property) continue;

    current[property.name] = { value: property.value, params: property.params };
  }

  return events
    .map((event, index) => {
      const startField = event.DTSTART;
      if (!startField?.value) return null;

      const start = parseIcsDate(startField.value, startField.params);
      const endField = event.DTEND;
      const end = endField?.value ? parseIcsDate(endField.value, endField.params) : null;
      const uid = String(event.UID?.value || `ical-${index}-${start.date.toISOString()}`);

      return {
        uid,
        title: String(event.SUMMARY?.value || "Blocked time"),
        description: String(event.DESCRIPTION?.value || "Imported from external iCal feed"),
        location: String(event.LOCATION?.value || ""),
        startTime: start.date.toISOString(),
        endTime: (end?.date ?? new Date(start.date.getTime() + 60 * 60 * 1000)).toISOString(),
        allDay: start.allDay,
        timezone: start.timezone,
      };
    })
    .filter(Boolean) as Array<{
      uid: string;
      title: string;
      description: string;
      location: string;
      startTime: string;
      endTime: string;
      allDay: boolean;
      timezone: string;
    }>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("SYNC_CALENDAR_SECRET");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: "Supabase admin is not configured in function env" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (cronSecret) {
      const headerSecret = req.headers.get("x-cron-secret");
      if (headerSecret !== cronSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: boats, error } = await supabase
      .from("boats")
      .select("id, owner_id, name, external_calendar_url")
      .not("external_calendar_url", "is", null);

    if (error) {
      throw new Error(error.message || "Failed to load boats for iCal sync");
    }

    const syncableBoats = Array.isArray(boats) ? boats : [];
    let imported = 0;
    let skipped = 0;

    for (const boat of syncableBoats) {
      if (!boat.external_calendar_url) {
        skipped += 1;
        continue;
      }

      const response = await fetch(boat.external_calendar_url, {
        headers: { Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.8" },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch iCal feed for ${boat.name}: ${response.status} ${response.statusText}`);
      }

      const feedText = await response.text();
      const events = parseFeed(feedText);

      await supabase
        .from("calendar_events")
        .delete()
        .eq("boat_id", boat.id)
        .eq("external_source", "ical");

      if (events.length === 0) {
        skipped += 1;
        continue;
      }

      const rows = events.map((event) => ({
        user_id: boat.owner_id,
        boat_id: boat.id,
        title: event.title,
        description: event.description,
        location: event.location || null,
        start_time: event.startTime,
        end_time: event.endTime,
        all_day: event.allDay,
        timezone: event.timezone,
        event_type: "blocked",
        external_source: "ical",
        external_source_uid: event.uid,
        external_source_url: boat.external_calendar_url,
      }));

      const { error: insertError } = await supabase.from("calendar_events").insert(rows);
      if (insertError) {
        throw new Error(insertError.message || `Failed to insert imported events for ${boat.name}`);
      }

      imported += rows.length;
    }

    return new Response(
      JSON.stringify({ ok: true, imported, syncedBoats: syncableBoats.length, skipped }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
