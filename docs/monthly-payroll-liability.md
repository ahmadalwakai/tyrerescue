# Monthly PAYE and National Insurance

The Assisted Chat **Tax & Payroll → Monthly PAYE & National Insurance** screen
summarises the company's local payroll liability, manually recorded payments,
confirmed adjustments and remaining balance. It does not represent a live HMRC
statement, send payments, file an FPS/EPS or verify that HMRC received a payment.
VAT, Corporation Tax, pension-provider payments and net wages are separate.

## Assisted Chat workflow

1. Save the company profile, then open **Employees & Payroll** and activate the
   pay schedule as the company founder.
2. Add each employee and effective pay terms. In **Payroll tax setup & opening
   balances**, enter the supplied tax code, basis, effective date and NI
   category. Explicitly confirm loan and pension status. Declare either the
   first payroll in this tax year (all seven current-employer balances are zero)
   or all seven imported opening balances; supply P45 pay/tax together where
   applicable. No missing loan status or payroll history is assumed to be zero.
3. Create a pay run, add employee earnings, and inspect the calculated tax, NI,
   loan deductions and net pay. Resolve every blocking issue first.
4. Submit for review. Another authorised administrator must approve it. The
   founder can grant company payroll access to an existing verified admin from
   **Payroll access & independent review** on the Tax & Payroll home. This sends
   no invitation and does not create an admin account.
5. Finalise the approved figures. The server checks the reviewed input hash,
   current versions and previous finalised payroll before saving immutable
   employee results, YTD balances, balanced ledger entries and audit evidence in
   one transaction. Changed inputs require a fresh independent review.
6. Open **View this tax month** to see the month containing the run's payment
   date. Record actual payments and confirmed adjustments separately. Returning
   from employee/run screens refreshes the calculation and summary.

Rapid taps are locked synchronously; uncertain retries retain idempotency keys.
The app verifies canonical response identities, versions, financial arithmetic
and requested earnings before displaying success. HTML/login pages, another
company or month, stale sessions and inconsistent responses cannot be accepted
as a saved financial record. Network errors do not sign the administrator out.

## Supported payroll scope

The calculation rules are verified for tax year **2026–27** only, with weekly,
fortnightly, four-weekly and monthly regular pay, supplied supported UK tax
codes/NI categories, cumulative or week-1/month-1 PAYE, and confirmed student and
postgraduate loans. Full-tax-year directors use the annual NI method and must
explicitly confirm that the directorship predates the tax year; an early
employment start alone does not prove that. Changing NI methods or a director's
NI category after finalisation requires reconciliation. Previous
current-employer YTD and prior-employer P45 values feed cumulative calculations
once; subsequent runs use saved finalised YTD snapshots.

Unsupported tax years/codes/categories, week 53, unknown history, pension payroll,
statutory pay, supplementary/correction runs for an already finalised period,
mid-year director appointments and the alternative director NI method require a
separate supported workflow. They must not be treated as a reliable zero bill.
This local feature is not HMRC recognition, filing or payroll certification.

## Calculation and completeness

Tax months run from the 6th to the following 5th. Payroll is grouped by the
**intended payment date**, not the dates worked. Monthly electronic payment is
normally due on the following 22nd; posted cheques must arrive by the 19th.
These dates assume a monthly PAYE arrangement. A quarterly arrangement agreed
with HMRC is not changed by the screen. Allow bank processing time.

The subtotal includes employee PAYE, employee NI, employer NI and student /
postgraduate loan deductions from finalised employee results. It excludes
gross wages, net wages and pension-provider liabilities. Negative PAYE refunds
and verified annual-director NI reconciliations remain signed amounts.

Only complete persisted results with an immutable calculation snapshot count.
The snapshot must identify the employee, payment date and input hash, and its
calculated amounts must match the saved result. Missing legacy snapshots,
unsupported calculations, missing employees and unfinished payroll make the
month **Incomplete**. A month without finalised payroll is **No data**. In both
states the liability and remaining balance are **Not calculated**, never £0.
An open month is provisional. A closed month with complete records is labelled
**Recorded month total**, not HMRC-approved.

Employment Allowance, statutory recoveries, CIS, levy, earlier balances and
other external changes are not inferred. Authorised members can record an
explained signed adjustment from confirmed accounting/HMRC records. Recording
a credit does not claim an allowance or submit an EPS.

## Payments and corrections

Record an actual bank transaction with amount, payment date and unique bank
transaction/receipt reference. The amount is integer GBP pence. Do not enter
the employer's reusable PAYE reference as the transaction identifier. Future
payments cannot be recorded as paid.

Retries reuse an idempotency key. Reusing a key with different data returns
409. An active receipt with the same company, payment date, normalised reference
and amount cannot be counted again, including in a different tax month.
Splitting a single bank transaction across multiple tax months is not supported.
Identical adjustment evidence (company, tax month, signed amount and normalised
reason/reference) also cannot be counted twice with a new request key.

A mistaken payment or adjustment can be **voided**, with a required reason.
The original record stays in history, its amount stops affecting the totals,
and an audit records the actor and reason. Voiding a local record does not
reverse a bank payment or contact HMRC. Concurrent retries create one void
audit. Original data and the first void reason cannot be overwritten.

## Protected API

All routes require an authenticated admin and company-specific payroll
membership. Reading requires `payroll.read`. Recording or voiding additionally
requires `payroll.settings.write`. Missing access returns 404. Responses are
private and have `Cache-Control: no-store`.

Base path: `/api/admin/tax/companies/{companyId}/payroll/monthly-liability`

- `GET ?date=YYYY-MM-DD`: local monthly summary; defaults to today's London date.
- `POST /payments`: `{periodStart, amountPence, paidOn, reference, idempotencyKey}`.
- `POST /adjustments`: `{periodStart, amountPence, reason, idempotencyKey}`.
- `POST /payments/{recordId}/void`: `{reason, idempotencyKey}`.
- `POST /adjustments/{recordId}/void`: `{reason, idempotencyKey}`.

Creation returns the plain public record (201); void returns the same public
record with `voidedAt` and `voidReason` (200). Reload the summary separately.
The last 100 records of each kind are shown, with the full record counts; totals
include all active records even when the visible history is truncated.
Payment and void writes use one atomic SQL statement with their audit. The
summary uses a single consistent database snapshot.

## Release prerequisites and isolated tests

The authorised 21 October 2026 release applied production migrations 0026–0032
after Assisted Chat 1.0.12 (46) was uploaded to TestFlight. Apple confirmed it
available for internal testing. Vercel deployment
`dpl_A7gzwkpCWHiQcP2mPY9xZPAS3Az6` is live on www and the apex; the previously
missing tax API now correctly returns JSON 401 without admin authentication.
See [the production release and live checks](releases/tyrerescue-production-2026-10-21.md).
The earlier installed build 44 does not acquire native changes automatically;
install build 46 through TestFlight.

Future releases must confirm migrations 0026, 0027 and 0028 exist before
0032. That migration explicitly fails if payroll-finalisation prerequisites
are missing. It adds only local payment/adjustment evidence and extends the
payroll lifecycle and declared opening-data source checks. Existing review
hashes remain null and must be recalculated/reviewed before finalisation.

0028 has been restored to the migration journal. For a database that already
applied a newer journal timestamp, review its migration history explicitly:
inserting an older journal entry does not guarantee that entry will be replayed.

Run the repeatable synthetic PostgreSQL suites with:

```powershell
npm run test:payroll-db
npm run test:tax-payroll
npm run typecheck:tax-payroll
npm --prefix assisted-chat-app run typecheck
```

The PostgreSQL suites use pinned PGlite, an in-memory PostgreSQL engine, with
synthetic users and companies. Both the HTTP and transactional clients are
replaced in tests. They never read a production database URL, send notifications
or connect to HMRC. They run serially to bound memory use.

Sources verified 21 October 2026:
[HMRC PAYE payment deadlines and bill components](https://www.gov.uk/pay-paye-tax),
[employer rates and thresholds](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027),
[PAYE calculation technical specification](https://www.gov.uk/government/publications/payroll-technical-specifications-income-tax),
[NI software calculation and rounding specification](https://www.gov.uk/government/publications/payroll-technical-specifications-national-insurance),
[student-loan software calculation specification](https://www.gov.uk/government/publications/payroll-technical-specifications-student-loans).

## VAT and Corporation Tax remain separate

The monthly screen does not combine PAYE with VAT or Corporation Tax. VAT is
normally reported by its own accounting period, commonly quarterly. The VAT
API currently has no reconciled sales/purchase transaction adapter: calculation
returns `422`, `calculationStatus: no_data` and `draft: null`, without writing a
nil return. Transaction-free historical drafts are not displayed as confirmed
zero bills or marked ready for submission. Connecting journal balances alone
would not establish invoice VAT rate, recoverability or source completeness.

The existing Corporation Tax API is a bounded **manual draft estimate**, not a
monthly payment instruction or CT600 filing system. It only reads/updates an
already recorded accounting period; creating/importing periods and completing
accountant-ready accounts are outside this change. First calculation requires
all profit categories and the associated-company count explicitly. Missing
figures do not become zeros. This guarded path covers ordinary nonnegative
UK profit inputs for periods within 1 April 2025–31 March 2027, no longer than
12 months; loss relief and special company regimes require separate review.

A new estimate saves an input hash and verifies saved output against those
inputs. Unverified defaults/historical values return `period: null`,
`calculationStatus: no_data` and separate period metadata. Verified manual
figures return `calculationStatus: estimate` and `hmrcVerified: false`. Updates
use row locking, version checks and one rollback-capable transaction with their
audit. No legacy financial records are modified merely by reading them.

The current iOS VAT/CT screens do not provide a complete source-data/import
workflow, and the new monthly overview does not link them as completed features.
Any future screen should handle these availability/estimate states explicitly.

Sources:
[VAT accounting periods and deadlines](https://www.gov.uk/submit-vat-return),
[Corporation Tax rates](https://www.gov.uk/corporation-tax-rates),
[maximum Corporation Tax accounting period](https://www.gov.uk/corporation-tax-accounting-period),
[verified 2025/2026 rates and thresholds](https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax).
