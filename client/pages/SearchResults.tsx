import Layout from "@/components/layout/Layout";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { performSearch } from "@/lib/search";
import {
  consumeSearchCredit,
  computeRemaining,
  isFirestorePermissionDenied,
} from "@/lib/user";
import { toast } from "sonner";

export default function SearchResults() {
  const [params] = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;

  useEffect(() => {
    setQuery(initialQ);
  }, [initialQ]);

  const remaining = computeRemaining(profile);

  useEffect(() => {
    if (!initialQ.trim()) return;
    if (
      (location as any).state &&
      (location as any).state.result !== undefined
    ) {
      setResult((location as any).state.result);
      return;
    }
    void onSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  async function onSearch() {
    if (!query.trim()) return;
    if (!user) {
      toast.error("Please sign in to search.");
      setTimeout(() => navigate("/auth"), 2000);
      return;
    }
    if (!Number.isFinite(remaining) || remaining <= 0) {
      toast.error("No searches remaining. Please purchase more.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const { data, hasResults } = await performSearch(query);
      setResult(data);

      if (hasResults) {
        try {
          await consumeSearchCredit(user.uid, 1);
        } catch (creditError) {
          if (isFirestorePermissionDenied(creditError)) {
            console.warn(
              "Skipping credit consumption due to permission error.",
              creditError,
            );
          } else {
            throw creditError;
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Search error.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <section className="relative py-10 md:py-14">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.brand.500/10),transparent_50%)]" />
        <div className="container mx-auto">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                Search Results
              </h1>
              <p className="mt-2 text-foreground/70">
                Clean, readable results with your site’s styling.
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-lg shadow-brand-500/10 ring-1 ring-brand-500/10 backdrop-blur">
                <Input
                  placeholder="Enter an email, phone, IP, domain, keyword…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSearch();
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-foreground/60">
                  Remaining:{" "}
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {remaining}
                  </span>
                </div>
                <Button onClick={onSearch} disabled={loading} className="h-10">
                  {loading ? "Searching…" : "Search"}
                </Button>
              </div>
            </div>

            <div className="mt-8">
              {result == null ? (
                <div className="text-center text-sm text-foreground/60">
                  Results will appear here.
                </div>
              ) : (
                <ResultRenderer data={result} />
              )}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function ResultRenderer({ data }: { data: any }) {
  if (typeof data === "string") {
    return (
      <pre className="overflow-auto rounded-2xl border border-border bg-card/80 p-4 text-left whitespace-pre-wrap shadow ring-1 ring-brand-500/10">
        {data}
      </pre>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <Empty />;
    }
    const isObjectArray = data.every((it) => it && typeof it === "object");
    if (!isObjectArray) {
      return (
        <pre className="overflow-auto rounded-2xl border border-border bg-card/80 p-4 text-left whitespace-pre-wrap shadow ring-1 ring-brand-500/10">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
    }
    return (
      <div className="grid gap-3">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-border bg-card/80 p-4 shadow ring-1 ring-brand-500/10"
          >
            <KeyValueGrid obj={item} />
          </div>
        ))}
      </div>
    );
  }

  if (data && typeof data === "object") {
    // Filter out meta keys and render source blocks
    const hiddenKeys = new Set([
      "NumOfResults",
      "NumOfDatabase",
      "NumOfDatabases",
      "price",
      "search time",
      "search_time",
    ]);
    const entries = Object.entries(data as Record<string, any>);
    const visibleEntries = entries.filter(([k]) => !hiddenKeys.has(k));

    const looksLikeAggregate = visibleEntries.some(([, v]) =>
      v && typeof v === "object" && ("Data" in v || "InfoLeak" in v),
    );

    if (looksLikeAggregate) {
      return (
        <div className="grid gap-4">
          {visibleEntries.map(([source, block]) => (
            <SourceBlock key={source} name={source} value={block} />
          ))}
        </div>
      );
    }

    // Generic object fallback (without metadata)
    const filtered: Record<string, any> = Object.fromEntries(visibleEntries);
    return (
      <div className="rounded-2xl border border-border bg-card/80 p-4 shadow ring-1 ring-brand-500/10">
        <KeyValueGrid obj={filtered} />
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded-2xl border border-border bg-card/80 p-4 text-left whitespace-pre-wrap shadow ring-1 ring-brand-500/10">
      {String(data)}
    </pre>
  );
}

function KeyValueGrid({ obj }: { obj: Record<string, any> }) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return <Empty />;
  return (
    <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-[0.95rem] leading-relaxed">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-3 gap-2 items-start">
          <div className="col-span-1 text-foreground/60 break-words font-semibold">{k}</div>
          <div className="col-span-2 break-words font-medium">
            {typeof v === "object" ? (
              <pre className="rounded border border-border bg-background/50 p-2 text-sm whitespace-pre-wrap">
                {JSON.stringify(v, null, 2)}
              </pre>
            ) : (
              String(v)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceBlock({ name, value }: { name: string; value: any }) {
  const count =
    value && typeof value === "object" && typeof value.NumOfResults === "number"
      ? value.NumOfResults
      : Array.isArray(value?.Data)
        ? value.Data.length
        : undefined;
  const info = value && typeof value === "object" ? value.InfoLeak : undefined;
  const dataArray = Array.isArray(value?.Data) ? (value.Data as any[]) : null;

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 md:p-6 shadow ring-1 ring-brand-500/10">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl md:text-2xl font-extrabold tracking-tight">{name}</h3>
        {typeof count === "number" && (
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{count}</span>
        )}
      </div>
      {typeof info === "string" && info.trim() && (
        <p className="mt-2 text-sm font-semibold text-foreground/70">{info}</p>
      )}

      {dataArray ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {dataArray.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-border bg-background/40 p-3">
              {item && typeof item === "object" ? (
                <KeyValueGrid obj={item} />
              ) : (
                <div className="text-sm font-medium">{String(item)}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          {value && typeof value === "object" ? (
            <KeyValueGrid obj={value} />
          ) : (
            <div className="text-sm font-medium">{String(value)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="text-center text-sm text-foreground/60">
      No results found.
    </div>
  );
}
