/**
 * PDF layout for the employee task & effort report (spec §9.3–9.5).
 * Loaded lazily (only when a PDF is generated) because @react-pdf/renderer is large.
 */
import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { ORG_TIMEZONE, TICKET_CATEGORY_META, TICKET_STATUS_LABELS, formatEffort } from '@tms/shared'
import type { ReportRow } from '../api'

export interface ReportDocumentProps {
  rows: ReportRow[]
  includeProduction: boolean
  employeeName: string
  employeeEmail: string
  start: string
  end: string
  companyName: string
  reportTitle: string
  footerText: string | null
  headerImage: string | null
  applicationName?: string | null
  generatedAt: Date
}

const fmtDateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: ORG_TIMEZONE })
const fmtDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' })
const ts = (iso: string | null) => (iso ? fmtDateTime.format(new Date(iso)) : '—')
const day = (d: string) => fmtDate.format(new Date(`${d}T00:00:00Z`))

/**
 * Page frame taken from the first page of Template.docx (company letterhead):
 *   header: logo right-aligned, full-width amber bar (#F5B93C) underneath
 *   footer: thin beige rule (#E2DDC7), company name centred in a serif face (Cambria in the
 *           template; Times is the closest built-in PDF font), address/contact line centred, grey #585858
 * Margins follow the template (~10 mm left/right).
 */
const TEMPLATE = {
  accentBar: '#F5B93C',
  footerRule: '#E2DDC7',
  footerText: '#585858',
  marginX: 28, // template: 566 twips ≈ 28 pt
}
const ACCENT_DARK = '#9a6a00' // readable amber for titles on white

const s = StyleSheet.create({
  page: { paddingTop: 70, paddingBottom: 72, paddingHorizontal: TEMPLATE.marginX, fontSize: 8.5, fontFamily: 'Helvetica', color: '#111827' },
  // ---- fixed letterhead header ----
  header: { position: 'absolute', top: 18, left: TEMPLATE.marginX, right: TEMPLATE.marginX },
  logoRow: { flexDirection: 'row', justifyContent: 'flex-end', height: 30, alignItems: 'flex-end' },
  logo: { height: 26, maxWidth: 150, objectFit: 'contain' },
  accentBar: { marginTop: 6, height: 2.4, backgroundColor: TEMPLATE.accentBar },
  // ---- fixed letterhead footer ----
  footer: { position: 'absolute', bottom: 14, left: TEMPLATE.marginX, right: TEMPLATE.marginX },
  footerMeta: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: TEMPLATE.footerText, marginBottom: 4 },
  footerRule: { borderTopWidth: 0.85, borderTopColor: TEMPLATE.footerRule },
  footerCompany: { marginTop: 5, textAlign: 'center', fontFamily: 'Times-Roman', fontSize: 10, letterSpacing: 0.6, color: TEMPLATE.footerText },
  footerAddress: { marginTop: 2, textAlign: 'center', fontFamily: 'Times-Roman', fontSize: 7.5, color: TEMPLATE.footerText },
  // ---- report heading (first page) ----
  titleBlock: { marginBottom: 10 },
  title: { fontSize: 14, fontFamily: 'Times-Bold', color: ACCENT_DARK },
  meta: { fontSize: 8.5, color: '#374151', marginTop: 2 },
  // ---- table ----
  table: { borderWidth: 0.5, borderColor: '#d6d3c4' },
  headRow: { flexDirection: 'row', backgroundColor: '#fdf3dc', borderBottomWidth: 0.75, borderBottomColor: TEMPLATE.accentBar },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ece9df' },
  rowAlt: { backgroundColor: '#faf9f5' },
  th: { paddingVertical: 4, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  td: { paddingVertical: 3.5, paddingHorizontal: 3 },
  right: { textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalBox: { borderWidth: 0.75, borderColor: TEMPLATE.accentBar, paddingVertical: 4, paddingHorizontal: 8, fontFamily: 'Helvetica-Bold', fontSize: 9.5 },
  empty: { padding: 16, textAlign: 'center', color: '#6b7280' },
})

interface Col {
  label: string
  width: string
  align?: 'right'
  value: (r: ReportRow) => string
}

function columns(includeProduction: boolean): Col[] {
  const base: Col[] = [
    { label: 'Task ID', width: '8%', value: (r) => r.ticket_number },
    { label: 'Task Title', width: includeProduction ? '18.5%' : '26%', value: (r) => r.title },
    { label: 'Application', width: includeProduction ? '11%' : '13%', value: (r) => r.application_name ?? '—' },
    { label: 'Category', width: includeProduction ? '8.5%' : '8%', value: (r) => TICKET_CATEGORY_META[r.category].label },
    { label: 'Efforts', width: '7%', align: 'right', value: (r) => formatEffort(r.effort_minutes) },
    { label: 'Current Status', width: '9%', value: (r) => TICKET_STATUS_LABELS[r.status] },
    { label: 'Started On', width: includeProduction ? '11%' : '14.5%', value: (r) => ts(r.started_on) },
    { label: 'QA Deployed On', width: includeProduction ? '11%' : '14.5%', value: (r) => ts(r.qa_deployed_on) },
  ]
  if (!includeProduction) return base
  return [
    ...base,
    { label: 'Prod Status', width: '7%', value: (r) => (r.status === 'prod_deployed' ? 'Deployed' : 'Not deployed') },
    { label: 'Prod Deployed On', width: '9%', value: (r) => ts(r.prod_deployed_on) },
  ]
}

export function ReportDocument(p: ReportDocumentProps) {
  const cols = columns(p.includeProduction)
  const total = p.rows.reduce((sum, r) => sum + r.effort_minutes, 0)
  return (
    <Document title={`${p.reportTitle} - ${p.employeeName} - ${p.start} to ${p.end}`} author={p.companyName} creator="Ticket Management System">
      <Page size="A4" orientation="landscape" style={s.page} wrap>
        {/* Letterhead header (Template.docx): logo right, amber bar — on every page */}
        <View style={s.header} fixed>
          <View style={s.logoRow}>{p.headerImage && <Image src={p.headerImage} style={s.logo} />}</View>
          <View style={s.accentBar} />
        </View>

        <View style={s.titleBlock}>
          <Text style={s.title}>{p.reportTitle}</Text>
          <Text style={s.meta}>{p.employeeName} · {p.employeeEmail}</Text>
          <Text style={s.meta}>Period: {day(p.start)} – {day(p.end)}</Text>
          {p.applicationName && <Text style={s.meta}>Application: {p.applicationName}</Text>}
        </View>

        <View style={s.table}>
          {/* Repeated on every page */}
          <View style={s.headRow} fixed>
            {cols.map((c) => (
              <Text key={c.label} style={[s.th, { width: c.width }, c.align === 'right' ? s.right : {}]}>{c.label}</Text>
            ))}
          </View>
          {p.rows.length === 0 ? (
            <Text style={s.empty}>No tickets match this period.</Text>
          ) : (
            p.rows.map((r, i) => (
              <View key={r.ticket_id} style={[s.row, i % 2 === 1 ? s.rowAlt : {}]} wrap={false}>
                {cols.map((c) => (
                  <Text key={c.label} style={[s.td, { width: c.width }, c.align === 'right' ? s.right : {}]}>{c.value(r)}</Text>
                ))}
              </View>
            ))
          )}
        </View>

        <View style={s.totalRow} wrap={false}>
          <Text style={s.totalBox}>Total effort: {formatEffort(total)}  ({p.rows.length} task{p.rows.length === 1 ? '' : 's'})</Text>
        </View>

        {/* Letterhead footer (Template.docx): rule, company name, address/contact — on every page.
            Spec §9.5 items (generation time, page numbers) sit just above the rule. */}
        <View style={s.footer} fixed>
          <View style={s.footerMeta}>
            <Text>Generated {fmtDateTime.format(p.generatedAt)} (IST)</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
          <View style={s.footerRule} />
          <Text style={s.footerCompany}>{p.companyName}</Text>
          {p.footerText && <Text style={s.footerAddress}>{p.footerText}</Text>}
        </View>
      </Page>
    </Document>
  )
}

export async function renderReportPdf(props: ReportDocumentProps): Promise<Blob> {
  return pdf(<ReportDocument {...props} />).toBlob()
}
