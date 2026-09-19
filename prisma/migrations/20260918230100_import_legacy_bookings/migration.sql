-- Phase 3.3: carry classic 8-type "bookings" into the operational tables.
--   flight / train / bus  -> tickets + ticket_segments + ticket_passengers
--   hotel                 -> hotel_bookings      (only when linked to a trip)
--   cab                   -> vehicle_assignments (only when linked to a trip and dated)
--   activity              -> activity_bookings   (only when linked to a trip and dated)
--   visa / insurance / other stay on the classic screen (no v2 home yet).
--
-- Additive and idempotent: the classic rows are never changed; every new row
-- carries legacyBookingId, so re-running skips what is already imported and
-- picks up bookings made on the classic screen since. The same function is
-- called hourly by the legacy.bookings-import job and from Tickets →
-- "Import from classic".
--
-- Reverse (if ever needed), per organisation:
--   DELETE FROM "tickets"             WHERE "legacyBookingId" IS NOT NULL;  -- segments + passenger rows cascade
--   DELETE FROM "hotel_bookings"      WHERE "legacyBookingId" IS NOT NULL;
--   DELETE FROM "vehicle_assignments" WHERE "legacyBookingId" IS NOT NULL;
--   DELETE FROM "activity_bookings"   WHERE "legacyBookingId" IS NOT NULL;

-- IST wall clock (date + optional HH:MM) -> instant; NULL when unreadable.
CREATE OR REPLACE FUNCTION travelos_ist(d text, t text) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF d IS NULL OR d !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN ((d || ' ' || CASE WHEN coalesce(t, '') ~ '^\d{1,2}:\d{2}' THEN substring(t from '^\d{1,2}:\d{2}') ELSE '00:00' END)::timestamp AT TIME ZONE 'Asia/Kolkata');
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION travelos_day(d text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF d IS NULL OR d !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN d::date;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION travelos_int(v text, fallback int) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(v, '') ~ '^\s*\d{1,5}\s*$' THEN trim(v)::int ELSE fallback END
$$;

CREATE OR REPLACE FUNCTION travelos_import_legacy_bookings(org text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  b record; leg jsonb; d jsonb;
  tid text; sid text; seq int; k int;
  names text[]; traveller_ids text[]; nm text; tv text;
  trip_ok boolean; cust text; total numeric; fee numeric; feegst numeric;
  tstatus text; pstatus text; ostatus text; astatus text;
  dep timestamptz; arr timestamptz; ci date; co date;
  notes text;
  c_tickets int := 0; c_hotels int := 0; c_vehicles int := 0; c_activities int := 0; c_skipped int := 0;
BEGIN
  FOR b IN
    SELECT * FROM "bookings" bk
    WHERE bk."organizationId" = org
      AND lower(bk."type") IN ('flight', 'train', 'bus', 'hotel', 'cab', 'activity')
      AND NOT EXISTS (SELECT 1 FROM "tickets" x WHERE x."organizationId" = org AND x."legacyBookingId" = bk."id")
      AND NOT EXISTS (SELECT 1 FROM "hotel_bookings" x WHERE x."organizationId" = org AND x."legacyBookingId" = bk."id")
      AND NOT EXISTS (SELECT 1 FROM "vehicle_assignments" x WHERE x."organizationId" = org AND x."legacyBookingId" = bk."id")
      AND NOT EXISTS (SELECT 1 FROM "activity_bookings" x WHERE x."organizationId" = org AND x."legacyBookingId" = bk."id")
    ORDER BY bk."createdAt"
  LOOP
    d := coalesce(b."detail", '{}'::jsonb);
    trip_ok := b."refId" IS NOT NULL AND EXISTS (SELECT 1 FROM "trips" t WHERE t."id" = b."refId" AND t."organizationId" = org);
    cust := CASE WHEN b."customerId" IS NOT NULL AND EXISTS (SELECT 1 FROM "customers" c WHERE c."id" = b."customerId" AND c."organizationId" = org) THEN b."customerId" END;
    total := coalesce(b."totalPayable", b."sellingPrice", 0);
    notes := 'Imported from classic booking ' || b."id" || CASE WHEN coalesce(b."notes", '') <> '' THEN '. Notes: ' || b."notes" ELSE '' END;

    -- ── Tickets ─────────────────────────────────────────────
    IF lower(b."type") IN ('flight', 'train', 'bus') THEN
      tstatus := CASE lower(b."status") WHEN 'pending' THEN 'REQUESTED' WHEN 'cancelled' THEN 'CANCELLED' WHEN 'rejected' THEN 'CANCELLED' ELSE 'CONFIRMED' END;
      pstatus := CASE tstatus WHEN 'REQUESTED' THEN 'PENDING' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'CONFIRMED' END;
      fee := coalesce(b."convenienceFee", 0);
      feegst := coalesce(b."gstOnFee", 0);
      IF lower(b."type") = 'train' AND (coalesce(d->>'seatNumbers', '') <> '' OR coalesce(d->>'coachNumber', '') <> '') THEN
        notes := notes || '. Classic seats: ' || coalesce(nullif(d->>'coachNumber', '') || ' ', '') || coalesce(d->>'seatNumbers', '');
      ELSIF lower(b."type") = 'bus' AND coalesce(d->>'seatNumbers', '') <> '' THEN
        notes := notes || '. Classic seats: ' || (d->>'seatNumbers');
      END IF;
      tid := 'tkt_legacy_' || b."id";
      INSERT INTO "tickets" ("id", "organizationId", "displayNumber", "tripId", "customerId", "mode", "status", "pnr", "carrier", "travelClass",
        "baseFare", "taxes", "otherCharges", "serviceFee", "serviceFeeGst", "totalFare", "costAmount", "currency", "chartPrepared",
        "internalNotes", "legacyBookingId", "bookedAt", "cancelledAt", "createdAt", "updatedAt")
      VALUES (tid, org, b."id", CASE WHEN trip_ok THEN b."refId" END, cust, upper(b."type")::"TicketMode", tstatus::"TicketStatus",
        nullif(upper(coalesce(d->>'pnr', '')), ''),
        CASE lower(b."type") WHEN 'flight' THEN nullif(d->>'airline', '') WHEN 'train' THEN nullif(d->>'trainName', '') ELSE nullif(d->>'operatorName', '') END,
        CASE lower(b."type") WHEN 'train' THEN nullif(d->>'travelClass', '') WHEN 'bus' THEN nullif(d->>'busType', '') END,
        greatest(total - fee - feegst, 0), 0, 0, fee, feegst, total, coalesce(b."supplierCost", 0), 'INR', false,
        notes, b."id", CASE WHEN tstatus = 'CONFIRMED' THEN b."createdAt" END, CASE WHEN tstatus = 'CANCELLED' THEN b."updatedAt" END, b."createdAt", NOW());

      -- Passengers: linked travellers first, else the free-text names on flight bookings.
      SELECT array_agg(p."id" ORDER BY o.ord), array_agg(trim(p."firstName" || ' ' || p."lastName") ORDER BY o.ord)
        INTO traveller_ids, names
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(b."passengerIds") = 'array' THEN b."passengerIds" ELSE '[]'::jsonb END) WITH ORDINALITY AS o(pid, ord)
        JOIN "passengers" p ON p."id" = o.pid AND p."organizationId" = org;
      IF names IS NULL AND coalesce(d->>'passengerNames', '') <> '' THEN
        traveller_ids := NULL;
        SELECT array_agg(trim(x)) INTO names FROM regexp_split_to_table(d->>'passengerNames', E'[\\n,;]+') AS x WHERE trim(x) <> '';
      END IF;

      seq := 0;
      FOR leg IN
        SELECT e FROM jsonb_array_elements(CASE WHEN lower(b."type") = 'flight' AND jsonb_typeof(d->'legs') = 'array' AND jsonb_array_length(d->'legs') > 0 THEN d->'legs' ELSE jsonb_build_array(d) END) AS e
      LOOP
        seq := seq + 1;
        sid := 'tks_legacy_' || b."id" || '_' || seq;
        IF lower(b."type") = 'flight' THEN
          dep := travelos_ist(leg->>'departDate', leg->>'departTime'); arr := travelos_ist(leg->>'arrivalDate', leg->>'arrivalTime');
          INSERT INTO "ticket_segments" ("id", "organizationId", "ticketId", "seq", "carrierNumber", "carrierName", "fromName", "toName", "departAt", "arriveAt", "terminal", "baggage", "createdAt", "updatedAt")
          VALUES (sid, org, tid, seq, nullif(leg->>'flightNumber', ''), nullif(leg->>'airline', ''), coalesce(nullif(leg->>'origin', ''), 'Not recorded'), coalesce(nullif(leg->>'destination', ''), 'Not recorded'),
            dep, CASE WHEN arr > dep THEN arr END, nullif(leg->>'terminal', ''), nullif(coalesce(leg->>'baggageAllowance', ''), ''), NOW(), NOW());
        ELSIF lower(b."type") = 'train' THEN
          dep := travelos_ist(leg->>'departure', leg->>'departureTime'); arr := travelos_ist(leg->>'arrival', leg->>'arrivalTime');
          INSERT INTO "ticket_segments" ("id", "organizationId", "ticketId", "seq", "carrierNumber", "carrierName", "fromName", "toName", "departAt", "arriveAt", "travelClass", "boardingPoint", "createdAt", "updatedAt")
          VALUES (sid, org, tid, seq, nullif(leg->>'trainNumber', ''), nullif(leg->>'trainName', ''), coalesce(nullif(leg->>'fromStation', ''), 'Not recorded'), coalesce(nullif(leg->>'toStation', ''), 'Not recorded'),
            dep, CASE WHEN arr > dep THEN arr END, nullif(leg->>'travelClass', ''), nullif(leg->>'fromStation', ''), NOW(), NOW());
        ELSE
          dep := travelos_ist(leg->>'travelDate', leg->>'departureTime'); arr := travelos_ist(leg->>'travelDate', leg->>'arrivalTime');
          IF arr IS NOT NULL AND dep IS NOT NULL AND arr <= dep THEN arr := arr + interval '1 day'; END IF;
          INSERT INTO "ticket_segments" ("id", "organizationId", "ticketId", "seq", "carrierNumber", "carrierName", "fromName", "toName", "departAt", "arriveAt", "travelClass", "boardingPoint", "droppingPoint", "createdAt", "updatedAt")
          VALUES (sid, org, tid, seq, nullif(leg->>'busNumber', ''), nullif(leg->>'operatorName', ''), coalesce(nullif(leg->>'from', ''), 'Not recorded'), coalesce(nullif(leg->>'to', ''), 'Not recorded'),
            dep, arr, nullif(leg->>'busType', ''), nullif(leg->>'boardingPoint', ''), nullif(leg->>'droppingPoint', ''), NOW(), NOW());
        END IF;
        IF names IS NOT NULL THEN
          FOR k IN 1 .. array_length(names, 1) LOOP
            nm := names[k];
            tv := CASE WHEN traveller_ids IS NOT NULL THEN traveller_ids[k] END;
            INSERT INTO "ticket_passengers" ("id", "organizationId", "ticketId", "segmentId", "paxIndex", "travellerId", "name", "paxType", "status", "createdAt", "updatedAt")
            VALUES ('tkp_legacy_' || b."id" || '_' || seq || '_' || k, org, tid, sid, k - 1, tv, nm, 'ADULT', pstatus::"PassengerStatus", NOW(), NOW());
          END LOOP;
        END IF;
      END LOOP;
      c_tickets := c_tickets + 1;

    -- ── Hotel ───────────────────────────────────────────────
    ELSIF lower(b."type") = 'hotel' THEN
      ci := travelos_day(d->>'checkIn'); co := travelos_day(d->>'checkOut');
      IF NOT trip_ok OR ci IS NULL OR co IS NULL OR co <= ci THEN c_skipped := c_skipped + 1; CONTINUE; END IF;
      ostatus := CASE lower(b."status") WHEN 'pending' THEN 'REQUESTED' WHEN 'cancelled' THEN 'CANCELLED' ELSE 'CONFIRMED' END;
      INSERT INTO "hotel_bookings" ("id", "organizationId", "tripId", "hotelName", "city", "roomTypeName", "mealPlan", "checkIn", "checkOut", "rooms", "adults", "children",
        "travellerIds", "status", "confirmationNo", "costAmount", "sellAmount", "internalNotes", "legacyBookingId", "confirmedAt", "createdAt", "updatedAt")
      VALUES ('htb_legacy_' || b."id", org, b."refId", coalesce(nullif(d->>'hotelName', ''), 'Hotel (classic booking)'), nullif(d->>'city', ''), nullif(d->>'roomType', ''),
        CASE WHEN upper(coalesce(d->>'mealPlan', '')) IN ('EP', 'CP', 'MAP', 'AP', 'AI') THEN upper(d->>'mealPlan')::"MealPlan" END, ci, co,
        travelos_int(d->>'rooms', 1), travelos_int(d->>'guests', 2), 0, CASE WHEN jsonb_typeof(b."passengerIds") = 'array' THEN b."passengerIds" ELSE '[]'::jsonb END,
        ostatus::"OpsStatus", nullif(d->>'confirmationNumber', ''), coalesce(b."supplierCost", 0), total, notes, b."id", CASE WHEN ostatus = 'CONFIRMED' THEN b."createdAt" END, b."createdAt", NOW());
      c_hotels := c_hotels + 1;

    -- ── Cab ─────────────────────────────────────────────────
    ELSIF lower(b."type") = 'cab' THEN
      dep := travelos_ist(d->>'pickupDate', d->>'pickupTime');
      IF NOT trip_ok OR dep IS NULL THEN c_skipped := c_skipped + 1; CONTINUE; END IF;
      astatus := CASE lower(b."status") WHEN 'pending' THEN 'REQUESTED' WHEN 'cancelled' THEN 'CANCELLED' WHEN 'completed' THEN 'COMPLETED' ELSE 'CONFIRMED' END;
      INSERT INTO "vehicle_assignments" ("id", "organizationId", "tripId", "vehicleType", "vehicleRegNo", "driverName", "driverPhone", "startAt", "endAt", "pickupPoint", "dropPoint",
        "pax", "status", "costAmount", "sellAmount", "internalNotes", "legacyBookingId", "createdAt", "updatedAt")
      VALUES ('vha_legacy_' || b."id", org, b."refId", nullif(d->>'vehicleType', ''), nullif(d->>'cabNumber', ''), nullif(d->>'driverName', ''), nullif(d->>'driverPhone', ''),
        dep, dep + interval '8 hours', nullif(d->>'pickup', ''), nullif(d->>'drop', ''), 0, astatus::"AssignmentStatus", coalesce(b."supplierCost", 0), total,
        notes || '. The classic booking had no end time: 8 hours after pickup is assumed — correct it here.', b."id", b."createdAt", NOW());
      c_vehicles := c_vehicles + 1;

    -- ── Activity ────────────────────────────────────────────
    ELSE
      ci := travelos_day(d->>'date');
      IF NOT trip_ok OR ci IS NULL THEN c_skipped := c_skipped + 1; CONTINUE; END IF;
      ostatus := CASE lower(b."status") WHEN 'pending' THEN 'REQUESTED' WHEN 'cancelled' THEN 'CANCELLED' ELSE 'CONFIRMED' END;
      INSERT INTO "activity_bookings" ("id", "organizationId", "tripId", "name", "city", "date", "time", "adults", "children", "status", "confirmationNo",
        "costAmount", "sellAmount", "internalNotes", "legacyBookingId", "confirmedAt", "createdAt", "updatedAt")
      VALUES ('acb_legacy_' || b."id", org, b."refId", coalesce(nullif(d->>'activityName', ''), 'Activity (classic booking)'), nullif(d->>'location', ''), ci,
        CASE WHEN coalesce(d->>'time', '') ~ '^([01]?\d|2[0-3]):[0-5]\d$' THEN d->>'time' END, travelos_int(d->>'pax', 1), 0, ostatus::"OpsStatus",
        nullif(d->>'confirmationNumber', ''), coalesce(b."supplierCost", 0), total, notes, b."id", CASE WHEN ostatus = 'CONFIRMED' THEN b."createdAt" END, b."createdAt", NOW());
      c_activities := c_activities + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('tickets', c_tickets, 'hotels', c_hotels, 'vehicles', c_vehicles, 'activities', c_activities, 'skipped', c_skipped);
END $$;

-- Import everything that exists now.
SELECT travelos_import_legacy_bookings("id") FROM "organizations";
