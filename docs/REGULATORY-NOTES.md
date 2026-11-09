# Regulatory notes (Bangladesh) - status: November 2026

Working notes for building WageProof/ExportPass. **Not legal advice.** Verify with Bangladesh Bank,
BSEC, the ICT Division and local counsel before any commercial deployment. Everything here was
checked against public sources in November 2026; rules in this space move quickly.

## 1. Crypto and virtual assets: stay out

- Bangladesh Bank's FE Circular No. 24 (15 September 2022) states that dealing in virtual assets or
  currencies - and facilitating their exchange/transfer/trading - is **not permitted**, and
  violations contravene the Foreign Exchange Regulation Act 1947 (cognizable under s.23).
- Warnings cite the Money Laundering Prevention Act 2012 and the Anti-Terrorism Act 2009 as well.
- P2P usage has kept rising and policy debate continues, but as of late 2026 there is still **no
  enabling framework**.
- **Design rule: the ledger never touches money and never holds value.** It stores SHA-256 hashes,
  Merkle roots and timestamps. No tokens, no wallets, no stablecoins, no "yield". If a client asks
  for a coin, the answer is no.

## 2. Payments: you need a licence to move money

- The **Payment and Settlement Systems Act 2024** governs PSP/PSO licensing (PSO Regulation 2025
  followed); licences exist but are slow and capital-heavy to obtain.
- MFS is effectively bank-led; **Digital Bank Guidelines v2 (August 2025)** require Tk 300 crore
  paid-up capital, and a new licensing wave is under way (five more digital banks received LoIs in
  September 2026, including bKash-, Robi- and Banglalink-backed ventures).
- Draft **E-Money Issuer Regulations** would let non-banks issue e-money (draft capital
  requirement: Tk 50 crore), with existing MFS operators reapplying during a transition window.
- **Design rule: sell software to licensed institutions; let funds ride BB-approved rails**
  (bank accounts, MFS, Bangla QR, Binimoy, NPSB, BEFTN, TakaPay cards). The payout CSV is a file the
  factory or its aggregator executes - WageProof is never in the flow of funds.

## 3. Data protection: PDPA 2026 is live

- Timeline: Personal Data Protection Ordinance (6 Nov 2025) -> amended Feb 2026 -> **Personal Data
  Protection Act 2026 (Act 63 of 2026)**, passed April 2026, retrospectively effective from
  Nov 2025; enforcement machinery (CDO, complaints, fines) phases in ~18 months after gazette.
- GDPR-style duties: informed consent, data classification (public/internal/confidential/restricted),
  breach notification, security duties, and **restrictions on cross-border transfer** - with
  residency expectations for the most sensitive categories.
- **Design rules:** personal data (names, wages, phone numbers) stays in the operational database,
  in-country; only salted hashes go on the ledger. Receipts are tokenised before any real pilot.
  Consent for worker-facing features (SMS confirmations) is captured explicitly.

## 4. Labour and wage payment

- The demo formula uses double-rate overtime and a 60/30/10 basic/house-rent/medical split, close to
  common RMG practice - **tune to the actual appointment letters and the Labour Act before a pilot**.
- Digital wage payment (bank/MFS accounts for RMG workers) is the stated policy direction; schemes
  and incentives vary by year - confirm current rules with BGMEA/Bangladesh Bank.

## 5. EU export rules that create buyer demand

- **EUDR (deforestation)**: application for large/medium operators from 30 Dec 2026 (micro/small
  30 Jun 2027), but **cattle hides, skins and leather were removed from scope in Sept 2026**
  (Delegated Regulation 2026/2102) - so leather is no longer the wedge; wood/rubber/coffee etc. remain.
- **ESPR / Digital Product Passport**: textiles are a priority; the delegated act is expected
  around Q4 2027 with compliance realistically 2028-29. Meanwhile the **ban on destroying unsold
  clothing applies to large companies from July 2026**.
- Brand scorecards, forced-labour due diligence and audit fatigue are driving real budgets **now** -
  that is what WageLedger/ExportPass sell today, with the DPP data model built in for later.

## 6. Positioning summary

| You are selling | You are NOT doing |
| --- | --- |
| Hash-chain audit trails for payroll and production | Anything with tokens, coins or crypto payments |
| Software to licensed banks/MFS/PSPs/factories | Holding or moving customer money |
| PDPA-compliant consent and data-minimal design | Shipping personal data to public chains |
| Evidence for brand audits and EU DPP readiness | Legal guarantees - always pair with counsel |
