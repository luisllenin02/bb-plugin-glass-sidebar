# Packet P8b — Project Icons: matter-specific icons, and an open-picker request other plugins can send

Work in the vendored Project Icons plugin on branch `feat/auto-icon-colour`
(HEAD `71f0e69`, installed and running as 0.2.0):
`/home/system/workspaces/LAL/Development/.bb/vendor/bb-plugins-ariofrio-39a8cf1a/plugins/bb-plugin-project-icons`.
Read `packet-P8-project-icons-auto.md`, P8's report in the appendix, and
brief §5 (Preservation rule).

User direction (2026-09-02): "The matter folders all resolved to the
balance-scale icon. The whole point is to have them be more specific than
just law for all of them." Also: right-clicking a thread in the sidebar
should open the icon/colour menu, with an extra option for a thread-specific
colour (the sidebar side is packet P9; this packet provides the hook).

## Part A — matter-specific icons

Matter projects live under `/mnt/c/Users/Law3/Claude/Projects/Esq/<Last, First 1101.XXXX>`.
Their type is not in the name; it is in the folder. Build a deterministic,
bounded classifier `classifyMatter(root)`:

1. Read at most: the top-level listing (names only, cap 200), the names in
   `notes/`, `pleadings/`, `_context/`, `work-product/` (cap 100 each), and the
   first 80 lines of `notes/case_strategy.md` or `case_strategy.md` if present,
   plus the first 40 lines of any `_context/*.md`. Never read PDFs, DOCX, or
   client-production. Never send content anywhere.
2. Score keyword families (case-insensitive, whole words, weight names 2×
   content) and pick the highest; ties → the earlier in this list:
   - **real-estate / closing**: closing, deed, title, escrow, buyer, seller, purchase agreement, HUD → `House01Icon`-family (a house/home icon)
   - **foreclosure / mortgage**: foreclosure, mortgage, lis pendens, lender, servicer, loan modification, loss mitigation → a house-with-lock or bank icon
   - **landlord-tenant / HOA / condo**: lease, tenant, landlord, eviction, association, HOA, condominium, assessment → building/apartment icon
   - **contract / commercial**: breach, contract, invoice, agreement, guaranty, vendor, services → document-signed/handshake icon
   - **construction / lien**: contractor, construction, lien, permit, change order, bond → hammer/tools icon
   - **collections / debt**: collection, debt, judgment, garnishment, promissory, balance due → money/coins icon
   - **personal injury / negligence**: injury, accident, negligence, medical, damages, insurer, PIP, premises → bandage/ambulance icon
   - **employment**: employment, wages, overtime, termination, discrimination, FLSA → briefcase-user icon
   - **family**: divorce, custody, marital, alimony, child support → users/family icon
   - **probate / estate**: probate, estate, trust, will, beneficiary, personal representative → scroll/document-heart icon
   - **corporate / business**: LLC, shareholder, operating agreement, dissolution → building-office icon
   - **appeal**: appeal, appellant, brief, district court of appeal → gavel/judge icon
   - **civil rights / defamation / government tort**: defamation, malicious prosecution, civil rights, § 768.28, sheriff, county, arrest → shield/user-warning icon
   - **consumer / debt defence**: FDCPA, FCCPA, TCPA, debt collector, credit reporting → shield-check icon
   - fallback for a matter with no signal: `BalanceScaleIcon` (as today).
   Pick each icon from the catalog by tags and record the chosen `export`
   per family in one table with a test that every export exists in the
   catalog.
3. Reason strings: `matter:real-estate`, `matter:foreclosure`, … shown in the
   picker's Auto badge tooltip together with the top three keywords that
   scored, so the user can see why.
4. Re-run for existing `auto` rows on this reload (one pass, one publish if
   changed); manual rows untouched. Add a "Re-detect all auto icons" button
   in the picker's Auto section and an RPC for it.
5. Tests: fixture folders under `test/fixtures/matters/<type>/` with a few
   file names and a short strategy note each; each classifies to its type;
   a folder with nothing classifies to the balance scale; reading caps are
   respected (a fixture with 500 files reads only 200).

## Part B — open-picker request from other plugins

Add to `broadcast.ts` a documented message on the existing
`bb.project-icons` BroadcastChannel:
`{ type: "open-picker", projectId: string, source?: string }`. The app
listens and opens the picker for that project (same picker the header icon
opens, positioned near the header icon or centred if no anchor). Ignore
malformed messages. Document it in README under "Integrations". Test with a
BroadcastChannel stub.

## Constraints

Preservation rule; no model calls; no polling; commit on the existing feature branch with subject `[P8b] matter-specific icons and open-picker request`. No reinstall (I1 does it).

## Verify

Plugin tests, `npx tsc --noEmit`, `bb plugin build`. Report per brief §5 with the family → export table and the classification of five real matters (names only; do not quote file contents). Calibration hints from three real matters (orchestrator sampled): one is a contractor dispute with an eviction complaint and permit emails (construction should win over landlord-tenant when both score; weight 'contractor', 'permit', 'change order' higher); one is defamation plus malicious prosecution with FDCPA/FCCPA counts (civil-rights family); one is a bank mortgage foreclosure with docket PDFs (foreclosure).
