// Server-side Raya Voice AI client. RAYA_API_KEY is read from process.env
// inside .handler() and never sent to the browser.

import { createServerFn } from "@tanstack/react-start";
import { delay, rayaFetch, RayaApiError, fetchAllRayaAgents } from "./raya-api";

export interface RayaContact {
  contact_name: string;
  contact_phone: string;
  country_code: string;
  [extra: string]: any;
}

export interface RayaSchedule {
  timezone: string; // IANA, e.g. "Asia/Kolkata"
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  days: number[]; // 1=Mon … 7=Sun
}

// ---------- createBatch ----------
export const rayaCreateBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { agentId: string; batchName: string; contacts: RayaContact[] }) => {
      if (!data.agentId) throw new Error("Missing agent id for this program. Set it in Settings.");
      if (!data.batchName) throw new Error("Missing batch name.");
      if (!Array.isArray(data.contacts) || data.contacts.length === 0)
        throw new Error("No contacts to send.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const body = {
      agent_id: data.agentId,
      batch_name: data.batchName,
      contacts: data.contacts,
    };
    let res: any;
    try {
      res = await rayaFetch("/batch", { method: "POST", json: body });
    } catch (e) {
      // Raya 400 validation: { status:"error", message, errors:[{row,field,...}] }
      if (e instanceof RayaApiError && e.body && typeof e.body === "object") {
        const b = e.body as Record<string, any>;
        if (b.status === "error" || Array.isArray(b.errors)) {
          return {
            ok: false as const,
            batchId: null,
            validation: {
              message: b.message ?? "Validation failed",
              totalRows: b.totalRows,
              validRows: b.validRows,
              invalidRows: b.invalidRows,
              errors: Array.isArray(b.errors) ? b.errors : [],
            },
          };
        }
      }
      throw e;
    }

    const r = (res ?? {}) as Record<string, any>;
    // Raya success uses camelCase `batchId` (number). Fall back to other common keys.
    const rawId =
      r.batchId ??
      r.batch_id ??
      r.id ??
      r.data?.batchId ??
      r.data?.batch_id ??
      r.data?.id ??
      r.batch?.id ??
      r.batch?.batchId;

    if (r.status === "error" || (!rawId && typeof r.invalidRows === "number" && r.invalidRows > 0)) {
      return {
        ok: false as const,
        batchId: null,
        validation: {
          message: r.message ?? "Validation failed",
          totalRows: r.totalRows,
          validRows: r.validRows,
          invalidRows: r.invalidRows,
          errors: Array.isArray(r.errors) ? r.errors : [],
        },
      };
    }

    if (!rawId) throw new Error("Raya did not return a batchId.");

    return {
      ok: true as const,
      batchId: String(rawId),
      totalRows: r.totalRows,
      validRows: r.validRows,
      invalidRows: r.invalidRows,
      contactsInserted: r.contactsInserted,
      message: r.message,
    };
  });

// ---------- startBatch ----------
export const rayaStartBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      batchId: string;
      schedule?: RayaSchedule;
      maxRetries?: number;
      retryAfterHrs?: number;
      concurrency?: number;
      selectedStatuses?: string[];
    }) => {
      if (!data.batchId) throw new Error("Missing batch id.");
      if (data.schedule) {
        const s = data.schedule;
        if (!s.start_time || !s.end_time) throw new Error("Schedule requires start_time and end_time.");
        if (s.start_time >= s.end_time) throw new Error("end_time must be after start_time.");
        if (!Array.isArray(s.days) || s.days.length === 0)
          throw new Error("Pick at least one day of the week.");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    await delay(1_500);
    const body: Record<string, any> = {};
    if (data.schedule) body.schedule = data.schedule;
    if (typeof data.maxRetries === "number") body.max_retries = data.maxRetries;
    if (typeof data.retryAfterHrs === "number") body.retry_after_hrs = data.retryAfterHrs;
    if (typeof data.concurrency === "number") body.concurrency = data.concurrency;
    // Raya requires selected_statuses on /batch/:id/start. Default to ["Pending"]
    // which dials freshly-uploaded contacts. Including "Unanswered"/"Failed"
    // immediately re-calls those contacts (resume mode).
    body.selected_statuses =
      data.selectedStatuses && data.selectedStatuses.length ? data.selectedStatuses : ["Pending"];
    return (await rayaFetch(`/batch/${encodeURIComponent(data.batchId)}/start`, {
      method: "POST",
      json: body,
    })) as Record<string, any>;
  });

// ---------- listAgents ----------
export const rayaListAgents = createServerFn({ method: "GET" })
  .inputValidator((data: { page?: number; pageSize?: number }) => data)
  .handler(async ({ data }) => fetchAllRayaAgents(
    (path) => rayaFetch(path, { method: "GET" }, { maxAttempts: 1 }),
    data.pageSize,
  ));

// ---------- validateContacts (no Raya call — pure validation) ----------
export const validateContacts = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { headers: string[]; rows: string[][] }) => {
      if (!Array.isArray(data.headers)) throw new Error("headers required");
      if (!Array.isArray(data.rows)) throw new Error("rows required");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const lc = data.headers.map((h) => h.trim().toLowerCase());
    const find = (cands: string[]) => {
      for (const c of cands) {
        const i = lc.indexOf(c.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };
    const nameIdx = find(["contact_name", "name", "seeker_name", "candidate_name"]);
    const phoneIdx = find(["contact_phone", "phone", "mobile", "phone_number"]);
    const ccIdx = find(["country_code", "cc"]);

    const missingCols: string[] = [];
    if (nameIdx < 0) missingCols.push("contact_name");
    if (phoneIdx < 0) missingCols.push("contact_phone");

    interface Problem { row: number; reason: string; phone?: string; name?: string }
    const problems: Problem[] = [];
    const validRows: { name: string; phone: string; cc: string; extras: Record<string, string>; rowIndex: number }[] = [];
    const seen = new Map<string, number>();

    if (missingCols.length === 0) {
      data.rows.forEach((r, i) => {
        const rowNum = i + 2; // header is row 1
        const name = (r[nameIdx] ?? "").trim();
        const rawPhone = (r[phoneIdx] ?? "").trim();
        const cc = ccIdx >= 0 ? (r[ccIdx] ?? "").replace(/[^\d]/g, "") || "91" : "91";
        if (!name) { problems.push({ row: rowNum, reason: "missing contact_name" }); return; }
        if (!rawPhone) { problems.push({ row: rowNum, reason: "missing contact_phone", name }); return; }
        let digits = rawPhone.replace(/[^\d]/g, "");
        // strip country code if present at start
        if (digits.startsWith(cc) && digits.length > 10) digits = digits.slice(cc.length);
        if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
          problems.push({ row: rowNum, reason: `invalid phone: ${rawPhone}`, name });
          return;
        }
        const dupRow = seen.get(digits);
        if (dupRow !== undefined) {
          problems.push({ row: rowNum, reason: `duplicate of row ${dupRow}`, phone: digits, name });
          return;
        }
        seen.set(digits, rowNum);
        const extras: Record<string, string> = {};
        data.headers.forEach((h, j) => {
          if (j === nameIdx || j === phoneIdx || j === ccIdx) return;
          if (!h) return;
          extras[h] = r[j] ?? "";
        });
        validRows.push({ name, phone: digits, cc, extras, rowIndex: rowNum });
      });
    }

    return {
      total: data.rows.length,
      valid: validRows.length,
      invalid: problems.length,
      missingCols,
      problems: problems.slice(0, 500),
      validRows,
    };
  });


// ---------- updateBatch ----------
export const rayaUpdateBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      batchId: string;
      name?: string;
      schedule?: RayaSchedule;
      maxRetries?: number;
      retryAfterHrs?: number;
      concurrency?: number;
    }) => {
      if (!data.batchId) throw new Error("Missing batch id.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const body: Record<string, any> = {};
    if (data.name) body.name = data.name;
    if (data.schedule) body.schedule = data.schedule;
    if (typeof data.maxRetries === "number") body.max_retries = data.maxRetries;
    if (typeof data.retryAfterHrs === "number") body.retry_after_hrs = data.retryAfterHrs;
    if (typeof data.concurrency === "number") body.concurrency = data.concurrency;
    return (await rayaFetch(`/batch/${encodeURIComponent(data.batchId)}`, {
      method: "PATCH",
      json: body,
    })) as Record<string, any>;
  });

// ---------- stopBatch ----------
export const rayaStopBatch = createServerFn({ method: "POST" })
  .inputValidator((data: { batchId: string }) => {
    if (!data.batchId) throw new Error("Missing batch id.");
    return data;
  })
  .handler(async ({ data }) => {
    return (await rayaFetch(`/batch/${encodeURIComponent(data.batchId)}/stop`, {
      method: "POST",
      json: {},
    })) as Record<string, any>;
  });

// ---------- listBatches ----------
export const rayaListBatches = createServerFn({ method: "GET" })
  .inputValidator((data: { agentId?: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data }) => {
    const qs = new URLSearchParams();
    if (data.agentId) qs.set("agent_id", data.agentId);
    if (data.page) qs.set("page", String(data.page));
    if (data.pageSize) qs.set("page_size", String(data.pageSize));
    const q = qs.toString();
    const res = await rayaFetch(`/batch${q ? `?${q}` : ""}`, { method: "GET" });
    return res as Record<string, any>;
  });

// ---------- getBatchContacts ----------
export const rayaGetBatchContacts = createServerFn({ method: "GET" })
  .inputValidator((data: { batchId: string; page?: number; pageSize?: number }) => {
    if (!data.batchId) throw new Error("Missing batch id.");
    return data;
  })
  .handler(async ({ data }) => {
    const qs = new URLSearchParams();
    if (data.page) qs.set("page", String(data.page));
    if (data.pageSize) qs.set("page_size", String(data.pageSize));
    const q = qs.toString();
    return (await rayaFetch(
      `/batch/${encodeURIComponent(data.batchId)}/contacts${q ? `?${q}` : ""}`,
      { method: "GET" },
    )) as Record<string, any>;
  });

// ---------- initiateCall ----------
export const rayaInitiateCall = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      agentId: string;
      toNumber: string;
      countryCode?: string;
      agentArgs?: Record<string, any>;
    }) => {
      if (!data.agentId) throw new Error("Missing agent id.");
      if (!data.toNumber) throw new Error("Missing phone number.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const body = {
      agent_id: data.agentId,
      to_number: data.toNumber,
      country_code: data.countryCode ?? "91",
      agent_args: data.agentArgs ?? {},
    };
    return (await rayaFetch("/call", { method: "POST", json: body })) as Record<string, any>;
  });

// ---------- key status (does not expose the key) ----------
export const rayaKeyStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: Boolean(process.env.RAYA_API_KEY) };
});
