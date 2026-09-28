import "server-only";
import { Document, Line, Page, Path, Rect, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReportData } from "./exports";
import { LANE_LABEL } from "./filters";
import { change, int, money, pct, rate, tickLabel } from "./format";

/*
 * The founder report as a PDF: the period's headline numbers with their
 * change, visitors and revenue over time, the funnel, lanes, top spots and
 * what needs attention. For investor updates and the monthly close.
 */

const INK = "#1c1b18",
  INK2 = "#5d5a52",
  INK3 = "#8b877d",
  LINE = "#e4e1da",
  S1 = "#2a78d6",
  S3 = "#1baf7a",
  PINK = "#ff7bc3",
  GOOD = "#15803d",
  BAD = "#c92a2a";

const st = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9.5, color: INK, backgroundColor: "#fcfcfb" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, paddingBottom: 12, borderBottom: `1pt solid ${LINE}` },
  brand: { fontFamily: "Times-Bold", fontSize: 20 },
  kicker: { fontSize: 8, color: INK3, letterSpacing: 1, textTransform: "uppercase", marginTop: 3 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 8, marginTop: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  kpi: { width: "33.33%", padding: 4 },
  kpiIn: { border: `1pt solid ${LINE}`, borderRadius: 6, padding: 10, backgroundColor: "#ffffff" },
  kLabel: { fontSize: 8.5, color: INK2 },
  kValue: { fontFamily: "Helvetica-Bold", fontSize: 18, marginTop: 4 },
  kSub: { fontSize: 8, color: INK3, marginTop: 3 },
  row: { flexDirection: "row", borderBottom: `0.5pt solid ${LINE}`, paddingVertical: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: INK2 },
  td: { fontSize: 8.5 },
  foot: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: INK3 },
});

function Kpi({ label, value, now, prev, kind = "count" }: { label: string; value: string; now: number | null; prev: number | null | undefined; kind?: "count" | "rate" | "money" }) {
  const c = change(now, prev, kind);
  return (
    <View style={st.kpi}>
      <View style={st.kpiIn}>
        <Text style={st.kLabel}>{label}</Text>
        <Text style={st.kValue}>{value}</Text>
        <Text style={[st.kSub, c ? { color: c.value >= 0 ? GOOD : BAD } : {}]}>{c ? `${c.label} vs previous period` : "no earlier period"}</Text>
      </View>
    </View>
  );
}

function Chart({ labels, values, color, money: isMoney, bucket }: { labels: string[]; values: number[]; color: string; money?: boolean; bucket: "hour" | "day" }) {
  const W = 250,
    H = 120,
    L = 30,
    B = 14;
  const max = Math.max(1, ...values) * 1.1;
  const x = (i: number) => L + (values.length <= 1 ? 0 : (i * (W - L - 4)) / (values.length - 1));
  const y = (v: number) => H - B - (v / max) * (H - B - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((k) => k * max);
  const every = Math.max(1, Math.ceil(labels.length / 4));
  return (
    <Svg width={W} height={H}>
      {ticks.map((t, k) => (
        <Line key={k} x1={L} x2={W} y1={y(t)} y2={y(t)} strokeWidth={0.5} stroke={LINE} />
      ))}
      {ticks.map((t, k) => (
        <Text key={"t" + k} x={L - 4} y={y(t) + 2.5} style={{ fontSize: 6.5, color: INK3 }} textAnchor="end">
          {isMoney ? money(t) : int(t)}
        </Text>
      ))}
      {labels.map((l, i) =>
        i % every === 0 ? (
          <Text key={l} x={x(i)} y={H - 3} style={{ fontSize: 6.5, color: INK3 }} textAnchor="middle">
            {tickLabel(l, bucket)}
          </Text>
        ) : null,
      )}
      <Path d={d} stroke={color} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

function Funnel({ steps }: { steps: [string, number][] }) {
  const top = Math.max(1, steps[0][1]);
  return (
    <View>
      {steps.map(([label, n], i) => (
        <View key={label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ width: 70, fontSize: 8.5 }}>{label}</Text>
          <Svg width={240} height={10}>
            <Rect x={0} y={0} width={240} height={10} rx={2} fill="#eeece7" />
            <Rect x={0} y={0} width={Math.max(1, (240 * n) / top)} height={10} rx={2} fill={S1} />
          </Svg>
          <Text style={{ width: 60, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>{int(n)}</Text>
          <Text style={{ width: 90, textAlign: "right", fontSize: 7.5, color: INK3 }}>{i ? `${pct(rate(n, steps[i - 1][1]))} of previous` : "people"}</Text>
        </View>
      ))}
    </View>
  );
}

function Table({ cols, rows }: { cols: { label: string; w: number; right?: boolean }[]; rows: string[][] }) {
  return (
    <View>
      <View style={st.row}>
        {cols.map((c) => (
          <Text key={c.label} style={[st.th, { width: c.w, textAlign: c.right ? "right" : "left" }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={st.row} wrap={false}>
          {r.map((v, j) => (
            <Text key={j} style={[st.td, { width: cols[j].w, textAlign: cols[j].right ? "right" : "left" }]}>
              {v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Report({ d, title }: { d: ReportData; title: string }) {
  const { k, prev, s, v } = d;
  const net = (x: typeof k) => x.gross - x.refunds - x.fees - x.disputes;
  const b = v.period.bucket;
  return (
    <Document title={title} author="Fivehundrd" creator="Fivehundrd Control Room">
      <Page size="A4" style={st.page}>
        <View style={st.head}>
          <View>
            <Text style={st.brand}>
              Fivehundrd<Text style={{ color: PINK }}>.</Text>
            </Text>
            <Text style={st.kicker}>Founder report</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>{v.period.label}</Text>
            <Text style={{ fontSize: 8, color: INK3, marginTop: 3 }}>{title.split(" · ").slice(2).join(" · ") || "All lanes, all visitors"}</Text>
          </View>
        </View>

        <View style={st.grid}>
          <Kpi label="Unique visitors" value={int(k.visitors)} now={k.visitors} prev={prev?.visitors} />
          <Kpi label="Spot opens" value={int(k.opens)} now={k.opens} prev={prev?.opens} />
          <Kpi label="Save rate" value={pct(rate(k.saves, k.opens))} now={rate(k.saves, k.opens)} prev={prev ? rate(prev.saves, prev.opens) : undefined} kind="rate" />
          <Kpi label="7-day return rate" value={pct(rate(k.returned7, k.cohort))} now={rate(k.returned7, k.cohort)} prev={prev ? rate(prev.returned7, prev.cohort) : undefined} kind="rate" />
          <Kpi label="Live spots" value={int(k.liveSpots)} now={k.liveSpots} prev={prev?.liveSpots} />
          <Kpi label="Net revenue" value={money(net(k), true)} now={net(k)} prev={prev ? net(prev) : undefined} kind="money" />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={st.h2}>Visitors</Text>
            <Chart labels={s.map((x) => x.t)} values={s.map((x) => x.visitors)} color={S1} bucket={b} />
          </View>
          <View>
            <Text style={st.h2}>Gross revenue</Text>
            <Chart labels={s.map((x) => x.t)} values={s.map((x) => x.gross)} color={S3} money bucket={b} />
          </View>
        </View>

        <Text style={st.h2}>From visit to live spot</Text>
        <Funnel
          steps={[
            ["Visit", k.visitors],
            ["Spot open", k.openers],
            ["Save", k.savers],
            ["Share", k.sharers],
            ["Create", k.createStarts],
            ["Checkout", k.checkouts],
            ["Live", k.paid],
          ]}
        />

        <Text style={st.h2}>Money</Text>
        <Table
          cols={[
            { label: "Gross", w: 88, right: true },
            { label: "Refunds", w: 88, right: true },
            { label: "Chargebacks", w: 88, right: true },
            { label: "Stripe fees", w: 88, right: true },
            { label: "Net", w: 88, right: true },
            { label: "Payments", w: 83, right: true },
          ]}
          rows={[[money(k.gross, true), money(-k.refunds, true), money(-k.disputes, true), money(-k.fees, true), money(net(k), true), int(k.paid)]]}
        />
        <View style={st.foot} fixed>
          <Text>Fivehundrd Control Room · confidential</Text>
          <Text render={({ pageNumber, totalPages }) => `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${pageNumber}/${totalPages}`} />
        </View>
      </Page>

      <Page size="A4" style={st.page}>
        <Text style={[st.h2, { marginTop: 0 }]}>Lanes</Text>
        <Table
          cols={[
            { label: "Lane", w: 120 },
            { label: "Live now", w: 70, right: true },
            { label: "Impressions", w: 80, right: true },
            { label: "Opens", w: 70, right: true },
            { label: "Saves", w: 70, right: true },
            { label: "Spots sold", w: 60, right: true },
            { label: "Revenue", w: 53, right: true },
          ]}
          rows={d.lanes.map((l) => [l.label, `${int(l.live)} / 500`, int(l.impressions), int(l.opens), int(l.saves), int(l.paid), money(l.revenue, true)])}
        />
        <Text style={st.h2}>Top spots</Text>
        <Table
          cols={[
            { label: "No.", w: 36 },
            { label: "Spot", w: 150 },
            { label: "Lane", w: 70 },
            { label: "Impr.", w: 55, right: true },
            { label: "Opens", w: 55, right: true },
            { label: "Open rate", w: 55, right: true },
            { label: "Saves", w: 50, right: true },
            { label: "Shares", w: 52, right: true },
          ]}
          rows={d.top.map((r) => [String(r.no), r.name, LANE_LABEL[r.lane] ?? r.lane, int(r.impressions), int(r.opens), pct(rate(r.opens, r.impressions)), int(r.saves), int(r.shares)])}
        />
        <Text style={st.h2}>Needs attention (last 24 hours)</Text>
        {d.alerts.length ? (
          d.alerts.map((a) => (
            <View key={a.id} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: a.level === "critical" ? BAD : INK }}>
                {a.title} <Text style={{ fontFamily: "Helvetica", color: INK3, fontSize: 7.5 }}>{a.level.toUpperCase()}</Text>
              </Text>
              <Text style={{ color: INK2, marginTop: 1 }}>{a.detail}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: INK2 }}>Nothing needs attention: traffic, payments, events and errors are within their usual range.</Text>
        )}
        <Text style={{ marginTop: 18, fontSize: 7.5, color: INK3 }}>
          Definitions: visitors are anonymous browsers, counted once per period. Opens are counted once per visitor per spot per day; impressions once per visitor per spot per day. Net revenue is gross minus refunds, chargebacks and Stripe fees; payments by
          the time they were made. Rates compare with the previous period of the same length.
        </Text>
        <View style={st.foot} fixed>
          <Text>Fivehundrd Control Room · confidential</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReport(d: ReportData, title: string): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<Report d={d} title={title} />));
}
