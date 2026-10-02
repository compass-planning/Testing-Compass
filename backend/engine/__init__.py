"""Compass planning engines (ported from the original TypeScript Compass Planning).

Pure, deterministic financial functions used by the retirement suite:
  - reference: CRA reference data (RRIF factors, tax brackets, CPP/OAS, benefit rates)
  - retirement_ca: deterministic year-by-year Canadian projection (RRSP->RRIF, tax, draw-order)
  - simulation: Monte Carlo (Cholesky + correlated multi-asset) + Guyton-Klinger guardrails
  - optimizers: RRIF/withdrawal optimizer, CPP/OAS timing, RRSP-vs-TFSA, pension splitting
"""
